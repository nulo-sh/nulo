/**
 * A PXE op refused for naming an unregistered scope registers the op's own scopes through the
 * stamped network and retries exactly once; the store-key recovery composes with it.
 */
import { PxeScopeUnregisteredError, PxeStoreKeyMissingError } from "@nulo/extension-messaging/errors"
import { ServiceClient } from "@nulo/extension-messaging/offscreen"
import type { ILogger } from "@nulo/wallet-core/logger"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { NetworkInfo } from "./chain-runtime"
import { PxeServiceClientBase, type ScopeRegistrar } from "./client"

const noopLogger: ILogger = { log: () => {} }
const net: NetworkInfo = { profileId: "p1", chainId: 31337, rpcUrl: "http://n/1" }
const ACCOUNT = "0x000000000000000000000000000000000000000000000000000000000000ab12"
const TOKEN = "0x000000000000000000000000000000000000000000000000000000000000cd34"

type Call = { method: string; args: unknown[] }
type Behavior = (method: string, args: unknown[]) => unknown

const refuse: Behavior = () => {
	throw new PxeScopeUnregisteredError()
}
const fail =
	(message: string): Behavior =>
	() => {
		throw new Error(message)
	}

/** Every scope-taking client method, each sent with `ACCOUNT` twice in its scope position. */
const SCOPED: ReadonlyArray<{ name: string; send: (client: PxeServiceClientBase) => Promise<unknown> }> = [
	{ name: "getNotes", send: (c) => c.getNotes(net, { contractAddress: TOKEN, scopes: [ACCOUNT, ACCOUNT] } as never) },
	{ name: "proveTx", send: (c) => c.proveTx(net, {} as never, [ACCOUNT, ACCOUNT] as never) },
	{ name: "simulateTx", send: (c) => c.simulateTx(net, {} as never, { scopes: [ACCOUNT, ACCOUNT] } as never) },
	{ name: "profileTx", send: (c) => c.profileTx(net, {} as never, { scopes: [ACCOUNT, ACCOUNT] } as never) },
	{ name: "executeUtility", send: (c) => c.executeUtility(net, {} as never, { scopes: [ACCOUNT, ACCOUNT] } as never) },
	{ name: "getPrivateEvents", send: (c) => c.getPrivateEvents(net, {} as never, { scopes: [ACCOUNT, ACCOUNT] } as never) },
]

let wire: Call[]
let behaviors: Behavior[]

beforeEach(() => {
	vi.stubGlobal("self", globalThis)
	vi.stubGlobal("chrome", {
		runtime: {
			onMessage: { addListener: () => {} },
			connect: () => ({ onMessage: { addListener: () => {} }, onDisconnect: { addListener: () => {} }, postMessage: () => {} }),
		},
	})
	wire = []
	behaviors = []
	const impl = async (method: unknown, ...args: unknown[]) => {
		wire.push({ method: method as string, args })
		const behavior = behaviors.shift()
		return behavior ? behavior(method as string, args) : []
	}
	for (const proto of [ServiceClient.prototype, Object.getPrototypeOf(ServiceClient.prototype)]) {
		vi.spyOn(proto as { request: (...a: unknown[]) => Promise<unknown> }, "request").mockImplementation(impl)
	}
})

function makeClient(registrar?: ScopeRegistrar) {
	const client = new PxeServiceClientBase(noopLogger)
	client.setGenerationProvider(async () => "gen-A")
	if (registrar) client.setScopeRegistrar(registrar)
	return client
}

describe("PxeServiceClientBase registers a refused op's scopes and retries once", () => {
	test.each(SCOPED)("$name hands the registrar its own scopes and the stamped network", async ({ name, send }) => {
		const registrar = vi.fn<ScopeRegistrar>(async () => {})
		behaviors.push(refuse, fail("retried"))
		await expect(send(makeClient(registrar))).rejects.toThrowError("retried")
		expect(wire.map((w) => w.method)).toEqual([name, name])
		expect(registrar).toHaveBeenCalledTimes(1)
		const [pxe, network, scopes] = registrar.mock.calls[0] ?? []
		expect(pxe).toBeDefined()
		expect(network).toEqual({ ...net, pxeGeneration: "gen-A" })
		expect(scopes).toEqual([ACCOUNT])
		expect(wire[1]?.args).toEqual(wire[0]?.args)
	})

	test("a second refusal is terminal", async () => {
		const registrar = vi.fn<ScopeRegistrar>(async () => {})
		behaviors.push(refuse, refuse)
		await expect(SCOPED[0].send(makeClient(registrar))).rejects.toBeInstanceOf(PxeScopeUnregisteredError)
		expect(wire.map((w) => w.method)).toEqual(["getNotes", "getNotes"])
		expect(registrar).toHaveBeenCalledTimes(1)
	})

	test("a registrar failure propagates without a retry", async () => {
		behaviors.push(refuse)
		const registrar = vi.fn<ScopeRegistrar>(async () => {
			throw new Error("unknown account address")
		})
		await expect(SCOPED[0].send(makeClient(registrar))).rejects.toThrowError("unknown account address")
		expect(wire.map((w) => w.method)).toEqual(["getNotes"])
	})

	test("without a registrar, or on any other error, nothing is registered", async () => {
		behaviors.push(refuse)
		await expect(SCOPED[0].send(makeClient())).rejects.toBeInstanceOf(PxeScopeUnregisteredError)
		const registrar = vi.fn<ScopeRegistrar>(async () => {})
		behaviors.push(fail(PxeScopeUnregisteredError.MESSAGE))
		await expect(SCOPED[0].send(makeClient(registrar))).rejects.toThrowError(PxeScopeUnregisteredError.MESSAGE)
		expect(registrar).not.toHaveBeenCalled()
	})

	test("a refusal on the store-key retry still registers and retries", async () => {
		const registrar = vi.fn<ScopeRegistrar>(async () => {})
		const client = makeClient(registrar)
		client.setStoreKeyProvider(async () => ({ key: new Uint8Array(32), generation: "gen-A" }))
		behaviors.push(
			() => {
				throw new PxeStoreKeyMissingError("PXE_STORE_KEY_MISSING: p1")
			},
			() => undefined,
			refuse,
		)
		await expect(SCOPED[0].send(client)).resolves.toEqual([])
		expect(wire.map((w) => w.method)).toEqual(["getNotes", "provisionChainStoreKey", "getNotes", "getNotes"])
		expect(registrar).toHaveBeenCalledTimes(1)
	})
})
