/**
 * Hold the local node's next block: with `minTxsPerBlock: 2` the sequencer leaves a lone submitted
 * tx unmined until a second one arrives, which makes "the first send is submitted but not yet
 * mined" a state a test can stand in, instead of a race it hopes to hit.
 *
 * Talks to the run's own node through its admin JSON-RPC, with the key `global-setup.ts` draws for
 * each node it starts. The sandbox is shared by every file of a shard, so a hold must never
 * outlive its test: `releaseMining` restores the value read before the first hold and checks that
 * it took, and a test file calls it from `afterEach` as well as on its own path, because a vitest
 * timeout abandons the test body.
 */

import { inject } from "vitest"
import { pollUntil } from "./poll"

const ADMIN = (): string => {
	const port = process.env.AZTEC_ADMIN_PORT
	if (!port) throw new Error("AZTEC_ADMIN_PORT is not set: the mining hold needs the e2e agent's node")
	return `http://127.0.0.1:${port}`
}

async function rpc(url: string, method: string, params: unknown[], headers: Record<string, string> = {}): Promise<unknown> {
	const res = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
	})
	const body = (await res.json()) as { result?: unknown; error?: unknown }
	if (body.error !== undefined) throw new Error(`${method} failed: ${JSON.stringify(body.error)}`)
	return body.result
}

/** The key rides only admin calls, never the node's main port. */
async function adminRpc(method: string, params: unknown[]): Promise<unknown> {
	const key = inject("aztecAdminKey")
	if (!key) throw new Error("the mining hold needs the admin key of a node this run started: run it through `bun run e2e:agent`")
	return rpc(ADMIN(), method, params, { "x-api-key": key })
}

const readMinTxs = async (): Promise<number> =>
	((await adminRpc("nodeAdmin_getConfig", [])) as { minTxsPerBlock?: number }).minTxsPerBlock ?? 0

/** The value to restore, captured by the first hold and cleared by the release that restores it. */
let restoreTo: number | undefined

/** Holds block production until two txs are pending. Idempotent while held. */
export async function holdMining(): Promise<void> {
	if (restoreTo !== undefined) return
	restoreTo = await readMinTxs()
	await adminRpc("nodeAdmin_setConfig", [{ minTxsPerBlock: 2 }])
}

/** Restores block production and fails unless the node reports the restored value. No-op when not held. */
export async function releaseMining(): Promise<void> {
	if (restoreTo === undefined) return
	const target = restoreTo
	await adminRpc("nodeAdmin_setConfig", [{ minTxsPerBlock: target }])
	const now = await readMinTxs()
	if (now !== target) throw new Error(`mining hold not released: minTxsPerBlock is ${now}, expected ${target}`)
	restoreTo = undefined
}

/** Txs the node holds in its mempool. */
export async function pendingTxCount(nodeUrl: string): Promise<number> {
	return Number(await rpc(nodeUrl, "node_getPendingTxCount", []))
}

/** Waits until the node's mempool is empty, so a case never pairs with a tx an earlier case left behind. */
export async function waitForEmptyMempool(nodeUrl: string, timeoutMs = 120_000): Promise<void> {
	await pollUntil(
		() => pendingTxCount(nodeUrl),
		(count) => count === 0,
		{ label: "the node's mempool empty", timeoutMs, intervalMs: 500, show: (count) => `${count} pending txs` },
	)
}
