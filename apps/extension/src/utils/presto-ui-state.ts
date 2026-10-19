/**
 * Presto status → what a Nulo surface shows. Pure: the SDK status comes in,
 * a state plus copy comes out. The state names are the banner package's own
 * (`stateFromStatus`), so Nulo classifies a status exactly as Presto's own
 * surfaces do. Titles are Presto's canonical strings, extended with Nulo's
 * numbered recovery steps, except the pitch states (`idle`, `detecting`,
 * `offline`), a remembered denial and `permission-blocked`, which are Nulo's own.
 */
import { type BannerState, STRINGS, stateFromStatus } from "@alejoamiras/presto-banners"
import type { PrestoStatus, SecureConnectionDiagnosis } from "@alejoamiras/presto-core"
import type { LastProveOutcome } from "@/wallet/services/execution/models"

/** Facts the health body carries. The version fields are absent on the minimal body Presto
 *  serves an origin it has not approved yet; `protocol` is the scheme that answered, so it is
 *  known whenever anything answered. */
export interface PrestoInfo {
	appVersion?: string
	nativeAztecVersion?: string
	protocol?: "http" | "https"
}

export type PrestoUiState =
	| { kind: "idle" }
	| { kind: "detecting" }
	| { kind: BannerState; diagnosis?: SecureConnectionDiagnosis; info: PrestoInfo }

/** Colour role of a card: `go` proves natively, `accent` will after a download, `warn` needs
 *  the user, `off` is the browser fallback, `pending` is a probe in flight. */
export type PrestoTone = "pending" | "go" | "accent" | "warn" | "off"

export interface PrestoCopy {
	tone: PrestoTone
	title: string
	detail: string
	steps?: string[]
	retry?: "Retry" | "Re-test" | "Check for Presto" | "Check again"
}

export function uiStateFromStatus(status: PrestoStatus): PrestoUiState {
	const kind = stateFromStatus(status)
	if (status.available) {
		return { kind, info: { appVersion: status.appVersion, nativeAztecVersion: status.nativeAztecVersion, protocol: status.protocol } }
	}
	switch (status.reason) {
		case "secure-connection-unavailable":
			// `unconfirmed` maps to `offline` (the install pitch); the other diagnoses keep their arm.
			return kind === "secure-connection-unavailable" ? { kind, diagnosis: status.diagnosis, info: {} } : { kind, info: {} }
		case "version-mismatch":
			return { kind, info: { nativeAztecVersion: status.nativeAztecVersion, protocol: status.protocol } }
		case "error":
			return { kind, info: { protocol: status.protocol } }
		default:
			return { kind, info: {} }
	}
}

const PRESTO_SETTINGS_STEP = "Open Presto from your menu bar and go to Settings."

const SECURE_CONNECTION_COPY: Record<SecureConnectionDiagnosis, { detail: string; steps: string[] }> = {
	"presto-reachable": {
		detail: "Presto is running but the encrypted connection isn't reachable. Nulo only hands proofs to Presto over HTTPS.",
		steps: [
			PRESTO_SETTINGS_STEP,
			"Turn on Encrypted Connection.",
			"If Presto asks, run the certificate setup again, then press Retry.",
		],
	},
	"https-disabled": {
		detail: "Nulo only hands proofs to Presto over HTTPS.",
		steps: [
			PRESTO_SETTINGS_STEP,
			"Turn on Encrypted Connection.",
			"If Presto asks, run the certificate setup again, then press Retry.",
		],
	},
	"tls-or-trust-failure": {
		detail: "Your browser doesn't trust Presto's certificate yet.",
		steps: [PRESTO_SETTINGS_STEP, "Run the certificate setup again.", "Press Retry."],
	},
	// Unreachable here (`unconfirmed` becomes the `offline` pitch); kept so the record is total.
	unconfirmed: {
		detail: "Nulo only hands proofs to Presto over HTTPS.",
		steps: [PRESTO_SETTINGS_STEP, "Turn on Encrypted Connection.", "Press Retry."],
	},
}

const PERMISSION_BLOCKED_COPY: Omit<PrestoCopy, "tone" | "retry"> = {
	title: "Browser blocked local access",
	detail: "Proofs run in your browser until it's allowed.",
	steps: ["Open Nulo's site permissions from the address bar.", "Set Local network to Allow.", "Press Retry."],
}

type ProbeKind = "idle" | "detecting" | "offline"

/** The states where Presto is not known to be there, so a surface shows the install pitch. */
export function isPitchKind(kind: PrestoUiState["kind"]): kind is ProbeKind {
	return kind === "idle" || kind === "detecting" || kind === "offline"
}

/** `secure-connection-unavailable` qualifies: every diagnosis that keeps that kind parsed a health body. */
const REACHED_KINDS: ReadonlySet<PrestoUiState["kind"]> = new Set([
	"available",
	"downloading",
	"version-mismatch",
	"secure-connection-unavailable",
])

/**
 * Whether a probe got an answer from Presto, which shows the browser let the request through
 * when it ran. No other outcome shows that: a dismissed prompt and an absent Presto both read
 * `offline`, and `error` is also what a probe that threw looks like.
 */
export function hasReachedPresto(state: PrestoUiState): boolean {
	return REACHED_KINDS.has(state.kind)
}

/**
 * A first probe runs only on a click, because it can raise the browser's local-network prompt:
 * `idle` names that prompt before the click that may cause it, and `offline` is the answer to
 * "check", not an unprompted verdict.
 */
const PROBE_COPY: Record<ProbeKind, PrestoCopy> = {
	idle: {
		tone: "accent",
		title: "Already have Presto?",
		detail: "Your browser may ask whether Nulo can access apps on this device. That app is Presto, on your own computer. Choose Allow.",
		retry: "Check for Presto",
	},
	detecting: { tone: "pending", title: "Looking for Presto…", detail: "If your browser asks, choose Allow." },
	offline: {
		tone: "off",
		title: "Presto isn't running yet",
		detail: "Install it, open it from your menu bar, then check again.",
		retry: "Check again",
	},
}

/**
 * Copy for a state. `last` is the SW's memory of the latest prove attempt:
 * a remembered denial overlays `available`, because health alone cannot see
 * that Presto's per-origin prompt was declined. The overlay says "declined
 * earlier" — it is history, not a statement about approval now.
 */
export function copyFor(state: PrestoUiState, last?: LastProveOutcome | null): PrestoCopy {
	if (isPitchKind(state.kind)) return PROBE_COPY[state.kind]
	switch (state.kind) {
		case "available":
			if (last?.denial) {
				return {
					tone: "warn",
					title: "Presto declined Nulo earlier",
					detail: "Approval is confirmed by your next transaction; Re-test only re-checks that Presto is running.",
					steps: ["Wait about 30 seconds, then send again and choose Allow in Presto's prompt."],
					retry: "Re-test",
				}
			}
			// The settings page lists the versions and the connection in its Details rows.
			return { tone: "go", title: STRINGS.available.title, detail: "Proving natively", retry: "Re-test" }
		case "downloading":
			return {
				tone: "accent",
				title: STRINGS.available.title,
				detail: "It needs a one-time download for this Aztec version, which starts with your next proof.",
				retry: "Re-test",
			}
		case "permission-blocked":
			return { tone: "warn", ...PERMISSION_BLOCKED_COPY, retry: "Retry" }
		case "secure-connection-unavailable": {
			const { detail, steps } = SECURE_CONNECTION_COPY[state.diagnosis ?? "presto-reachable"]
			return { tone: "warn", title: STRINGS["secure-connection-unavailable"].title, detail, steps, retry: "Retry" }
		}
		case "version-mismatch":
			return {
				tone: "warn",
				title: STRINGS["version-mismatch"].title,
				detail: state.info.nativeAztecVersion
					? `Presto runs Aztec ${state.info.nativeAztecVersion}; Nulo needs ${__BB_VERSION__}. ${STRINGS["version-mismatch"].support}.`
					: `${STRINGS["version-mismatch"].support}.`,
				retry: "Retry",
			}
		default:
			return { tone: "warn", title: STRINGS.error.title, detail: `${STRINGS.error.support}.`, retry: "Retry" }
	}
}

/** The settings index row's one-line description. */
export function rowDescriptionFor(state: PrestoUiState, last?: LastProveOutcome | null): string {
	switch (state.kind) {
		case "idle":
			return "In browser · Presto not set up"
		case "detecting":
			return "Checking Presto…"
		case "available":
			return last?.denial ? "Presto · approval needed" : "Presto · connected"
		case "downloading":
			return "Presto · one-time download pending"
		case "offline":
			return "In browser · Presto not detected"
		case "permission-blocked":
			return "Browser blocked local access"
		case "secure-connection-unavailable":
			return "Presto · encrypted connection unavailable"
		case "version-mismatch":
			return "Presto · update needed"
		default:
			return "Presto · not responding"
	}
}

export interface PrestoDetailRow {
	title: string
	description: string
	value: string
}

function connectionLabel(state: PrestoUiState): string {
	if (state.kind === "permission-blocked") return "Blocked"
	if (state.kind === "idle" || state.kind === "detecting") return "—"
	if (state.info.protocol === "https") return "Encrypted"
	if (state.info.protocol === "http") return "Plain HTTP"
	return "—"
}

/** The settings page's Details rows; the version rows read `—` on the minimal health body. */
export function detailRowsFor(state: PrestoUiState): PrestoDetailRow[] {
	const info = "info" in state ? state.info : {}
	return [
		{ title: "Presto", description: "Menu-bar app", value: info.appVersion ?? "—" },
		{ title: "Aztec runtime", description: "Prover version", value: info.nativeAztecVersion ?? "—" },
		{ title: "Connection", description: "Loopback, this machine only", value: connectionLabel(state) },
	]
}
