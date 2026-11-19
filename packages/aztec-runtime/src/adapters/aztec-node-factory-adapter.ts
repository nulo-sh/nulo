/**
 * Real `NodeFactory` implementation. Wraps `createAztecNodeClient` with
 * `makeFetchWithTimeout()` so every production node has bounded HTTP I/O.
 * Tests substitute a `FakeNodeFactory`.
 *
 * Invariant: this is the ONLY `createAztecNodeClient(...)` call site in
 * the codebase (and the one `createSafeJsonRpcClient` over the node schema,
 * for the silent single-attempt node). A lint guard (`no-restricted-syntax`)
 * enforces that every other reference goes through `NodeFactory.createNode()`.
 *
 * Every node is built through the transport rule (`rpcTransportVerdict`). It is the only gate
 * for a URL that never crossed the extension's schema, such as a persisted endpoint. Unlike the
 * schema it judges the raw string, not a trimmed copy.
 */

import type { Fr } from "@aztec-labs/foundation/curves/bn254"
import { createSafeJsonRpcClient } from "@aztec-labs/foundation/json-rpc/client"
import type { Logger } from "@aztec-labs/foundation/log"
import type { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { type AztecNode, AztecNodeApiSchema, createAztecNodeClient } from "@aztec-labs/stdlib/interfaces/client"
import { walletChainId } from "@nulo/wallet-core/chain-id"
import { rpcTransportVerdict } from "@nulo/wallet-core/utils"
import type { NodeFactory, RoutedNodeOptions } from "../ports/node-factory-port"
import { type RouteLogEvent, type RouteSpec, type RoutedNode, realTimer, routeNode } from "../routing/routed-node"
import { makeFetchWithTimeout, makeSingleAttemptFetch, type RetryOptions } from "../utils/fetch"

const noop = () => {}

/** The JSON-RPC client's logger for single-attempt reads: every level a no-op. Without it the SDK
 *  warns through pino, which reaches `console.*` and so the user's exportable log, with the reply
 *  body and the endpoint URL (providers put API keys in the path). */
export const SILENT_RPC_LOG: Logger = {
	silent: noop,
	fatal: noop,
	error: noop,
	warn: noop,
	info: noop,
	verbose: noop,
	debug: noop,
	trace: noop,
	level: "silent",
	isLevelEnabled: () => false,
	module: "json-rpc:client",
	createChild: () => SILENT_RPC_LOG,
	getBindings: () => ({}),
}

/** The transport rule on the raw string. A refusal `reason` names at most the host or scheme it
 *  refused, never the URL: an unparseable string can still carry credentials. */
export function isAllowedRpcUrl(rpcUrl: string): { ok: true } | { ok: false; reason: string } {
	let parsed: URL
	try {
		parsed = new URL(rpcUrl)
	} catch {
		return { ok: false, reason: "not a valid URL" }
	}
	const verdict = rpcTransportVerdict(parsed)
	if (verdict.allowed) return { ok: true }
	if (verdict.refusal === "userinfo") return { ok: false, reason: "userinfo is not permitted in an RPC URL" }
	if (verdict.refusal === "http-host") {
		return { ok: false, reason: `http: only permitted for localhost and 127.0.0.1 (got host="${verdict.host}")` }
	}
	return {
		ok: false,
		reason: `scheme "${verdict.scheme}:" not in allowlist (only https: and http: to localhost or 127.0.0.1 are permitted)`,
	}
}

export class AztecNodeFactoryAdapter implements NodeFactory {
	/** @param maxBatchSizeFor The largest JSON-RPC batch the endpoint at a URL accepts, applied to
	 *  every client built here; `undefined` keeps the client's default of 100. Required: a construction
	 *  that forgot it would build uncapped clients without a type error. */
	public constructor(private readonly maxBatchSizeFor: (rpcUrl: string) => number | undefined) {}

	public createNode(rpcUrl: string, options?: RetryOptions): AztecNode {
		const check = isAllowedRpcUrl(rpcUrl)
		if (!check.ok) {
			throw new Error(`AztecNodeFactoryAdapter refused to construct node client — ${check.reason}`)
		}
		return createAztecNodeClient(rpcUrl, {
			fetch: makeFetchWithTimeout(undefined, options),
			maxBatchSize: this.maxBatchSizeFor(rpcUrl),
		})
	}

	public createSingleAttemptNode(rpcUrl: string, timeoutMs: number): AztecNode {
		const check = isAllowedRpcUrl(rpcUrl)
		if (!check.ok) {
			throw new Error(`AztecNodeFactoryAdapter refused to construct node client — ${check.reason}`)
		}
		return silentSingleAttemptNode(rpcUrl, timeoutMs, this.maxBatchSizeFor(rpcUrl))
	}

	public async probeChainId(rpcUrl: string, timeoutMs: number): Promise<number> {
		const check = isAllowedRpcUrl(rpcUrl)
		if (!check.ok) {
			throw new Error(`AztecNodeFactoryAdapter refused to probe — ${check.reason}`)
		}
		// Single attempt, no retry chain: the probe's whole point is that its
		// socket dies WITH its budget (see NodeFactory.probeChainId).
		const node = createAztecNodeClient(rpcUrl, { fetch: makeSingleAttemptFetch(timeoutMs), maxBatchSize: this.maxBatchSizeFor(rpcUrl) })
		const info = await node.getNodeInfo()
		return walletChainId(info.l1ChainId, info.rollupVersion)
	}

	public createRoutedNode(spec: RouteSpec, options: RoutedNodeOptions = {}): RoutedNode {
		const verdicts = spec.endpoints.map((endpoint) => isAllowedRpcUrl(endpoint.rpcUrl))
		const refused = verdicts.find((verdict) => !verdict.ok)
		const endpoints = spec.endpoints.filter((_, i) => verdicts[i]?.ok)
		if (endpoints.length === 0 && refused && !refused.ok) {
			throw new Error(`AztecNodeFactoryAdapter refused to construct node client — ${refused.reason}`)
		}
		return routeNode(
			(rpcUrl, timeoutMs) => silentSingleAttemptNode(rpcUrl, timeoutMs, this.maxBatchSizeFor(rpcUrl)),
			{ ...spec, endpoints },
			{
				now: Date.now,
				sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
				timer: realTimer,
				log: logRouteEvent,
				changed: options.onChange,
				retryWhile: options.retryWhile,
				pins: options.pins,
			},
		)
	}

	public async readPublicStorageOnce(rpcUrl: string, contract: AztecAddress, slot: Fr, timeoutMs: number): Promise<Fr> {
		const check = isAllowedRpcUrl(rpcUrl)
		if (!check.ok) {
			throw new Error(`AztecNodeFactoryAdapter refused to read — ${check.reason}`)
		}
		const value = await silentSingleAttemptNode(rpcUrl, timeoutMs, this.maxBatchSizeFor(rpcUrl)).getPublicStorageAt(
			"latest",
			contract,
			slot,
		)
		// The SDK resolves a `null` result as `undefined` rather than rejecting it.
		if (value === undefined) throw new Error("AztecNodeFactoryAdapter read no value")
		return value
	}
}

/** A change of endpoint state or of the active endpoint reaches the default log level; a moved call
 *  only debug. Events carry endpoint ids, never URLs. */
function logRouteEvent(event: RouteLogEvent): void {
	if (event.event === "move") console.debug("[route] call moved off an endpoint", event)
	else console.info("[route] endpoint routing changed", event)
}

/** `createAztecNodeClient` with no versions to check, plus the `log` option it cannot pass. */
function silentSingleAttemptNode(rpcUrl: string, timeoutMs: number, maxBatchSize: number | undefined): AztecNode {
	return createSafeJsonRpcClient<AztecNode>(rpcUrl, AztecNodeApiSchema, {
		namespaceMethods: "aztec",
		fetch: makeSingleAttemptFetch(timeoutMs),
		log: SILENT_RPC_LOG,
		maxBatchSize,
	})
}
