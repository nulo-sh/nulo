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

/** The entry's path, or `undefined` for an entry whose flow got no profile in. */
export function donePath(state: unknown): OnboardingPath | undefined {
	const raw = (state as Record<string, unknown> | null | undefined)?.[STATE_KEY]
	return raw === "password" || raw === "passkey" || raw === "import" ? raw : undefined
}

let resumeSettled = false
let markedSinceLoad = false

/** Marks the current entry as one whose flow got a profile in, so a reload here resumes at Ready.
 *  vue-router keeps its own keys in the same state, so they are carried over. */
export function markFlowPath(path: OnboardingPath): void {
	markedSinceLoad = true
	window.history.replaceState({ ...window.history.state, [STATE_KEY]: path }, "")
}

/** A form mounted after the shell's load check is a fresh attempt, so its entry stops claiming the
 *  last one. Until the check settles the mark is the check's to read, and this does nothing. */
export function clearFlowPath(): void {
	const state = window.history.state as Record<string, unknown> | null
	if (!resumeSettled || state === null || !(STATE_KEY in state)) return
	const { [STATE_KEY]: _, ...rest } = state
	window.history.replaceState(rest, "")
}

/** The path the load check resumes at Ready on. A mark this document's flow wrote while the check
 *  was pending belongs to that flow, which is still on screen, so it never counts. */
export function resumePath(): OnboardingPath | undefined {
	return markedSinceLoad ? undefined : donePath(window.history.state)
}

/** Ends the shell's load check. Unless it resumed at Ready, the mark the entry was loaded with goes,
 *  a failed check included: the form left on screen is a fresh attempt. */
export function settleResume(resumed: boolean): void {
	resumeSettled = true
	if (!resumed && !markedSinceLoad) clearFlowPath()
}
