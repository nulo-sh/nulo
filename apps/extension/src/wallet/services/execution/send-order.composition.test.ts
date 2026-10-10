/**
 * Send ordering after a worker restart: a freshly started ExecutionService (its lane, sequencer and
 * transfer executor keep nothing across one) and the real journal, against a pending row that names
 * fee contract F. Every case stops before the build: no PXE call, no simulation, no proof.
 */
import { describe, expect, test, vi } from "vitest"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { JobCancelledError } from "@nulo/extension-messaging/errors"
import { EventHandler } from "@nulo/wallet-core/utils"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { ServiceCollection } from "@/wallet/base"
import { svc } from "@/wallet/services/composition-harness"
import { ProfileService } from "@/wallet/services/profile/service"
import { type ExecutionFence, ProfileDeletionState } from "@/wallet/services/profile/profile-deletion-state"
import { NetworkService } from "@/wallet/services/network/service"
import { AccountService } from "@/wallet/services/account/service"
import { ContactService } from "@/wallet/services/contact/service"
import { TokenService } from "@/wallet/services/token/service"
import { PriceService } from "@/wallet/services/price/service"
import { FpcService } from "@/wallet/services/fpc/service"
import { FpcType } from "@/wallet/services/fpc/spec"
import { TransactionService, TransferType, TxStatus } from "@/wallet/services/transaction/service"
import { TxExecutionResult } from "@/wallet/services/transaction/spec"
import { AuthRegistryService } from "@/wallet/services/auth-registry/service"
import { LegalAcceptanceService } from "@/wallet/services/legal/service"
import { OperationJournalService } from "@/wallet/services/operation-journal/service"
import { TaskService } from "@/wallet/services/task/service"
import type { PxeServiceClient } from "@/wallet/services/pxe/client"
import { NOOP_PROOF_GATE } from "@/e2e/proof-gate"
import type { FeeSettings } from "./models"
import type { SendSequencer } from "./send-sequencer"
import { ExecutionService } from "./service"
import type { TransferExecutor } from "./transfer-executor"

const NETWORK = { id: "net1", chainId: 1, l1ChainId: 5, primaryEndpointId: "ep1", endpoints: [{ id: "ep1", rpcUrl: "http://fake" }] }
const ACCOUNT = AztecAddress.fromNumberUnsafe(0x1234).toString()
const F = AztecAddress.fromNumberUnsafe(0xf).toString()
const G = AztecAddress.fromNumberUnsafe(0x6).toString()
/** Hand-added sponsors: neither is the protocol one, so each may spend the payer's notes. */
const SPONSORS: Record<string, string> = { "fpc-f": F, "fpc-g": G }
const FENCE_SESSION = 1

async function makeHarness() {
	const api = new FakeBrowserApi()
	api.reset()
	const logger = new LoggerStore(new ConfigStore())
	const journal = new OperationJournalService(logger, api)
	const stages: string[] = []
	journal.onOperationUpdated.add((rec) => stages.push(rec.progress.stage))
	const deletionState = new ProfileDeletionState()
	const fenceLive = (fence: ExecutionFence) => fence.profileId === "p1" && fence.session === FENCE_SESSION
	const getPXE = vi.fn()
	const pxeClient = { getPXE, onProvePhase: { add: () => {} } } as unknown as PxeServiceClient
	// Submitted before the restart, still unmined: it spends another token, through F.
	const pendingRow = {
		hash: "0xprev",
		chainId: NETWORK.chainId,
		account: ACCOUNT,
		calls: [
			{
				contract: "0xother",
				method: "transfer_public_to_public",
				args: [],
				transfers: [{ type: TransferType.Public, from: ACCOUNT, to: "0xbob" }],
			},
		],
		createdAt: Date.now(),
		status: TxStatus.Pending,
		feeSpender: F,
	}

	const collection = new ServiceCollection()
	collection.add(
		svc(ProfileService.name, {
			getActiveProfile: async () => ({ id: "p1" }),
			getProfiles: async () => [{ id: "p1" }],
			getDeletionState: () => deletionState,
			captureExecutionFence: async (): Promise<ExecutionFence> => ({
				profileId: "p1",
				epoch: deletionState.capture("p1"),
				session: FENCE_SESSION,
			}),
			assertFence: async () => {},
			isFenceLive: fenceLive,
			peekLiveSerial: () => FENCE_SESSION,
			setExpiryDeferral: () => {},
			onActiveProfileChanged: new EventHandler<unknown>(),
		}),
	)
	collection.add(svc(NetworkService.name, { getNetwork: async () => NETWORK, getNode: async () => ({}) }))
	collection.add(svc(AccountService.name, {}))
	collection.add(
		svc(TransactionService.name, {
			getPendingForAccount: () => [pendingRow],
			// One mined tx: the account is initialized, so a public send here holds only its fee contract.
			getTransactions: async () => [
				{ chainId: NETWORK.chainId, status: TxStatus.Proposed, executionResult: TxExecutionResult.Success, calls: [] },
				pendingRow,
			],
			addTransaction: vi.fn(),
			onTransactionUpdated: { add: () => {} },
		}),
	)
	collection.add(svc(TokenService.name, { getTokenRaw: async () => ({ contract: "0xtoken" }) }))
	collection.add(
		svc(FpcService.name, {
			onFpcUpdated: { add: () => {} },
			onFpcDeleted: { add: () => {} },
			getFpcImpl: async (id: string) => ({
				infoData: {
					id,
					profileId: "p1",
					chainId: NETWORK.chainId,
					type: FpcType.DefaultSponsoredFpc,
					address: SPONSORS[id],
					isProtocol: false,
				},
			}),
		}),
	)
	collection.add(svc(ContactService.name, {}))
	collection.add(svc(AuthRegistryService.name, {}))
	collection.add(svc(LegalAcceptanceService.name, { assertCurrent: async () => {} }))
	collection.add(journal)
	collection.add(svc(TaskService.name, { startNewTask: () => ({ complete: vi.fn(), fail: vi.fn(), cancel: vi.fn() }) }))
	collection.add(svc(PriceService.name, {}))
	const service = new ExecutionService(logger, NOOP_PROOF_GATE, () => pxeClient)
	collection.add(service)
	await collection.start()

	const internals = service as unknown as { transferExecutor: TransferExecutor; sendSequencer: SendSequencer }
	return { service, journal, stages, getPXE, internals }
}

const request = (fpcId: string) => {
	const feeSettings: FeeSettings = { paymentMethod: { kind: "fpc", fpcId } }
	return {
		networkId: NETWORK.id,
		accountAddress: ACCOUNT,
		tokenId: 1,
		transferType: TransferType.Public,
		recipientAddress: AztecAddress.fromNumberUnsafe(0x5678).toString(),
		amount: 10n,
		feeSettings,
	}
}

const waitFor = async (pred: () => boolean | Promise<boolean>, timeoutMs = 2000) => {
	const deadline = Date.now() + timeoutMs
	while (!(await pred())) {
		if (Date.now() > deadline) throw new Error("waitFor timeout")
		await new Promise((r) => setTimeout(r, 5))
	}
}

describe("send ordering composition: a restarted worker still orders by the recorded fee spender", () => {
	test("a transfer through the pending row's fee contract starts queued, is never claimed while that row is pending, and a cancel ends it without the PXE", async () => {
		const h = await makeHarness()
		const r = request("fpc-f")
		const run = h.service
			.executeTransfer(r.networkId, r.accountAddress, r.tokenId, r.transferType, r.recipientAddress, r.amount, r.feeSettings)
			.catch((e: unknown) => e)
		let id = ""
		await waitFor(async () => {
			id = (await h.journal.getOperations({ profileId: "p1" }))[0]?.id ?? ""
			return id !== ""
		})
		expect((await h.journal.getOperation(id))?.progress.stage).toBe("queued")
		// Past two of the sequencer's polls: the row is still pending, so the send is still waiting.
		await new Promise((r) => setTimeout(r, 1_200))
		expect((await h.journal.getOperation(id))?.progress.stage).toBe("queued")

		await h.service.cancelJob(id)
		expect(await run).toBeInstanceOf(JobCancelledError)
		expect((await h.journal.getOperation(id))?.progress.stage).toBe("cancelled")
		expect(h.stages).not.toContain("pending")
		expect(h.stages).not.toContain("simulating")
		expect(h.getPXE).not.toHaveBeenCalled()
	})

	test("the same graph answers an estimate through F as queued, and holds nothing against a send through G", async () => {
		const h = await makeHarness()
		const f = request("fpc-f")
		expect(
			await h.service.estimateTransferFee(
				f.networkId,
				f.accountAddress,
				f.tokenId,
				f.transferType,
				f.recipientAddress,
				f.amount,
				f.feeSettings,
			),
		).toEqual({ queued: true, tokenSpent: false })
		const onG = await h.internals.transferExecutor.sequence(request("fpc-g"))
		expect([...onG.keys]).toEqual([`fpc:${G.toLowerCase()}`])
		expect(h.internals.sendSequencer.isBlocked(onG.scope, onG.keys)).toBe(false)
		expect(h.getPXE).not.toHaveBeenCalled()
	})
})
