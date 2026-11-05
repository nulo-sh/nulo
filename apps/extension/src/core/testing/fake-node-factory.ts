/**
 * Test double for `NodeFactory`. Returns a deterministic in-memory
 * `AztecNode` handle keyed by the rpcUrl passed to `createNode`.
 *
 * Callers can register per-URL overrides to make `getNodeInfo()` /
 * `getBlockNumber()` / etc. return specific values, or supply a
 * shared template that every URL receives.
 *
 * WARNING: A POJO `AztecNode` satisfies the interface structurally but
 * bypasses the `createSafeJsonRpcClient` proxy's param validation and
 * error marshalling. Unit tests driving `NetworkService` / code that
 * relies on JSON-RPC error surfaces (e.g. `NetworkService.getChainId`'s
 * catch block) will go green against this fake even if the real code
 * path would throw against a live node. Use integration tests against
 * the production adapter for those paths.
 */

import type { Fr } from "@aztec-labs/foundation/curves/bn254"
import type { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import type { NodeFactory } from "@nulo/aztec-runtime/ports"
import { type RouteSpec, type RoutedNode, routeNode, type SubmissionPins } from "@nulo/aztec-runtime/routing"
import { type RetryOptions, type TransportFailure, withTransportFailure } from "@nulo/aztec-runtime/utils"
import { walletChainId } from "@/utils/chain-ids"

/** The error a node client's caller sees when its request failed in transport with `kind`: the SDK
 *  hands the fetch's tagged error to every entry of the batch as `cause.data`. Throw it from a fake
 *  node to drive a routed node's failover. */
export function transportFailure(kind: TransportFailure): Error {
	const fetchError = withTransportFailure(new Error(`FakeNode: ${kind}`), kind)
	return new Error(fetchError.message, { cause: { code: -32000, data: fetchError, message: fetchError.message } })
}

export type FakeNodeOverrides = Partial<AztecNode>

export class FakeNodeFactory implements NodeFactory {
	/** Nodes created so far, in call order. Useful for assertions. */
	public readonly created: Array<{ rpcUrl: string; node: AztecNode }> = []
	/** The URLs of the `created` entries that came from `createSingleAttemptNode`, in call order. */
	public readonly singleAttempt: string[] = []
	/** Each endpoint client a routed node built, with the attempt timeout it was built for. */
	public readonly routedClients: Array<{ rpcUrl: string; timeoutMs: number }> = []

	private readonly perUrl = new Map<string, FakeNodeOverrides>()
	private template: FakeNodeOverrides = {}

	/** Set a fallback override applied to every unregistered rpcUrl. */
	public setTemplate(template: FakeNodeOverrides): void {
		this.template = template
	}

	/** Register per-rpcUrl overrides. Shadows `template`. */
	public setOverrides(rpcUrl: string, overrides: FakeNodeOverrides): void {
		this.perUrl.set(rpcUrl, overrides)
	}

	/** Mirrors the production probe against the same per-URL stubs: resolves the
	 *  fake node's `getNodeInfo` and composes the chain id. `timeoutMs` is
	 *  accepted but not enforced — fakes settle synchronously. */
	public async probeChainId(rpcUrl: string, _timeoutMs: number): Promise<number> {
		const node = this.createNode(rpcUrl)
		const info = await node.getNodeInfo()
		return walletChainId(info.l1ChainId, info.rollupVersion)
	}

	/** The same fake as `createNode`, recorded with `singleAttempt` so a test can tell the two apart. */
	public createSingleAttemptNode(rpcUrl: string, _timeoutMs: number): AztecNode {
		const node = this.createNode(rpcUrl)
		this.singleAttempt.push(rpcUrl)
		return node
	}

	/** Mirrors the production single read against the same per-URL stubs; `timeoutMs` is not
	 *  enforced, as for `probeChainId`. */
	public async readPublicStorageOnce(rpcUrl: string, contract: AztecAddress, slot: Fr, _timeoutMs: number): Promise<Fr> {
		return this.createNode(rpcUrl).getPublicStorageAt("latest", contract, slot)
	}

	/** The real router over this factory's fake nodes, one per endpoint URL. A lone endpoint is
	 *  never probed, so a one-endpoint consumer needs no `getNodeInfo` or `getChainTips` stub. */
	public createRoutedNode(spec: RouteSpec, options: RetryOptions & { pins?: SubmissionPins } = {}): RoutedNode {
		return routeNode(
			(rpcUrl, timeoutMs) => {
				this.routedClients.push({ rpcUrl, timeoutMs })
				return this.createNode(rpcUrl)
			},
			spec,
			{
				now: Date.now,
				sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
				log: () => {},
				retryWhile: options.retryWhile,
				pins: options.pins,
			},
		)
	}

	public createNode(rpcUrl: string): AztecNode {
		const overrides = this.perUrl.get(rpcUrl) ?? this.template
		const node = new Proxy({ ...overrides } as AztecNode, {
			get(target, prop) {
				// Promise.resolve() probes `then` to decide if the value is
				// thenable. Returning a function here (the loud-throw default
				// below) would make the node accidentally thenable and cause
				// `await someNode` to throw "method 'then' not stubbed".
				// `catch` / `finally` get the same treatment for symmetry.
				if (prop === "then" || prop === "catch" || prop === "finally") return undefined
				if (prop in target) return Reflect.get(target, prop)
				// Any unstubbed method throws loudly so tests fail fast rather
				// than silently returning `undefined`.
				return () => {
					throw new Error(`FakeNode: method "${String(prop)}" not stubbed for ${rpcUrl}`)
				}
			},
		})
		this.created.push({ rpcUrl, node })
		return node
	}
}
