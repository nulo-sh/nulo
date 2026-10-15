// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { hasHiddenUrlCharacter, rpcTransportVerdict } from "@nulo/wallet-core/utils"
import { z } from "zod"

export const NETWORK_SERVICE_NAME = "network"

/** EntityStorage root for network rows (keyed by `network.id`). Frozen:
 *  renaming detaches every existing row; the backup-migration registry pins it. */
export const NETWORK_STORAGE_ROOT = "nulo:core:networks"

export enum NodeStatus {
	Active,
	Inactive,
	InvalidChain,
}

// "devnet" is LEGACY-tolerated only (no seed/UI since the devnet default was dropped): stored
// rows and backups may still carry it, so the schema keeps accepting it.
export type ChainKind = "mainnet" | "testnet" | "devnet" | "local" | "custom"

export type NetworkEndpoint = {
	/** Stable id (random hex). */
	id: string
	/** RPC URL (host lowercased on add; path/query preserved verbatim). */
	rpcUrl: string
	/** Optional human-readable label. Empty/undefined → render the host. */
	label?: string
}

export type Network = {
	/** Stable id (random hex). Used as `networkId` in operations + bridge. */
	id: string
	/** Profile scoping — Networks are per-profile. */
	profileId: string
	/** Logical chain identity (XOR of l1ChainId + rollupVersion, or 0 for localhost). STORAGE
	 *  SCOPING ONLY — never a key-derivation input. */
	chainId: number
	/** The EXACT L1 chain id (1 / 11155111 / 31337 / probed) — the key-derivation chain input.
	 *  Seeded from hardcoded constants (never probed at seed time); captured from the node probe
	 *  for custom networks. Kept separate from the XOR composite above on purpose. */
	l1ChainId: number
	/** User-customizable display name. */
	name: string
	/** Persisted user choice — which endpoint receives traffic by default. */
	primaryEndpointId: string
	/** Endpoints owned by this Network. Always ≥1. */
	endpoints: NetworkEndpoint[]
	/** Optional chain-type metadata. Set at seed time; "custom" otherwise. */
	kind?: ChainKind
}

const NetworkEndpointRowSchema: z.ZodType<NetworkEndpoint> = z.object({
	id: z.string(),
	rpcUrl: z.string(),
	label: z.string().optional(),
})

/** STORAGE codec row schema — structural only, deliberately LAXER than the wire
 *  `NetworkSchema` below (no `RpcUrlSchema` refine, no `.min(1)`): a legacy row
 *  written before a value-constraint was tightened must still LOAD (the strict
 *  rules keep applying at the add/update/restore boundaries). The `kind` enum
 *  list MUST stay in sync with `ChainKind` above: a new kind written before it
 *  is added here would make those rows unreadable (kept, but hidden) on read. */
export const NetworkRowSchema: z.ZodType<Network> = z.object({
	id: z.string(),
	profileId: z.string(),
	chainId: z.number(),
	// Key-derivation chain input: canonical u32, REQUIRED even in the lax row codec — a row
	// without it cannot participate in account derivation, and a silent default would collapse
	// the chain separation the field exists to provide (pre-production baseline, no migration).
	l1ChainId: z.number().int().nonnegative().max(0xffffffff),
	name: z.string(),
	primaryEndpointId: z.string(),
	endpoints: z.array(NetworkEndpointRowSchema),
	kind: z.enum(["mainnet", "testnet", "devnet", "local", "custom"]).optional(),
})

/**
 * Synthesized at lookup-time from `(Network, primaryEndpoint.rpcUrl)`. Kept
 * structurally identical to the prior `Network` shape on the PXE-facing
 * boundary so `chain-runtime.ts` keeps working unchanged.
 */
export type NetworkInfo = {
	profileId: string
	chainId: number
	rpcUrl: string
}

/**
 * Helper: project a Network down to the legacy `NetworkInfo` shape using
 * its primary endpoint's URL. Throws if the network has no primary
 * endpoint (data-shape invariant violation).
 */
export function networkInfoFrom(network: Network): NetworkInfo {
	const primary = findPrimaryEndpoint(network)
	if (!primary) throw new Error(`Network ${network.id} has no primary endpoint`)
	return { profileId: network.profileId, chainId: network.chainId, rpcUrl: primary.rpcUrl }
}

/**
 * The Network's primary endpoint URL, or `undefined` if it has no primary
 * endpoint. Unlike `networkInfoFrom`, never throws — for callers that want to
 * record/pin the endpoint a tx was submitted to and should degrade gracefully
 * when the primary is missing rather than abort. The nullish `endpoints` guard is
 * defensive against a malformed record crossing the storage boundary; a
 * well-formed Network always carries ≥1 endpoint.
 */
export function primaryEndpointUrl(network: Network): string | undefined {
	return network.endpoints == null ? undefined : findPrimaryEndpoint(network)?.rpcUrl
}

/** The endpoint `primaryEndpointId` names, or `undefined`; each caller owns its missing-primary policy. */
export function findPrimaryEndpoint(network: Network): NetworkEndpoint | undefined {
	return network.endpoints.find((e) => e.id === network.primaryEndpointId)
}

// ── Service-thrown error message prefixes ────────────────────────────
// Errors cross the SW↔popup wire as plain Error.message strings (custom
// classes don't survive serialization). Callers match on prefixes.

export const ERR_DUPLICATE_CHAIN = "DUPLICATE_CHAIN"
export const ERR_DUPLICATE_ENDPOINT = "DUPLICATE_ENDPOINT"
export const ERR_ENDPOINT_CHAIN_MISMATCH = "ENDPOINT_CHAIN_MISMATCH"
export const ERR_LAST_ENDPOINT = "LAST_ENDPOINT"
export const ERR_PRIMARY_ENDPOINT = "PRIMARY_ENDPOINT"
export const ERR_ACTIVE_NETWORK = "ACTIVE_NETWORK"
/** An unattended caller asked to verify a network whose L1 identity needs a live endpoint probe. */
export const ERR_UNATTENDED_LIVE_CHECK = "UNATTENDED_LIVE_CHECK"
/** A stale-network verdict or a reset journal names this chain, so no new row may take it. */
export const ERR_CHAIN_QUARANTINED = "CHAIN_QUARANTINED"
/** A reset of this network is running: deleting it would race the reset's purge. */
export const ERR_RESET_RUNNING = "RESET_RUNNING"
/** The RPC URL field's own lines, matched by the popups in the validation error's message. */
export const ERR_RPC_URL_HIDDEN_CHARACTERS = "RPC URL can't contain spaces or hidden characters."
export const ERR_RPC_URL_IPV6_LOOPBACK = "Use http://localhost instead of http://[::1]."
const ERR_RPC_URL_TRANSPORT = "RPC URL must use https:// or http://localhost / http://127.0.0.1 and contain no userinfo"

// ── Zod schemas for the RPC boundary ─────────────────────────────────

export const ChainKindSchema: z.ZodType<ChainKind> = z.enum(["mainnet", "testnet", "devnet", "local", "custom"])

/**
 * An RPC URL the wallet may treat as its chain authority: no hidden character
 * inside it, then the transport rule (`rpcTransportVerdict`), userinfo refused.
 * zod's `.url()` returns the trimmed string, so a caller stores the parsed value,
 * never its own argument.
 *
 * Runs on the params of the popup client (`network/client.ts`) and of the
 * service, and on the backup-restore network filter (`account-state/service.ts`);
 * not on results, nor in the lax storage row codec. The node-factory adapter
 * applies the transport rule on its own to every URL it dials.
 */
export const RpcUrlSchema = z
	.string()
	.url()
	.refine((url) => !hasHiddenUrlCharacter(url), { message: ERR_RPC_URL_HIDDEN_CHARACTERS, abort: true })
	.superRefine((url, ctx) => {
		let parsed: URL
		try {
			parsed = new URL(url)
		} catch {
			ctx.addIssue({ code: "custom", message: ERR_RPC_URL_TRANSPORT })
			return
		}
		const verdict = rpcTransportVerdict(parsed)
		if (verdict.allowed) return
		const ipv6Loopback = verdict.refusal === "http-host" && verdict.host === "[::1]"
		ctx.addIssue({ code: "custom", message: ipv6Loopback ? ERR_RPC_URL_IPV6_LOOPBACK : ERR_RPC_URL_TRANSPORT })
	})

export const NetworkEndpointSchema: z.ZodType<NetworkEndpoint> = z.object({
	id: z.string(),
	rpcUrl: RpcUrlSchema,
	label: z.string().optional(),
})

const networkFields = {
	id: z.string(),
	profileId: z.string(),
	chainId: z.number(),
	l1ChainId: z.number().int().nonnegative().max(0xffffffff),
	name: z.string(),
	primaryEndpointId: z.string(),
	kind: ChainKindSchema.optional(),
}

export const NetworkSchema: z.ZodType<Network> = z.object({
	...networkFields,
	endpoints: z.array(NetworkEndpointSchema).min(1),
})

/** The service's answers: `NetworkSchema` with each stored endpoint URL read as the row codec reads
 *  it. A URL saved before a rule tightened (an `http://[::1]` node) must still list, so the person
 *  can switch or delete it; new input still meets `RpcUrlSchema` as a param. */
const NetworkResultSchema: z.ZodType<Network> = z.object({
	...networkFields,
	endpoints: z.array(NetworkEndpointRowSchema).min(1),
})

export const NodeStatusSchema: z.ZodType<NodeStatus> = z.enum(NodeStatus)

/**
 * Per-method schemas. Tuples preserve positional-param ordering (our wire
 * format sends params as a positional list).
 */
export const NetworkMethodSchemas = {
	getOrInitNetworks: {
		params: z.tuple([]),
		result: z.array(NetworkResultSchema),
	},
	seedDefaultsForProfile: {
		params: z.tuple([z.string().min(1)]),
		result: z.array(NetworkResultSchema),
	},
	getNetworks: {
		params: z.tuple([z.number().int().nonnegative().optional()]),
		result: z.array(NetworkResultSchema),
	},
	getNetwork: {
		params: z.tuple([z.string().min(1)]),
		result: NetworkResultSchema,
	},
	addNetwork: {
		params: z.tuple([z.string().min(1), RpcUrlSchema]),
		result: NetworkResultSchema,
	},
	renameNetwork: {
		params: z.tuple([z.string().min(1), z.string().min(1)]),
		result: NetworkResultSchema,
	},
	deleteNetwork: {
		params: z.tuple([z.string().min(1)]),
		result: NetworkResultSchema,
	},
	setActiveNetwork: {
		params: z.tuple([z.string().min(1)]),
		result: NetworkResultSchema,
	},
	getActiveNetwork: {
		params: z.tuple([]),
		result: NetworkResultSchema.nullable(),
	},
	getPrimaryNetwork: {
		params: z.tuple([]),
		result: NetworkResultSchema.nullable(),
	},
	setActiveForProfile: {
		params: z.tuple([z.string().min(1), z.string().min(1)]),
		result: z.string(),
	},
	addEndpoint: {
		params: z.tuple([z.string().min(1), z.string().optional(), RpcUrlSchema]),
		result: NetworkEndpointRowSchema,
	},
	updateEndpoint: {
		params: z.tuple([z.string().min(1), z.string().min(1), z.string().optional(), RpcUrlSchema]),
		result: NetworkEndpointRowSchema,
	},
	deleteEndpoint: {
		params: z.tuple([z.string().min(1), z.string().min(1)]),
		result: NetworkEndpointRowSchema,
	},
	setPrimaryEndpoint: {
		params: z.tuple([z.string().min(1), z.string().min(1)]),
		result: NetworkResultSchema,
	},
	getNodeStatus: {
		params: z.tuple([z.string().min(1)]),
		result: NodeStatusSchema,
	},
	probeNodeStatus: {
		// timeoutMs bounds ONE non-retrying attempt; clamped well under the
		// popup→SW request ceiling so the probe can never outlive its caller.
		params: z.tuple([z.string().min(1), z.number().int().min(100).max(30_000)]),
		result: NodeStatusSchema,
	},
} as const

export type Methods = {
	/** Returns existing networks if any, or seeds + returns the 3 defaults. */
	getOrInitNetworks(): Network[]
	/**
	 * Seeds the defaults for a profile that is NOT the active session (full-backup import
	 * restores into a profile before activating it). The profile must exist and not be under
	 * deletion; rows already stored for it are returned untouched. Writes that profile's own
	 * active pointer only — never the shared node cache.
	 */
	seedDefaultsForProfile(profileId: string): Network[]
	/** Returns all networks for the active profile, or filtered by chainId. */
	getNetworks(chainId?: number): Network[]
	/** Returns a network by id. */
	getNetwork(id: string): Network
	/**
	 * Creates a new Network with one initial endpoint.
	 * Throws `DUPLICATE_CHAIN: ...` if a network with the probed chainId
	 * already exists in this profile (caller should `addEndpoint` instead).
	 * @param name Display name for the chain.
	 * @param rpcUrl Initial endpoint URL.
	 */
	addNetwork(name: string, rpcUrl: string): Network
	/** Renames a network. Does NOT touch endpoints. */
	renameNetwork(id: string, name: string): Network
	/**
	 * Deletes a network and PURGES all chain-scoped state for that
	 * (profileId, chainId) — accounts, txs, balances, tokens, fpcs,
	 * authwits, journal, PXE. Rejects if the network is currently active.
	 */
	deleteNetwork(id: string): Network
	/**
	 * Switches the active chain pointer. Primes the AztecNode cache. Does
	 * NOT mutate `primaryEndpointId` (that's a separate user choice via
	 * `setPrimaryEndpoint`).
	 */
	setActiveNetwork(id: string): Network
	/** Returns the currently active network, or null if none. */
	getActiveNetwork(): Network | null
	/**
	 * Returns the profile's PRIMARY network — the one whose default seed carries `isPrimaryActive`
	 * (Alpha in prod, Testnet under the e2e flag), or null if that network isn't present. Single
	 * source for "which network is the default", so the bootstrap fallback can't drift from
	 * `DEFAULT_SEEDS` (a hardcoded `kind` check in the composable would break the e2e flag).
	 */
	getPrimaryNetwork(): Network | null
	/**
	 * Writes the active-network pointer for a SPECIFIC profile without requiring it to be the active
	 * session — used by full-backup import to restore the user's active-network selection BEFORE
	 * `finalizeRestore` activates the profile. `networkId` must be a network owned by `profileId`
	 * (rejects an unowned/hostile id — the value comes from an attacker-controlled backup). Returns
	 * the written networkId.
	 */
	setActiveForProfile(profileId: string, networkId: string): string
	/**
	 * Adds an endpoint to an existing network. Probes the RPC; rejects
	 * `ENDPOINT_CHAIN_MISMATCH` if the URL's chainId doesn't match.
	 */
	addEndpoint(networkId: string, label: string | undefined, rpcUrl: string): NetworkEndpoint
	/** Updates an endpoint's label and/or rpcUrl. Re-probes on URL change. */
	updateEndpoint(networkId: string, endpointId: string, label: string | undefined, rpcUrl: string): NetworkEndpoint
	/**
	 * Deletes an endpoint. Rejects `PRIMARY_ENDPOINT` if it's the primary,
	 * or `LAST_ENDPOINT` if it's the only one on the network.
	 */
	deleteEndpoint(networkId: string, endpointId: string): NetworkEndpoint
	/** Sets the primary endpoint for a network. Evicts the AztecNode cache. */
	setPrimaryEndpoint(networkId: string, endpointId: string): Network
	/** Probes the network's primary endpoint and returns Active/Inactive/InvalidChain. */
	getNodeStatus(networkId: string): NodeStatus
	/**
	 * Like `getNodeStatus`, but with a caller-owned budget: ONE non-retrying
	 * probe whose socket aborts at `timeoutMs` (no retry chain, no work left
	 * running past the budget). Timeout/refusal ⇒ `Inactive`.
	 */
	probeNodeStatus(networkId: string, timeoutMs: number): NodeStatus
}

export type Events = {
	/** Emitted when a new network is added. */
	onNetworkAdded: Network
	/** Emitted when an existing network is updated (rename or endpoint mutation). */
	onNetworkUpdated: Network
	/** Emitted when a network is deleted (after purge completes). */
	onNetworkDeleted: Network
	/** Emitted when the active chain changes. */
	onActiveNetworkChanged: Network
	/** Emitted when a network's primary endpoint changes. */
	onPrimaryEndpointChanged: { networkId: string; endpointId: string }
	/**
	 * Emitted after `purgeChain` finishes wiping chain-scoped state. UI uses
	 * this to refresh views (account list, tx list, etc.).
	 */
	onChainPurged: { profileId: string; chainId: number }
}
