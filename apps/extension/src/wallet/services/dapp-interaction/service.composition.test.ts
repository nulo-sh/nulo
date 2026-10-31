/**
 * Real OperationJournalService FSM + real WindowManager on one FakeBrowserApi;
 * DappInteractionService started through a ServiceCollection so `init()` wires
 * the journal and dApp-session subscriptions. Stubbed: profile, network, account,
 * dApp session, execution, FPCs. No PXE, no proving, no browser.
 */
import { describe, expect, test, vi } from "vitest"
import { JobCancelledError, UserRejectedError } from "@nulo/extension-messaging/errors"
import { FakeBrowserApi, MockClock } from "@nulo/wallet-core/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
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
import { failQueuedForError } from "@/wallet/services/wallet-sdk/queued-journal"
import { DappInteractionService } from "./service"
import type { DappInteraction, InteractionPayload } from "./spec"
import { WindowEndedError } from "./window-end"

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
	// The app's stored row, and whether the session the reads run under is still live.
	let row: typeof SESSION | undefined = SESSION
	let locked = false
	let lockOnRead = false
	const onDappSessionDeleted = new EventHandler<typeof SESSION>()
	const onVerificationRefused = new EventHandler<{ origin: string; chainId: string; profileId: string }>()

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
			captureExecutionFence: async () => {
				if (locked) throw new Error("Wallet locked")
				return { profileId: "p1", epoch: 0 }
			},
			isFenceLive: () => !locked,
		}),
	)
	collection.add(svc(NetworkService.name, { registerChainPurgeSubscriber: () => {}, isNetworkLive: async () => true }))
	collection.add(svc(AccountService.name, {}))
	collection.add(
		svc(DappSessionService.name, {
			tryGetDappSession: async () => {
				if (lockOnRead) locked = true
				return row
			},
			getDappSession: async () => SESSION,
			onDappSessionDeleted,
			onVerificationRefused,
		}),
	)
	collection.add(svc(ExecutionService.name, { executeOperations: vi.fn(async () => []) }))
	collection.add(svc(FpcService.name, { getOrComputeProtocolAddresses: async () => ({ sponsored: "0x01", private: "0x02" }) }))
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

	const internals = dapp as unknown as {
		interaction: (type: string, payload: InteractionPayload, token?: string, hooks?: { queuedJournalId: string }) => Promise<unknown>
	}
	return {
		journal,
		dapp,
		internals,
		storage,
		removeSpy,
		onDappSessionDeleted,
		onVerificationRefused,
		/** Deletes the app's row as the dApp-session service does: gone, then the event. */
		deleteRow: (deleted: typeof SESSION = SESSION) => {
			row = undefined
			onDappSessionDeleted.invoke(deleted)
		},
		dropRow: () => {
			row = undefined
		},
		/** The next row read runs as the wallet locks, so it reads nothing whether or not the row is there. */
		lockOnNextRead: () => {
			lockOnRead = true
		},
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

describe("DappInteractionService × DappSessionService (a revoked app's requests end)", () => {
	const opened = async (h: Awaited<ReturnType<typeof makeHarness>>, find: () => DappInteraction | undefined) => {
		let windowId: number | undefined
		await vi.waitFor(async () => {
			const interaction = find()
			expect(interaction).toBeDefined()
			windowId = await h.windowOf(interaction as DappInteraction)
			expect(windowId).toBeTypeOf("number")
		})
		return windowId as number
	}
	const isCapabilities = (x: DappInteraction) => "knownContracts" in ((x.payload as { params?: object }).params ?? {})

	test("deleting the app's row closes its send and capabilities windows, and the send's row reads as refused", async () => {
		const h = await makeHarness()
		const rec = await h.queuedRecord()
		const sent = h.execute(rec.id)
		const asked = settleOf(h.dapp.requestCapabilities({ sessionId: SESSION.id } as never))
		const sendWindow = await opened(h, () => h.interactionFor(rec.id))
		const capabilitiesWindow = await opened(h, () => [...h.storage.values()].find(isCapabilities))

		h.deleteRow()

		for (const outcome of [await sent, await asked]) {
			const err = "err" in outcome ? outcome.err : undefined
			expect(err).toBeInstanceOf(WindowEndedError)
			expect((err as WindowEndedError).end).toBe("disconnect")
		}
		expect(h.removeSpy).toHaveBeenCalledWith(sendWindow)
		expect(h.removeSpy).toHaveBeenCalledWith(capabilitiesWindow)
		expect(h.storage.size).toBe(0)
		const sentOutcome = await sent
		await failQueuedForError(h.journal, rec.id, "err" in sentOutcome ? sentOutcome.err : undefined, new LoggerStore(new ConfigStore()))
		expect((await h.journal.getOperation(rec.id))?.error?.kind).toBe("wallet_refused")
	})

	test.each([
		["another chain", { ...SESSION, chainId: "2" }],
		["another profile", { ...SESSION, profileId: "p2" }],
		["another app", { ...SESSION, dappMetadata: { name: "other", url: "https://other.example" } }],
	])("a deletion of %s leaves the app's window open", async (_name, deleted) => {
		const h = await makeHarness()
		const rec = await h.queuedRecord()
		void h.execute(rec.id)
		await opened(h, () => h.interactionFor(rec.id))

		h.onDappSessionDeleted.invoke(deleted)

		expect(h.removeSpy).not.toHaveBeenCalled()
		expect(h.interactionFor(rec.id)).toBeDefined()
		expect((await h.journal.getOperation(rec.id))?.progress.stage).toBe("queued")
	})

	test("a fee question of the app's approved send stays open", async () => {
		const h = await makeHarness()
		const rec = await h.queuedRecord()
		const payload = {
			feeQuestion: { fee: "2", approved: "1", payer: "self" },
			operation: {},
			session: SESSION,
		} as unknown as InteractionPayload
		void settleOf(h.internals.interaction("fee", payload, undefined, { queuedJournalId: rec.id }))
		await opened(h, () => h.interactionFor(rec.id))

		h.deleteRow()

		expect(h.removeSpy).not.toHaveBeenCalled()
		expect(h.interactionFor(rec.id)).toBeDefined()
	})

	test("a refused check closes the app's window even when its row stays", async () => {
		const h = await makeHarness()
		const rec = await h.queuedRecord()
		const sent = h.execute(rec.id)
		const window = await opened(h, () => h.interactionFor(rec.id))

		h.onVerificationRefused.invoke({ origin: SESSION.dappMetadata.url, chainId: SESSION.chainId, profileId: SESSION.profileId })

		const outcome = await sent
		expect("err" in outcome && (outcome.err as WindowEndedError).end).toBe("disconnect")
		expect(h.removeSpy).toHaveBeenCalledWith(window)
	})

	test("registration gap: a deletion before the window registers still closes it (reconciliation read)", async () => {
		const h = await makeHarness()
		const rec = await h.queuedRecord()
		const { release, reached } = h.parkProfile()
		const sent = h.execute(rec.id)
		await reached
		h.deleteRow()
		expect(h.removeSpy).not.toHaveBeenCalled()

		release()
		const outcome = await sent
		expect("err" in outcome && (outcome.err as WindowEndedError).end).toBe("disconnect")
		await vi.waitFor(async () => expect(h.removeSpy).toHaveBeenCalledWith(await h.windowIdOf(0)))
	})

	test("registration gap control: a row read the wallet's lock left empty leaves the window to its own guard", async () => {
		const h = await makeHarness()
		const rec = await h.queuedRecord()
		const { release, reached } = h.parkProfile()
		void h.execute(rec.id)
		await reached
		h.dropRow()
		h.lockOnNextRead()

		release()
		await opened(h, () => h.interactionFor(rec.id))
		// The read after registration has run: the window it found is still the request's.
		await new Promise((r) => setTimeout(r, 0))
		expect(h.removeSpy).not.toHaveBeenCalled()
		expect(h.interactionFor(rec.id)).toBeDefined()
	})
})
