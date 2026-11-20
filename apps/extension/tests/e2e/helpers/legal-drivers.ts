import type { Page } from "puppeteer"
import { type BackgroundOwner, evaluateInBackground, reloadExtensionPage } from "../fixtures/browser"
import { TEST_PASSWORD } from "../fixtures/constants"
import { clickByTestId, replaceInputValue, waitForHash, withTimeoutMessage } from "../fixtures/dom"
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
 * The shell's verdict on the Terms sheet, once the sheet has read the acceptance status on a page it
 * may cover. A reload into such a page's hash passes through the start location and the lock screen
 * first, and the shell marks no verdict on either. Read in the wait, so a mark that leaves after it
 * cannot be read as none.
 */
export async function legalSheetVerdict(page: Page): Promise<"shown" | "hidden"> {
	const verdict = await page.waitForFunction(
		(s) => document.querySelector(s)?.getAttribute("data-verdict") ?? false,
		{ timeout: 15_000, polling: 100 },
		sel("legal-sheet-verdict"),
	)
	return (await verdict.jsonValue()) as "shown" | "hidden"
}

/** Holds that the Terms sheet neither showed nor is in the page, once the shell read the acceptance. */
export async function expectNoTermsSheet(page: Page): Promise<void> {
	if ((await legalSheetVerdict(page)) === "shown" || (await isSheetPresent(page))) {
		throw new Error("the update raised the Terms sheet over a current acceptance")
	}
}

/** Answers the Terms sheet an update meets when the release's stored acceptance, in its storage
 *  `entries`, predates this build's newest material Terms, and returns once the sheet has closed,
 *  which it does only when the acceptance is stored; otherwise holds that none shows. */
export async function answerUpdatedTerms(page: Page, entries: Record<string, unknown>): Promise<void> {
	if (updatedTermsAnswer(entries) === "none") return expectNoTermsSheet(page)
	await waitForSheet(page, "changed")
	await pointerClick(page, "legal-consent-checkbox")
	await pointerClick(page, "legal-continue")
	await page.waitForSelector(sel("legal-sheet"), { hidden: true, timeout: 15_000 })
}

/** A press is aimed once, and once more after a miss its target's own move explains. */
const MAX_PRESSES = 2

/**
 * A REAL pointer click at the element's centre, after proving nothing sits on top of it there. A
 * DOM-dispatched click reaches an element under an overlay; this is the proof that no overlay is.
 * `last` picks the last match of the testid — the control of the popup on top of a stack. The centre
 * is read only once the element holds still: a sheet's card moves 15px as a sheet opens over it or
 * closes above it, and a centre read mid-move is clicked a round trip later, after it has moved off it.
 * A still element can still move in that round trip (Send's fee line grows a row when a note lands),
 * so it returns only once the browser's click reached the element: a press that met only the
 * element's own ground because the element moved off the point is aimed again, any other miss throws.
 */
export async function pointerClick(page: Page, testid: string, opts: { last?: boolean } = {}): Promise<void> {
	for (let press = 1; ; press++) {
		await page.waitForSelector(sel(testid), { visible: true, timeout: 15_000 })
		await waitUntilStill(page, sel(testid), opts.last === true)
		const point = await aimAt(page, sel(testid), opts.last === true)
		if (!point.reachable) {
			throw new Error(`${testid} is covered at its centre by ${point.covering} (${point.where}): "${point.says}"`)
		}
		await armPress(page, sel(testid), opts.last === true, point, press > 1)
		await page.mouse.click(point.x, point.y)
		const met = await readPress(page)
		if (met.reached) return
		if (!met.displaced || press === MAX_PRESSES) {
			throw new Error(`${testid} took no click from press ${press} at ${Math.round(point.x)},${Math.round(point.y)}: ${met.account}`)
		}
	}
}

/** The element's centre and what sits on top of it there. */
function aimAt(page: Page, selector: string, last: boolean) {
	return page.evaluate(
		(s, lastMatch) => {
			const all = document.querySelectorAll(s)
			const el = lastMatch ? all[all.length - 1] : all[0]
			if (!el) throw new Error(`${s} not found`)
			el.scrollIntoView({ block: "center" })
			const box = el.getBoundingClientRect()
			const x = box.left + box.width / 2
			const y = box.top + box.height / 2
			const top = document.elementFromPoint(x, y)
			const cover = top?.getBoundingClientRect()
			return {
				x,
				y,
				reachable: !!top && (el === top || el.contains(top)),
				covering: top?.getAttribute("data-testid") ?? top?.tagName,
				where: `y ${Math.round(y)} under ${Math.round(cover?.top ?? 0)}..${Math.round(cover?.bottom ?? 0)} of ${innerHeight}`,
				says: top?.textContent?.replace(/\s+/g, " ").trim().slice(0, 80),
			}
		},
		selector,
		last,
	)
}

/** Arms the page's record of the press about to land at the point. A press after a miss must find the
 *  element it missed: a match that replaced it may be another popup's. */
function armPress(page: Page, selector: string, last: boolean, point: { x: number; y: number }, again: boolean) {
	return page.evaluate(
		(s, lastMatch, x, y, retry) => {
			const all = document.querySelectorAll(s)
			const el = lastMatch ? all[all.length - 1] : all[0]
			// biome-ignore lint/suspicious/noExplicitAny: the press record is page state no type declares
			const w = window as any
			if (!el) throw new Error(`${s} left before the press`)
			if (retry && w.__nuloPress?.el !== el) throw new Error(`${s} was replaced after a press that missed it`)
			w.__nuloPress = { el, x, y, heard: [], armed: true }
			if (w.__nuloPressHeard) return
			w.__nuloPressHeard = true
			const name = (t: Element) => t.closest("[data-testid]")?.getAttribute("data-testid") ?? t.tagName
			const covers = (t: Element, px: number, py: number) => {
				const r = t.getBoundingClientRect()
				return px >= r.left && px < r.right && py >= r.top && py < r.bottom
			}
			// Window capture hears each event before any handler can stop, move or remove its target. Every
			// click of the press counts, a label's forwarded click included: they all run in the pointerup's task.
			const hear = (type: string) => (e: Event) => {
				const p = w.__nuloPress
				if (!p?.armed || !(e.target instanceof Element)) return
				const on = covers(p.el, p.x, p.y)
				p.heard.push({ type, at: name(e.target), inside: p.el.contains(e.target), under: e.target.contains(p.el), on })
				if (type === "pointerup") setTimeout(() => (p.armed = false), 0)
			}
			for (const type of ["pointerdown", "pointerup", "click"]) addEventListener(type, hear(type), true)
		},
		selector,
		last,
		point.x,
		point.y,
		again,
	)
}

/**
 * What the armed press met. `reached`: a click landed inside the element. `displaced`: no
 * click did, the element had left the aimed point by the pointerup, and every event landed on the
 * element or on what holds it, so the miss pressed nothing else. A press that replaced the document
 * is taken as reached: a miss on the element's own ground runs nothing that could replace it.
 */
async function readPress(page: Page): Promise<{ reached: boolean; displaced: boolean; account: string }> {
	await withTimeoutMessage(
		// biome-ignore lint/suspicious/noExplicitAny: the press record is page state no type declares
		page.waitForFunction(() => (window as any).__nuloPress?.armed !== true, { timeout: 5_000, polling: 20 }),
		"the browser dispatched the press, but the page heard no pointerup",
	)
	return page.evaluate(() => {
		// biome-ignore lint/suspicious/noExplicitAny: the press record is page state no type declares
		const p = (window as any).__nuloPress
		if (!p) return { reached: true, displaced: false, account: "the document was replaced" }
		type Heard = { type: string; at: string; inside: boolean; under: boolean; on: boolean }
		const heard: Heard[] = p.heard
		const up = heard.filter((h) => h.type === "pointerup").pop()
		const reached = heard.some((h) => h.type === "click" && h.inside)
		const displaced = !reached && p.el.isConnected && up?.on === false && heard.every((h) => h.inside || h.under)
		const account = heard.map((h) => `${h.type} on ${h.at} (target ${h.on ? "on" : "off"} the point)`).join(", ") || "no event"
		return { reached, displaced, account }
	})
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
