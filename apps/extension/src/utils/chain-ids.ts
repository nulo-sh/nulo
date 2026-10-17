/**
 * Known Aztec network chain identities — the ONE definition both shells consume (popup UI via
 * `components/ui/utils`, the SW via `network/service` + `constants/explorers`), owned here so
 * neither side imports across the popup/wallet boundary for a constant.
 *
 * A wallet chainId is `(l1ChainId ^ rollupVersion) >>> 0`. The rollupVersion CHANGES whenever a
 * network's rollup redeploys (resets and protocol upgrades), so every pinned id below is only as
 * fresh as its pair — the Alpha 5.0.1 upgrade shipped with a stale MAINNET pin precisely because
 * the id was a bare literal with no recorded pair. Keep the pair next to every id.
 */

import { LOCAL_L1_CHAIN_ID, walletChainId } from "@nulo/wallet-core/chain-id"

/** The extension's entry point for the formula and the local L1; extension code imports them from
 *  here. The seeded Local Network's L1 is `LOCAL_L1_CHAIN_ID`, hardcoded (never probed at seed
 *  time) so profile creation stays offline-safe; key derivation consumes it. */
export { LOCAL_L1_CHAIN_ID, walletChainId }

/** Ethereum mainnet's L1 id: the trust root a stored `mainnet`-kind network row is checked against.
 *  No mainnet network is seeded on the V6 line. */
export const MAINNET_L1_CHAIN_ID = 1

/** Testnet identity (live-verified via node_getNodeInfo: nodeVersion 6.0.0-rc.3, after its reset) —
 *  the L1/rollup pair behind CHAIN_IDS.TESTNET. The bridge keeps its own copy; nothing checks that
 *  the two agree. */
export const TESTNET_L1_CHAIN_ID = 11155111
export const TESTNET_ROLLUP_VERSION = 3409706519

export const CHAIN_IDS = {
	TESTNET: walletChainId(TESTNET_L1_CHAIN_ID, TESTNET_ROLLUP_VERSION), // 3415328944
	SANDBOX: 0, // localhost:8080
} as const
