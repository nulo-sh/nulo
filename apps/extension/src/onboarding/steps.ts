import type { RouteLocationRaw } from "vue-router"

/** Only a wallet made on Create has the phrase step; the step row draws its path's cells. */
export type OnboardingPath = "password" | "passkey" | "import"

export type OnboardingStep = "terms" | "wallet" | "phrase" | "ready"

export interface StepCell {
	step: OnboardingStep
	num: string
	label: string
}

export function stepCells(path: OnboardingPath): StepCell[] {
	const steps: Array<[OnboardingStep, string]> = [
		["terms", "Terms"],
		["wallet", path === "import" ? "Import" : "Create"],
	]
	if (path !== "import") steps.push(["phrase", "Phrase"])
	steps.push(["ready", "Ready"])
	return steps.map(([step, label], i) => ({ step, label, num: String(i + 1).padStart(2, "0") }))
}

const STATE_KEY = "onboardingPath"

/** Ready learns its path from the history entry, which a reload keeps, so the hash stays the bare route. */
export function doneRoute(path: OnboardingPath): RouteLocationRaw {
	return { path: "/onboarding/done", state: { [STATE_KEY]: path } }
}

/** The entry's path, or `undefined` for an entry that never carried one (a reload mid-Create). */
export function donePath(state: unknown): OnboardingPath | undefined {
	const raw = (state as Record<string, unknown> | null | undefined)?.[STATE_KEY]
	return raw === "password" || raw === "passkey" || raw === "import" ? raw : undefined
}
