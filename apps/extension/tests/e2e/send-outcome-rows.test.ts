/** In a real browser: what Home, History and a journal page show for sends that ended without a
 *  settled transaction. One card per send; each status icon in its status line's colour; no figure
 *  for a token whose decimals are unknown; a checked send's hash with the explorer's link, or with no
 *  link under explorer None. */
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { getTransactionExplorerUrl } from "@/wallet/constants/explorers"
import { clickByTestId, type ExtensionContext, openPopup, test, waitForHash } from "./fixtures/extension"
import { navigateByHash, navigateToSettings, seedUsdQuoteAndReload } from "./fixtures/helpers"
import { settleThemeTransitions, shotSend } from "./fixtures/send-page"
import { type ActivityScope, readActivityScope, seedJournalRecord, seedTokenRow, seedTransaction } from "./helpers/activity-seeds"
import { bringToFront } from "./fixtures/browser"

const sel = (testid: string) => `[data-testid="${testid}"]`
const hex = (byte: string) => `0x${byte.repeat(32)}`

const TOKEN_ID = 41
const RAW_TOKEN_ID = 42
/** A send whose record failed at submitting, yet whose transaction landed: the tx row is its card. */
const LANDED = hex("5e")

const RECORDS = {
	refused: { id: "f6f6f6f6f6f6f6f6", txHash: hex("76") },
	unconfirmed: { id: "a1a1a1a1a1a1a1a1", txHash: hex("71") },
	failed: { id: "b2b2b2b2b2b2b2b2" },
	sent: { id: "c3c3c3c3c3c3c3c3", txHash: hex("73") },
	landed: { id: "d4d4d4d4d4d4d4d4", txHash: LANDED },
	raw: { id: "e5e5e5e5e5e5e5e5" },
} as const

/** A landed send's tx row and six ended sends: refused, amber, red, green, the landed one's own
 *  record, and a red one of a token whose decimals are unknown. Home shows the newest five. */
async function openSeeded(ctx: ExtensionContext): Promise<{ page: Page; scope: ActivityScope }> {
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general")
	const scope = await readActivityScope(page)
	expect(scope.chainId, "a new profile is on Mainnet, the default network, which an explorer covers").toBe(CHAIN_IDS.MAINNET)
	const now = Date.now()
	await seedTokenRow(page, scope, TOKEN_ID)
	await seedTokenRow(page, scope, RAW_TOKEN_ID, {
		token: { contract: hex("d0"), name: "Raw", symbol: "RAW", decimals: 6 },
		decimalsGetter: false,
	})
	await seedTransaction(page, scope, { hash: LANDED, amount: "1500000", at: now - 4_000 })
	const fromSubmitting = (txHash: string, check: string) => ({ stage: "failed" as const, from: "submitting", txHash, check })
	const base = { tokenId: TOKEN_ID, amount: "1500000", errorKind: "transfer" }
	await seedJournalRecord(page, scope, {
		...base,
		id: RECORDS.refused.id,
		progress: fromSubmitting(RECORDS.refused.txHash, "refused"),
		at: now - 500,
	})
	await seedJournalRecord(page, scope, {
		...base,
		id: RECORDS.unconfirmed.id,
		progress: fromSubmitting(RECORDS.unconfirmed.txHash, "unconfirmed"),
		at: now - 1_000,
	})
	await seedJournalRecord(page, scope, {
		...base,
		id: RECORDS.failed.id,
		progress: { stage: "failed", from: "simulating" },
		at: now - 2_000,
	})
	await seedJournalRecord(page, scope, {
		...base,
		id: RECORDS.sent.id,
		progress: fromSubmitting(RECORDS.sent.txHash, "sent"),
		at: now - 3_000,
	})
	await seedJournalRecord(page, scope, { ...base, id: RECORDS.landed.id, progress: fromSubmitting(LANDED, "sent"), at: now - 4_000 })
	await seedJournalRecord(page, scope, {
		...base,
		tokenId: RAW_TOKEN_ID,
		amount: "2500000",
		id: RECORDS.raw.id,
		progress: { stage: "failed", from: "simulating" },
		at: now - 5_000,
	})
	await seedUsdQuoteAndReload(page)
	await bringToFront(page)
	// The reload's own start-up navigation lands on Home; a hash set before it settles is overridden.
	await readCards(page, 5)
	return { page, scope }
}

type Card = { journal: string | null; tx: string | null; amount: string | null; iconFill: string | null; lineColor: string | null }

/** Every activity card on the page once `count` show: the journal record or tx hash it opens, its
 *  amount, its status icon's fill and its status line's colour. */
async function readCards(page: Page, count: number): Promise<Card[]> {
	const cards = `${sel("tx-terminal-card")}, ${sel("tx-card")}`
	await page.waitForFunction(
		(s: string, n: number) => document.querySelectorAll(s).length === n,
		{ timeout: 15_000, polling: 100 },
		cards,
		count,
	)
	return page.$$eval(cards, (els) =>
		els.map((card) => {
			const href = card.querySelector("a[data-row-target]")?.getAttribute("href") ?? ""
			const icon = card.querySelector('[data-testid="activity-status-icon"]')
			const line = card.querySelector('[data-testid="tx-terminal-subtitle"]')
			return {
				journal: href.match(/#\/popup\/journal\/([0-9a-f]+)/)?.[1] ?? null,
				tx: card.getAttribute("data-tx-hash"),
				amount: card.querySelector('[data-testid="activity-amount"]')?.textContent?.trim() ?? null,
				iconFill: icon ? getComputedStyle(icon).fill : null,
				lineColor: line ? getComputedStyle(line).color : null,
			}
		}),
	)
}

async function setThemeAttribute(page: Page, theme: "dark" | "light"): Promise<void> {
	await page.evaluate((t: string) => document.documentElement.setAttribute("theme", t), theme)
	await settleThemeTransitions(page)
}

test("Home shows one card per send; each status icon wears its status line's colour; a token of unknown decimals shows no figure", async ({
	registeredExtensionPerTest: ctx,
}) => {
	const { page } = await openSeeded(ctx)

	const home = await readCards(page, 5)
	expect(home.map((c) => c.journal ?? c.tx)).toEqual([
		RECORDS.refused.id,
		RECORDS.unconfirmed.id,
		RECORDS.failed.id,
		RECORDS.sent.id,
		LANDED,
	])
	await shotSend(page, "home-one-card-per-send", "activity-feed-root")

	await navigateByHash(page, "#/popup/activity")
	for (const theme of ["light", "dark"] as const) {
		await setThemeAttribute(page, theme)
		const history = (await readCards(page, 7)).filter((c) => c.journal !== null)
		expect(history.map((c) => c.journal)).toEqual(Object.values(RECORDS).map((r) => r.id))
		for (const card of history) {
			expect(card.iconFill, `${theme}: ${card.journal}'s icon`).toBe(card.lineColor)
			expect(card.lineColor, `${theme}: ${card.journal}'s status line`).toMatch(/^rgb/)
		}
		expect(history.find((c) => c.journal === RECORDS.raw.id)?.amount, "no figure without known decimals").toBeNull()
		expect(history.find((c) => c.journal === RECORDS.failed.id)?.amount).toBe("1.5")
	}
	await shotSend(page, "history-status-icons", "tx-terminal-card")

	// A failed row's red line, hovered and pressed; the press is released off the row, so nothing opens.
	const row = await page.$(`${sel("tx-terminal-card")} a[data-row-target][href$="/${RECORDS.failed.id}"]`)
	const box = await row?.boundingBox()
	if (!box) throw new Error("the failed row has no box")
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
	await shotSend(page, "history-failed-row-hovered", "tx-terminal-card")
	await page.mouse.down()
	await shotSend(page, "history-failed-row-pressed", "tx-terminal-card")
	await page.mouse.move(box.x + box.width / 2, 4)
	await page.mouse.up()

	await navigateByHash(page, `#/popup/journal/${RECORDS.refused.id}`)
	await page.waitForFunction(
		(s: string) => document.querySelector(s)?.textContent?.trim() === "Refused by the network",
		{ timeout: 10_000, polling: 100 },
		sel("journal-detail-category"),
	)
	await shotSend(page, "journal-refused", "journal-detail-state")
	// A new id alone does not reload the journal page: the next record opens from History.
	await navigateByHash(page, "#/popup/activity")
	await readCards(page, 7)

	await navigateByHash(page, `#/popup/journal/${RECORDS.raw.id}`)
	await page.waitForSelector(sel("journal-detail-state"), { visible: true, timeout: 10_000 })
	expect(await page.$(sel("journal-detail-amount")), "the journal page shows no figure without known decimals").toBeNull()
	await shotSend(page, "journal-unknown-decimals", "journal-detail-state")

	expect(ctx.pageErrors).toEqual([])
}, 240_000)

test("a checked send's page shows its hash with the explorer's link, and under explorer None the hash to copy", async ({
	registeredExtensionPerTest: ctx,
}) => {
	const { page } = await openSeeded(ctx)
	const { id, txHash } = RECORDS.unconfirmed
	const url = getTransactionExplorerUrl(CHAIN_IDS.MAINNET, "aztecscan", txHash)

	await navigateByHash(page, `#/popup/journal/${id}`)
	await page.waitForSelector(sel("journal-detail-tx-hash-link"), { visible: true, timeout: 10_000 })
	expect(await page.$eval(sel("journal-detail-tx-hash-link"), (a) => a.getAttribute("href"))).toBe(url)
	const hero = await page.$eval(sel("journal-detail-explorer-link"), (a) => ({
		href: a.getAttribute("href"),
		text: a.textContent?.trim(),
	}))
	expect(hero).toEqual({ href: url, text: "View on Aztecscan" })
	await shotSend(page, "journal-checked-send", "journal-detail-tx-hash-link")

	await navigateByHash(page, "#/popup/general")
	await navigateToSettings(page, "privacy")
	await clickByTestId(page, "explorer-trigger")
	await clickByTestId(page, "explorer-none-btn")
	await navigateByHash(page, `#/popup/journal/${id}`)
	await page.waitForSelector(sel("journal-detail-tx-hash-copy"), { visible: true, timeout: 10_000 })
	expect(await page.$(sel("journal-detail-tx-hash-link"))).toBeNull()
	expect(await page.$(sel("journal-detail-explorer-link"))).toBeNull()
	expect(await page.$eval(sel("journal-detail-tx-hash-copy"), (el) => el.textContent?.trim())).toBe(
		`${txHash.slice(0, 6)}..${txHash.slice(-4)}`,
	)
	await shotSend(page, "journal-checked-send-no-explorer", "journal-detail-tx-hash-copy")

	expect(ctx.pageErrors).toEqual([])
}, 240_000)
