import type { Browser } from "puppeteer"
import { CSP_FLUSH_MESSAGE, CSP_VIOLATIONS_KEY } from "@/e2e/csp-report"
import { openScratchPage } from "./browser"

/**
 * Whether the loaded build carries the CSP violation recorder (`src/e2e/csp-report.ts`). Set by
 * the same callers that build with `VITE_NULO_E2E_CSP_REPORT=1`; a run against a release
 * artifact leaves it unset and checks nothing.
 */
export const CSP_REPORT_ARMED = process.env.NULO_E2E_CSP_REPORT === "1"

/** The flush, the read and the scratch page together; a launch past it closes regardless. */
const READ_BUDGET_MS = 15_000

/** Why a launch's recorded violations fail it, or undefined when they do not. */
export function cspViolationFailure(stored: unknown): string | undefined {
	if (stored === undefined || stored === null) {
		return "the CSP violation recorder never ran in this launch: is the build missing VITE_NULO_E2E_CSP_REPORT=1?"
	}
	if (!Array.isArray(stored)) return `the CSP violation record is not a list: ${JSON.stringify(stored)}`
	if (stored.length === 0) return undefined
	return `${stored.length} CSP violation(s) recorded in this launch:\n${stored.map((entry) => `  ${JSON.stringify(entry)}`).join("\n")}`
}

/** Fails when the recorder holds a violation, or cannot be read within the budget. */
export async function assertNoCspViolations(read: () => Promise<unknown>): Promise<void> {
	const failure = cspViolationFailure(await withBudget(read(), READ_BUDGET_MS))
	if (failure) throw new Error(failure)
}

/**
 * Close the launch, failing it when the recorder holds a violation. The browser closes whatever
 * the read does: a check that throws must not strand the browser it ran in.
 */
export async function closeAfterCspCheck(close: () => Promise<void>, read: () => Promise<unknown>): Promise<void> {
	try {
		await assertNoCspViolations(read)
	} finally {
		await close()
	}
}

/**
 * The recorded list, after the background has written every report it received. Read from a
 * scratch extension page: Firefox's background evaluation cannot await, and the flush message is
 * what wakes a background that has since been reaped.
 */
export async function readCspViolations(browser: Browser, extensionId: string): Promise<unknown> {
	const page = await openScratchPage(browser, extensionId)
	try {
		const { flushed, stored } = await page.evaluate(
			async ({ flush, key }) => ({
				flushed: await chrome.runtime.sendMessage({ type: flush }).catch((err) => String(err)),
				stored: (await chrome.storage.session.get(key))[key] ?? null,
			}),
			{ flush: CSP_FLUSH_MESSAGE, key: CSP_VIOLATIONS_KEY },
		)
		// An unarmed build answers nothing and stores nothing; the missing key then names that cause.
		if (stored !== null && flushed !== true) throw new Error(`the CSP violation recorder did not confirm its writes: ${flushed}`)
		return stored
	} finally {
		await page.close().catch(() => {})
	}
}

async function withBudget<T>(work: Promise<T>, budgetMs: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`reading the CSP violation record took over ${budgetMs / 1000}s`)), budgetMs)
	})
	try {
		return await Promise.race([work, timeout])
	} finally {
		clearTimeout(timer)
	}
}
