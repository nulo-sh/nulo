/**
 * Unit tests for `CollectingDiscoveryProbe`. Real hash paths run Barretenberg
 * WASM and are e2e-only (same discipline as authwit-discoverer.test.ts); the
 * crypto seam is injected so the logic — laziness, first-sim-only, dedup,
 * chain-assert ordering — is testable in isolation.
 */

import { describe, expect, test, vi } from "vitest"
import { CollectingDiscoveryProbe, type DiscoveryProbeCrypto } from "./discovery-probe"

const NETWORK = { chainId: 0, l1ChainId: 31337 } as never // local: only the exact l1ChainId binds
const SIGNER = { toString: () => "0xsigner" } as never
const OTHER = { toString: () => "0xother" } as never

function fakeSim(effects: { contractAddress: unknown; data: unknown[] }[]) {
	return {
		privateExecutionResult: {
			entrypoint: {
				offchainEffects: effects,
				nestedExecutionResults: [],
				publicInputs: { callContext: { contractAddress: { toString: () => "0xentry" } } },
			},
		},
	}
}

function fakeCrypto(hashByEffect: (data: unknown[]) => string | Error): DiscoveryProbeCrypto {
	return {
		fromFields: async (data) => {
			const h = hashByEffect(data as unknown[])
			if (h instanceof Error) throw h
			return {
				innerHash: h as never,
				onBehalfOf: data[1] as never,
				msgSender: `caller:${h}`,
				functionSelector: "0xsel",
				args: [`arg:${h}`],
			}
		},
		computeMessageHash: async (intent) => ({ toString: () => `mh:${intent.innerHash}` }) as never,
	}
}

function fakeNode() {
	const getNodeInfo = vi.fn(async () => ({ l1ChainId: 31337, rollupVersion: 1 }))
	return { node: { getNodeInfo } as never, getNodeInfo }
}

/** A request's tag and the account it names, as the fake decodes them. */
const effect = (tag: string, onBehalfOf: unknown = SIGNER) => ({ contractAddress: { toString: () => "0xtoken" }, data: [tag, onBehalfOf] })
const ctxOf = (node: never, network: never = NETWORK) => ({ node, network, signer: SIGNER })

describe("CollectingDiscoveryProbe", () => {
	test("no effects: returns [] without fetching node info (lazy chain fetch)", async () => {
		const probe = new CollectingDiscoveryProbe(
			new Set(),
			fakeCrypto(() => "h"),
		)
		const { node, getNodeInfo } = fakeNode()

		const out = await probe.extractEffects(fakeSim([]), ctxOf(node))

		expect(out).toEqual({ actions: [], requested: false })
		expect(probe.collected).toEqual([])
		expect(getNodeInfo).not.toHaveBeenCalled()
	})

	test("effects map to message_hash actions; identical hashes dedup to one", async () => {
		const probe = new CollectingDiscoveryProbe(
			new Set(),
			fakeCrypto((d) => String(d[0])),
		)
		const { node } = fakeNode()

		const out = await probe.extractEffects(fakeSim([effect("a"), effect("a"), effect("b")]), ctxOf(node))

		expect(out.actions).toEqual([
			{ kind: "add_private_authwit", content: { kind: "message_hash", messageHash: "mh:a" } },
			{ kind: "add_private_authwit", content: { kind: "message_hash", messageHash: "mh:b" } },
		])
		expect(out.requested).toBe(true)
		expect(probe.collected).toEqual(out.actions)
		// The decoded call rides beside each hash, deduped in step with it.
		expect(probe.discovered).toEqual([
			{ consumer: "0xentry", caller: "caller:a", selector: "0xsel", args: ["arg:a"], innerHash: "a", messageHash: "mh:a" },
			{ consumer: "0xentry", caller: "caller:b", selector: "0xsel", args: ["arg:b"], innerHash: "b", messageHash: "mh:b" },
		])
	})

	test("hashes already covered by pre-attached actions are dropped", async () => {
		const probe = new CollectingDiscoveryProbe(
			new Set(["mh:a"]),
			fakeCrypto((d) => String(d[0])),
		)
		const { node } = fakeNode()

		const out = await probe.extractEffects(fakeSim([effect("a"), effect("b")]), ctxOf(node))

		expect(out.actions).toEqual([{ kind: "add_private_authwit", content: { kind: "message_hash", messageHash: "mh:b" } }])
	})

	test("only the signer's request becomes an action; another account's still counts as requested", async () => {
		const probe = new CollectingDiscoveryProbe(
			new Set(),
			fakeCrypto((d) => String(d[0])),
		)
		const { node } = fakeNode()

		const out = await probe.extractEffects(fakeSim([effect("theirs", OTHER), effect("ours")]), ctxOf(node))

		expect(out).toEqual({
			actions: [{ kind: "add_private_authwit", content: { kind: "message_hash", messageHash: "mh:ours" } }],
			requested: true,
		})
		expect(probe.discovered.map((d) => d.messageHash)).toEqual(["mh:ours"])
		const onlyTheirs = new CollectingDiscoveryProbe(
			new Set(),
			fakeCrypto((d) => String(d[0])),
		)
		expect(await onlyTheirs.extractEffects(fakeSim([effect("theirs", OTHER)]), ctxOf(node))).toEqual({ actions: [], requested: true })
	})

	test("first-sim-only: the second extraction is inert and leaves collected untouched", async () => {
		const probe = new CollectingDiscoveryProbe(
			new Set(),
			fakeCrypto((d) => String(d[0])),
		)
		const { node, getNodeInfo } = fakeNode()

		const first = await probe.extractEffects(fakeSim([effect("a")]), ctxOf(node))
		const second = await probe.extractEffects(fakeSim([effect("b")]), ctxOf(node))

		expect(first.actions).toHaveLength(1)
		expect(second).toEqual({ actions: [], requested: false })
		expect(probe.collected).toEqual(first.actions)
		expect(getNodeInfo).toHaveBeenCalledTimes(1)
	})

	test("non-CallAuthorizationRequest effects are skipped, others still collected", async () => {
		const probe = new CollectingDiscoveryProbe(
			new Set(),
			fakeCrypto((d) => (d[0] === "bad" ? new Error("not an auth request") : String(d[0]))),
		)
		const { node } = fakeNode()

		const out = await probe.extractEffects(fakeSim([effect("bad"), effect("ok")]), ctxOf(node))

		expect(out.actions).toEqual([{ kind: "add_private_authwit", content: { kind: "message_hash", messageHash: "mh:ok" } }])
	})

	test("chain-identity drift fails the extraction loudly (no silent hash derivation)", async () => {
		const probe = new CollectingDiscoveryProbe(
			new Set(),
			fakeCrypto(() => "h"),
		)
		const getNodeInfo = vi.fn(async () => ({ l1ChainId: 999, rollupVersion: 1 }))
		// A real (non-local) stored chain identity that the live node contradicts.
		const network = { chainId: 31337, l1ChainId: 31337 } as never

		let refused: unknown
		try {
			await probe.extractEffects(fakeSim([effect("a")]), ctxOf({ getNodeInfo } as never, network))
		} catch (error) {
			refused = error
		}
		expect((refused as Error).constructor).toBe(Error)
		expect((refused as Error).message).toBe(
			"Chain identity mismatch: selected network has l1ChainId=31337 but live node reports l1ChainId=999 (rollupVersion=1). Refusing to sign/prove against a drifted endpoint.",
		)
		expect(probe.collected).toEqual([])
	})

	test("an effect whose record cannot be built does not claim its hash: a later effect with that hash is collected", async () => {
		const crypto: DiscoveryProbeCrypto = {
			fromFields: async (data) => ({
				innerHash: "x" as never,
				onBehalfOf: SIGNER,
				msgSender: "caller:x",
				functionSelector: "0xsel",
				// `toDiscoveredAuthwit` maps the args, so a missing list fails the record after the hash.
				args: (data[0] === ("broken" as never) ? undefined : ["arg:x"]) as never,
			}),
			computeMessageHash: async (intent) => ({ toString: () => `mh:${intent.innerHash}` }) as never,
		}
		const probe = new CollectingDiscoveryProbe(new Set(), crypto)
		const { node } = fakeNode()

		const out = await probe.extractEffects(fakeSim([effect("broken"), effect("whole")]), ctxOf(node))

		expect(out.actions).toEqual([{ kind: "add_private_authwit", content: { kind: "message_hash", messageHash: "mh:x" } }])
		expect(probe.discovered).toEqual([
			{ consumer: "0xentry", caller: "caller:x", selector: "0xsel", args: ["arg:x"], innerHash: "x", messageHash: "mh:x" },
		])
	})
})
