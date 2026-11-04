import { CHAIN_IDS, LOCAL_L1_CHAIN_ID, MAINNET_L1_CHAIN_ID, TESTNET_L1_CHAIN_ID } from "@/utils/chain-ids"
import { MAINNET_RPC_URL, TESTNET_RPC_URL } from "@/wallet/constants/network-endpoints"
import type { RetiredEndpoint } from "./retired-endpoints"
import type { ChainKind } from "./spec"

/** Immutable L1 identities for the seeded kinds — the trust root `getL1ChainIdStored` validates
 *  seeded rows against (a row is mutable storage; these constants ship in code). Custom/devnet
 *  kinds have no constant and are probe-verified at account creation instead. */
export const SEED_L1_BY_KIND: Partial<Record<ChainKind, number>> = {
	mainnet: MAINNET_L1_CHAIN_ID,
	testnet: TESTNET_L1_CHAIN_ID,
	local: LOCAL_L1_CHAIN_ID,
}

export interface DefaultSeed {
	name: string
	rpcUrl: string
	chainId: number
	/** Hardcoded L1 identity — NEVER probed at seed time (seeding is offline-safe and
	 *  load-bearing for fresh profiles with the node down). Key derivation consumes it. */
	l1ChainId: number
	kind: ChainKind
	isPrimaryActive: boolean
	/** Provider label stamped on the seeded endpoint; Settings titles the endpoint row with it. */
	endpointLabel?: string
}

/**
 * RPC URL stamped into the "Local Network" preset at build time. Defaults
 * to `http://localhost:8080`; e2e runs override via `VITE_LOCAL_NETWORK_RPC_URL`
 * so each parallel agent's wallet build talks to its own aztec sandbox. The
 * override must be a loopback URL: chain 0 is built only on one.
 *
 * The chainId-zero check in `service.ts` also normalizes against this value so that
 * if a user (or test fixture) edits the seed's endpoint URL via the
 * settings UI, the chainId resolution still recognizes it as Local Network.
 * For the structural path, callers that already know they're touching a
 * `kind === "local"` network pass `kindHint` to `_getChainId`, which
 * replaces the URL comparison; the URL must still be loopback.
 */
export const LOCAL_NETWORK_RPC_URL: string = (import.meta.env.VITE_LOCAL_NETWORK_RPC_URL as string | undefined) ?? "http://localhost:8080"

export const DEFAULT_SEEDS: DefaultSeed[] = [
	{
		name: "Testnet",
		rpcUrl: TESTNET_RPC_URL,
		chainId: CHAIN_IDS.TESTNET, // (TESTNET_L1_CHAIN_ID ^ TESTNET_ROLLUP_VERSION) >>> 0 — single-sourced in @/utils/chain-ids
		l1ChainId: TESTNET_L1_CHAIN_ID,
		kind: "testnet",
		isPrimaryActive: false,
		endpointLabel: "dRPC",
	},
	{
		name: "Local Network",
		rpcUrl: LOCAL_NETWORK_RPC_URL,
		chainId: 0,
		l1ChainId: LOCAL_L1_CHAIN_ID,
		kind: "local",
		isPrimaryActive: false,
	},
	{
		name: "Alpha",
		rpcUrl: MAINNET_RPC_URL,
		chainId: CHAIN_IDS.MAINNET,
		l1ChainId: MAINNET_L1_CHAIN_ID,
		kind: "mainnet",
		isPrimaryActive: true,
		endpointLabel: "dRPC",
	},
]

/** Whether this build seeds a network on `chainId`: the only networks a new profile, and so a
 *  restore, starts with. */
export function isSeedChain(chainId: number): boolean {
	return DEFAULT_SEEDS.some((seed) => seed.chainId === chainId)
}

/** Defaults an earlier build seeded, by the digest of the exact URL it stored, each with the URL the
 *  unlock moves such an endpoint to. Entries stay for good: a profile last unlocked on an older
 *  build may unlock on this one at any time. */
export const RETIRED_DEFAULT_ENDPOINTS: readonly RetiredEndpoint[] = [
	// The keyed Testnet endpoint earlier builds seeded.
	{ sha256: "8c97d123e13121add8218c0240ca5f9af70cd57e2e50b9cfd1f9d5ef882f4ec5", replacement: TESTNET_RPC_URL },
]

/** The one seed marked `isPrimaryActive` (Mainnet). Single source
 *  for the primary/default network — consumed by `getOrInitNetworks` (fresh seed) AND
 *  `getPrimaryNetwork` (the import/bootstrap fallback), so the two can't disagree. */
export const PRIMARY_SEED = DEFAULT_SEEDS.find((s) => s.isPrimaryActive)

/** The build's seed for a row's kind; `undefined` for custom, devnet and every kind no seed of
 *  this build carries. */
export function seedForKind(kind: ChainKind | undefined): DefaultSeed | undefined {
	return kind === undefined ? undefined : DEFAULT_SEEDS.find((s) => s.kind === kind)
}

/** The largest JSON-RPC batch each provider endpoint allows, by origin: dRPC's free plan refuses a
 *  batch above 100 entries whole (HTTP 400, seen 2026-11), and one prover tick, a read per contract,
 *  can exceed that. The client's own default is 100 too; the entry holds the provider's limit if an
 *  Aztec bump moves that default. Keyed by literal origin, not read off the seeds, so a row seeded on
 *  one of these hosts keeps its cap after a later build moves the seed. */
const BATCH_CAPS: Readonly<Record<string, number>> = {
	"https://aztec-mainnet.drpc.org": 100,
	"https://aztec-testnet.drpc.org": 100,
}

/** The batch cap for `rpcUrl`'s origin; `undefined` leaves the client's own default. */
export function maxBatchSizeFor(rpcUrl: string): number | undefined {
	let origin: string
	try {
		origin = new URL(rpcUrl).origin
	} catch {
		return undefined
	}
	return Object.hasOwn(BATCH_CAPS, origin) ? BATCH_CAPS[origin] : undefined
}
