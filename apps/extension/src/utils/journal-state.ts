/**
 * Display for journal records with no `TransactionService` entry: cancelled and interrupted
 * operations, failures, and failed sends the wallet checks on the network. Their terminal state
 * comes from the record alone (its stage, `error.kind` and a checked send's answer); settled
 * transactions render through `TransactionCard` instead. Each visual state is an owner decision.
 */

// The glyph module, not the barrel: the e2e typecheck reaches this file and resolves no `.vue`.
import type { GlyphName } from "@nulo/design/core/glyphs.ts"
import type { JobErrorKind, SendCheckOutcome } from "@nulo/wallet-core/jobs"
import { balanceFormatted } from "@/utils/amount.js"
import { dashIfBlank } from "@/utils/string"
import { knownDecimals } from "@/utils/token-amount"
import type { ListedToken } from "@/utils/tx-amount"
import { DAPP_LABEL, callTitle, formatTransferType, settledCallTitle } from "@/utils/tx-enrichment"
import { isSendCheckable, type OperationKind, type OperationRecord, wasNeverSent } from "@/wallet/services/operation-journal/spec"

/**
 * Operation kinds that render on the activity feed (both the home-surface
 * `RecentActivityView` widget and the dedicated `activity.vue` page).
 *
 * - `transfer` / `dapp_execute`: on-chain ops; in-flight cards come from
 *   the journal, settled cards come from `TransactionService`.
 * - `token_import` is intentionally absent: its in-flight + recently-failed
 *   states render in `TokensView.vue` via `TokenImportRow`, and its
 *   `succeeded` state is handed off to the regular `TokenCard` (with the
 *   `updatedAt === 0` initial-sync spinner).
 *
 * Adding a new `OperationKind` MUST update this set or fail the
 * `journal-state.test.ts` exhaustiveness pin. The failure is the signal
 * to make a deliberate "where does this kind render?" decision rather
 * than silently inheriting whichever default the next consumer assumes.
 */
export const ACTIVITY_FEED_KINDS: ReadonlySet<OperationKind> = new Set(["transfer", "dapp_execute"])

export type JournalTerminalVisualState = "cancelled" | "interrupted" | "failed" | "checking" | "sent" | "unconfirmed"

export interface JournalTerminalDisplay {
	state: JournalTerminalVisualState
	subtitle: string
	icon: GlyphName
	color: "gray" | "amber" | "red" | "green"
}

/** What a failed send's record proves about the network: nothing was sent, the check is still
 *  asking, or the check's answer. */
export type SendOutcome = "nothing_sent" | "checking" | SendCheckOutcome

type CheckedOutcome = Exclude<SendOutcome, "nothing_sent">

/** The status glyph per visual state. `Icon` draws an unknown name blank, so each is a `GlyphName`. */
const ICONS = {
	cancelled: "square-cross",
	interrupted: "refresh",
	failed: "square-cross",
	checking: "square-half",
	sent: "square-check",
	unconfirmed: "help",
} as const satisfies Record<JournalTerminalVisualState, GlyphName>

const CHECKED_DISPLAYS: Record<CheckedOutcome, JournalTerminalDisplay> = {
	checking: { state: "checking", subtitle: "Not confirmed yet", icon: ICONS.checking, color: "gray" },
	sent: { state: "sent", subtitle: "Sent", icon: ICONS.sent, color: "green" },
	reverted: { state: "failed", subtitle: "Reverted", icon: ICONS.failed, color: "red" },
	unconfirmed: { state: "unconfirmed", subtitle: "Unconfirmed", icon: ICONS.unconfirmed, color: "amber" },
	expired: { state: "failed", subtitle: "Won't go through", icon: ICONS.failed, color: "red" },
}

/**
 * `null` for a record that is not a failed send, and for a failed row with no recorded stage,
 * which proves neither outcome.
 */
export function sendOutcome(op: OperationRecord): SendOutcome | null {
	const { progress } = op
	if (progress.stage !== "failed") return null
	if (isSendCheckable(op)) return progress.check ?? "checking"
	return wasNeverSent(op) ? "nothing_sent" : null
}

/**
 * Map a terminal journal record to its display shape.
 *
 * Returns `null` for non-terminal records and for successfully-completed
 * records — those are surfaced via the in-flight `TransactionAwaitingCard`
 * and the on-chain `TransactionCard` respectively, not by this mapping.
 */
export function journalTerminalDisplay(op: OperationRecord): JournalTerminalDisplay | null {
	if (op.terminalAt === null) return null

	const stage = op.progress.stage
	if (stage === "succeeded") return null

	const outcome = sendOutcome(op)
	if (outcome !== null && outcome !== "nothing_sent") return { ...CHECKED_DISPLAYS[outcome] }

	// Cancelled: either the journal-level cancel stage, or the user-rejected
	// error kind (popup-side reject can transition to failed:user_rejected
	// instead of cancelled when it happens late in the flow).
	if (stage === "cancelled" || op.error?.kind === "user_rejected") {
		return { state: "cancelled", subtitle: "Cancelled", icon: ICONS.cancelled, color: "gray" }
	}

	// At this point stage is "failed" by elimination (FSM has no other
	// terminal-non-success state). Branch on error.kind for the user-facing
	// distinction. Defensive: if error is null somehow (FSM invariant says
	// it shouldn't be), fall through to the generic Failed.
	const kind = op.error?.kind ?? "unknown"

	if (kind === "sw_restart_post_prove" || kind === "stale_on_resume" || kind === "stuck_proving") {
		return { state: "interrupted", subtitle: "Transaction was interrupted", icon: ICONS.interrupted, color: "amber" }
	}

	// Failed branch — kind-specific subtitle where useful, generic fallback otherwise.
	const subtitle = failedSubtitleFor(kind)
	return { state: "failed", subtitle, icon: ICONS.failed, color: "red" }
}

/**
 * Render a journal-record `subtitle` (dApp-controlled at session-discover time)
 * as defensive plain text. A malicious dApp could set its origin/subtitle to
 * something that LOOKS like an http(s) URL — if we ever rendered it as an
 * anchor or even just bare text in a context the user reads top-down, it could
 * mislead. Bracket any URL-shaped value so the UI signals "not a link" at a
 * glance. Returns null on null/undefined/empty input.
 *
 * Pure helper to keep the regression pin testable without mounting Vue.
 */
export function sanitizeJournalSubtitle(raw: string | undefined | null): string | null {
	if (!raw) return null
	// Match any `<scheme>:` prefix (http://, mailto:, tel:, javascript:, data:,
	// chrome-extension://, aztec://, arbitrary custom schemes). The widened
	// match (scheme + bare colon, not just scheme://) catches schemeful values
	// that aren't URL-shaped per RFC 3986 §1.1.2 but still read as actionable
	// links to a glancing user. False-positives on plain text containing colons
	// (timestamps `12:34`, versions `v1:`, CSS-like `color:red`) are accepted —
	// callers only pass dApp-controlled origin fields here, where bracketing
	// noise is safer than missing a real link-shaped value.
	// RFC 3986 scheme grammar: ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ).
	if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return `[${raw}]`
	return raw
}

/**
 * User-facing label for an error kind. Each documented `JobError.kind`
 * value maps to a short tag-style label; unknown kinds → `"Error"`.
 *
 * The journal-detail page renders this as the "Reason" row — distinct
 * from `failedSubtitleFor`'s sentence-form subtitle ("Network" vs.
 * "Network error"). Both surfaces stay consistent with the kind value
 * the reaper / executor classify against.
 *
 * `stuck_queued` IS in the whitelist — the reaper's `classifyReapKind`
 * (`operation-journal/reaper.ts`) emits it on queued-record time-out.
 * Without humanization it would leak the raw kind name into the UI.
 */
export function humanizeErrorKind(kind: JobErrorKind): string {
	switch (kind) {
		case "network":
			return "Network"
		case "simulation":
			return "Simulation"
		case "prover":
			return "Proof generation"
		case "popup_bound":
			return "Popup closed"
		case "dapp_execute":
		case "too_many_pending":
			return "App"
		case "transfer":
			return "Transfer"
		case "sw_restart_post_prove":
			return "Browser restart"
		case "stale_on_resume":
			return "Stale on resume"
		case "stuck_proving":
			return "Stuck proving"
		case "stuck_queued":
			return "Stuck queued"
		case "user_rejected":
			return "User rejected"
		case "unknown":
			return "Unknown"
		default:
			return "Error"
	}
}

/**
 * The journal page's category and one-line context for a record that ended without a settled
 * transaction: a failed send's outcome when its record proves one, otherwise its error kind's.
 * Reads only wallet-controlled fields, never the dApp-controlled `op.subtitle`.
 */
export type CategoricalFailureLabel = {
	label: string
	context: string
}

const STOPPED_BEFORE_BROADCAST: CategoricalFailureLabel = {
	label: "Stopped before broadcast",
	context: "Your wallet caught this before reaching the network. Often balance, fees, or invalid call.",
}

const CHECKED_LABELS: Record<CheckedOutcome, CategoricalFailureLabel> = {
	checking: {
		label: "Not confirmed yet",
		context: "Your wallet is checking whether this reached the network. Don't send it again yet.",
	},
	sent: { label: "Went through", context: "The network confirmed this transaction." },
	reverted: { label: "Reverted", context: "The network included this transaction, but it reverted. The fee was still paid." },
	unconfirmed: {
		label: "Unconfirmed",
		context: "Your wallet couldn't confirm this. It may still go through, so check History before sending it again.",
	},
	expired: {
		label: "Won't go through",
		context: "This transaction expired before the network included it. No fee was paid, and you can send it again.",
	},
}

export function categoricalLabel(op: OperationRecord): CategoricalFailureLabel {
	// Cancelled-stage ops carry no `error.kind` (the FSM transitions to
	// cancelled via user action, not a thrown error). Default-arm
	// "Error" was wrong for cancellation; surface as "Cancelled" instead.
	if (op.progress?.stage === "cancelled" && !op.error?.kind) {
		return { label: "Cancelled", context: "This transaction was cancelled." }
	}
	const kind = op.error?.kind ?? "unknown"
	const outcome = sendOutcome(op)
	if (outcome === "nothing_sent") return nothingSentLabel(kind) ?? kindLabel(kind)
	return outcome === null ? kindLabel(kind) : { ...CHECKED_LABELS[outcome] }
}

function nothingSentLabel(kind: JobErrorKind): CategoricalFailureLabel | undefined {
	switch (kind) {
		case "transfer":
		case "dapp_execute":
			return { ...STOPPED_BEFORE_BROADCAST }
		case "sw_restart_post_prove":
		case "stale_on_resume":
			return { label: "Interrupted before sending", context: "Your wallet stopped before sending this. Nothing was sent." }
		default:
			return undefined
	}
}

function kindLabel(kind: JobErrorKind): CategoricalFailureLabel {
	switch (kind) {
		case "user_rejected":
			return { label: "You rejected", context: "You stopped this transaction." }
		case "popup_bound":
			return { label: "Popup closed early", context: "The popup closed before this transaction could finish." }
		case "scope_refused":
			return { label: "Not allowed", context: "The app asked for more than you allowed. Nothing was sent." }
		case "registry_refused":
			return { label: "Not allowed", context: "Apps cannot change your public authorizations. Nothing was sent." }
		case "malformed_request":
			return { label: "Couldn't read request", context: "The app sent a request the wallet could not read. Nothing was sent." }
		case "terms_refused":
			return { label: "Terms not accepted", context: "Accept Nulo's Terms to let apps send. Nothing was sent." }
		case "wallet_refused":
			return {
				label: "Refused before sending",
				context: "The wallet refused this request before anything was signed. Nothing was sent.",
			}
		case "too_many_pending":
			return { label: "Refused before sending", context: "Too many sends were already waiting. Nothing was sent." }
		case "session_ended":
			// Never "Nothing was sent": a lock that lands during execution files this kind too.
			return { label: "Stopped when the wallet locked", context: "The wallet locked while this was in progress." }
		case "simulation":
		case "prover":
		case "stuck_proving":
		case "stuck_queued":
			return { ...STOPPED_BEFORE_BROADCAST }
		case "sw_restart_post_prove":
		case "stale_on_resume":
			return {
				label: "Interrupted mid-flight",
				context: "The wallet restarted before confirming this. Transaction may still be on-chain. Check the explorer.",
			}
		case "network":
			return {
				label: "Network error",
				context: "Couldn't reach the network. The transaction may not have been submitted.",
			}
		case "transfer":
			// Reached only by a record without `from`, which cannot say whether the node holds the tx.
			return {
				label: "Send failed",
				context: "Your wallet couldn't finish this send. If it was already submitted, it may still go through.",
			}
		case "dapp_execute":
			return { label: "Reported by app", context: "The connected app reported an error." }
		default:
			return { label: "Error", context: "Something went wrong with this transaction." }
	}
}

/** Subtitle copy per documented `JobError.kind` + live execution catch-alls. */
function failedSubtitleFor(kind: JobErrorKind): string {
	switch (kind) {
		case "network":
			return "Network error"
		case "simulation":
			return "Simulation failed"
		case "prover":
			return "Couldn't generate proof"
		case "duplicate_initialization":
			// The first-tx init race: another device/tx initialized the account
			// first. Honest and actionable — a plain retry succeeds once synced.
			return "Account already initialized. Retry after sync"
		case "session_ended":
			return "Stopped when the wallet locked"
		case "scope_refused":
		case "registry_refused":
			return "Not allowed"
		case "malformed_request":
			return "Couldn't read request"
		case "terms_refused":
			return "Terms not accepted"
		case "wallet_refused":
		case "too_many_pending":
			return "Refused before sending"
		// popup_bound, transfer, dapp_execute, unknown, and any other / future
		// kind all fall through to the generic copy. The kind is still preserved
		// in the journal record's error.kind field for debugging / future
		// granularity.
		default:
			return "Transaction failed"
	}
}

/** Minimal token shape the activity-feed terminal-card resolver needs. */
export interface TokenForCardProps {
	symbol?: string
	decimals?: number
	hasDecimals?: boolean
}

export interface JournalTerminalCardCtx {
	tokenById: (id: number) => TokenForCardProps | undefined
	/** The listed tokens a dApp call's movement label is read against. */
	tokens: readonly ListedToken[]
}

/** Props shape a terminal `TransactionTerminalCard` consumes, on Home and in History alike. */
export interface JournalTerminalCardProps {
	title: string
	activityIcon: GlyphName
	originLabel: string | null
	/** Privacy-direction chip ("Private → Public" etc.) for transfer ops.
	 *  Mutually exclusive with originLabel — the terminal card renders
	 *  whichever is set in the title-trailing slot. Null for non-transfer
	 *  kinds AND for transfer records persisted before the v0.17 schema
	 *  added `transferType` (gracefully degrades to no chip). */
	transferTypeLabel: string | null
	amount: string | null
	amountSymbol: string | null
	/** The title names the function a dApp called, whether or not the dApp's name survived. */
	oneLineTitle: boolean
	state: JournalTerminalVisualState
	subtitle: string
	icon: GlyphName
	color: JournalTerminalDisplay["color"]
}

/**
 * Resolve card props for a terminal journal record. Returns `null` when
 * the record should NOT render an activity-feed terminal card:
 *  - The record is non-terminal or `succeeded` (no terminal card; succeeded
 *    on-chain ops surface via TransactionService instead).
 *  - The kind is not in {@link ACTIVITY_FEED_KINDS} (e.g. `token_import`
 *    renders in TokensView via `TokenImportRow`, not in the activity feed).
 *
 * The non-activity-kind guard is intentional: it lets an accidental caller
 * get a clean `null` rather than a malformed card.
 *
 * Pure function. `tokenById` is passed via ctx because the token cache
 * lives in popup-store land; this file stays free of Pinia / Vue refs.
 */
export function buildJournalTerminalCardProps(op: OperationRecord, ctx: JournalTerminalCardCtx): JournalTerminalCardProps | null {
	if (!ACTIVITY_FEED_KINDS.has(op.kind)) return null
	const display = journalTerminalDisplay(op)
	if (!display) return null

	const fields = op.kind === "transfer" ? transferCardFields(op, ctx) : dappCardFields(op, ctx.tokens)
	return { ...fields, ...display }
}

type JournalCardFields = Pick<
	JournalTerminalCardProps,
	"title" | "activityIcon" | "originLabel" | "transferTypeLabel" | "amount" | "amountSymbol" | "oneLineTitle"
>

/** One token lookup, and the amount formatted before the title and the transfer type are read. */
function transferCardFields(op: OperationRecord, ctx: JournalTerminalCardCtx): JournalCardFields {
	const token = op.tokenId !== undefined ? ctx.tokenById(op.tokenId) : undefined

	// An empty or missing `amountRaw` would format as "0", a fake "0 USDC" on the card.
	let amount: string | null = null
	let amountSymbol: string | null = null
	const decimals = knownDecimals(token)
	if (op.amountRaw && token && decimals !== null) {
		amount = balanceFormatted(op.amountRaw, decimals, 8, { compact: true }).value
		amountSymbol = token.symbol ?? null
	}

	return {
		title: transferTitle(token),
		activityIcon: "send",
		originLabel: null,
		transferTypeLabel: transferTypeLabel(op),
		amount,
		amountSymbol,
		oneLineTitle: false,
	}
}

function dappCardFields(op: OperationRecord, tokens: readonly ListedToken[]): JournalCardFields {
	return {
		title: journalCallTitle(op, tokens),
		activityIcon: "zap",
		originLabel: journalCardOriginLabel(op),
		transferTypeLabel: null,
		amount: null,
		amountSymbol: null,
		oneLineTitle: true,
	}
}

/*
 * The awaiting card's fields, built from the same leaves as the terminal card's so a journal op
 * reads the same across its lifecycle. Each checks the kind before reading anything else.
 */

export function journalCardTitle(op: OperationRecord, ctx: JournalTerminalCardCtx): string {
	if (op.kind === "transfer") return transferTitle(op.tokenId !== undefined ? ctx.tokenById(op.tokenId) : undefined)
	return journalCallTitle(op, ctx.tokens)
}

export function journalCardIcon(op: OperationRecord): GlyphName {
	return op.kind === "transfer" ? "send" : "zap"
}

/** `op.subtitle` is the dApp-controlled origin persisted at session-discover time; bracketed when
 *  schemeful so it never reads as a link. */
export function journalCardOriginLabel(op: OperationRecord): string | null {
	if (op.kind !== "dapp_execute") return null
	return sanitizeJournalSubtitle(op.subtitle) ?? DAPP_LABEL
}

export function journalCardTransferTypeLabel(op: OperationRecord): string | null {
	if (op.kind !== "transfer") return null
	return transferTypeLabel(op)
}

function transferTitle(token: TokenForCardProps | undefined): string {
	return dashIfBlank(token?.symbol || "Transfer")
}

/**
 * A dApp call's title by the rule its settled row follows, from what its record holds: the call's
 * contract and argument count from the request, its class once the wallet's build recorded one. A
 * record with no call names no contract, so a movement name reads as its contract spells it.
 */
export function journalCallTitle(op: OperationRecord, tokens: readonly ListedToken[]): string {
	if (!op.title) return "Transaction"
	if (!op.call) return callTitle(op.title, undefined, false)
	const { contract, argCount, classId } = op.call
	return settledCallTitle({ contract, method: op.title, args: { length: argCount }, classId }, tokens)
}

function transferTypeLabel(op: OperationRecord): string | null {
	// `TransferType.Private` is 0, so a truthy check would drop the Private → Private chip.
	return op.transferType !== undefined ? formatTransferType(op.transferType) : null
}
