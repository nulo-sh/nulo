import type { Page } from "puppeteer"
import { type BackgroundOwner, evaluateInBackground, reloadExtensionPage } from "../fixtures/browser"
import { TEST_PASSWORD } from "../fixtures/constants"
import { clickByTestId, replaceInputValue, waitForHash } from "../fixtures/dom"
import type { ExtensionContext } from "../fixtures/extension"
import { openOnboarding, seedLegalAcceptance } from "../fixtures/wallet-pages"
import { PollTimeoutError, pollUntil } from "../fixtures/poll"
import { LEGAL_ACCEPTANCE_KEY, type LegalSeed, updatedTermsAnswer } from "../fixtures/legal"

const sel = (testid: string) => `[data-testid="${testid}"]`

/** Swaps the background's `chrome.storage.local.set`, the object its storage adapter holds, for one
 *  that refuses a write carrying the acceptance key once and puts the real one back as it does. */
const REFUSE_NEXT_ACCEPTANCE_WRITE = `
	const area = chrome.storage.local;
	const own = Object.getOwnPropertyDescriptor(area, "set");
	const set = area.set;
	Object.defineProperty(area, "set", {
		configurable: true,
		writable: true,
		value: function (items, ...rest) {
			if (items === null || typeof items !== "object" || !(${JSON.stringify(LEGAL_ACCEPTANCE_KEY)} in items)) return set.apply(this, [items, ...rest]);
			if (own) Object.defineProperty(area, "set", own);
			else delete area.set;
			return Promise.reject(new Error("the e2e refused this write"));
		},
	});
	return true;`

/** The background's next acceptance write fails as a refused storage write does; the one after it lands. */
export async function refuseNextAcceptanceWrite(owner: BackgroundOwner): Promise<void> {
	await evaluateInBackground(owner, REFUSE_NEXT_ACCEPTANCE_WRITE)
}

/** Most specific first: the controls sit inside the sheet. */
const LAYERS = ["snackbar", "legal-continue", "legal-sheet-not-now", "legal-sheet"]

export interface SnackOverSheet {
	/** Continue's top less the card's bottom; Continue is its row's first child, and the row has no padding. */
	gapAboveContinue: number
	/** What a tap hits: the card's centre, Continue's, "Not now"'s, and a point in the card's row beside it. */
	hits: Record<"card" | "continue" | "notNow" | "beside", string | null>
}

/** Where the snack sits over the Terms sheet once the sheet's body is scrolled to its end, the one
 *  place its placement promises. */
export async function readSnackOverSheet(page: Page): Promise<SnackOverSheet> {
	await page.$eval(sel("legal-sheet-body"), (body) => body.scrollTo({ top: body.scrollHeight, behavior: "instant" }))
	await waitUntilStill(page, sel("legal-continue"), false)
	// The card rises as it fades in, and its CSS-module enter class escapes `waitUntilStill`'s
	// `-enter-from` match, so a throttled frame can hold it mid-rise through three equal reads.
	await page.waitForFunction(
		(s) => {
			const card = document.querySelector(s)
			return card !== null && getComputedStyle(card).opacity === "1" && card.getAnimations().length === 0
		},
		{ timeout: 10_000 },
		sel("snackbar"),
	)
	return page.evaluate((layers) => {
		const box = (testid: string) => {
			const el = document.querySelector(`[data-testid="${testid}"]`)
			if (!el) throw new Error(`${testid} is not on the page`)
			return el.getBoundingClientRect()
		}
		const centre = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
		const hit = ({ x, y }: { x: number; y: number }) => {
			const el = document.elementFromPoint(x, y)
			return layers.find((layer) => el?.closest(`[data-testid="${layer}"]`)) ?? el?.tagName ?? null
		}
		const card = box("snackbar")
		const cont = box("legal-continue")
		const cardCentre = centre(card)
		return {
			gapAboveContinue: cont.top - card.bottom,
			hits: {
				card: hit(cardCentre),
				continue: hit(centre(cont)),
				notNow: hit(centre(box("legal-sheet-not-now"))),
				beside: hit({ x: card.left / 2, y: cardCentre.y }),
			},
		}
	}, LAYERS)
}

/** The snack host's computed `z-index`: `9500` while the Terms sheet shows, `auto` otherwise. */
export async function waitForToastLayer(page: Page, zIndex: "9500" | "auto"): Promise<void> {
	const read = () => page.$eval(sel("toast-root"), (el) => getComputedStyle(el).zIndex)
	try {
		await page.waitForFunction(
			(s, want) => {
				const el = document.querySelector(s)
				return !!el && getComputedStyle(el).zIndex === want
			},
			{ timeout: 5_000 },
			sel("toast-root"),
			zIndex,
		)
	} catch {
		throw new Error(`the snack host's z-index is ${await read()}, not ${zIndex}`)
	}
}

/** The stored acceptance record, read from any extension page. */
export async function readLegalRecord(page: Page): Promise<Record<string, unknown> | undefined> {
	return page.evaluate(
		async (key) => (await chrome.storage.local.get(key))[key] as Record<string, unknown> | undefined,
		LEGAL_ACCEPTANCE_KEY,
	)
}

export async function isContinueDisabled(page: Page): Promise<boolean> {
	return page.$eval(sel("legal-continue"), (el) => (el as HTMLButtonElement).disabled)
}

/** The gate's URL names where it resumes, so waiting for it also proves the resume target. */
export async function waitForTermsGate(page: Page, resumesAt: "create" | "import"): Promise<void> {
	await waitForHash(page, `#/onboarding/terms?next=${resumesAt}`, 10_000)
	await page.waitForSelector(sel("legal-consent-checkbox"), { visible: true, timeout: 10_000 })
}

/** Tick the consent box and continue, from the onboarding Terms page to wherever it resumes. */
export async function acceptOnboardingTerms(page: Page, resumesAt: "create" | "import"): Promise<void> {
	await waitForTermsGate(page, resumesAt)
	await clickByTestId(page, "legal-consent-checkbox")
	await page.waitForFunction(
		(s) => !(document.querySelector(s) as HTMLButtonElement | null)?.disabled,
		{ timeout: 5_000 },
		sel("legal-continue"),
	)
	await clickByTestId(page, "legal-continue")
	await waitForHash(page, `#/onboarding/${resumesAt}`, 10_000)
}

/**
 * A first run's own path, from no acceptance: the Terms gate, then a password and "Do it later" on
 * the recovery phrase, ending unlocked with onboarding marked complete so the popup opens on Home.
 * The acceptance is the event the worker's token list fetches on; a launch's seeded acceptance is a
 * storage write that no listener hears.
 */
export async function createProfileAcceptingTerms(ctx: ExtensionContext): Promise<void> {
	const page = await openOnboarding(ctx, { legal: "missing" })
	await clickByTestId(page, "onboarding-welcome-create")
	await acceptOnboardingTerms(page, "create")
	await clickByTestId(page, "onboarding-method-password")
	await replaceInputValue(page, '[data-testid="onboarding-password-input"]', TEST_PASSWORD)
	await replaceInputValue(page, '[data-testid="onboarding-password-confirm"]', TEST_PASSWORD)
	await clickByTestId(page, "onboarding-submit-create")
	await page.waitForSelector('[data-testid="onboarding-phrase-later"]', { visible: true, timeout: 60_000 })
	await clickByTestId(page, "onboarding-phrase-later")
	await waitForHash(page, "#/onboarding/done", 10_000)
	await page.evaluate(() => chrome.storage.local.set({ "nulo:onboarding:completed": true }))
	await page.close()
}

/**
 * Put an unlocked popup into an acceptance state and reload it, which is what an extension update
 * that ships newer Terms looks like to a running wallet. The session lives in the worker, so the
 * reload lands back on the wallet, not the lock screen.
 */
export async function reloadWithLegalState(page: Page, seed: Exclude<LegalSeed, "keep">): Promise<void> {
	await seedLegalAcceptance(page, seed)
	await page.evaluate(() => chrome.storage.session.remove("nulo:legal:dismissed"))
	await page.evaluate(() => {
		window.location.hash = "#/popup/general"
	})
	await reloadExtensionPage(page)
	await waitForHash(page, "#/popup/general", 30_000)
}

export async function waitForSheet(page: Page, variant: "changed" | "review"): Promise<void> {
	await page.waitForSelector(`${sel("legal-sheet")}[data-variant="${variant}"]`, { visible: true, timeout: 15_000 })
}

export async function isSheetPresent(page: Page): Promise<boolean> {
	return page.evaluate((s) => document.querySelector(s) !== null, sel("legal-sheet"))
}

/**
 * The shell's verdict on the Terms sheet, once the sheet has read the acceptance status. It is the
 * verdict for the route the shell is on: until the router's first navigation lands, that is the start
 * location, which the sheet never covers, so after a reload into a preset hash wait for that page first.
 */
export async function legalSheetVerdict(page: Page): Promise<"shown" | "hidden"> {
	const shell = sel("popup-shell")
	await page.waitForFunction(
		(s) => document.querySelector(s)?.hasAttribute("data-legal-sheet") === true,
		{ timeout: 15_000, polling: 100 },
		shell,
	)
	return page.$eval(shell, (el) => el.getAttribute("data-legal-sheet") as "shown" | "hidden")
}

/** Answers the Terms sheet an update meets when the release's stored acceptance, in its storage
 *  `entries`, predates this build's newest material Terms; otherwise holds that none shows. */
export async function answerUpdatedTerms(page: Page, entries: Record<string, unknown>): Promise<void> {
	if (updatedTermsAnswer(entries) === "none") {
		if ((await legalSheetVerdict(page)) === "shown" || (await isSheetPresent(page))) {
			throw new Error("the update raised the Terms sheet over a current acceptance")
		}
		return
	}
	await waitForSheet(page, "changed")
	await pointerClick(page, "legal-consent-checkbox")
	await pointerClick(page, "legal-continue")
}

/**
 * A REAL pointer click at the element's centre, after proving nothing sits on top of it there. A
 * DOM-dispatched click reaches an element under an overlay; this is the proof that no overlay is.
 * `last` picks the last match of the testid — the control of the popup on top of a stack. The centre
 * is read only once the element holds still: a sheet's card moves 15px as a sheet opens over it or
 * closes above it, and a centre read mid-move is clicked a round trip later, after it has moved off it.
 */
export async function pointerClick(page: Page, testid: string, opts: { last?: boolean } = {}): Promise<void> {
	await page.waitForSelector(sel(testid), { visible: true, timeout: 15_000 })
	await waitUntilStill(page, sel(testid), opts.last === true)
	const point = await page.evaluate(
		(s, last) => {
			const all = document.querySelectorAll(s)
			const el = last ? all[all.length - 1] : all[0]
			if (!el) throw new Error(`${s} not found`)
			el.scrollIntoView({ block: "center" })
			const box = el.getBoundingClientRect()
			const x = box.left + box.width / 2
			const y = box.top + box.height / 2
			const top = document.elementFromPoint(x, y)
			return {
				x,
				y,
				reachable: !!top && (el === top || el.contains(top)),
				covering: top?.getAttribute("data-testid") ?? top?.tagName,
			}
		},
		sel(testid),
		opts.last === true,
	)
	if (!point.reachable) throw new Error(`${testid} is covered at its centre by ${point.covering}`)
	await page.mouse.click(point.x, point.y)
}

/** Returns once three reads 50 ms apart give the element the same box and no enter transition above it
 *  still waits to start: Vue drops `*-enter-from` two animation frames after insert, and headless Chrome
 *  has been seen throttling frames long enough to hold a popup still in its start state (reads are
 *  polled from the test for the same reason). After 5 s a still element is pressed where it stands; one
 *  still moving throws. */
async function waitUntilStill(page: Page, selector: string, last: boolean): Promise<void> {
	const read = () =>
		page.evaluate(
			(s, lastMatch) => {
				const all = document.querySelectorAll(s)
				const el = lastMatch ? all[all.length - 1] : all[0]
				const r = el?.getBoundingClientRect()
				return {
					box: r ? `${r.left},${r.top} ${r.width}x${r.height}` : "gone",
					pending: Boolean(el?.closest('[class*="-enter-from"]')),
				}
			},
			selector,
			last,
		)
	let previous: Awaited<ReturnType<typeof read>> | undefined
	let unchanged = 0
	const sample = async () => {
		const now = await read()
		unchanged = previous && now.box === previous.box && now.pending === previous.pending ? unchanged + 1 : 0
		previous = now
		return { ...now, unchanged }
	}
	try {
		await pollUntil(sample, (s) => s.unchanged >= 2 && !s.pending, { label: `${selector} still`, timeoutMs: 5_000, intervalMs: 50 })
	} catch (error) {
		if (!(error instanceof PollTimeoutError)) throw error
		const seen = error.last as Awaited<ReturnType<typeof sample>>
		if (seen.unchanged >= 2) return
		throw new Error(`${selector} was still moving after 5s (last box ${seen.box})`)
	}
}
