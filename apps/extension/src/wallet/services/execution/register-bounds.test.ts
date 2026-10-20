// @vitest-environment node
/**
 * A dApp's registrations through the real PXE service, with arguments crossing as JSON and errors
 * rebuilt from their payload as the worker hop does, admitted against the real registration counts:
 * the refusal as the dApp reads it, what a refused call writes, and a sender the person adds, which
 * is not counted. The client's own retry paths are not in play. Node environment for the real key
 * derivation.
 */

import { describe, expect, test } from "vitest"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { jsonStringify } from "@aztec-labs/foundation/json-rpc"
import type { PXE } from "@aztec-labs/pxe/client/bundle"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { computePartialAddress, type ContractInstanceWithAddress } from "@aztec-labs/stdlib/contract"
import { ScopeViolationError, WalletError, walletErrorFromPayload } from "@nulo/extension-messaging/errors"
import { MemoryStorageArea } from "@nulo/wallet-core/storage"
import { FrozenSchnorrAccountArtifact, NuloAccount } from "@nulo/aztec-runtime/account"
import { ChainRuntime, PxeService } from "@nulo/aztec-runtime/pxe"
import type { ILogger } from "@nulo/wallet-core/logger"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { AccountStateService } from "@/wallet/services/account-state/service"
import { APP_REGISTRATIONS_PER_CHAIN, RegistrationAllowance } from "@/wallet/services/dapp-session/registration-allowance"
import { OriginType } from "@/wallet/services/transaction/spec"
import { toWalletResponseError } from "@/wallet/services/wallet-sdk/error-envelope"
import { ExecutionService } from "./service"

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

/** What the worker hop changes: JSON arguments, a `WalletError` rebuilt from its payload. */
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
		dappSessionService: unknown
		executeAztecRegisterSender(op: unknown, origin: unknown): Promise<unknown>
		executeAztecRegisterContract(op: unknown, origin: unknown): Promise<unknown>
	}
	const allowance = new RegistrationAllowance(new MemoryStorageArea())
	internals.networkService = { getNetwork: async () => NETWORK }
	internals.dappSessionService = {
		admitDappRegistration: (origin: string, profileId: string, chainId: number) => allowance.admit(profileId, chainId, origin),
	}
	internals.pxeService = {
		registerSender: overTheWire(pxeService.registerSender.bind(pxeService)),
		registerAccount: overTheWire(pxeService.registerAccount.bind(pxeService)),
		registerContract: overTheWire(pxeService.registerContract.bind(pxeService)),
		getContractArtifact: async () => FrozenSchnorrAccountArtifact,
	}
	const accountState = new AccountStateService(new LoggerStore(new ConfigStore()))
	Object.assign(accountState, { initialized: true, networkService: internals.networkService, pxeService: internals.pxeService })
	const dapp = { type: OriginType.DAPP, name: "https://app.example" }
	const dappSender = (address: AztecAddress) =>
		internals.executeAztecRegisterSender({ kind: "aztec_registerSender", networkId: NETWORK.id, address: address.toString() }, dapp)
	const dappContract = (keyed: Awaited<ReturnType<typeof keyedInstance>>, withKey = true) => {
		accountAddressOf.set(keyed.partialAddress, keyed.address)
		return internals.executeAztecRegisterContract(
			{
				kind: "aztec_registerContract",
				networkId: NETWORK.id,
				instance: keyed.instance,
				secretKey: withKey ? keyed.secretKey : undefined,
			},
			dapp,
		)
	}
	/** Spends the rest of the app's share on fresh senders. */
	const useUpShare = async (spent = 0) => {
		for (const address of distinct(1000, APP_REGISTRATIONS_PER_CHAIN - spent)) await dappSender(address)
		writes.length = 0
	}
	const ownSender = (address: AztecAddress) => accountState.addSender(NETWORK.id, address.toString())
	return { writes, dappSender, dappContract, ownSender, useUpShare }
}

/** What a dApp receives for a refusal: the scope envelope every grant refusal shares. */
const dappReads = (error: unknown) => toWalletResponseError(error)
const SCOPE_ENVELOPE = toWalletResponseError(
	new ScopeViolationError("Scope violation: requested account not authorized for this dApp session"),
)

describe(`an app's registrations on a profile's chain stop at ${APP_REGISTRATIONS_PER_CHAIN}`, () => {
	test("past its share, its sender is refused as the scope refusal and nothing is written", async () => {
		const { writes, dappSender, useUpShare } = makeService([], [])
		await useUpShare()
		const refusal = await dappSender(addressAt(500)).catch((e: unknown) => e)
		expect(refusal).toBeInstanceOf(ScopeViolationError)
		expect(dappReads(refusal)).toEqual(SCOPE_ENVELOPE)
		expect(writes).toEqual([])
	})

	test("past its share, its keyed contract registers neither the account nor the contract", async () => {
		const { writes, dappContract, useUpShare } = makeService([], [])
		await useUpShare()
		const refusal = await dappContract(await keyedInstance(2n)).catch((e: unknown) => e)
		expect(refusal).toBeInstanceOf(ScopeViolationError)
		expect(writes).toEqual([])
	})

	test("an address the chain holds and a fresh one get the same answer, under the share and past it", async () => {
		const held = distinct(0, 100)
		const { writes, dappSender, useUpShare } = makeService([...held], distinct(100, 28))
		await dappSender(held[0])
		await dappSender(addressAt(500))
		expect(writes).toEqual(["registerSender", "registerSender"])
		await useUpShare(2)
		const refusals = await Promise.all([held[1], addressAt(501)].map((a) => dappSender(a).catch((e: unknown) => e)))
		expect(refusals.map(dappReads)).toEqual([SCOPE_ENVELOPE, SCOPE_ENVELOPE])
		expect(writes).toEqual([])
	})

	test("a keyless contract is not counted and is admitted past the share", async () => {
		const { writes, dappContract, useUpShare } = makeService([], [])
		await useUpShare()
		await dappContract(await keyedInstance(2n), false)
		expect(writes).toEqual(["registerContract"])
	})

	test("a sender the person adds is not counted and is admitted past the share", async () => {
		const { writes, ownSender, useUpShare } = makeService([], [])
		await useUpShare()
		await ownSender(addressAt(500))
		expect(writes).toEqual(["registerSender"])
	})
})
