import { MAINNET_L1_CHAIN_ID } from "@/utils/chain-ids"
import type { DefaultSeed } from "@/wallet/services/network/seeds"

/**
 * The default network an update candidate seeds beside the shipped ones, so an install updated in
 * place meets a default it was never offered, as it will when a build adds Mainnet. Under `src/`
 * only `./config` may import it: its flag carries the stamp that keeps it out of a release bundle,
 * and a direct import would carry none.
 *
 * No real network carries its chainId, and its node is a closed loopback port, so a wallet that
 * switches to it reaches nothing.
 */
export const E2E_EXTRA_SEED: DefaultSeed = {
	name: "Mainnet",
	rpcUrl: "http://127.0.0.1:9",
	chainId: 1_000_000_001,
	l1ChainId: MAINNET_L1_CHAIN_ID,
	kind: "mainnet",
	isPrimaryActive: false,
}
