import { Options, ZxcvbnFactory } from "@zxcvbn-ts/core"
import { adjacencyGraphs, dictionary as commonDictionary } from "@zxcvbn-ts/language-common"
import { dictionary as englishDictionary } from "@zxcvbn-ts/language-en"
import { characterCount, MIN_NEW_PASSWORD_LENGTH } from "./password"

/** Every line the new-password hint can show. */
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
const REASON_BY_WARNING: Readonly<Record<string, WeakReason>> = {
	simpleRepeat: "repeat",
	extendedRepeat: "repeat",
	sequences: "sequence",
	straightRow: "keyboard",
	keyPattern: "keyboard",
	topTen: "common",
	topHundred: "common",
	common: "common",
	similarToCommon: "common",
}

/**
 * Score 3 starts at 10^10 estimated guesses and 4 at 10^12, above the library's 10^8 and 10^10:
 * whoever steals a profile or an exported file guesses offline, for as long as the funds repay.
 * zxcvbn writes a warning only up to score 2, so these bands keep a reason on every weak line.
 */
const ESTIMATOR_OPTIONS = {
	dictionary: { ...commonDictionary, "commonWords-en": englishDictionary["commonWords-en"] },
	graphs: adjacencyGraphs,
	timeEstimationValues: {
		scoring: { 0: 1e3, 1: 1e6, 2: 1e10, 3: 1e12 },
		attackTime: new Options().timeEstimationValues.attackTime,
	},
}

function strengthHint(password: string): string {
	// A factory per check: core keeps the last password it scored, so a shared one would hold the chosen password for the page's life.
	const { score, feedback } = new ZxcvbnFactory(ESTIMATOR_OPTIONS).check(password)
	if (score === 4) return NEW_PASSWORD_HINTS.strong
	if (score === 3) return NEW_PASSWORD_HINTS.good
	return NEW_PASSWORD_HINTS[REASON_BY_WARNING[feedback.warning ?? ""] ?? "guessable"]
}

/** Inline hint under a new-password pair, in the order the user resolves it. Advice only: `isNewPasswordValid` alone decides. */
export function newPasswordHint(password: string, repeated: string): string {
	if (characterCount(password) < MIN_NEW_PASSWORD_LENGTH) return NEW_PASSWORD_HINTS.short
	if (password !== repeated) return NEW_PASSWORD_HINTS.mismatch
	return strengthHint(password)
}
