/**
 * Real OperationJournalService FSM + real WindowManager on one FakeBrowserApi;
 * DappInteractionService started through a ServiceCollection so `init()` wires
 * the journal subscription. Stubbed: profile, network, account, dApp session,
 * execution, FPCs. No PXE, no proving, no browser.
 */
import { describe, expect, test, vi } from "vitest"
import { JobCancelledError, UserRejectedError } from "@nulo/extension-messaging/errors"
import { FakeBrowserApi, MockClock } from "@nulo/wallet-core/testing"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { ServiceCollection } from "@/wallet/base"
import { ProfileService } from "@/wallet/services/profile/service"
import { NetworkService } from "@/wallet/services/network/service"
import { AccountService } from "@/wallet/services/account/service"
import { FpcService } from "@/wallet/services/fpc/service"
import { AccessLevel, DappSessionService } from "@/wallet/services/dapp-session/service"
import { ExecutionService } from "@/wallet/services/execution/service"
import { OperationJournalService } from "@/wallet/services/operation-journal/service"
import { TokenService } from "@/wallet/services/token/service"
import { WindowManager } from "@/wallet/services/window-manager/window-manager"
import { rowKeysForEveryProfile } from "@/wallet/storage/sealed-entity-storage.testing"
import { DappInteractionService } from "./service"
import type { DappInteraction } from "./spec"

function svc(name: string, methods: Record<string, unknown>) {
	return { name, dependencies: [], async start() {}, ...methods } as never
}

type Outcome = { ok: unknown } | { err: unknown }
const settleOf = (p: Promise<unknown>): Promise<Outcome> =>
	p.then(
		(ok) => ({ ok }),
		(err) => ({ err }),
	)

const SESSION = {
	id: "s1",
	profileId: "p1",
	chainId: "1",
	dappMetadata: { name: "dapp.example", url: "https://dapp.example" },
	permissions: [],
	accounts: [],
	// Lowest level so an empty operation list still needs the popup.
	confirmationLevel: AccessLevel.None,
	expiry: Number.MAX_SAFE_INTEGER,
}

async function makeHarness() {
	const api = new FakeBrowserApi()
	api.reset()
	const clock = new MockClock()
	const logger = new LoggerStore(new ConfigStore())
	const journal = new OperationJournalService(logger, api)
	const manager = new WindowManager(api.windows, clock, logger)
	const dapp = new DappInteractionService(logger, manager)

	// `isConfirmationNeeded` awaits this; parking it holds `execute()` between
	// its pre-popup journal read and the interaction's registration.
	let profileGate: Promise<void> = Promise.resolve()
	let reachedGate = () => {}

	const collection = new ServiceCollection()
	collection.add(
		svc(ProfileService.name, {
			getActiveProfile: async () => {
				reachedGate()
				await profileGate
				return { id: "p1" }
			},
			getProfiles: async () => [{ id: "p1" }],
			...(await rowKeysForEveryProfile()),
			refreshSession: async () => {},
			captureExecutionFence: async () => ({ profileId: "p1", epoch: 0 }),
		}),
	)
	collection.add(svc(NetworkService.name, { registerChainPurgeSubscriber: () => {}, isNetworkLive: async () => true }))
	collection.add(svc(AccountService.name, {}))
	collection.add(svc(DappSessionService.name, { tryGetDappSession: async () => SESSION }))
	collection.add(svc(ExecutionService.name, { executeOperations: vi.fn(async () => []) }))
	collection.add(svc(FpcService.name, {}))
	collection.add(svc(TokenService.name, { getVerifiedDefaults: async () => [] }))
	collection.add(journal)
	collection.add(dapp)
	await collection.start()

	const storage = (dapp as unknown as { storage: Map<string, DappInteraction> }).storage
	// A window's URL names its request, as in the browser.
	vi.mocked(chrome.runtime.getURL).mockImplementation((path) => path)
	const createSpy = vi.spyOn(api.windows, "create")
	const removeSpy = vi.spyOn(api.windows, "remove")

	const queuedRecord = () =>
		journal.createOperation({
			kind: "dapp_execute",
			origin: "dapp",
			profileId: "p1",
			sessionId: SESSION.id,
			initialStage: { stage: "queued" },
		})
	const execute = (queuedJournalId: string) =>
		settleOf(dapp.execute({ sessionId: SESSION.id, operations: [] }, undefined, { queuedJournalId }))
	const windowIdOf = async (createIndex: number) => (await createSpy.mock.results[createIndex]?.value)?.id as number | undefined
	const windowOf = (interaction: DappInteraction) =>
		windowIdOf(createSpy.mock.calls.findIndex(([options]) => options.url?.endsWith(`requestId=${interaction.id}`)))
	const interactionFor = (journalId: string) => [...storage.values()].find((x) => x.hooks?.queuedJournalId === journalId)

	return {
		journal,
		dapp,
		storage,
		removeSpy,
		queuedRecord,
		execute,
		windowIdOf,
		windowOf,
		interactionFor,
		/** Parks `execute()` at the gate; `reached` settles once it waits there. */
		parkProfile: () => {
			let release!: () => void
			profileGate = new Promise<void>((r) => {
				release = r
			})
			const reached = new Promise<void>((r) => {
				reachedGate = r
			})
			return { release, reached }
		},
	}
}

describe("DappInteractionService × OperationJournalService × WindowManager (feed cancel closes the popup)", () => {
	test("cancelling A closes A's window only, rejects A with JobCancelledError{jobId}, cleans A up, leaves B open; a late reject of A is a no-op", async () => {
		const h = await makeHarness()
		const recA = await h.queuedRecord()
		const recB = await h.queuedRecord()

		// Concurrent requests open in whichever order their sealed journal reads settle, so B opens
		// first here and the cancel must follow A's interaction, not the opening order.
		const openedWindow = async (journalId: string) => {
			let windowId: number | undefined
			await vi.waitFor(async () => {
				const interaction = h.interactionFor(journalId)
				expect(interaction).toBeDefined()
				windowId = await h.windowOf(interaction as DappInteraction)
				expect(windowId).toBeTypeOf("number")
			})
			return windowId
		}
		const outcomeB = h.execute(recB.id)
		const windowB = await openedWindow(recB.id)
		const outcomeA = h.execute(recA.id)
		const windowA = await openedWindow(recA.id)
		expect(await h.windowIdOf(0)).toBe(windowB)
		expect(windowA).not.toBe(windowB)
		const interactionA = h.interactionFor(recA.id)

		await h.journal.transitionOperation(recA.id, { stage: "cancelled" })

		const resultA = await outcomeA
		expect("err" in resultA && resultA.err).toBeInstanceOf(JobCancelledError)
		expect(("err" in resultA ? (resultA.err as JobCancelledError) : undefined)?.details).toEqual({ jobId: recA.id })
		expect(h.removeSpy).toHaveBeenCalledTimes(1)
		expect(h.removeSpy).toHaveBeenCalledWith(windowA)
		await vi.waitFor(() => expect(h.interactionFor(recA.id)).toBeUndefined())
		expect(h.interactionFor(recB.id)).toBeDefined()

		// The popup's own unload-time reject after the SW closed it: harmless.
		await h.dapp.rejectInteraction((interactionA as DappInteraction).id, "User rejected")
		expect(h.removeSpy).toHaveBeenCalledTimes(1)

		// B is still live and settles on its own terms.
		await h.dapp.rejectInteraction((h.interactionFor(recB.id) as DappInteraction).id, "User rejected")
		const resultB = await outcomeB
		expect("err" in resultB && resultB.err).toBeInstanceOf(UserRejectedError)
		expect(h.removeSpy).toHaveBeenCalledWith(windowB)
	})

	test("registration gap: a cancel landing before the interaction is registered still closes the popup (reconciliation read)", async () => {
		const h = await makeHarness()
		const recC = await h.queuedRecord()

		const { release, reached } = h.parkProfile()
		const outcomeC = h.execute(recC.id)
		await reached
		// Parked inside isConfirmationNeeded: past the pre-popup short-circuit,
		// before registration. The subscription fires here and finds nothing.
		expect(h.interactionFor(recC.id)).toBeUndefined()
		await h.journal.transitionOperation(recC.id, { stage: "cancelled" })
		expect(h.removeSpy).not.toHaveBeenCalled()

		release()
		const resultC = await outcomeC
		expect("err" in resultC && resultC.err).toBeInstanceOf(JobCancelledError)
		expect(("err" in resultC ? (resultC.err as JobCancelledError) : undefined)?.details).toEqual({ jobId: recC.id })
		// Reconciliation closes the window that was opened after the cancellation.
		await vi.waitFor(async () => expect(h.removeSpy).toHaveBeenCalledWith(await h.windowIdOf(0)))
		expect(await h.windowIdOf(0)).toBeTypeOf("number")
		expect(h.interactionFor(recC.id)).toBeUndefined()
	})
})
