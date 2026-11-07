import { CHAIN_IDS, LOCAL_L1_CHAIN_ID, MAINNET_L1_CHAIN_ID, TESTNET_L1_CHAIN_ID } from "@/utils/chain-ids"
import { MAINNET_RPC_URL, TESTNET_RPC_URL } from "@/wallet/constants/network-endpoints"
import type { RetiredEndpoint } from "./retired-endpoints"
import type { ChainKind, Network, NetworkEndpoint } from "./spec"

/** Immutable L1 identities for the seeded kinds — the trust root `getL1ChainIdStored` validates
 *  seeded rows against (a row is mutable storage; these constants ship in code). Custom/devnet
 *  kinds have no constant and are probe-verified at account creation instead. */
export const SEED_L1_BY_KIND: Partial<Record<ChainKind, number>> = {
	mainnet: MAINNET_L1_CHAIN_ID,
	testnet: TESTNET_L1_CHAIN_ID,
	local: LOCAL_L1_CHAIN_ID,
}

/** Nulo's relay (`infra/rpc-proxy`), by the kind of network each host serves. Keyless: the provider
 *  key lives in the relay, never in a build. */
export const RELAY_RPC_URLS = {
	mainnet: "https://rpc.nulo.sh",
	testnet: "https://testnet.rpc.nulo.sh",
} as const

/** The title Settings shows on the relay's endpoint row. */
export const RELAY_LABEL = "Nulo"

export interface SeedEndpoint {
	readonly rpcUrl: string
	readonly label: string
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
	/** Nulo's relay, the seeded endpoint after `rpcUrl`. A profile made before a seed carried it is
	 *  given it once at unlock (`appendRelay`). */
	relay?: SeedEndpoint
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
 * `kind === "local"` network pass `kindHint` to `_probeChainIdentity`, which
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
		relay: { rpcUrl: RELAY_RPC_URLS.testnet, label: RELAY_LABEL },
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
		relay: { rpcUrl: RELAY_RPC_URLS.mainnet, label: RELAY_LABEL },
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

/** Names an earlier build seeded a kind's row with; the unlock gives such a row its seed's current
 *  name. A row records nothing about who chose its name, so a person who picked one of these loses
 *  it too. Entries stay for good, as the endpoints' do. */
const RETIRED_DEFAULT_NAMES: Readonly<Partial<Record<ChainKind, readonly string[]>>> = {
	mainnet: ["Alpha V6", "Mainnet"],
}

/** The one seed marked `isPrimaryActive` (Mainnet). Single source
 *  for the primary/default network — consumed by `getOrInitNetworks` (fresh seed) AND
 *  `getPrimaryNetwork` (the import/bootstrap fallback), so the two can't disagree. */
export const PRIMARY_SEED = DEFAULT_SEEDS.find((s) => s.isPrimaryActive)

/** The build's seed for a row's kind; `undefined` for custom, devnet and every kind no seed of
 *  this build carries. */
export function seedForKind(kind: ChainKind | undefined): DefaultSeed | undefined {
	return kind === undefined ? undefined : DEFAULT_SEEDS.find((s) => s.kind === kind)
}

/** Lowercase host + protocol; preserve path/query/fragment verbatim. Falls
 *  back to the raw string if `URL` rejects it (validation runs elsewhere). */
export function normalizeRpcUrl(raw: string): string {
	try {
		const u = new URL(raw)
		u.protocol = u.protocol.toLowerCase()
		u.hostname = u.hostname.toLowerCase()
		let s = u.toString()
		if (!raw.endsWith("/") && s.endsWith("/") && u.pathname === "/") {
			s = s.slice(0, -1)
		}
		return s
	} catch {
		return raw
	}
}

/**
 * Strict RPC-URL equality that tolerates trailing-slash and casing differences
 * on a seed-vs-stored comparison only: the chainId-zero check for the "Local
 * Network" preset, and whether a row already holds the relay. The shared
 * `normalizeRpcUrl` deliberately preserves what the user typed
 * (path/query/fragment verbatim), so we need a more aggressive comparison here.
 */
export function sameEndpointUrl(a: string, b: string): boolean {
	try {
		const ua = new URL(a)
		const ub = new URL(b)
		const pa = ua.pathname.replace(/\/+$/, "")
		const pb = ub.pathname.replace(/\/+$/, "")
		return ua.protocol === ub.protocol && ua.host === ub.host && pa === pb && ua.search === ub.search && ua.hash === ub.hash
	} catch {
		return a === b
	}
}

/** Whether `rpcUrl` is `seed`'s endpoint, with Local Network's tolerance for an edited URL. */
export function isSeedEndpointUrl(seed: DefaultSeed, rpcUrl: string): boolean {
	return rpcUrl === normalizeRpcUrl(seed.rpcUrl) || (seed.kind === "local" && sameEndpointUrl(rpcUrl, seed.rpcUrl))
}

/** The relay's endpoint for `network`, under an id derived from the row's and free among its own:
 *  no random id, so the conversion stays a pure function of the row. */
export function relayEndpointOf(network: Network, relay: SeedEndpoint): NetworkEndpoint {
	const taken = new Set(network.endpoints.map((endpoint) => endpoint.id))
	let id = `${network.id}-relay`
	for (let n = 1; taken.has(id); n++) id = `${network.id}-relay${n}`
	return { id, rpcUrl: normalizeRpcUrl(relay.rpcUrl), label: relay.label }
}

/** The kinds of `rows` that hold their seed's relay: each was given it, by a seeding whose record
 *  write may have failed, so recording them keeps a later removal for good. */
export function relayHolders(rows: readonly Network[]): ChainKind[] {
	return rows.flatMap((row) => {
		const relay = seedForKind(row.kind)?.relay
		const holds = relay && row.endpoints.some((endpoint) => sameEndpointUrl(endpoint.rpcUrl, relay.rpcUrl))
		return holds && row.kind ? [row.kind] : []
	})
}

/**
 * A copy of `network` with its seed's relay after its endpoints, when the seed carries one, the
 * row's primary is still the endpoint the seed stored, and no endpoint already holds the relay;
 * `undefined` otherwise. A person who made their own node primary is never given the relay.
 */
export function appendRelay(network: Network): Network | undefined {
	const seed = seedForKind(network.kind)
	if (!seed?.relay) return undefined
	const primary = network.endpoints.find((endpoint) => endpoint.id === network.primaryEndpointId)
	if (!primary || !isSeedEndpointUrl(seed, primary.rpcUrl)) return undefined
	const relayUrl = seed.relay.rpcUrl
	if (network.endpoints.some((endpoint) => sameEndpointUrl(endpoint.rpcUrl, relayUrl))) return undefined
	return { ...network, endpoints: [...network.endpoints, relayEndpointOf(network, seed.relay)] }
}

/** A copy of `network` under its seed's current name when it still carries a name an earlier build
 *  seeded its kind with; `undefined` otherwise, or when another of the profile's `rows` already holds
 *  that name, since a profile's names are unique. */
export function retireDefaultName(network: Network, rows: readonly Network[]): Network | undefined {
	const seed = seedForKind(network.kind)
	if (!seed || !RETIRED_DEFAULT_NAMES[seed.kind]?.includes(network.name)) return undefined
	const taken = rows.some((row) => row.id !== network.id && row.profileId === network.profileId && row.name === seed.name)
	return taken ? undefined : { ...network, name: seed.name }
}

/** dRPC's free plan refuses a JSON-RPC batch of more entries whole (HTTP 400, seen 2026-11). A
 *  provider's documented limit, not a client cap: no client reads it. */
export const DRPC_FREE_PLAN_BATCH_LIMIT = 100

/** The largest JSON-RPC batch a provider endpoint allows, by origin, for a provider whose limit is
 *  below the client's own default of 100 entries per request. dRPC's free-plan limit equals that
 *  default, so its origins take no entry; `seeds.test.ts` reds if an Aztec bump raises the default
 *  past it. Keyed by literal origin, not read off the seeds, so a row seeded on such a host keeps its
 *  cap after a later build moves the seed. */
const BATCH_CAPS: Readonly<Record<string, number>> = {}

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
