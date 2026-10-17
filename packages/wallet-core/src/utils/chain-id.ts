/**
 * The wallet's chain id. Persisted rows, storage scopes and dApp-session keys carry it, so its
 * value is frozen: an unsigned 32-bit `number`, never signed, bigint or hex.
 */
export function walletChainId(l1ChainId: number, rollupVersion: number): number {
	return (l1ChainId ^ rollupVersion) >>> 0
}

/** Anvil's fixed default chain id: the L1 of the local development chain, and the only L1 a row on
 *  wallet chain id 0 may name. */
export const LOCAL_L1_CHAIN_ID = 31337
