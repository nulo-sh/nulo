/**
 * Composition test: one dApp batch through the REAL wallet-sdk dispatcher, the REAL ExecutionService
 * and the REAL TaskService, over fake storage and a node that answers only `getNodeInfo`. Each leg
 * runs as its own dApp root task, so a long batch is what fills the registry fastest. No sandbox,
 * PXE, bb or browser (`apps/extension/tests/COMPOSITION-TESTS.md`).
 */
import { describe, expect, test } from "vitest"
import { type IDappInteractionRunner, WalletSdkDispatcher } from "@nulo/wallet-bridge"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
import { NOOP_PROOF_GATE } from "@/e2e/proof-gate"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { AccountService } from "@/wallet/services/account/service"
import { AuthRegistryService } from "@/wallet/services/auth-registry/service"
import { svc } from "@/wallet/services/composition-harness"
import { ContactService } from "@/wallet/services/contact/service"
import { DappSessionService } from "@/wallet/services/dapp-session/service"
import { AccessLevel } from "@/wallet/services/dapp-session/spec"
import { FpcService } from "@/wallet/services/fpc/service"
import { LegalAcceptanceService } from "@/wallet/services/legal/service"
import { NetworkService } from "@/wallet/services/network/service"
import { OperationJournalService } from "@/wallet/services/operation-journal/service"
import { PriceService } from "@/wallet/services/price/service"
import { type ExecutionFence, ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { ProfileService } from "@/wallet/services/profile/service"
import type { PxeServiceClient } from "@/wallet/services/pxe/client"
import { FINISHED_DAPP_ROOTS_KEPT, TaskService } from "@/wallet/services/task/service"
import { TokenService } from "@/wallet/services/token/service"
import { TransactionService } from "@/wallet/services/transaction/service"
import { toWalletResponseError } from "@/wallet/services/wallet-sdk/error-envelope"
import { rowKeysForEveryProfile } from "@/wallet/storage/sealed-entity-storage.testing"
import { ExecutionService } from "./service"

const NETWORK = {
	id: "net1",
	profileId: "p1",
	// The node's pair below: (5 ^ 4) >>> 0 === 1.
	chainId: 1,
	l1ChainId: 5,
	primaryEndpointId: "ep1",
	endpoints: [{ id: "ep1", rpcUrl: "http://fake" }],
}
const APP = "https://a.example"

async function makeHarness() {
	const api = new FakeBrowserApi()
	api.reset()
	const logger = new LoggerStore(new ConfigStore())
	const deletionState = new ProfileDeletionState()
	const captureExecutionFence = async (): Promise<ExecutionFence> => ({ profileId: "p1", epoch: deletionState.capture("p1"), session: 1 })
	const node = { getNodeInfo: async () => ({ l1ChainId: 5, rollupVersion: 4 }) }
	const pxeClient = { onProvePhase: { add: () => {} } } as unknown as PxeServiceClient

	const collection = new ServiceCollection()
	collection.add(
		svc(ProfileService.name, {
			getActiveProfile: async () => ({ id: "p1" }),
			getProfiles: async () => [{ id: "p1" }],
			getDeletionState: () => deletionState,
			captureExecutionFence,
			deriveDappSessionMacKey: async () => crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]),
			setExpiryDeferral: () => {},
			onActiveProfileChanged: new EventHandler<unknown>(),
			...(await rowKeysForEveryProfile()),
		}),
	)
	collection.add(svc(NetworkService.name, { getNetwork: async () => NETWORK, getNode: async () => node }))
	collection.add(svc(AccountService.name, {}))
	collection.add(svc(TransactionService.name, { onTransactionUpdated: { add: () => {} } }))
	collection.add(svc(TokenService.name, {}))
	collection.add(svc(FpcService.name, { onFpcUpdated: { add: () => {} }, onFpcDeleted: { add: () => {} } }))
	collection.add(svc(ContactService.name, {}))
	collection.add(svc(AuthRegistryService.name, {}))
	collection.add(svc(LegalAcceptanceService.name, { assertCurrent: async () => {} }))
	collection.add(new OperationJournalService(logger, api))
	const tasks = new TaskService(logger)
	collection.add(tasks)
	collection.add(svc(PriceService.name, {}))
	const sessions = new DappSessionService(logger, api)
	collection.add(sessions)
	const execution = new ExecutionService(logger, NOOP_PROOF_GATE, () => pxeClient)
	collection.add(execution)
	await collection.start()

	const dispatcher = new WalletSdkDispatcher(
		{ getNetworksRaw: async () => [NETWORK] } as never,
		{ provisionDefaultAccount: async () => {}, getAccounts: async () => [] } as never,
		execution,
		{} as IDappInteractionRunner,
		sessions,
		logger,
	)
	await sessions.addDappSession({ url: APP }, [], [], AccessLevel.Transactions, String(NETWORK.chainId), "p1")
	const ctx = { chainId: NETWORK.chainId, profileId: "p1", origin: APP, sessionId: "wire-a", fence: await captureExecutionFence() }
	return { tasks, batch: (legs: unknown[]) => dispatcher.dispatch("batch", [legs], ctx) }
}

describe("a dApp batch against the finished-task bound", () => {
	test("a batch of more legs than the bound answers every leg and leaves the bound of finished dApp roots", async () => {
		const { tasks, batch } = await makeHarness()
		let created = 0
		let deleted = 0
		tasks.onTaskCreated.add(() => created++)
		tasks.onTaskDeleted.add(() => deleted++)
		const legs = Array.from({ length: FINISHED_DAPP_ROOTS_KEPT + 44 }, () => ({ name: "getChainInfo", args: [] }))

		const answers = (await batch(legs)) as Array<{ name: string; result: unknown }>

		expect(answers).toHaveLength(legs.length)
		expect(answers.filter((answer) => answer.name !== "getChainInfo" || answer.result === undefined)).toEqual([])
		expect({ created, deleted }).toEqual({ created: legs.length, deleted: 44 })
		expect(await tasks.getTasks()).toHaveLength(FINISHED_DAPP_ROOTS_KEPT)
	})
})

describe("a dApp batch against the call limit", () => {
	const chainLeg = { name: "getChainInfo", args: [] }

	test.each([
		["1,025 calls", Array.from({ length: 1_025 }, () => chainLeg)],
		["a batch inside it", [chainLeg, { name: "batch", args: [[chainLeg]] }]],
	])("a batch carrying %s is answered with the invalid-arguments reply and starts no task", async (_label, legs) => {
		const { tasks, batch } = await makeHarness()
		let created = 0
		tasks.onTaskCreated.add(() => created++)

		const reply = await batch(legs).then(
			() => "answered",
			(error: unknown) => toWalletResponseError(error),
		)

		expect(reply).toEqual({
			code: -32602,
			message: "The request's arguments do not match the wallet API.",
			data: { walletErrorCode: "INVALID_PARAMS" },
		})
		expect(created).toBe(0)
	})
})
