// @vitest-environment node
/**
 * Every `PxeService` method that hands the PXE a list of scopes makes the PXE sync each scope's
 * private state for the contracts it touches, and every contract sync runs the HandshakeRegistry's
 * discovery for that scope. A scope the PXE holds no keys for is refused before the PXE runs: its
 * discovery would advance the handshake cursor past notes it cannot decrypt.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("./known-artifacts", () => ({
	loadProductionKnownArtifacts: async () => ({ artifacts: new Map(), instances: new Map() }),
}))
vi.mock("./note-schemas", () => ({
	loadProductionNoteSchemas: async () => new Map<string, unknown>(),
}))

import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { jsonStringify } from "@aztec-labs/foundation/json-rpc"
import type { PXE } from "@aztec-labs/pxe/client/bundle"
import { EventSelector, FunctionCall, FunctionSelector, FunctionType } from "@aztec-labs/stdlib/abi"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { GasSettings } from "@aztec-labs/stdlib/gas"
import { TxContext, TxExecutionRequest } from "@aztec-labs/stdlib/tx"
import type { ILogger } from "@nulo/wallet-core/logger"
import { PxeScopeUnregisteredError } from "@nulo/extension-messaging/errors"
import { ChainRuntime, type NetworkInfo, type PxeFactory } from "./chain-runtime"
import { type IProfileReader, PxeService } from "./service"

const noopLogger: ILogger = { log: () => {} }
const noopProfiles: IProfileReader = { connect: async () => {}, getProfiles: async () => [] }
const network: NetworkInfo = { profileId: "p1", chainId: 31337, rpcUrl: "http://localhost:8080" }
const ACCOUNT = "0x000000000000000000000000000000000000000000000000000000000000ab12"
const TOKEN = "0x000000000000000000000000000000000000000000000000000000000000cd34"
const OTHER = "0x000000000000000000000000000000000000000000000000000000000000ef56"

/** Wire forms, built without Barretenberg (no random addresses, no hashing). */
const wire = (value: unknown) => JSON.parse(jsonStringify(value))
const txRequest = () =>
	wire(
		new TxExecutionRequest(
			AztecAddress.fromStringUnsafe(ACCOUNT),
			FunctionSelector.fromField(new Fr(1)),
			Fr.ZERO,
			new TxContext(1, 2, GasSettings.empty()),
			[],
			[],
			[],
			Fr.ZERO,
		),
	)
const utilityCall = () =>
	wire(
		new FunctionCall(
			"balance_of_private",
			AztecAddress.fromStringUnsafe(TOKEN),
			FunctionSelector.fromField(new Fr(2)),
			FunctionType.UTILITY,
			false,
			true,
			[],
		),
	)

type ScopedMethod = {
	name: string
	call: (service: PxeService, scopes: string[]) => Promise<unknown>
}

/** The six entry points that reach the PXE's contract sync, each with the scopes it forwards. */
const SCOPED_METHODS: readonly ScopedMethod[] = [
	{ name: "getNotes", call: (s, scopes) => s.getNotes(network, wire({ contractAddress: TOKEN, scopes })) },
	{ name: "simulateTx", call: (s, scopes) => s.simulateTx(network, txRequest(), { simulatePublic: false, scopes } as never) },
	{ name: "proveTx", call: (s, scopes) => s.proveTx(network, txRequest(), scopes as never) },
	{
		name: "profileTx",
		call: (s, scopes) => s.profileTx(network, txRequest(), { profileMode: "gates", skipProofGeneration: true, scopes } as never),
	},
	{ name: "executeUtility", call: (s, scopes) => s.executeUtility(network, utilityCall(), { scopes } as never) },
	{
		name: "getPrivateEvents",
		call: (s, scopes) =>
			s.getPrivateEvents(network, wire(EventSelector.fromField(new Fr(3))), wire({ contractAddress: TOKEN, scopes })),
	},
]

/** A PXE whose scope-taking entry points record the scopes they were asked to sync. */
function makeHarness(registered: string[]) {
	const synced: Array<{ method: string; scopes: string[] }> = []
	const record = (method: string, scopes: AztecAddress[]) => synced.push({ method, scopes: scopes.map((s) => s.toString()) })
	const factory: PxeFactory = {
		createChainRuntime: async (n) => {
			const pxe = {
				getRegisteredAccounts: async () => registered.map((a) => ({ address: AztecAddress.fromStringUnsafe(a) })),
				debug: {
					getNotes: async (filter: { scopes: AztecAddress[] }) => {
						record("getNotes", filter.scopes)
						return []
					},
				},
				simulateTx: async (_req: unknown, opts: { scopes: AztecAddress[] }) => {
					record("simulateTx", opts.scopes)
					return {}
				},
				proveTx: async (_req: unknown, opts: { scopes: AztecAddress[] }) => {
					record("proveTx", opts.scopes)
					return {}
				},
				profileTx: async (_req: unknown, opts: { scopes: AztecAddress[] }) => {
					record("profileTx", opts.scopes)
					return {}
				},
				executeUtility: async (_call: unknown, opts: { scopes: AztecAddress[] }) => {
					record("executeUtility", opts.scopes)
					return {}
				},
				getPrivateEvents: async (_selector: unknown, filter: { scopes: AztecAddress[] }) => {
					record("getPrivateEvents", filter.scopes)
					return []
				},
			} as unknown as PXE
			return new ChainRuntime(n.chainId, {} as never, pxe, n.rpcUrl)
		},
	}
	const service = new PxeService(noopProfiles, noopLogger, factory)
	;(service as unknown as { initialized: boolean }).initialized = true
	return { service, synced }
}

beforeEach(() => {
	vi.stubGlobal("chrome", { runtime: { onMessage: { addListener: () => {} }, sendMessage: () => {} } })
})
afterEach(() => {
	vi.unstubAllGlobals()
})

describe("PxeService forwards the scopes of an account the PXE holds keys for", () => {
	test.each(SCOPED_METHODS)("$name syncs a registered scope", async ({ name, call }) => {
		const { service, synced } = makeHarness([ACCOUNT])
		await call(service, [ACCOUNT])
		expect(synced).toEqual([{ method: name, scopes: [ACCOUNT] }])
	})
})

describe("PxeService refuses a scope the PXE holds no keys for", () => {
	test.each(SCOPED_METHODS)("$name refuses before the PXE syncs", async ({ call }) => {
		const { service, synced } = makeHarness([ACCOUNT])
		await expect(call(service, [ACCOUNT, OTHER])).rejects.toBeInstanceOf(PxeScopeUnregisteredError)
		expect(synced).toEqual([])
	})

	test("an empty scope list reaches the PXE: it syncs nothing", async () => {
		const { service, synced } = makeHarness([])
		await service.executeUtility(network, utilityCall(), { scopes: [] } as never)
		expect(synced).toEqual([{ method: "executeUtility", scopes: [] }])
	})
})
