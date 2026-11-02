/**
 * A held Enter acts once. On the recovery phrase's Reveal the button ignores the repeat, so the
 * held key makes one reveal; in onboarding's confirm field the browser's implicit submission
 * activates Create once, and the repeat that reaches the phrase step presses nothing there. The
 * page records each Enter keydown, click and submit, so a driver that sends no repeat, or a repeat
 * that lands anywhere but the control, fails on the record. The phrase check is answered by keys
 * alone, since only a browser moves focus through radio groups.
 */
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { TEST_PASSWORD } from "./fixtures/constants"
import { clickByTestId, openOnboarding, openPopup, replaceInputValue, test, waitForHash } from "./fixtures/extension"
import { navigateByHash, readProfileNames, readRecoveryWords } from "./fixtures/helpers"
import { waitForFocus } from "./helpers/pointer-probes"

type KeyRecord = { type: "keydown"; on: string | null; repeat: boolean } | { type: "click"; on: string | null } | { type: "submit" }

const sel = (testid: string) => `[data-testid="${testid}"]`

/** From now on, records in order each Enter keydown (its nearest testid and `repeat`), each click
 *  (its nearest testid) and each submit, at the window's capture phase. */
async function recordKeys(page: Page): Promise<void> {
	await page.evaluate(() => {
		const w = window as unknown as { __keyRecord?: unknown[] }
		w.__keyRecord = []
		const nearest = (t: EventTarget | null) =>
			t instanceof Element ? (t.closest("[data-testid]")?.getAttribute("data-testid") ?? null) : null
		const push = (r: unknown) => w.__keyRecord?.push(r)
		window.addEventListener(
			"keydown",
			(e) => {
				if (e.key === "Enter") push({ type: "keydown", on: nearest(e.target), repeat: e.repeat })
			},
			true,
		)
		window.addEventListener("click", (e) => push({ type: "click", on: nearest(e.target) }), true)
		window.addEventListener("submit", () => push({ type: "submit" }), true)
	})
}

async function readRecord(page: Page): Promise<KeyRecord[]> {
	return page.evaluate(() => (window as unknown as { __keyRecord?: KeyRecord[] }).__keyRecord ?? [])
}

const clicksOn = (record: KeyRecord[], testid: string) => record.filter((r) => r.type === "click" && r.on === testid)

const phraseSavedFlags = (page: Page) =>
	page.evaluate(async () =>
		Object.entries(await chrome.storage.local.get(null))
			.filter(([key]) => key.startsWith("nulo:ui:getStartedPhraseSaved@"))
			.map(([, value]) => value),
	)

/** The focused element: its testid, the position of the check's group it sits in, and a radio's word. */
const focusedChoice = (page: Page) =>
	page.evaluate(() => {
		const el = document.activeElement as HTMLInputElement | null
		return {
			on: el?.getAttribute("data-testid") ?? null,
			position: el?.closest("[data-position]")?.getAttribute("data-position") ?? null,
			word: el?.type === "radio" ? el.value : null,
			checked: el?.type === "radio" ? el.checked : null,
		}
	})

/** Each group is one Tab stop entered unpicked; Space picks the first choice and an arrow moves the
 *  pick, so each group ends on the word `words` holds at its position. Ends on the last group. */
async function pickCheckByKeys(page: Page, words: readonly string[]): Promise<string[]> {
	const groups = await page.$$eval(sel("onboarding-phrase-check-question"), (all) =>
		all.map((q) => ({
			position: q.getAttribute("data-position") ?? "",
			choices: [...q.querySelectorAll<HTMLInputElement>('[data-testid="onboarding-phrase-check-choice"]')].map((c) => c.value),
		})),
	)
	for (const { position, choices } of groups) {
		await page.keyboard.press("Tab")
		expect(await focusedChoice(page)).toMatchObject({ on: "onboarding-phrase-check-choice", position, checked: false })
		const word = words[Number(position) - 1]
		const steps = choices.indexOf(word)
		if (steps === 0) await page.keyboard.press(" ")
		for (let i = 0; i < steps; i++) await page.keyboard.press("ArrowRight")
		expect(await focusedChoice(page)).toEqual({ on: "onboarding-phrase-check-choice", position, word, checked: true })
	}
	return groups.map((g) => g.position)
}

async function focusWhenEnabled(page: Page, testid: string): Promise<void> {
	await page.waitForFunction(
		(s: string) => {
			const el = document.querySelector<HTMLButtonElement | HTMLInputElement>(s)
			return Boolean(el && !el.disabled)
		},
		{ timeout: 10_000, polling: 50 },
		sel(testid),
	)
	await page.focus(sel(testid))
	await waitForFocus(page, testid)
}

/** Holds Enter on the control: a press, its repeat, and the release, recorded from the press on. */
async function holdEnterOn(page: Page, testid: string): Promise<void> {
	await focusWhenEnabled(page, testid)
	await recordKeys(page)
	await page.keyboard.down("Enter")
	await page.keyboard.down("Enter")
	await page.keyboard.up("Enter")
}

function expectHeldEnterOn(record: KeyRecord[], testid: string): void {
	expect(
		record.filter((r) => r.type === "keydown"),
		`the press and its repeat did not both reach ${testid}, so the held Enter proved nothing: ${JSON.stringify(record)}`,
	).toEqual([
		{ type: "keydown", on: testid, repeat: false },
		{ type: "keydown", on: testid, repeat: true },
	])
}

test("a held Enter on Reveal reveals once", { timeout: 120_000 }, async ({ registeredExtension }) => {
	const page = await openPopup(registeredExtension)
	await waitForHash(page, "#/popup/general")
	await navigateByHash(page, "#/popup/settings/security/export", 15_000)
	await navigateByHash(page, "#/popup/settings/security/export/seed", 15_000)
	await clickByTestId(page, "agree-continue-btn")

	// A wrong password keeps Reveal on the page after its attempt, so the repeat lands on the button
	// however fast that attempt ends. On Firefox a right one reveals the phrase before the repeat.
	await replaceInputValue(page, sel("unlock-password-input"), "not-the-password-1")
	await holdEnterOn(page, "unlock-submit-btn")
	await page.waitForSelector(sel("unlock-error-text"), { visible: true, timeout: 30_000 })
	const record = await readRecord(page)
	expectHeldEnterOn(record, "unlock-submit-btn")
	expect(clicksOn(record, "unlock-submit-btn"), `Reveal ran more than once: ${JSON.stringify(record)}`).toHaveLength(1)

	await replaceInputValue(page, sel("unlock-password-input"), TEST_PASSWORD)
	await focusWhenEnabled(page, "unlock-submit-btn")
	await page.keyboard.press("Enter")
	await page.waitForSelector(sel("reveal-content"), { visible: true, timeout: 30_000 })

	expect(registeredExtension.consoleErrors).toEqual([])
	expect(registeredExtension.pageErrors).toEqual([])
})

test("Enter in the confirm field creates the wallet once, and its repeat cannot press I saved it", { timeout: 120_000 }, async ({
	freshExtensionPerTest: extension,
}) => {
	const page = await openOnboarding(extension)
	await clickByTestId(page, "onboarding-welcome-create")
	await waitForHash(page, "#/onboarding/create", 10_000)
	await clickByTestId(page, "onboarding-method-password")
	await replaceInputValue(page, sel("onboarding-password-input"), TEST_PASSWORD)
	await replaceInputValue(page, sel("onboarding-password-confirm-input"), TEST_PASSWORD)

	// The key stays down until the recovery phrase step has mounted, so its repeat arrives there.
	await focusWhenEnabled(page, "onboarding-password-confirm-input")
	await recordKeys(page)
	await page.keyboard.down("Enter")
	await page.waitForSelector(sel("onboarding-phrase-saved"), { visible: true, timeout: 60_000 })
	await page.keyboard.down("Enter")
	await page.keyboard.up("Enter")

	const record = await readRecord(page)
	expect(
		record.filter((r) => r.type === "keydown"),
		`the press and a repeat after the step mounted were not both recorded: ${JSON.stringify(record)}`,
	).toEqual([
		{ type: "keydown", on: "onboarding-password-confirm-input", repeat: false },
		{ type: "keydown", on: "onboarding-phrase-title", repeat: true },
	])
	// Implicit submission clicks the form's default button. Create's click handler disables it before
	// the button's own activation runs, so no submit event follows.
	const activations = clicksOn(record, "onboarding-submit-create")
	expect(activations, `the Enter did not activate Create exactly once: ${JSON.stringify(record)}`).toHaveLength(1)
	expect(clicksOn(record, "onboarding-phrase-saved")).toEqual([])
	expect(await readProfileNames(page)).toEqual(["Main"])
	expect(await phraseSavedFlags(page)).toEqual([])

	// Control: one plain press on I saved it opens the check, and passing it records the phrase as saved.
	const words = await readRecoveryWords(page, "onboarding-phrase")
	await focusWhenEnabled(page, "onboarding-phrase-saved")
	await page.keyboard.press("Enter")
	await page.waitForSelector(sel("onboarding-phrase-check-page"), { visible: true, timeout: 10_000 })
	await waitForFocus(page, "onboarding-phrase-check-title")
	const positions = await pickCheckByKeys(page, words)
	// Enter on a pick submits nothing; Shift+Tab goes back onto the previous group's pick.
	await page.keyboard.press("Enter")
	await page.keyboard.down("Shift")
	await page.keyboard.press("Tab")
	await page.keyboard.up("Shift")
	expect(await focusedChoice(page)).toMatchObject({ position: positions[1], checked: true })
	expect(await page.$(sel("onboarding-phrase-check-page"))).not.toBeNull()
	expect(await phraseSavedFlags(page)).toEqual([])
	await page.keyboard.press("Tab")
	await page.keyboard.press("Tab")
	await waitForFocus(page, "onboarding-phrase-check-confirm")
	await page.keyboard.press("Enter")
	await waitForHash(page, "#/onboarding/done", 10_000)
	expect(await phraseSavedFlags(page)).toEqual([true])

	expect(extension.consoleErrors).toEqual([])
	expect(extension.pageErrors).toEqual([])
})
