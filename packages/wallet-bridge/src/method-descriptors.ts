/**
 * Single source of truth for per-method wallet-RPC metadata.
 *
 * One `MethodDescriptor` row per dispatchable method. The six tables that used
 * to be hand-maintained across `capability-map.ts`, `dispatcher.ts`, and
 * `scope-enforcement.ts` are now DERIVED from this registry (see the `derive*`
 * functions + the pre-computed exports below). Adding a method's authz/routing
 * facts is one edit here; a forgotten method is caught by the exhaustiveness
 * test (build failure) and the dispatch-entry guard (runtime throw).
 *
 * Scope: this owns the method-name-keyed METADATA only. It does NOT own the
 * kind→Operation build switches (`buildNetworkOperation`/`buildAccountOperation`
 * in dispatcher.ts) — those construct Operation objects from args and stay
 * kind-keyed. Adding a method that needs a NEW Operation kind still touches
 * those switches; the registry just centralizes the metadata facts.
 *
 * Layering: this is a near-leaf module. It imports the scope-checker function
 * references from `./method-scope-checkers` (the true leaf) and types only from
 * `./operation` + `./capabilities`. Nothing it depends on depends back on it,
 * which is what lets `capability-map.ts` / `dispatcher.ts` / `scope-enforcement.ts`
 * become thin facades over it without an import cycle.
 */

import { UnsupportedMethodError } from "@nulo/extension-messaging/errors"
import { isRecord } from "@nulo/wallet-core/utils"
import type { OperationKind } from "./operation"
import {
	type ScopeCheck,
	checkRegisterContract,
	checkGetContractMetadata,
	checkIsTokenRegistered,
	checkGetContractClassMetadata,
	checkRegisterContractClassDisabled,
	checkSendTx,
	checkGrantPublicAuthwit,
	checkSimulateTx,
	checkProfileTx,
	checkExecuteUtility,
	checkGetPrivateEvents,
	checkCreateAuthWit,
	checkGetAccounts,
	checkGetAddressBook,
	checkRegisterSender,
} from "./method-scope-checkers"

/** Capability types a dApp method can require. Defined HERE (not capability-map.ts)
 *  so the seam is one-directional: capability-map re-exports it. */
export type CapabilityType = "accounts" | "contracts" | "contractClasses" | "simulation" | "transaction" | "data"

/** Operation kinds routed via `buildNetworkOperation` (network context only). */
export type NetworkOperationKind =
	| "aztec_getChainInfo"
	| "aztec_getContractClassMetadata"
	| "aztec_getContractMetadata"
	| "aztec_getPrivateEvents"
	| "aztec_registerSender"
	| "aztec_getAddressBook"
	| "aztec_registerContract"

/** Operation kinds routed via `buildAccountOperation` (network + account context). */
export type AccountOperationKind = "aztec_simulateTx" | "aztec_executeUtility" | "aztec_profileTx"

// Compile-time proof the route-narrowed kinds stay subsets of Operation["kind"].
// If a kind is renamed in operation.ts and not here, this stops compiling.
type AssertExtends<T extends U, U> = T
type _NetworkSubset = AssertExtends<NetworkOperationKind, OperationKind>
type _AccountSubset = AssertExtends<AccountOperationKind, OperationKind>

/** How a method is serviced AFTER capability + scope enforcement.
 *  `handler` = popup / meta / reader (dispatch()-internal, no buildOperation). */
export type MethodRouting =
	| { readonly via: "network-operation"; readonly kind: NetworkOperationKind }
	| { readonly via: "account-operation"; readonly kind: AccountOperationKind }
	| { readonly via: "handler" }

/**
 * Per-method arity guard, run before the capability check: required leading positions only (and
 * the batch envelope), never value shapes, which the schema parse checks after the capability
 * check (`wallet-schema-args.ts`). A pass/fail predicate, so the wire args reach every reader
 * unchanged.
 */
export type ArgGuard = (args: readonly unknown[]) => boolean

export interface MethodDescriptor {
	/** Required capability, or `null` for exempt/meta. `null` ⟺ `exemptReason` set (D7 XOR). */
	readonly capability: CapabilityType | null
	/** Present iff the method skips `enforceCapability` entirely. Documents WHY. */
	readonly exemptReason?: string
	readonly routing: MethodRouting
	/** Per-origin scope gate. Omitted = no scope dimension (enforceScope no-ops). */
	readonly scopeCheck?: ScopeCheck
	/** Arity guard (see {@link ArgGuard}). Omitted = no check before the capability check. */
	readonly argSchema?: ArgGuard
	/** Refused as a batch leg before any leg runs. Named for the refusal, not for popup routing, so
	 *  routing a new method through a popup never widens the set by itself. */
	readonly refusedInBatch?: true
	/** Security rationale for the row, paired with tests. */
	readonly audit?: string
	/** Rationale migrated verbatim from the old inline comments. */
	readonly note?: string
}

// ── Arg guards ─────────────────────────────────────────────────────────

/** Each leg is checked by its own method's guard and parse when it re-enters dispatch. */
export function argsBatch(args: readonly unknown[]): boolean {
	const legs = args[0]
	if (!Array.isArray(legs)) return false
	return legs.every((leg) => isRecord(leg) && typeof leg.name === "string" && Array.isArray(leg.args))
}

export function argsCreateAuthWit(args: readonly unknown[]): boolean {
	return args.length >= 2
}

export function argsOneRequired(args: readonly unknown[]): boolean {
	return args.length >= 1
}

export function argsTwoRequired(args: readonly unknown[]): boolean {
	return args.length >= 2
}

// Private `satisfies` source so the literal KEYS survive for `MethodName`
// (`keyof typeof METHOD_REGISTRY_SOURCE`). The public `METHOD_REGISTRY` below is
// a wide-typed (`Record<string, MethodDescriptor>`) re-export of this SAME object
// so the frozen oracle + derivations keep their optional-field (`exemptReason?`/
// `scopeCheck?`) access. Runtime-identical; oracle byte-UNEDITED.
const METHOD_REGISTRY_SOURCE = {
	// ── Exempt meta / infra (no capability, no scope) ──
	getChainInfo: {
		capability: null,
		exemptReason: "meta-protocol — chain info is public, requires no grant",
		routing: { via: "network-operation", kind: "aztec_getChainInfo" },
	},
	requestCapabilities: {
		capability: null,
		exemptReason: "capability-negotiation meta-protocol — the method by which grants are obtained",
		routing: { via: "handler" },
	},
	batch: {
		capability: null,
		exemptReason: "infrastructure wrapper — each leg re-enters dispatch() and is enforced individually",
		routing: { via: "handler" },
		argSchema: argsBatch,
	},
	getWalletFeatures: {
		capability: null,
		exemptReason: "meta-protocol — a static list of what this build routes; no account, network or balance data",
		routing: { via: "handler" },
		note: "handler-routed; a dApp asks before naming the account's own Fee Juice as payer (a build without the feature builds that invalid)",
	},

	// ── accounts ──
	createAuthWit: {
		capability: "accounts",
		// Routed via a dispatcher handler (not the generic account-operation path) so it
		// can resolve the signer from args[0], bind name↔selector in execution, and route
		// uncovered/inner-hash intents to a confirmation popup instead of silent signing.
		routing: { via: "handler" },
		scopeCheck: checkCreateAuthWit,
		argSchema: argsCreateAuthWit,
	},
	registerToken: {
		capability: "accounts",
		routing: { via: "handler" },
		argSchema: argsTwoRequired,
		refusedInBatch: true,
		// D8: NOT a missing scope checker. registerToken's session-account authz
		// is enforced inline in handleRegisterToken(); it has no METHOD_SCOPE_CHECKER
		// entry by design.
		note: "popup-routed; session-account authz is inline in handleRegisterToken (no scope-checker by design)",
	},
	getAccounts: {
		capability: "accounts",
		routing: { via: "handler" },
		scopeCheck: checkGetAccounts,
		audit: "requires accounts.canGet=true (the canGet sub-grant is enforced, not decorative)",
	},

	// ── contracts ──
	isTokenRegistered: {
		capability: "contracts",
		routing: { via: "handler" },
		scopeCheck: checkIsTokenRegistered,
		argSchema: argsOneRequired,
		// A1: wallet-local registration probe; gated by the contracts grant
		// (need-to-know address list), scope-checked via canGetMetadata — the same
		// consent surface as getContractMetadata. Preserved verbatim.
		note: "reader-routed; contracts grant + canGetMetadata scope (A1, preserved)",
	},
	registerContract: {
		capability: "contracts",
		routing: { via: "network-operation", kind: "aztec_registerContract" },
		scopeCheck: checkRegisterContract,
		argSchema: argsOneRequired,
	},
	getContractMetadata: {
		capability: "contracts",
		routing: { via: "network-operation", kind: "aztec_getContractMetadata" },
		scopeCheck: checkGetContractMetadata,
		argSchema: argsOneRequired,
	},

	// ── contractClasses ──
	getContractClassMetadata: {
		capability: "contractClasses",
		routing: { via: "network-operation", kind: "aztec_getContractClassMetadata" },
		scopeCheck: checkGetContractClassMetadata,
		argSchema: argsOneRequired,
	},
	registerContractClass: {
		capability: "contractClasses",
		routing: { via: "handler" },
		scopeCheck: checkRegisterContractClassDisabled,
		note: "Neutralized: unbound PXE artifact registration (5.0-new) is NOT dApp-exposed until contractClasses.canRegister + UI disclosure + class-id-scoped async enforcement exist. Denied at scope-check.",
	},

	// ── simulation ──
	simulateTx: {
		capability: "simulation",
		routing: { via: "account-operation", kind: "aztec_simulateTx" },
		scopeCheck: checkSimulateTx,
	},
	executeUtility: {
		capability: "simulation",
		routing: { via: "account-operation", kind: "aztec_executeUtility" },
		scopeCheck: checkExecuteUtility,
	},
	profileTx: {
		capability: "simulation",
		routing: { via: "account-operation", kind: "aztec_profileTx" },
		scopeCheck: checkProfileTx,
	},

	// ── transaction (both popup-routed → handler, no kind) ──
	sendTx: {
		capability: "transaction",
		routing: { via: "handler" },
		scopeCheck: checkSendTx,
		refusedInBatch: true,
		note: "popup-routed via DappInteractionService (fee selection); no METHOD_TO_KIND entry",
	},
	grantPublicAuthwit: {
		capability: "transaction",
		routing: { via: "handler" },
		scopeCheck: checkGrantPublicAuthwit,
		argSchema: argsTwoRequired,
		refusedInBatch: true,
		// WITHOUT the transaction capability, enforceCapability returns [] and the
		// scope-enforcement block is skipped — the gate becomes dead code.
		audit: "requires the transaction capability or the scope gate is dead code (see dispatcher.test.ts)",
	},

	// ── data ──
	getPrivateEvents: {
		capability: "data",
		routing: { via: "network-operation", kind: "aztec_getPrivateEvents" },
		scopeCheck: checkGetPrivateEvents,
		argSchema: argsTwoRequired,
	},
	getAddressBook: {
		capability: "data",
		routing: { via: "network-operation", kind: "aztec_getAddressBook" },
		scopeCheck: checkGetAddressBook,
		audit: "requires data.addressBook=true",
	},
	registerSender: {
		capability: "data",
		routing: { via: "network-operation", kind: "aztec_registerSender" },
		scopeCheck: checkRegisterSender,
		argSchema: argsOneRequired,
		audit: "requires data.addressBook=true (same sub-grant as getAddressBook)",
	},
} satisfies Record<string, MethodDescriptor>

/** The registry the facades/derivations/oracle consume — the SAME object as
 *  `METHOD_REGISTRY_SOURCE`, widened to `Record<string, MethodDescriptor>` so
 *  optional-field access (`exemptReason?`/`scopeCheck?`) type-checks. */
export const METHOD_REGISTRY: Record<string, MethodDescriptor> = METHOD_REGISTRY_SOURCE

// ── Derivations (each replaces a former hand-maintained table) ─────────

/** Method → projected value for every descriptor whose projection is defined. */
function deriveRecord<V>(registry: Record<string, MethodDescriptor>, project: (d: MethodDescriptor) => V | undefined): Record<string, V> {
	const out: Record<string, V> = {}
	for (const [method, d] of Object.entries(registry)) {
		const v = project(d)
		if (v !== undefined) out[method] = v
	}
	return out
}

/** The defined projections of every descriptor, as a set. */
function deriveSet<V>(registry: Record<string, MethodDescriptor>, project: (method: string, d: MethodDescriptor) => V | undefined): Set<V> {
	const out = new Set<V>()
	for (const [method, d] of Object.entries(registry)) {
		const v = project(method, d)
		if (v !== undefined) out.add(v)
	}
	return out
}

export function deriveCapabilityMap(registry: Record<string, MethodDescriptor>): Record<string, CapabilityType> {
	return deriveRecord(registry, (d) => d.capability ?? undefined)
}

export function deriveExemptSet(registry: Record<string, MethodDescriptor>): Set<string> {
	return deriveSet(registry, (method, d) => (d.exemptReason !== undefined ? method : undefined))
}

export function deriveMethodToKind(registry: Record<string, MethodDescriptor>): Record<string, OperationKind> {
	return deriveRecord(registry, (d) => (d.routing.via !== "handler" ? d.routing.kind : undefined))
}

export function deriveNetworkOnlyKinds(registry: Record<string, MethodDescriptor>): Set<OperationKind> {
	return deriveSet(registry, (_, d) => (d.routing.via === "network-operation" ? d.routing.kind : undefined))
}

export function deriveAccountKinds(registry: Record<string, MethodDescriptor>): Set<OperationKind> {
	return deriveSet(registry, (_, d) => (d.routing.via === "account-operation" ? d.routing.kind : undefined))
}

export function deriveScopeCheckerMap(registry: Record<string, MethodDescriptor>): Record<string, ScopeCheck> {
	return deriveRecord(registry, (d) => d.scopeCheck)
}

/** The exact set of dApp RPC method names the dispatcher supports — the literal
 *  key union of `METHOD_REGISTRY`. A typed replacement for the bare `string` at
 *  the dispatch boundary; layered FROM the registry (not a second whitelist). */
export type MethodName = keyof typeof METHOD_REGISTRY_SOURCE

/** Fail-closed dispatch-entry guard + narrowing. Throws (preserving the frozen
 *  "Unsupported wallet method" string) for any name absent from `METHOD_REGISTRY`;
 *  `Object.hasOwn` (not a truthy index) rejects prototype names. On return,
 *  `methodName` is narrowed to `MethodName`. This is the single typed choke point
 *  the dispatcher routes through — no permissive default, no `as` at the boundary. */
export function assertKnownMethod(methodName: string): asserts methodName is MethodName {
	if (!Object.hasOwn(METHOD_REGISTRY, methodName)) {
		throw UnsupportedMethodError.forMethod(methodName)
	}
}

// Pre-computed once at module load — these are what the facades import.
export const METHOD_CAPABILITY_MAP: Record<string, CapabilityType> = deriveCapabilityMap(METHOD_REGISTRY)
export const EXEMPT_METHODS: Set<string> = deriveExemptSet(METHOD_REGISTRY)
export const METHOD_TO_KIND: Record<string, OperationKind> = deriveMethodToKind(METHOD_REGISTRY)
export const NETWORK_ONLY_KINDS: Set<OperationKind> = deriveNetworkOnlyKinds(METHOD_REGISTRY)
export const ACCOUNT_KINDS: Set<OperationKind> = deriveAccountKinds(METHOD_REGISTRY)
export const METHOD_SCOPE_CHECKER: Record<string, ScopeCheck> = deriveScopeCheckerMap(METHOD_REGISTRY)
export const BATCH_REFUSED_METHODS: ReadonlySet<string> = deriveSet(METHOD_REGISTRY, (method, d) => (d.refusedInBatch ? method : undefined))
