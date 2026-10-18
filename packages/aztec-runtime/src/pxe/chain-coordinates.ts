/**
 * Codec for the `(profileId, chainId)` coordinate that identifies a PXE runtime, in its two
 * encodings: `${profileId}:${chainId}` (the `ChainRuntimeRegistry` + per-chain guard key) and
 * `pxe/${profileId}/${chainId}` (the chain's OPFS store directory). The `pxe/...` form is
 * **PERSISTED on disk**, so the exact strings here are load-bearing — changing them orphans a
 * user's existing PXE stores.
 */
export type ChainCoordinates = {
	profileId: string
	chainId: number
}

/** Root of every PXE store directory. */
export const PXE_DATA_DIR_ROOT = "pxe/"

/** Registry / per-chain-guard key: `${profileId}:${chainId}`. */
export function chainRegistryKey({ profileId, chainId }: ChainCoordinates): string {
	return `${profileId}:${chainId}`
}

/** Prefix matching every registry key under one profile: `${profileId}:`. */
export function chainRegistryKeyPrefix(profileId: string): string {
	return `${profileId}:`
}

/** The chain's store directory: `pxe/${profileId}/${chainId}`. PERSISTED — do not drift. */
export function chainDataDir({ profileId, chainId }: ChainCoordinates): string {
	return `${PXE_DATA_DIR_ROOT}${profileId}/${chainId}`
}
