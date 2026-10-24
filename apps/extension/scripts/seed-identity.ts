/**
 * Live pin check: reads every remote default network's node identity and holds it to the assertion
 * each signing path runs. Exits 1 on any mismatch or failed read, so a stale pin cannot pass as a
 * printout; a line names the seed and the reported pair, never the endpoint.
 *
 * Run from apps/extension: bun run check:seeds
 */
import { assertLiveChainIdentity } from "@nulo/aztec-runtime/utils"
import { scrubUrls } from "../src/utils/scrub-urls"
import { DEFAULT_SEEDS } from "../src/wallet/services/network/seeds"
import { createPreflightNodeClient } from "./seed-preflight-node"

let failed = false
for (const seed of DEFAULT_SEEDS.filter(({ kind }) => kind !== "local")) {
	const pinned = `pinned chainId=${seed.chainId} l1ChainId=${seed.l1ChainId}`
	try {
		const { l1ChainId, rollupVersion } = await createPreflightNodeClient(seed.rpcUrl).getNodeInfo()
		assertLiveChainIdentity(seed, { l1ChainId, rollupVersion })
		console.log(`${seed.name}: l1ChainId=${l1ChainId} rollupVersion=${rollupVersion} (${pinned}) OK`)
	} catch (error) {
		failed = true
		console.log(`${seed.name}: ${scrubUrls(error instanceof Error ? error.message : String(error))} (${pinned}) MISMATCH`)
	}
}
process.exit(failed ? 1 : 0)
