/**
 * Job types.
 *
 * Stages, progress payloads, and error envelopes used by the durable-job
 * subsystem. Pure types only — no chrome.*, no zod, no PXE imports.
 *
 * The 7-stage FSM is shared across kinds (transfer, dapp_execute, future
 * imports). Each stage's `JobProgress` variant can carry stage-specific
 * extras without bumping the schema.
 *
 * `JobError` preserves the raw error category from the underlying boundary
 * (PXE / network / user-reject) so a retry policy can classify
 * retryable vs terminal without revisiting the schema.
 */

/**
 * Stages a job can be in. Three are terminal (see {@link TERMINAL_STAGES}).
 *
 * `queued` is a pre-execution holding stage for records created at message
 * arrival before the handler claims them. Used by the wallet-sdk session
 * FIFO surface so concurrent dApp sendTx requests are visible in the
 * activity feed BEFORE their handler runs. Handlers transition queued →
 * pending the moment they claim ownership; the journal-layer mutex on
 * `transitionOperation` ensures a concurrent `cancelJob` can't race with
 * the claim.
 */
export type JobStage = "queued" | "pending" | "simulating" | "proving" | "submitting" | "succeeded" | "failed" | "cancelled"

export type TerminalStage = "succeeded" | "failed" | "cancelled"

/** The stages a job can still leave. */
export type ActiveStage = Exclude<JobStage, TerminalStage>

/**
 * Terminal stages. Records in these stages never transition further; the
 * journal keeps them with `terminalAt` set so resume sweeps,
 * idempotency dedup, and tombstones have a stable record.
 */
export const TERMINAL_STAGES: ReadonlySet<JobStage> = new Set<JobStage>(["succeeded", "failed", "cancelled"])

/** True if `stage` is terminal — i.e. no further transitions are legal. */
export function isTerminal(stage: JobStage): stage is TerminalStage {
	return TERMINAL_STAGES.has(stage)
}

/** What the network answered for a failed send that may have reached it. `unconfirmed`: no
 *  answer within the check's window. `expired`: the finalized chain is past the send's expiry and
 *  holds none of it. */
export type SendCheckOutcome = "sent" | "reverted" | "unconfirmed" | "expired"

/** What proves a send can never be included: its expiry in chain seconds, and its first
 *  nullifier, which every block that includes it inserts, reverted or not. */
export type SendExpiry = { timestamp: number; nullifier: string }

/** The block a `sent` or `reverted` answer was read in, kept until the finalized chain holds it. */
export type SendInclusion = { block: number; hash: string }

export type ProveBackend = "presto" | "browser"

/** Who pays a queued send's fee, in the Send page's terms: Fee Juice from the account, or a fee
 *  contract by its row. */
export type QueuedFeePayer = { type: "fj" | "private_fpc" | "fpc"; fpcId?: string; isProtocol: boolean }

/** A queued send whose build came out above its cap and waits for the person: `fee` is that
 *  build's fee and `cap` the one it was held to, both in base units. */
export type QueuedFeeReask = { fee: string; cap: string; payer: QueuedFeePayer }

/** A positive integer in base units of at most 39 digits, the width of a u128: no sign, point,
 *  exponent or leading zero. */
export function isFeeAmount(value: unknown): value is string {
	return typeof value === "string" && /^[1-9]\d{0,38}$/.test(value)
}

/**
 * Progress payload, discriminated by stage. Adding fields per stage variant
 * does NOT require a schema migration — consumers ignore unknown keys.
 *
 * `proving.enteredProveAt` is the single timestamp used by the resume
 * policy to detect stuck proves (periodic heartbeats from
 * inside the BB.wasm prove are not feasible — the prover blocks the JS turn).
 *
 * `proving.backend` is evidence copied from the prover's own phase stream —
 * `presto` once the prover committed the witness to the native server (announced
 * at `transmit`, before the POST), `browser` once it fell back to WASM — and
 * absent until a phase decides it. It changes inside
 * the stage (the FSM has no `proving → proving` edge), through the journal's
 * `updateProvingBackend` seam only.
 */
export type JobProgress =
	| { stage: "queued"; reask?: QueuedFeeReask }
	| { stage: "pending" }
	| { stage: "simulating" }
	| { stage: "proving"; enteredProveAt: number; backend?: ProveBackend }
	/** `submittedEndpointUrl`: the endpoint the send goes out through, where a lost answer is checked.
	 *  `expiry` is absent when the tx cannot carry one the chain enforces. */
	| { stage: "submitting"; txHash?: string; submittedEndpointUrl?: string; expiry?: SendExpiry }
	/**
	 * `txHash` is present for on-chain ops (`transfer`, `dapp_execute`) and
	 * absent for non-tx ops (`token_import`, future imports). The journal
	 * service enforces the kind ↔ txHash mapping in `transitionOperation`
	 * so the structural optionality here can't be misused by a caller.
	 */
	| { stage: "succeeded"; txHash?: string }
	/**
	 * Every field is the journal's own: `from` is the stage the row left, the hash, endpoint and
	 * expiry are carried from `submitting`, and `check` is the network's answer. A caller's are
	 * discarded. `inclusion` rides a `sent` or `reverted` answer until its block is final;
	 * `checkSince` restarts the check's window when that block was pruned.
	 */
	| {
			stage: "failed"
			from?: ActiveStage
			txHash?: string
			submittedEndpointUrl?: string
			expiry?: SendExpiry
			check?: SendCheckOutcome
			inclusion?: SendInclusion
			checkSince?: number
	  }
	| { stage: "cancelled" }

/**
 * Known {@link JobError.kind} categories. OPEN union — the `(string & {})` arm
 * keeps arbitrary strings assignable, so a `switch` over `kind` does NOT narrow
 * to `never` (consumers MUST keep a `default` arm). The literals exist for
 * autocomplete + the runtime drift guard, NOT for compiler exhaustiveness.
 *
 * Producers: `normalizeError(…, "transfer" | "dapp_execute" | "prover" | "network" | "unknown")`,
 * `popup_bound`, `user_rejected`, `scope_refused`, `registry_refused`, `malformed_request`,
 * `terms_refused`, `session_ended` and `wallet_refused` (wallet-sdk; `scope_refused` and
 * `registry_refused` also from execution's `markFailedUnlessCancelled`, `terms_refused` also from the
 * dApp interaction service), `too_many_pending` (execution's waiting-sends cap), the reaper
 * (`sw_restart_post_prove` | `stuck_proving` | `stuck_queued` | `stale_on_resume`),
 * and `classifyTokenImportError` (`network_unreachable` | `contract_invalid` |
 * `metadata_fetch` | `unknown`). `network` | `simulation` are switched-on / documented but not all
 * produced on HEAD.
 */
export type KnownJobErrorKind =
	| "user_rejected"
	| "popup_bound"
	| "scope_refused"
	| "registry_refused"
	| "malformed_request"
	| "terms_refused"
	| "wallet_refused"
	| "too_many_pending"
	| "sw_restart_post_prove"
	| "stale_on_resume"
	| "stuck_proving"
	| "stuck_queued"
	| "network"
	| "simulation"
	| "prover"
	| "transfer"
	| "dapp_execute"
	| "duplicate_initialization"
	| "session_ended"
	| "network_unreachable"
	| "contract_invalid"
	| "metadata_fetch"
	| "unknown"

export type JobErrorKind = KnownJobErrorKind | (string & {})

/**
 * Runtime mirror of {@link KnownJobErrorKind}, completeness-guarded by
 * `satisfies Record<KnownJobErrorKind, true>`: adding a literal to the type
 * without adding it here (or vice-versa) is a COMPILE error → the drift signal.
 * This table — NOT the compiler's `switch` narrowing, which the open arm defeats
 * — is what catches a producer/known-set drift.
 */
const KNOWN_JOB_ERROR_KIND_TABLE = {
	user_rejected: true,
	popup_bound: true,
	scope_refused: true,
	registry_refused: true,
	malformed_request: true,
	terms_refused: true,
	wallet_refused: true,
	too_many_pending: true,
	sw_restart_post_prove: true,
	stale_on_resume: true,
	stuck_proving: true,
	stuck_queued: true,
	network: true,
	simulation: true,
	prover: true,
	transfer: true,
	dapp_execute: true,
	duplicate_initialization: true,
	session_ended: true,
	network_unreachable: true,
	contract_invalid: true,
	metadata_fetch: true,
	unknown: true,
} satisfies Record<KnownJobErrorKind, true>

/** All {@link KnownJobErrorKind} literals at runtime (drift-guarded mirror). */
export const KNOWN_JOB_ERROR_KINDS = Object.keys(KNOWN_JOB_ERROR_KIND_TABLE) as KnownJobErrorKind[]

/**
 * Error envelope. Preserves the raw error category from the underlying
 * boundary so a retry policy can classify retryable vs terminal.
 *
 * `normalizedRaw` is best-effort `JSON.stringify` of the original error,
 * capped at {@link NORMALIZED_RAW_MAX_CHARS}. If serialization itself
 * throws (Proxy traps, getters that throw), the field is `null`.
 */
export interface JobError {
	/**
	 * Category, used by resume + retry policy (see {@link KnownJobErrorKind}).
	 * Open union — consumers MUST tolerate unknown values (keep a `default` arm).
	 */
	kind: JobErrorKind
	/** User-facing message — already humanized; safe to render verbatim. */
	message: string
	/** Best-effort serialized raw error (capped); `null` if unserializable. */
	normalizedRaw: string | null
}

/**
 * Hard cap for {@link JobError.normalizedRaw} in UTF-16 code units
 * (i.e. JavaScript `string.length` — NOT UTF-8 byte length).
 *
 * Multi-byte content (emoji, non-Latin scripts) will land somewhere between
 * 1x and 4x this value when measured as UTF-8 bytes in `chrome.storage`.
 * For the quota-safety goal (avoid runaway error strings blowing the
 * ~10MB session quota), a 4096-char ceiling is conservative enough.
 */
export const NORMALIZED_RAW_MAX_CHARS = 4096
