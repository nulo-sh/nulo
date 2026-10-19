// @vitest-environment node
/**
 * A dApp's registrations through the real PXE service, its arguments and errors crossing the worker
 * hop as the RPC carries them: the bound the handlers pass, the refusal as the dApp reads it, and the
 * person's own registration, which passes none. Node environment for the real key derivation.
 */

import { describe, expect, test } from "vitest"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { jsonStringify } from "@aztec-labs/foundation/json-rpc"
import type { PXE } from "@aztec-labs/pxe/client/bundle"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { computePartialAddress, type ContractInstanceWithAddress } from "@aztec-labs/stdlib/contract"
import { ScopeViolationError, WalletError, walletErrorFromPayload } from "@nulo/extension-messaging/errors"
import { FrozenSchnorrAccountArtifact, NuloAccount } from "@nulo/aztec-runtime/account"
import { ChainRuntime, PxeService } from "@nulo/aztec-runtime/pxe"
import type { ILogger } from "@nulo/wallet-core/logger"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { toWalletResponseError } from "@/wallet/services/wallet-sdk/error-envelope"
import { DAPP_TAGGING_SOURCES_BOUND, ExecutionService } from "./service"

const noopLogger: ILogger = { log: () => {} }
const NETWORK = { id: "net1", profileId: "p1", chainId: 1, primaryEndpointId: "ep1", endpoints: [{ id: "ep1", rpcUrl: "http://fake" }] }

const addressAt = (i: number) => AztecAddress.fromBigIntUnsafe(BigInt(i + 1))
const distinct = (from: number, count: number) => Array.from({ length: count }, (_, i) => addressAt(from + i))

/** An account instance in the wire form a dApp sends, with its own secret key. */
async function keyedInstance(seed: bigint) {
	const account = (await NuloAccount.new(new Fr(seed), noopLogger, "account")) as unknown as {
		instance: ContractInstanceWithAddress
		secretKey: Fr
	}
	return {
		instance: JSON.parse(jsonStringify(account.instance)),
		secretKey: account.secretKey.toString(),
		address: account.instance.address,
		partialAddress: (await computePartialAddress(account.instance)).toString(),
	}
}

/** Each PXE call as the client makes it: JSON arguments, a `WalletError` rebuilt from its payload. */
function overTheWire<A extends unknown[], R>(call: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
	return async (...args) => {
		try {
			return await call(...(JSON.parse(jsonStringify(args)) as A))
		} catch (error) {
			if (error instanceof WalletError) throw walletErrorFromPayload(JSON.parse(JSON.stringify(error.toPayload())))
			throw error
		}
	}
}

function makeService(senders: AztecAddress[], accounts: AztecAddress[]) {
	const writes: string[] = []
	const accountAddressOf = new Map<string, AztecAddress>()
	const pxe = {
		getTaggingSecretSources: async () => senders.map((sender) => ({ kind: "address-derived", sender })),
		registerTaggingSecretSource: async ({ sender }: { sender: AztecAddress }) => {
			writes.push("registerSender")
			senders.push(sender)
		},
		getRegisteredAccounts: async () => accounts.map((address) => ({ address })),
		registerAccount: async (_keys: unknown, partialAddress: Fr) => {
			const address = accountAddressOf.get(partialAddress.toString())
			if (!address) throw new Error("unknown test key")
			writes.push("registerAccount")
			accounts.push(address)
			return { address }
		},
		getContractArtifact: async () => undefined,
		registerContractClass: async () => {},
		registerContract: async (instance: ContractInstanceWithAddress) => {
			writes.push("registerContract")
			return instance.address
		},
	} as unknown as PXE
	const pxeService = new PxeService({ connect: async () => {}, getProfiles: async () => [] }, noopLogger, {
		createChainRuntime: async (n) => new ChainRuntime(n.chainId, {} as never, pxe, n.rpcUrl),
	})
	;(pxeService as unknown as { initialized: boolean }).initialized = true

	const service = new ExecutionService(new LoggerStore(new ConfigStore()))
	const internals = service as unknown as {
		networkService: unknown
		pxeService: unknown
		executeAztecRegisterSender(op: unknown): Promise<unknown>
		executeAztecRegisterContract(op: unknown): Promise<unknown>
		executeRegisterSender(op: unknown): Promise<unknown>
	}
	internals.networkService = { getNetwork: async () => NETWORK }
	internals.pxeService = {
		registerSender: overTheWire(pxeService.registerSender.bind(pxeService)),
		registerAccount: overTheWire(pxeService.registerAccount.bind(pxeService)),
		registerContract: overTheWire(pxeService.registerContract.bind(pxeService)),
		getContractArtifact: async () => FrozenSchnorrAccountArtifact,
	}
	const dappSender = (address: AztecAddress) =>
		internals.executeAztecRegisterSender({ kind: "aztec_registerSender", networkId: NETWORK.id, address: address.toString() })
	const dappContract = (keyed: Awaited<ReturnType<typeof keyedInstance>>, withKey = true) => {
		accountAddressOf.set(keyed.partialAddress, keyed.address)
		return internals.executeAztecRegisterContract({
			kind: "aztec_registerContract",
			networkId: NETWORK.id,
			instance: keyed.instance,
			secretKey: withKey ? keyed.secretKey : undefined,
		})
	}
	const ownSender = (address: AztecAddress) =>
		internals.executeRegisterSender({ kind: "register_sender", networkId: NETWORK.id, address: address.toString() })
	return { writes, dappSender, dappContract, ownSender }
}

/** What a dApp receives for a refusal: the scope envelope every grant refusal shares. */
const dappReads = (error: unknown) => toWalletResponseError(error)
const SCOPE_ENVELOPE = toWalletResponseError(
	new ScopeViolationError("Scope violation: requested account not authorized for this dApp session"),
)

describe(`a dApp grows a chain's senders and accounts to at most ${DAPP_TAGGING_SOURCES_BOUND}`, () => {
	test("its sender is admitted at 127 sources and refused at 128, read as the scope refusal", async () => {
		const { writes, dappSender } = makeService(distinct(0, 100), distinct(100, 27))
		await dappSender(addressAt(500))
		const refusal = await dappSender(addressAt(501)).catch((e: unknown) => e)
		expect(refusal).toBeInstanceOf(ScopeViolationError)
		expect(dappReads(refusal)).toEqual(SCOPE_ENVELOPE)
		expect(writes).toEqual(["registerSender"])
	})

	test("its keyed contract registers the account, then the contract, at 127 sources", async () => {
		const { writes, dappContract } = makeService(distinct(0, 100), distinct(100, 27))
		await dappContract(await keyedInstance(2n))
		expect(writes).toEqual(["registerAccount", "registerContract"])
	})

	test("its keyed contract refused at 128 sources registers neither the account nor the contract", async () => {
		const { writes, dappContract } = makeService(distinct(0, 100), distinct(100, 28))
		const refusal = await dappContract(await keyedInstance(2n)).catch((e: unknown) => e)
		expect(refusal).toBeInstanceOf(ScopeViolationError)
		expect(writes).toEqual([])
	})

	test("its keyless contract adds no source and is admitted at 128", async () => {
		const { writes, dappContract } = makeService(distinct(0, 100), distinct(100, 28))
		await dappContract(await keyedInstance(2n), false)
		expect(writes).toEqual(["registerContract"])
	})

	test("the person's own sender is admitted at 128", async () => {
		const { writes, ownSender } = makeService(distinct(0, 100), distinct(100, 28))
		await ownSender(addressAt(500))
		expect(writes).toEqual(["registerSender"])
	})
})
