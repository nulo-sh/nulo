/**
 * What the popup renders for a journal record that ended without a settled transaction: its stored
 * error kind, its journal detail page and its terminal activity card.
 */
import type { Page } from "puppeteer"
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

/** The title and subtitle of the one terminal card on the page at `hash`, read after the wait: the
 *  fixtures' `waitForSelector` resolves `null`, never an element handle. `shot` names the opt-in
 *  capture of the page. */
export async function readTerminalCard(
	page: Page,
	hash: string,
	shot?: string,
): Promise<{ title: string | null; subtitle: string | null }> {
	await navigateByHash(page, hash)
	await page.waitForSelector(`${CARD} [data-testid="tx-terminal-subtitle"]`, { visible: true, timeout: 15_000 })
	if (shot) await shotSend(page, shot, "tx-terminal-card")
	return page.$eval(CARD, (card) => ({
		title: card.querySelector('[data-testid="activity-title"]')?.textContent?.trim() ?? null,
		subtitle: card.querySelector('[data-testid="tx-terminal-subtitle"]')?.textContent?.trim() ?? null,
	}))
}
