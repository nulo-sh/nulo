/**
 * What the popup renders for a journal record that ended without a settled transaction: its stored
 * error kind, its journal detail page and its terminal activity card.
 */
import type { Page } from "puppeteer"
import { withTimeoutMessage } from "./dom"
import { navigateByHash } from "./helpers"
import { shotSend } from "./send-page"

const DETAIL_FIELDS = [
	"journal-detail-category",
	"journal-detail-context",
	"journal-detail-state",
	"journal-detail-method",
	"journal-detail-error-message",
]

/** The journal detail's fields for record `id` once its state row renders; a field the page does
 *  not show reads null. `shot` names the opt-in capture of the page. */
export async function readJournalDetail(page: Page, id: string, shot?: string): Promise<Record<string, string | null>> {
	await navigateByHash(page, `#/popup/journal/${id}`)
	await page.waitForFunction(
		(sel: string) => (document.querySelector(sel)?.textContent?.trim() ?? "") !== "",
		{ timeout: 10_000, polling: 100 },
		'[data-testid="journal-detail-state"]',
	)
	if (shot) await shotSend(page, shot, "journal-detail-state")
	return page.evaluate(
		(ids: string[]) =>
			Object.fromEntries(ids.map((id) => [id, document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? null])),
		DETAIL_FIELDS,
	)
}

/** The stored error kind of journal record `id`: the send-record view carries none. */
export async function readErrorKind(page: Page, id: string): Promise<string | undefined> {
	return page.evaluate(async (key: string) => {
		const raw = (await chrome.storage.local.get(key))[key]
		const record = (typeof raw === "string" ? JSON.parse(raw) : raw) as { error?: { kind?: string } | null } | undefined
		return record?.error?.kind
	}, `nulo:journal@${id}`)
}

const CARD = '[data-testid="tx-terminal-card"]'

/** The title and subtitle of the first terminal card on `tab`, read in the evaluation that finds it.
 *  The hash names the new page before the router draws it, so the old page's card can answer first
 *  and be gone by a second lookup; the tab's `aria-current` changes in the render that swaps the
 *  page, as long as no transition wraps the `RouterView`. `shot` names the opt-in capture. */
export async function readTerminalCard(
	page: Page,
	tab: "activity" | "general",
	shot?: string,
): Promise<{ title: string | null; subtitle: string }> {
	await navigateByHash(page, `#/popup/${tab}`)
	const found = await withTimeoutMessage(
		page.waitForFunction(
			(nav: string, card: string) => {
				if (document.querySelector(nav)?.getAttribute("aria-current") !== "page") return null
				const el = document.querySelector(card)
				const subtitle = el?.querySelector<HTMLElement>('[data-testid="tx-terminal-subtitle"]')
				if (!el || !subtitle) return null
				const style = getComputedStyle(subtitle)
				const rect = subtitle.getBoundingClientRect()
				if (style.display === "none" || style.visibility === "hidden" || rect.width === 0 || rect.height === 0) return null
				return {
					title: el.querySelector('[data-testid="activity-title"]')?.textContent?.trim() ?? null,
					subtitle: subtitle.textContent?.trim() ?? "",
				}
			},
			{ timeout: 15_000, polling: 100 },
			`[data-testid="nav-${tab}"]`,
			CARD,
		),
		async () => {
			const seen = await page.evaluate(
				(card: string) => ({
					hash: location.hash,
					current: document.querySelector('[data-testid^="nav-"][aria-current="page"]')?.getAttribute("data-testid") ?? null,
					cards: document.querySelectorAll(card).length,
				}),
				CARD,
			)
			return `no shown terminal card on ${tab}: ${JSON.stringify(seen)}`
		},
	)
	const read = (await found.jsonValue()) as { title: string | null; subtitle: string }
	if (shot) await shotSend(page, shot, "tx-terminal-card")
	return read
}
