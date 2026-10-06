/**
 * Hold the local node's next block: with `minTxsPerBlock: 2` the sequencer leaves a lone submitted
 * tx unmined until a second one arrives, which makes "the first send is submitted but not yet
 * mined" a state a test can stand in, instead of a race it hopes to hit.
 *
 * Talks to the run's own node through its admin JSON-RPC (served keyless on the run's admin port,
 * see `global-setup.ts`). The sandbox is shared by every file of a shard, so a hold must never
 * outlive its test: `releaseMining` restores the value read before the first hold and checks that
 * it took, and a test file calls it from `afterEach` as well as on its own path, because a vitest
 * timeout abandons the test body.
 */

const ADMIN = (): string => {
	const port = process.env.AZTEC_ADMIN_PORT
	if (!port) throw new Error("AZTEC_ADMIN_PORT is not set: the mining hold needs the e2e agent's node")
	return `http://127.0.0.1:${port}`
}

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
	const res = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
	})
	const body = (await res.json()) as { result?: unknown; error?: unknown }
	if (body.error !== undefined) throw new Error(`${method} failed: ${JSON.stringify(body.error)}`)
	return body.result
}

const readMinTxs = async (): Promise<number> =>
	((await rpc(ADMIN(), "nodeAdmin_getConfig", [])) as { minTxsPerBlock?: number }).minTxsPerBlock ?? 0

/** The value to restore, captured by the first hold and cleared by the release that restores it. */
let restoreTo: number | undefined

/** Holds block production until two txs are pending. Idempotent while held. */
export async function holdMining(): Promise<void> {
	if (restoreTo !== undefined) return
	restoreTo = await readMinTxs()
	await rpc(ADMIN(), "nodeAdmin_setConfig", [{ minTxsPerBlock: 2 }])
}

/** Restores block production and fails unless the node reports the restored value. No-op when not held. */
export async function releaseMining(): Promise<void> {
	if (restoreTo === undefined) return
	const target = restoreTo
	await rpc(ADMIN(), "nodeAdmin_setConfig", [{ minTxsPerBlock: target }])
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
	const deadline = Date.now() + timeoutMs
	for (;;) {
		const count = await pendingTxCount(nodeUrl)
		if (count === 0) return
		if (Date.now() > deadline) throw new Error(`the node still holds ${count} pending txs`)
		await new Promise((r) => setTimeout(r, 500))
	}
}
