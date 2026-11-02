// @vitest-environment node
/**
 * `aztec_registerContract`'s secret key against REAL key derivation: an account instance with its
 * own key registers both, and with any other account's key, or under other public keys, nothing. Node environment for the same reason
 * as `authwit-discoverer.real.test.ts` (foundation's poseidon fails under jsdom).
 */

import { describe, expect, test, vi } from "vitest"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { jsonStringify } from "@aztec-labs/foundation/json-rpc"
import { computePartialAddress, type ContractInstanceWithAddress } from "@aztec-labs/stdlib/contract"
import { InvalidWalletArgumentsError, ScopeViolationError } from "@nulo/extension-messaging/errors"
import { FrozenSchnorrAccountArtifact, NuloAccount } from "@nulo/aztec-runtime/account"
import type { ILogger } from "@nulo/wallet-core/logger"
import { EventHandler } from "@nulo/wallet-core/utils"
import { NOOP_PROOF_GATE } from "@/e2e/proof-gate"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { AccountService } from "@/wallet/services/account/service"
import { AuthRegistryService } from "@/wallet/services/auth-registry/service"
import { svc } from "@/wallet/services/composition-harness"
import { ContactService } from "@/wallet/services/contact/service"
import { DAPP_SESSION_SERVICE_NAME } from "@/wallet/services/dapp-session/spec"
import { FpcService } from "@/wallet/services/fpc/service"
import { LegalAcceptanceService } from "@/wallet/services/legal/service"
import { NetworkService } from "@/wallet/services/network/service"
import { OperationJournalService } from "@/wallet/services/operation-journal/service"
import type { ExecutionFence } from "@/wallet/services/profile/profile-deletion-state"
import { ProfileService } from "@/wallet/services/profile/service"
import type { PxeServiceClient } from "@/wallet/services/pxe/client"
import { TaskService } from "@/wallet/services/task/service"
import { TokenService } from "@/wallet/services/token/service"
import { OriginType, TransactionService } from "@/wallet/services/transaction/service"
import { ExecutionService } from "./service"

const noopLogger: ILogger = { log: () => {} }
const NETWORK = { id: "net1", profileId: "p1", chainId: 1, primaryEndpointId: "ep1", endpoints: [{ id: "ep1", rpcUrl: "http://fake" }] }

/** The instance in the wire form a dApp sends, the account's own secret key and its partial address. */
async function accountOf(seed: bigint): Promise<{ instance: Record<string, unknown>; secretKey: string; partialAddress: string }> {
	const account = (await NuloAccount.new(new Fr(seed), noopLogger, "account")) as unknown as {
		instance: ContractInstanceWithAddress
		secretKey: Fr
	}
	return {
		instance: JSON.parse(jsonStringify(account.instance)),
		secretKey: account.secretKey.toString(),
		partialAddress: (await computePartialAddress(account.instance)).toString(),
	}
}

function makeService() {
	const writes: Array<{ method: string; args: unknown[] }> = []
	const record =
		(method: string) =>
		async (...args: unknown[]) => {
			writes.push({ method, args })
		}
	const service = new ExecutionService(new LoggerStore(new ConfigStore()))
	const internals = service as unknown as {
		networkService: unknown
		pxeService: unknown
		dappSessionService: unknown
		executeAztecRegisterContract(op: unknown, registrant: unknown): Promise<void>
	}
	internals.networkService = { getNetwork: async () => NETWORK }
	internals.dappSessionService = { admitDappRegistration: async () => {} }
	internals.pxeService = {
		getContractArtifact: async () => FrozenSchnorrAccountArtifact,
		registerContract: record("registerContract"),
		registerAccount: record("registerAccount"),
	}
	const register = (instance: unknown, secretKey: string) =>
		internals.executeAztecRegisterContract(
			{ kind: "aztec_registerContract", networkId: NETWORK.id, instance, secretKey },
			{ origin: "https://app.example", fence: { profileId: "p1", epoch: 0, session: 1 } },
		)
	return { register, writes }
}

describe("aztec_registerContract binds its secret key to the instance", () => {
	test("the instance's own key registers its account under the instance's partial address, then the contract", async () => {
		const own = await accountOf(2n)
		const { register, writes } = makeService()

		await register(own.instance, own.secretKey)

		expect(writes.map((w) => w.method)).toEqual(["registerAccount", "registerContract"])
		const [, secretKey, partialAddress] = writes[0].args
		expect(secretKey).toBe(own.secretKey)
		expect(String(partialAddress)).toBe(own.partialAddress)
	})

	test("another account's key is refused as invalid arguments and nothing is registered", async () => {
		const own = await accountOf(2n)
		const other = await accountOf(3n)
		const { register, writes } = makeService()

		await expect(register(own.instance, other.secretKey)).rejects.toBeInstanceOf(InvalidWalletArgumentsError)
		expect(writes).toEqual([])
	})

	test("the instance's own address under another account's public keys is refused and nothing is registered", async () => {
		const own = await accountOf(2n)
		const other = await accountOf(3n)
		const { register, writes } = makeService()

		await expect(register({ ...own.instance, publicKeys: other.instance.publicKeys }, own.secretKey)).rejects.toBeInstanceOf(
			InvalidWalletArgumentsError,
		)
		expect(writes).toEqual([])
	})
})

const APP = "https://app.example"
const FENCE: ExecutionFence = { profileId: "p1", epoch: 0, session: 1 }

/** The facade started over stub services, so a dApp's call enters where the dispatcher hands it
 *  over (`executeOperations`) and admission is recorded in line with the PXE writes. */
async function startFacade(admit: () => Promise<void>) {
	const writes: string[] = []
	const record =
		(method: string) =>
		async (..._args: unknown[]) => {
			writes.push(method)
		}
	const pxeClient = {
		getContractArtifact: async () => FrozenSchnorrAccountArtifact,
		registerContract: record("registerContract"),
		registerAccount: record("registerAccount"),
		onProvePhase: { add: () => {} },
	} as unknown as PxeServiceClient
	const admitDappRegistration = vi.fn(async (..._args: unknown[]) => {
		writes.push("admit")
		await admit()
	})
	const collection = new ServiceCollection()
	collection.add(
		svc(ProfileService.name, {
			getActiveProfile: async () => ({ id: "p1" }),
			captureExecutionFence: async () => ({ ...FENCE }),
			setExpiryDeferral: () => {},
			onActiveProfileChanged: new EventHandler<unknown>(),
		}),
	)
	collection.add(svc(NetworkService.name, { getNetwork: async () => NETWORK }))
	collection.add(svc(AccountService.name, {}))
	collection.add(svc(TransactionService.name, { onTransactionUpdated: { add: () => {} } }))
	collection.add(svc(TokenService.name, {}))
	collection.add(svc(FpcService.name, { onFpcUpdated: { add: () => {} }, onFpcDeleted: { add: () => {} } }))
	collection.add(svc(ContactService.name, {}))
	collection.add(svc(AuthRegistryService.name, {}))
	collection.add(svc(LegalAcceptanceService.name, { assertCurrent: async () => {} }))
	collection.add(svc(OperationJournalService.name, {}))
	collection.add(svc(TaskService.name, { startNewTask: () => ({ complete: vi.fn(), fail: vi.fn(), cancel: vi.fn() }) }))
	collection.add(svc(DAPP_SESSION_SERVICE_NAME, { admitDappRegistration }))
	const execution = new ExecutionService(new LoggerStore(new ConfigStore()), NOOP_PROOF_GATE, () => pxeClient)
	collection.add(execution)
	await collection.start()
	const register = async (instance: unknown, secretKey: string) =>
		execution.executeOperations(
			[{ kind: "aztec_registerContract", networkId: NETWORK.id, instance, secretKey } as never],
			{ type: OriginType.DAPP, name: APP },
			undefined,
			undefined,
			undefined,
			FENCE,
		)
	return { register, writes, admitDappRegistration }
}

describe("a dApp's keyed registerContract through the facade", () => {
	test("is admitted under its app and the authorizing fence before the account, then the contract, registers", async () => {
		const own = await accountOf(2n)
		const { register, writes, admitDappRegistration } = await startFacade(async () => {})

		expect(await register(own.instance, own.secretKey)).toEqual([{ status: "ok", result: undefined }])

		expect(writes).toEqual(["admit", "registerAccount", "registerContract"])
		const [origin, fence, chainId] = admitDappRegistration.mock.calls[0] as unknown[]
		expect(origin).toBe(APP)
		expect(fence).toBe(FENCE)
		expect(chainId).toBe(NETWORK.chainId)
	})

	test("a refused admission registers neither the account nor the contract", async () => {
		const own = await accountOf(2n)
		const { register, writes } = await startFacade(async () => {
			throw new ScopeViolationError("Scope violation: the app's registrations are spent")
		})

		const [result] = await register(own.instance, own.secretKey)

		expect(result?.status).not.toBe("ok")
		expect(writes).toEqual(["admit"])
	})
})
