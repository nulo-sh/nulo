// @vitest-environment node
/**
 * `aztec_registerContract`'s secret key against REAL key derivation: an account instance with its
 * own key registers both, and with any other account's key, or under other public keys, nothing. Node environment for the same reason
 * as `authwit-discoverer.real.test.ts` (foundation's poseidon fails under jsdom).
 */

import { describe, expect, test } from "vitest"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { jsonStringify } from "@aztec-labs/foundation/json-rpc"
import { computePartialAddress, type ContractInstanceWithAddress } from "@aztec-labs/stdlib/contract"
import { InvalidWalletArgumentsError } from "@nulo/extension-messaging/errors"
import { FrozenSchnorrAccountArtifact, NuloAccount } from "@nulo/aztec-runtime/account"
import type { ILogger } from "@nulo/wallet-core/logger"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
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
