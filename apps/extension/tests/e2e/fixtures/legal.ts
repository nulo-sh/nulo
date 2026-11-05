import { LEGAL_ACCEPTANCE_KEY, LEGAL_MANIFEST, acceptanceStatus, applyAcceptance, currentVersion } from "@nulo/legal"

/**
 * The acceptance state a launch starts from. `keep` leaves storage alone, which is what a relaunch
 * over a surviving profile needs: reseeding there would erase the state under test.
 */
export type LegalSeed = "current" | "missing" | "stale" | "corrupt" | "keep"

/** Older than any version the manifest can hold, so it stays stale however the manifest grows. */
const STALE_TERMS_VERSION = "0.9"

/** The stored value for a seed, built by the same code the service writes with; `undefined` removes the key. */
export function legalSeedValue(seed: Exclude<LegalSeed, "keep">): unknown {
	if (seed === "missing") return undefined
	if (seed === "corrupt") return { termsVersion: 7, acceptedAt: "yesterday" }
	const current = applyAcceptance(null, "onboarding", Date.UTC(2026, 0, 1), LEGAL_MANIFEST)
	if (seed === "current") return current
	return { ...current, termsVersion: STALE_TERMS_VERSION }
}

/** What an in-place update meets, given the release's storage `entries`: the changed-Terms sheet when
 *  its acceptance predates this build's newest material Terms, else nothing. Every recording holds an
 *  acceptance, so `entries` without a readable one is refused. */
export function updatedTermsAnswer(entries: Record<string, unknown>): "none" | "changed" {
	const status = acceptanceStatus(entries[LEGAL_ACCEPTANCE_KEY])
	if (status === "missing") throw new Error("the release's storage holds no readable Terms acceptance")
	return status === "current" ? "none" : "changed"
}

export { LEGAL_ACCEPTANCE_KEY, currentVersion }
