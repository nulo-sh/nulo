import { type TranslationKeys, ZxcvbnFactory } from "@zxcvbn-ts/core"
import { adjacencyGraphs, dictionary } from "@zxcvbn-ts/language-common"
import { characterCount, MIN_NEW_PASSWORD_LENGTH } from "./password"

export const NEW_PASSWORD_HINTS = {
	short: "At least 8 characters",
	mismatch: "Passwords don't match",
	repeat: "Easy to guess: repeated characters",
	sequence: "Easy to guess: characters in order",
	keyboard: "Easy to guess: a keyboard pattern",
	common: "Easy to guess: a common password",
	guessable: "Easy to guess: make it longer",
	good: "Good password",
	strong: "Strong password",
} as const

type WeakReason = "repeat" | "sequence" | "keyboard" | "common"

/** zxcvbn's warnings arrive as their translation keys, since no translations are configured. */
const REASON_BY_WARNING: Readonly<Record<string, WeakReason | undefined>> = {
	simpleRepeat: "repeat",
	extendedRepeat: "repeat",
	sequences: "sequence",
	straightRow: "keyboard",
	keyPattern: "keyboard",
	topTen: "common",
	topHundred: "common",
	common: "common",
	similarToCommon: "common",
} satisfies Partial<Record<keyof TranslationKeys["warnings"], WeakReason>>

/**
 * zxcvbn's own bands, which its warnings follow: it warns only in the weak band, scores 0 to 2.
 * No language word list: a single long English word reads strong until one ships.
 */
const ESTIMATOR_OPTIONS = { dictionary, graphs: adjacencyGraphs }

function strengthHint(password: string): string {
	// Core keeps the last password it scored, so a shared factory would hold it for the page's life.
	const { score, feedback } = new ZxcvbnFactory(ESTIMATOR_OPTIONS).check(password)
	if (score === 4) return NEW_PASSWORD_HINTS.strong
	if (score === 3) return NEW_PASSWORD_HINTS.good
	return NEW_PASSWORD_HINTS[REASON_BY_WARNING[feedback.warning ?? ""] ?? "guessable"]
}

/** Advice only: `isNewPasswordValid` alone decides. The meter runs on a matching pair only. */
export function newPasswordHint(password: string, repeated: string): string {
	if (characterCount(password) < MIN_NEW_PASSWORD_LENGTH) return NEW_PASSWORD_HINTS.short
	if (password !== repeated) return NEW_PASSWORD_HINTS.mismatch
	return strengthHint(password)
}
