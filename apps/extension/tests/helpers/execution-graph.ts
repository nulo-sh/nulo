/**
 * The execution service's real graph for `*.composition.test.ts`: `ExecutionService` with its lane,
 * sequencer, executors and caches, over the real `OperationJournalService` on a `FakeBrowserApi`.
 * Every other service is a stub of the calls the graph makes: a test passes the ones whose answers
 * it shapes, and the rest are inert. See `apps/extension/tests/COMPOSITION-TESTS.md`.
 */
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { AccountService } from "@/wallet/services/account/service"
import { AuthRegistryService } from "@/wallet/services/auth-registry/service"
import { svc } from "@/wallet/services/composition-harness"
import { ContactService } from "@/wallet/services/contact/service"
import { DAPP_SESSION_SERVICE_NAME } from "@/wallet/services/dapp-session/spec"
import type { EstimateCancelRegistry } from "@/wallet/services/execution/estimate-cancel-registry"
import type { ExecutionLane } from "@/wallet/services/execution/execution-lane"
import type { OperationEstimateReuse } from "@/wallet/services/execution/operation-estimate-reuse"
import type { PreviewSnapshots } from "@/wallet/services/execution/preview-snapshots"
import type { SendSequencer } from "@/wallet/services/execution/send-sequencer"
import { ExecutionService } from "@/wallet/services/execution/service"
import type { TransferEstimateReuse } from "@/wallet/services/execution/transfer-estimate-reuse"
import type { TransferExecutor } from "@/wallet/services/execution/transfer-executor"
import { FpcService } from "@/wallet/services/fpc/service"
import { LegalAcceptanceService } from "@/wallet/services/legal/service"
import { NetworkService } from "@/wallet/services/network/service"
import { OperationJournalService } from "@/wallet/services/operation-journal/service"
import { PriceService } from "@/wallet/services/price/service"
import { ProfileService } from "@/wallet/services/profile/service"
import type { PxeServiceClient } from "@/wallet/services/pxe/client"
import { TaskService } from "@/wallet/services/task/service"
import { TokenService } from "@/wallet/services/token/service"
import { TransactionService } from "@/wallet/services/transaction/service"
import { rowKeysForEveryProfile } from "@/wallet/storage/sealed-entity-storage.testing"
import type { ProofGate } from "@/e2e/proof-gate"

type Stub = Record<string, unknown>

/** The stubs of the services the graph resolves; the profile's row keys are added to `profile`. */
export type ExecutionGraphStubs = {
	profile: Stub
	network: Stub
	transactions: Stub
	fpc: Stub
	token: Stub
	account?: Stub
	authRegistry?: Stub
	legal?: Stub
	task?: Stub
	price?: Stub
}

/** The service's own collaborators a composition case reads or seeds. */
export type ExecutionInternals = {
	lane: ExecutionLane
	sendSequencer: SendSequencer
	transferExecutor: TransferExecutor
	estimateReuse: TransferEstimateReuse
	operationEstimateReuse: OperationEstimateReuse
	estimateCancel: EstimateCancelRegistry
	previewSnapshots: PreviewSnapshots
}

export async function startExecutionGraph(stubs: ExecutionGraphStubs, proofGate: ProofGate, pxeClient: PxeServiceClient) {
	const api = new FakeBrowserApi()
	api.reset()
	const logger = new LoggerStore(new ConfigStore())
	const journal = new OperationJournalService(logger, api)
	const collection = new ServiceCollection()
	collection.add(svc(ProfileService.name, { ...(await rowKeysForEveryProfile()), ...stubs.profile }))
	collection.add(svc(NetworkService.name, stubs.network))
	collection.add(svc(AccountService.name, stubs.account ?? {}))
	collection.add(svc(TransactionService.name, stubs.transactions))
	collection.add(svc(TokenService.name, stubs.token))
	collection.add(svc(FpcService.name, stubs.fpc))
	collection.add(svc(ContactService.name, {}))
	collection.add(svc(AuthRegistryService.name, stubs.authRegistry ?? {}))
	collection.add(svc(DAPP_SESSION_SERVICE_NAME, {}))
	collection.add(svc(LegalAcceptanceService.name, stubs.legal ?? { assertCurrent: async () => {} }))
	collection.add(journal)
	collection.add(svc(TaskService.name, stubs.task ?? {}))
	collection.add(svc(PriceService.name, stubs.price ?? {}))
	const service = new ExecutionService(logger, proofGate, () => pxeClient)
	collection.add(service)
	await collection.start()
	return { service, journal, api, logger, internals: service as unknown as ExecutionInternals }
}

/** A proof gate that holds `proveTxTask` until `release()`. */
export function makeControllableGate() {
	let resolveGate: () => void = () => {}
	let entered = false
	const gate: ProofGate = {
		wait: () => {
			entered = true
			return new Promise<void>((r) => {
				resolveGate = r
			})
		},
	}
	return {
		gate,
		release: () => resolveGate(),
		get entered() {
			return entered
		},
	}
}

/** Polls `pred` every 5 ms of real time until it holds, failing after `timeoutMs`. */
export async function waitFor(pred: () => boolean | Promise<boolean>, timeoutMs = 2000): Promise<void> {
	const deadline = Date.now() + timeoutMs
	while (!(await pred())) {
		if (Date.now() > deadline) throw new Error("waitFor timeout")
		await new Promise((r) => setTimeout(r, 5))
	}
}
