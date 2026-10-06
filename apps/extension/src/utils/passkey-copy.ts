/**
 * Every line a passkey screen or toast shows, and the one reading of a passkey failure they share.
 * The words are signed off by the owner: change them here, and only with that sign-off. None of
 * them says prompt, toolbar, popup, panel, ceremony, PRF or WebAuthn.
 */
import { UserRejectedError } from "@nulo/extension-messaging/errors"
import type { ToastOptions } from "@/composables/toast"
import type { PasskeyStep } from "@/wallet/services/passkey/spec"
import { PasskeyPrfError, PasskeyUnconfirmedError } from "@/wallet/utils/passkey-errors"

/** A screen's large title, set on two lines. */
export type PasskeyTitle = readonly [string, string]

export const PASSKEY_COPY = {
	notConfirmed: "Passkey not confirmed. Try again.",
	noPrf: "This passkey can't unlock Nulo.",
	unlockFailed: "Couldn't unlock. Try again.",
	waiting: {
		title: ["Use your", "passkey"],
		body: "Confirm the request from your browser or password manager.",
	},
	failed: {
		title: ["Not", "confirmed"],
		body: "The passkey request was cancelled or took too long. Nothing changed.",
		unconfirmedBody: "Your passkey was saved but not confirmed. Try again to finish.",
	},
	finishing: {
		title: ["Passkey", "confirmed"],
		body: "Finishing up. This window closes by itself.",
	},
	stepFailedBody: "Close this window and try again from Nulo.",
	windowNote: "On Firefox, Nulo uses this window for passkeys.",
} as const

const STEP_LABEL: Record<PasskeyStep, string> = {
	unlock: "Unlock",
	create: "New profile",
	import: "Import",
	export: "Backup",
	restore: "Restore",
}

/** The steps the passkey window runs to their end; the others finish in the page that asked. */
export type WindowStep = Extract<PasskeyStep, "unlock" | "create" | "import">

const STEP_FAILED_TITLE: Record<WindowStep, PasskeyTitle> = {
	unlock: ["Couldn't", "unlock"],
	create: ["Couldn't", "create the profile"],
	import: ["Couldn't", "import the passkey"],
}

/** "Unlock · Alice": the step and the profile it is for, or the step alone without a name. */
export function passkeyTag(step: PasskeyStep, profileName?: string): string {
	return profileName ? `${STEP_LABEL[step]} · ${profileName}` : STEP_LABEL[step]
}

/** The window's title when its step failed after the prompt succeeded. */
export function stepFailedTitle(step: WindowStep): PasskeyTitle {
	return STEP_FAILED_TITLE[step]
}

/** The browser's own failure behind a passkey error: a credential created but not confirmed
 *  carries the confirmation's failure as its cause. */
export function unwrapPasskeyFailure(err: unknown): unknown {
	return err instanceof PasskeyUnconfirmedError ? err.cause : err
}

/** The page aborted the ceremony (Escape, Cancel, the page going away): a silent cancel. */
export function isPasskeyCancel(err: unknown): boolean {
	const inner = unwrapPasskeyFailure(err)
	return inner instanceof DOMException && inner.name === "AbortError"
}

export type PasskeyFailure = "not-confirmed" | "no-prf" | "other"

/**
 * `NotAllowedError` is the browser's one answer for a dismissed prompt, a timeout and, on Firefox,
 * a prompt whose window lost focus, so all three read as "not confirmed".
 */
export function classifyPasskeyFailure(err: unknown): PasskeyFailure {
	const inner = unwrapPasskeyFailure(err)
	if (inner instanceof DOMException && inner.name === "NotAllowedError") return "not-confirmed"
	if (inner instanceof PasskeyPrfError) return "no-prf"
	return "other"
}

/**
 * The two endings every passkey step words alike: a cancel stays silent and an unconfirmed prompt
 * gets the one toast line. False for any other failure, which the caller words.
 */
export function handleCancelOrUnconfirmed(err: unknown, openToast: (toast: ToastOptions) => void): boolean {
	if (err instanceof UserRejectedError) return true
	if (classifyPasskeyFailure(err) !== "not-confirmed") return false
	openToast({ kind: "error", label: PASSKEY_COPY.notConfirmed })
	return true
}

/** The toast line for a failed passkey unlock: `fallback` for a failure that is neither. */
export function passkeyFailureCopy(err: unknown, fallback: string): string {
	switch (classifyPasskeyFailure(err)) {
		case "not-confirmed":
			return PASSKEY_COPY.notConfirmed
		case "no-prf":
			return PASSKEY_COPY.noPrf
		default:
			return fallback
	}
}
