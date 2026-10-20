import type { Page } from "puppeteer"
import { pinnedTokensKey } from "@/utils/profile-ui-keys"
import { reloadExtensionPage } from "./browser"
import { clickByTestId, replaceInputValue, withTimeoutMessage } from "./dom"
import { dropdownDiagnostic, openDropdown, waitForToast } from "./widgets"

// ── Token ──────────────────────────────────────────────────────────────

/** Import a token by contract address via the NewTokenPopup. */
export async function importToken(page: Page, contractAddress: string): Promise<void> {
	await clickTokensMenuItem(page, "tokens-menu-import")

	// Enter contract address
	await page.waitForSelector('[data-testid="token-address-input"]', { visible: true, timeout: 5_000 })
	await replaceInputValue(page, '[data-testid="token-address-input"]', contractAddress)
	await submitNewTokenPopup(page)
}

export async function waitForNewTokenAddress(page: Page, address: string): Promise<void> {
	await page.waitForFunction(
		(want: string) => document.querySelector<HTMLInputElement>('[data-testid="token-address-field"]')?.value === want,
		{ timeout: 5_000 },
		address,
	)
}

/** Submits the open New token popup, its address already entered, and waits for the success toast. */
export async function submitNewTokenPopup(page: Page): Promise<void> {
	await clickNewTokenSubmit(page)

	// Wait for success toast. The popup now blocks until the active account's
	// initial balance projection completes (or 30s timeout in the popup
	// itself), then fires the toast. Generous timeout because under sustained
	// network-suite load the flow goes through PXE metadata fetch + storage
	// write before the projector run.
	await waitForToast(page, "Token added", 60_000)
}

export async function clickNewTokenSubmit(page: Page): Promise<void> {
	// Wait for parsing to complete (button text changes from "Awaiting..." to
	// "Import new token"). The wallet calls PXE to fetch token metadata,
	// which is slow under sustained network-suite load — 60s is the safe
	// envelope here.
	await page.waitForSelector('[data-testid="import-token-button"]', { visible: true, timeout: 60_000 })
	await page.waitForFunction(
		() => {
			const btn = document.querySelector('[data-testid="import-token-button"]')
			return btn && getComputedStyle(btn).pointerEvents !== "none"
		},
		{ timeout: 60_000 },
	)

	// Click import
	await page.waitForSelector('[data-testid="import-token-button"]', { visible: true })
	await clickByTestId(page, "import-token-button")
}

/** Click "Refresh balances" from the token dropdown menu.
 *
 *  The dropdown menu and the refresh action are both state-driven: open the
 *  menu, wait for the refresh row to mount (a few hundred ms typically), then
 *  click. Callers own their own "did the balance actually update?" polling
 *  (e.g. the fixture loops in extension.ts and the input-enabled wait inside
 *  sendTransfer), so we don't add a defensive trailing sleep here. */
export async function refreshBalances(page: Page): Promise<void> {
	await clickTokensMenuItem(page, "tokens-menu-refresh")
}

/** Opens Home's tokens menu and clicks `item`, which teleports into the dropdown layer once open. */
async function clickTokensMenuItem(page: Page, item: string): Promise<void> {
	await openDropdown(page, "tokens-menu-trigger")
	await withTimeoutMessage(clickByTestId(page, item, 2_000), () =>
		dropdownDiagnostic(page, "tokens-menu-trigger", `${item} never showed`),
	)
}

/** Read the displayed balance text from BalanceView. */
export async function getDisplayedBalance(page: Page): Promise<string> {
	return await page.evaluate(() => {
		const balanceEl = document.querySelector("[class*='balance'], [class*='amount']")
		return balanceEl?.textContent?.trim() || ""
	})
}

// ── Token Detail ──────────────────────────────────────────────────────

/** Navigate to the token detail page by clicking a token card on Home — the one carrying
 *  `symbol`, or the first card when no symbol is given. Home orders cards by value, so a test
 *  that cares which token opens must name it.
 *  Uses dispatchEvent instead of Puppeteer's coordinate-based click because
 *  the router-link <a> has href=null and Puppeteer's click doesn't reliably
 *  trigger Vue Router's navigation handler on it. */
export async function navigateToTokenDetail(page: Page, symbol?: string): Promise<void> {
	const selector = symbol
		? `[data-testid="tokens-card"]:has([data-testid="token-symbol"][data-symbol="${symbol}"])`
		: '[data-testid="tokens-card"]'
	// Wait for the token card to render (balance must load from PXE)
	await page.waitForSelector(selector, { visible: true, timeout: 30_000 })
	// Dispatch a click event directly on the <a> — triggers Vue Router's handler
	await page.evaluate((sel: string) => {
		const a = document.querySelector(sel) as HTMLElement
		a?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, button: 0 }))
	}, selector)
	await page.waitForFunction(() => window.location.hash.includes("#/popup/tokens/"), { timeout: 10_000 })
	await page.waitForSelector('[data-testid="balance-amount"]', { visible: true, timeout: 15_000 })
}

/** Home holds its total behind a skeleton until the figure is settled (≤ 12 s by design): a read of
 *  `balance-amount` before this resolves reads an empty slot, not a wrong number. */
export async function waitForHomeTotal(page: Page): Promise<void> {
	await page.waitForSelector('[data-testid="balance-amount"]', { visible: true, timeout: 15_000 })
	await page.waitForFunction(() => !document.querySelector('[data-testid="balance-hero-loading"]'), { timeout: 20_000 })
}

/** Home's Get started card and backup banner mount once their reads settle, which can be after the
 *  rows have: a spec that measures or scrolls the middle waits for this first. */
export async function waitForHomeReminders(page: Page): Promise<void> {
	await page.waitForSelector('[data-testid="home-scroller"][data-reminders-settled="true"]', { timeout: 30_000 })
}

/** The Get started card's steps in order, a done one suffixed " done"; Hide and the count aside. */
export async function getStartedRows(page: Page): Promise<string[]> {
	return await page.$$eval(
		'[data-testid^="get-started-"]:not([data-testid="get-started-hide"]):not([data-testid="get-started-count"])',
		(els) => els.map((el) => `${el.getAttribute("data-testid")}${el.getAttribute("data-done") === "true" ? " done" : ""}`),
	)
}

/** Import a token from Home and wait for its projected balance row to carry `expectedPublicRaw`
 *  and a fresher timestamp than before the import — the discipline every multi-token spec needs so
 *  its assertions never race the balance projector. */
export async function importTokenAndWaitForBalance(
	page: Page,
	account: string,
	contract: string,
	expectedPublicRaw: string,
	timeoutMs = 90_000,
): Promise<void> {
	const baseline = await captureBalanceBaseline(page, account, contract)
	await importToken(page, contract)
	await waitForFreshBalanceRow(page, {
		account,
		tokenContract: contract,
		expectedPublicRaw,
		baselineUpdatedAt: baseline,
		timeoutMs,
	})
}

/** Seed a fresh $1 quote for `priceId` (USDC by default) and remount the popup so the
 *  stale-on-connect read adopts it. Resolves on Home. The quote prices a token only through a
 *  mapping: the agent build maps every sandbox contract to `usd-coin`, and a smoke launch needs a
 *  held list (`listedExtension`), whose priced token `readActivityScope(page, { priced: true })` names. */
export async function seedUsdQuoteAndReload(page: Page, priceId = "usd-coin"): Promise<void> {
	await page.evaluate((id: string) => {
		const state = { [id]: { coingeckoId: id, usd: 1.0, fetchedAt: Date.now(), providerUpdatedAt: null } }
		return chrome.storage.local.set({ "nulo:core:token-prices": JSON.stringify(state) })
	}, priceId)
	await reloadExtensionPage(page)
	await page.waitForFunction(() => window.location.hash === "#/popup/general", { timeout: 15_000 })
}

/** On the Send page, open the token picker, choose the row for `symbol`, and wait for the popup to
 *  close with the trigger showing that symbol. */
export async function selectSendToken(page: Page, symbol: string): Promise<void> {
	await clickByTestId(page, "send-token-trigger")
	const rowSelector = `[data-testid="select-token-row"][data-symbol="${symbol}"]`
	await page.waitForSelector(rowSelector, { visible: true, timeout: 15_000 })
	await page.evaluate((sel: string) => {
		;(document.querySelector(sel) as HTMLElement)?.click()
	}, rowSelector)
	await page.waitForFunction(
		(sel: string, sym: string) => {
			if (document.querySelector(sel)) return false
			return document.querySelector('[data-testid="send-token-symbol"]')?.textContent?.trim() === sym
		},
		{ timeout: 10_000 },
		rowSelector,
		symbol,
	)
}

/** On a token page, open the "⋯" menu and click the pin item (Pin to Home / Unpin from Home);
 *  resolves once the menu has closed on the click. */
export async function pinFromTokenPage(page: Page): Promise<void> {
	await clickByTestId(page, "token-menu-trigger")
	await page.waitForSelector('[data-testid="token-menu-pin"]', { visible: true, timeout: 5_000 })
	await page.evaluate(() => {
		;(document.querySelector('[data-testid="token-menu-pin"]') as HTMLElement)?.click()
	})
	await page.waitForSelector('[data-testid="token-menu-pin"]', { hidden: true, timeout: 5_000 })
}

/** Removes every profile's pinned-tokens key; an open page's pins follow the storage change. */
export async function clearPinnedTokens(page: Page): Promise<void> {
	await page.evaluate(async (prefix: string) => {
		const all = await chrome.storage.local.get()
		await chrome.storage.local.remove(Object.keys(all).filter((key) => key.startsWith(prefix)))
	}, pinnedTokensKey(""))
}

/** On a token page, read the pin item's `data-pinned` ("true" | "false") and close the menu again. */
export async function readPinState(page: Page): Promise<string | undefined> {
	await clickByTestId(page, "token-menu-trigger")
	await page.waitForSelector('[data-testid="token-menu-pin"]', { visible: true, timeout: 5_000 })
	const state = await page.$eval('[data-testid="token-menu-pin"]', (el) => (el as HTMLElement).dataset.pinned)
	await page.keyboard.press("Escape")
	await page.waitForSelector('[data-testid="token-menu-pin"]', { hidden: true, timeout: 5_000 })
	return state
}

/** Read the private and public balance values from the token detail page's BalanceView breakdown. */
export async function getTokenDetailBalances(page: Page): Promise<{ privateBalance: string; publicBalance: string }> {
	await page.waitForSelector('[data-testid="private-balance-value"]', { visible: true, timeout: 10_000 })
	const privateBalance = await page.evaluate(() => {
		return document.querySelector('[data-testid="private-balance-value"]')?.textContent?.trim() || ""
	})
	const publicBalance = await page.evaluate(() => {
		return document.querySelector('[data-testid="public-balance-value"]')?.textContent?.trim() || ""
	})
	return { privateBalance, publicBalance }
}

// ── Balance rows ───────────────────────────────────────────────────────

/** Highest `updatedAt` across the account's balance rows (0 if none). Captured
 *  BEFORE a refresh so `waitForFreshBalanceRow` can require a projection that
 *  happened AFTER it — an imported backup already carries the expected value
 *  with a nonzero `updatedAt`, so a value-only poll could pass with zero
 *  post-import/post-reopen sync, silently un-proving the re-sync the tests
 *  exist to prove. */
export async function captureBalanceBaseline(page: Page, account: string, tokenContract: string): Promise<number> {
	let max = 0
	for (const row of await readScopedBalanceRows(page, account, tokenContract)) {
		if (typeof row.updatedAt === "number" && row.updatedAt > max) max = row.updatedAt
	}
	return max
}

const TOKEN_ROWS_PREFIX = "nulo:core:tokens@"

const BALANCE_ROWS_PREFIX = "nulo:core:token-balances@"

type BalanceRow = { account?: string; token?: number; publicBalance?: string; privateBalance?: string; updatedAt?: number }

/** Runs IN THE PAGE (Puppeteer serializes it, so it must not reference module scope): the raw
 *  `chrome.storage.local` values under each prefix, all from ONE snapshot, decoded by nothing —
 *  the hostile rows are parsed on the Node side by the same guarded loops that used to run here. */
async function readStorageValuesByPrefixes({ prefixes }: { prefixes: string[] }): Promise<unknown[][]> {
	const all = await chrome.storage.local.get(null)
	const entries = Object.entries(all)
	return prefixes.map((prefix) => entries.filter(([k]) => k.startsWith(prefix)).map(([, v]) => v))
}

/** Numeric ids of the token rows bound to `contract` (case-insensitive). Each raw value is decoded
 *  inside its own try: a malformed row, or one whose shape makes the predicate throw, is skipped —
 *  hostile-input discipline, never fatal. */
function tokenIdsForContract(tokenValues: unknown[], contract: string): Set<number> {
	const tokenIds = new Set<number>()
	for (const v of tokenValues) {
		try {
			const row = JSON.parse(v as string) as { id?: number; contract?: string }
			if (typeof row.id === "number" && row.contract?.toLowerCase() === contract.toLowerCase()) tokenIds.add(row.id)
		} catch {
			// Malformed row: skip.
		}
	}
	return tokenIds
}

/** Balance rows for exactly `account` × `tokenIds`, raw (no field normalization — the callers'
 *  comparisons keep coercing as they always did). Same per-row try discipline as the token scan. */
function balanceRowsFor(balanceValues: unknown[], account: string, tokenIds: Set<number>): BalanceRow[] {
	const rows: BalanceRow[] = []
	for (const v of balanceValues) {
		try {
			const row = JSON.parse(v as string) as BalanceRow
			if (row.account === account && typeof row.token === "number" && tokenIds.has(row.token)) rows.push(row)
		} catch {
			// Malformed row: skip.
		}
	}
	return rows
}

/** The exact (account, token) join both balance waits share, re-resolved from one storage snapshot
 *  per call: another token's row with the same raw value must never satisfy a freshness/value
 *  acceptance, and after a restore the token row itself can land later than the first read. */
async function readScopedBalanceRows(page: Page, account: string, tokenContract: string): Promise<BalanceRow[]> {
	const [tokenValues, balanceValues] = await page.evaluate(readStorageValuesByPrefixes, {
		prefixes: [TOKEN_ROWS_PREFIX, BALANCE_ROWS_PREFIX],
	})
	return balanceRowsFor(balanceValues, account, tokenIdsForContract(tokenValues, tokenContract))
}

/** Wait for a balance row for `account` that is both FRESH (`updatedAt` past the
 *  captured baseline — proves a re-projection actually ran) and CORRECT (exact
 *  raw `publicBalance`, plus exact raw `privateBalance` when the caller proves
 *  a private leg — note discovery is what several sweeps assert). Drives at
 *  most `maxRefreshes` refreshes. Retry cadence: a refresh is re-kicked when
 *  the previous projection observably finished (some row's `updatedAt`
 *  advanced past the last refresh) OR the projection envelope elapsed with no
 *  write (a failed projection persists `syncFailure` but leaves `updatedAt`
 *  untouched, so a silent stall and a failure look alike here) — AND at least
 *  the spacing floor has passed since the last kick, so a projection that
 *  completes fast with stale values cannot burn the cap and leave a dead tail.
 *  Both bounds pace only WHEN TO RE-KICK, never the acceptance signal, which
 *  stays freshness + exact value. Bounded refreshes (not spam) matter: blind
 *  spam starves the popup thread and queues PXE readers that delay any
 *  subsequent purge (ReadWriteGuard drains readers first). The row read is
 *  exact and locale-independent — a body-text scan for "1,000" can
 *  false-positive on "$1,000.00" fiat or "11,000". Value-display call sites
 *  pair this with a card-scoped DOM assertion (`waitForTokenCardAmount`). */
export async function waitForFreshBalanceRow(
	page: Page,
	opts: {
		account: string
		tokenContract: string
		expectedPublicRaw: string
		expectedPrivateRaw?: string
		baselineUpdatedAt: number
		maxRefreshes?: number
		timeoutMs?: number
	},
): Promise<void> {
	// No ambient periodic re-sync exists (projections fire only on explicit
	// refresh / token events / tx updates) and a failed batch is dropped, never
	// re-enqueued — so the refresh budget must span the whole timeout. The
	// envelope (queue tick + a ≤12-row batch + margin) re-kicks through silent
	// stalls; both it and the spacing floor bound the re-kick cadence only,
	// never the acceptance signal.
	const REFRESH_ENVELOPE_MS = 15_000
	// Floor between re-kicks: a projection that completes FAST with stale/wrong
	// values must not burn the refresh cap in seconds and leave a dead tail —
	// the cap is derived from this floor so kicks can span the whole deadline
	// (the old per-site loops re-kicked at ~1.5-2s for up to 60 iterations).
	const MIN_REFRESH_SPACING_MS = 2_000
	const { account, tokenContract, expectedPublicRaw, expectedPrivateRaw, baselineUpdatedAt, timeoutMs = 120_000 } = opts
	const maxRefreshes = opts.maxRefreshes ?? Math.ceil(timeoutMs / MIN_REFRESH_SPACING_MS)
	const deadline = Date.now() + timeoutMs
	// The (account, token) join re-resolves EVERY poll (audit condition) — see `readScopedBalanceRows`.
	const readRows = (): Promise<BalanceRow[]> => readScopedBalanceRows(page, account, tokenContract)

	let refreshes = 0
	let lastRefreshAt = 0
	let rows: BalanceRow[] = []
	while (Date.now() < deadline) {
		rows = await readRows()
		if (
			rows.some(
				(r) =>
					(r.updatedAt ?? 0) > baselineUpdatedAt &&
					r.publicBalance === expectedPublicRaw &&
					(expectedPrivateRaw === undefined || r.privateBalance === expectedPrivateRaw),
			)
		)
			return
		const attemptFinished =
			refreshes === 0 || rows.some((r) => (r.updatedAt ?? 0) >= lastRefreshAt) || Date.now() - lastRefreshAt >= REFRESH_ENVELOPE_MS
		const spaced = refreshes === 0 || Date.now() - lastRefreshAt >= MIN_REFRESH_SPACING_MS
		if (attemptFinished && spaced && refreshes < maxRefreshes) {
			lastRefreshAt = Date.now()
			refreshes++
			await refreshBalances(page)
		}
		await new Promise((r) => setTimeout(r, 1_000))
	}
	// Census across roots, account-agnostic: distinguishes "the account's rows are
	// keyed differently" from "the token/balance slices are simply absent" — the
	// latter points at restore-slice loss, a product condition, not a wait problem.
	const census = await page
		.evaluate(async () => {
			const all = await chrome.storage.local.get(null)
			const keys = Object.keys(all)
			const grab = (p: string) => keys.filter((k) => k.startsWith(p))
			return {
				tokenRows: grab("nulo:core:tokens@").length,
				balanceRows: grab("nulo:core:token-balances@").map((k) => {
					try {
						const r = JSON.parse(all[k] as string) as { account?: string; updatedAt?: number }
						return { account: `${r.account?.slice(0, 10)}…`, updatedAt: r.updatedAt }
					} catch {
						return { account: "unparseable", updatedAt: -1 }
					}
				}),
				accountRows: grab("nulo:core:accounts@").length,
			}
		})
		.catch((e) => ({ censusFailed: String(e) }))
	throw new Error(
		`waitForFreshBalanceRow: no (${account}, ${tokenContract}) row with publicBalance=${expectedPublicRaw}${expectedPrivateRaw !== undefined ? ` privateBalance=${expectedPrivateRaw}` : ""} and updatedAt>${baselineUpdatedAt} after ${refreshes} refresh(es); rows: ${JSON.stringify(rows)}; census: ${JSON.stringify(census)}`,
	)
}

/** Card-scoped display assertion: the tokens-card for `symbol` shows exactly
 *  `displayAmount` — the card is selected by its `data-symbol` attribute, the
 *  fiat node is excluded (so "$1,000.00" can't satisfy a "1,000" check), and
 *  the amount must sit on digit boundaries (so "11,000" or "1,000.5" can't
 *  satisfy "1,000" as a substring — audit condition). */
export async function waitForTokenCardAmount(page: Page, displayAmount: string, symbol: string, timeout = 30_000): Promise<void> {
	await page.waitForFunction(
		({ amt, sym }: { amt: string; sym: string }) => {
			const boundary = new RegExp(`(^|[^\\d,.])${amt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\d,.])`)
			return [...document.querySelectorAll('[data-testid="tokens-card"]')].some((card) => {
				if (!card.querySelector(`[data-testid="token-symbol"][data-symbol="${sym}"]`)) return false
				const clone = card.cloneNode(true) as HTMLElement
				for (const fiat of clone.querySelectorAll('[data-testid="token-fiat"]')) fiat.remove()
				return boundary.test(clone.textContent ?? "")
			})
		},
		{ timeout, polling: 500 },
		{ amt: displayAmount, sym: symbol },
	)
}
