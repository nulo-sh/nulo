// @vitest-environment node

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("./known-artifacts", () => ({
	loadProductionKnownArtifacts: async () => ({ artifacts: new Map(), instances: new Map() }),
}))
vi.mock("./note-schemas", () => ({
	loadProductionNoteSchemas: async () => new Map<string, unknown>(),
}))

import { Fr } from "@aztec-labs/foundation/curves/bn254"
import type { PXE } from "@aztec-labs/pxe/client/bundle"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { CompleteAddress } from "@aztec-labs/stdlib/contract"
import { PxeTaggingSourcesFullError, walletErrorFromPayload } from "@nulo/extension-messaging/errors"
import type { ILogger } from "@nulo/wallet-core/logger"
import { ChainRuntime, type NetworkInfo, type PxeFactory } from "./chain-runtime"
import { type IProfileReader, PxeService } from "./service"

const noopLogger: ILogger = { log: () => {} }
const noopProfiles: IProfileReader = { connect: async () => {}, getProfiles: async () => [] }
const network: NetworkInfo = { profileId: "p1", chainId: 31337, rpcUrl: "http://localhost:8080" }
const BOUND = 128

const addressAt = (i: number) => AztecAddress.fromBigIntUnsafe(BigInt(i + 1))
/** The service parses what the RPC carries: hex strings. */
const wire = (value: { toString(): string }) => value.toString() as never

/** A key the PXE can register, with the address it derives. */
async function accountKey(seed: number) {
	const secretKey = new Fr(BigInt(seed))
	const partialAddress = new Fr(BigInt(seed) + 1000n)
	const { address } = await CompleteAddress.fromSecretKeyAndPartialAddress(secretKey, partialAddress)
	return { secretKey, partialAddress, address }
}

/** The store as the registration reads list it: senders and accounts, each possibly repeated in the other. */
function makeHarness(senders: AztecAddress[], accounts: AztecAddress[]) {
	const writes: string[] = []
	const accountAddressOf = new Map<string, AztecAddress>()
	const pxe = {
		getTaggingSecretSources: async () => senders.map((sender) => ({ kind: "address-derived", sender })),
		registerTaggingSecretSource: async ({ sender }: { sender: AztecAddress }) => {
			writes.push(`sender ${sender}`)
			senders.push(sender)
		},
		getRegisteredAccounts: async () => accounts.map((address) => ({ address })),
		registerAccount: async (_keys: unknown, partialAddress: Fr) => {
			const address = accountAddressOf.get(partialAddress.toString())
			if (!address) throw new Error("unknown test key")
			writes.push(`account ${address}`)
			accounts.push(address)
			return { address }
		},
	} as unknown as PXE
	const factory: PxeFactory = { createChainRuntime: async (n) => new ChainRuntime(n.chainId, {} as never, pxe, n.rpcUrl) }
	const service = new PxeService(noopProfiles, noopLogger, factory)
	;(service as unknown as { initialized: boolean }).initialized = true
	const registerAccount = async (key: Awaited<ReturnType<typeof accountKey>>, bound?: number) => {
		accountAddressOf.set(key.partialAddress.toString(), key.address)
		return service.registerAccount(network, wire(key.secretKey), wire(key.partialAddress), bound)
	}
	return { service, writes, registerAccount }
}

const distinct = (from: number, count: number) => Array.from({ length: count }, (_, i) => addressAt(from + i))

describe("a bounded registration counts the chain's distinct senders and accounts", () => {
	beforeEach(() => {
		vi.stubGlobal("chrome", { runtime: { onMessage: { addListener: () => {} }, sendMessage: () => {} } })
	})
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	test("at 127 sources a new sender and a new account are each admitted", async () => {
		const senderSide = makeHarness(distinct(0, 100), distinct(100, 27))
		await senderSide.service.registerSender(network, wire(addressAt(500)), BOUND)
		expect(senderSide.writes).toEqual([`sender ${addressAt(500)}`])

		const key = await accountKey(7)
		const accountSide = makeHarness(distinct(0, 100), distinct(100, 27))
		await accountSide.registerAccount(key, BOUND)
		expect(accountSide.writes).toEqual([`account ${key.address}`])
	})

	test("at 128 sources a new sender and a new account are refused and nothing is written", async () => {
		const { service, writes, registerAccount } = makeHarness(distinct(0, 100), distinct(100, 28))
		await expect(service.registerSender(network, wire(addressAt(500)), BOUND)).rejects.toBeInstanceOf(PxeTaggingSourcesFullError)
		await expect(registerAccount(await accountKey(7), BOUND)).rejects.toBeInstanceOf(PxeTaggingSourcesFullError)
		expect(writes).toEqual([])
	})

	test("at 128 an address already counted is admitted, as a sender over an account and as an account over a sender", async () => {
		const key = await accountKey(7)
		const asSender = makeHarness([...distinct(0, 100), key.address], distinct(100, 27))
		await asSender.registerAccount(key, BOUND)
		expect(asSender.writes).toEqual([`account ${key.address}`])

		const asAccount = makeHarness(distinct(0, 100), [...distinct(100, 27), addressAt(500)])
		await asAccount.service.registerSender(network, wire(addressAt(500)), BOUND)
		expect(asAccount.writes).toEqual([`sender ${addressAt(500)}`])
	})

	test("an address that is both a sender and an account counts once", async () => {
		const both = distinct(0, 64)
		const { service, writes } = makeHarness([...both, ...distinct(64, 63)], [...both])
		await service.registerSender(network, wire(addressAt(500)), BOUND)
		await expect(service.registerSender(network, wire(addressAt(501)), BOUND)).rejects.toBeInstanceOf(PxeTaggingSourcesFullError)
		expect(writes).toEqual([`sender ${addressAt(500)}`])
	})

	test("an unbounded registration, the person's own, is admitted past the bound", async () => {
		const key = await accountKey(7)
		const { service, writes, registerAccount } = makeHarness(distinct(0, 100), distinct(100, 28))
		await service.registerSender(network, wire(addressAt(500)))
		await registerAccount(key)
		expect(writes).toEqual([`sender ${addressAt(500)}`, `account ${key.address}`])
	})

	test("two concurrent bounded registrations at 127 admit exactly one", async () => {
		const { service, writes } = makeHarness(distinct(0, 127), [])
		const outcomes = await Promise.allSettled([
			service.registerSender(network, wire(addressAt(500)), BOUND),
			service.registerSender(network, wire(addressAt(501)), BOUND),
		])
		expect(outcomes.map((o) => o.status).sort()).toEqual(["fulfilled", "rejected"])
		expect((outcomes.find((o) => o.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(PxeTaggingSourcesFullError)
		expect(writes).toHaveLength(1)
	})

	test("the refusal crosses the worker hop as its own class, naming no address", async () => {
		const { service } = makeHarness(distinct(0, 128), [])
		const refusal = await service.registerSender(network, wire(addressAt(500)), BOUND).then(
			() => expect.unreachable("a registration past the bound was admitted"),
			(e: PxeTaggingSourcesFullError) => e,
		)
		const rebuilt = walletErrorFromPayload(JSON.parse(JSON.stringify(refusal.toPayload())))
		expect(rebuilt).toBeInstanceOf(PxeTaggingSourcesFullError)
		expect(rebuilt.message).not.toContain(addressAt(500).toString())
	})
})
