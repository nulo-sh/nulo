/**
 * Live pin check: reads every remote default network's node identity and holds it to the assertion
 * each signing path runs. Exits 1 on any mismatch or failed read, so a stale pin cannot pass as a
 * printout.
 *
 * Run from apps/extension: bun run check:seeds
 */
import type { AztecNode } from "@aztec-labs/stdlib/interfaces/client"
import { assertLiveChainIdentity } from "@nulo/aztec-runtime/utils"
import { DEFAULT_SEEDS, type DefaultSeed } from "../src/wallet/services/network/seeds"
import { createPreflightNodeClient } from "./seed-preflight-node"

/** The seed's line: its name, the pair its node reported and its pins. Never the node's own words or
 *  an error's message, which can echo the endpoint's path or a credential. */
export async function checkSeed(seed: DefaultSeed, node: Pick<AztecNode, "getNodeInfo">): Promise<{ ok: boolean; line: string }> {
	const pinned = `pinned chainId=${seed.chainId} l1ChainId=${seed.l1ChainId}`
	let info: { l1ChainId: number; rollupVersion: number }
	try {
		info = await node.getNodeInfo()
	} catch {
		return { ok: false, line: `${seed.name}: no node info (${pinned}) MISMATCH` }
	}
	const read = `l1ChainId=${info.l1ChainId} rollupVersion=${info.rollupVersion}`
	try {
		assertLiveChainIdentity(seed, info)
	} catch {
		return { ok: false, line: `${seed.name}: ${read} (${pinned}) MISMATCH` }
	}
	return { ok: true, line: `${seed.name}: ${read} (${pinned}) OK` }
}

if (import.meta.main) {
	let failed = false
	for (const seed of DEFAULT_SEEDS.filter(({ kind }) => kind !== "local")) {
		const { ok, line } = await checkSeed(seed, createPreflightNodeClient(seed.rpcUrl))
		console.log(line)
		failed ||= !ok
	}
	process.exit(failed ? 1 : 0)
}
