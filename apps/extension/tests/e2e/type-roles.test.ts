/**
 * The type roles reach a real page: one probe per role computes to its record, the faces they ask
 * for load, History's hero title takes `title-hero` through its composed module rule, and in
 * Firefox's real toolbar panel the role-bearing text neither clips nor moves the layout.
 */
import { typeRoleNames, typeRoles } from "@nulo/design/tokens"
import type { Page } from "puppeteer"
import { describe, expect, vi } from "vitest"
import { FIREFOX_ONLY, isFirefox } from "./fixtures/browser"
import { evaluateInActionPopup, openActionPopup } from "./fixtures/browser/firefox-action-popup"
import { type ExtensionContext, openPopup, test, waitForHash } from "./fixtures/extension"
import { clickNavTab, readSessionRow } from "./fixtures/helpers"
import {
	checkFontFaces,
	clearTypeRoleProbes,
	expectSweepClean,
	firstFamily,
	judgeTypography,
	type PageTypography,
	panelBodies,
	PROBE_TEXT,
	placeTypeRoleProbes,
	readPageTypography,
	sweepTypeRoles,
	type TypeReading,
	withBlockedAccount,
} from "./fixtures/type-roles"

const sel = (testid: string) => `[data-testid="${testid}"]`
const PROBE = "type-role-probe-"

async function openHome(ctx: ExtensionContext): Promise<Page> {
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general")
	await page.waitForSelector(sel("nav-general"), { visible: true, timeout: 15_000 })
	return page
}

/** Runs `fn` with the probes over the page, and proves none outlives it. */
async function withProbes<T>(page: Page, fn: () => Promise<T>): Promise<T> {
	await placeTypeRoleProbes(page)
	try {
		return await fn()
	} finally {
		await clearTypeRoleProbes(page)
		expect(await page.evaluate((prefix: string) => document.querySelectorAll(`[data-testid^="${prefix}"]`).length, PROBE)).toBe(0)
	}
}

const describeTracking = (reading: TypeReading) => `${reading.roles.join(" ")} ${reading.letterSpacing}@${reading.fontSize}`

test("every role's probe computes to its record, and a probe pushed off it is caught", async ({ registeredExtension: ctx }) => {
	const page = await openHome(ctx)
	const { sweep, pushed } = await withProbes(page, async () => {
		const sweep = await sweepTypeRoles(page)
		// 0.2em at 10px is 2px against the role's 1px: past the 0.1px tolerance, and past no override.
		await page.evaluate(
			(probe: string) => {
				document.querySelector<HTMLElement>(probe)?.style.setProperty("letter-spacing", "0.2em")
			},
			sel(`${PROBE}label`),
		)
		return { sweep, pushed: judgeTypography(await readPageTypography(page, { kind: "roles" })) }
	})

	const probes = sweep.readings.filter((reading) => reading.testid?.startsWith(PROBE))
	expect(probes.map((reading) => reading.roles.join(" ")).sort()).toEqual([...typeRoleNames].sort())
	expectSweepClean(sweep)
	expect(pushed).toEqual([
		{ testid: `${PROBE}label`, text: PROBE_TEXT, role: "label", property: "letter-spacing", expected: "0.1em", actual: "2px" },
	])
	const tracked = probes.filter((reading) => typeRoles[reading.roles[0] as keyof typeof typeRoles].tracking !== 0)
	console.log(`[type-roles] probe tracking: ${tracked.map(describeTracking).join(", ")}`)
	expect(ctx.pageErrors).toEqual([])
})

test("the three faces the roles name load, and none fails", async ({ registeredExtension: ctx }) => {
	const page = await openHome(ctx)
	const fonts = await withProbes(page, () => checkFontFaces(page))

	console.log(`[type-roles] faces: ${fonts.faces.map(({ face, statuses }) => `${face} [${statuses.join(", ")}]`).join("; ")}`)
	expect(fonts.faces.map(({ face }) => face)).toEqual(["Space Grotesk", "InterVariable", "JetBrains Mono"])
	expect(fonts.failures).toEqual([])
	expect(ctx.pageErrors).toEqual([])
})

test("History's hero title takes title-hero through its composed module rule", async ({ registeredExtension: ctx }) => {
	const page = await openHome(ctx)
	await clickNavTab(page, "activity")
	await waitForHash(page, "#/popup/activity")
	await page.waitForSelector(sel("page-hero-title"), { visible: true, timeout: 15_000 })
	const sweep = await sweepTypeRoles(page)

	const hero = sweep.readings.filter((reading) => reading.testid === "page-hero-title")
	expect(hero).toHaveLength(1)
	const [title] = hero
	console.log(
		`[type-roles] History hero: ${title.fontFamily} ${title.fontSize} ${title.fontWeight} ${title.letterSpacing} ${title.textTransform}`,
	)
	expect(title.roles).toEqual(["title-hero"])
	expect(firstFamily(title.fontFamily)).toBe("Space Grotesk")
	expect(title).toMatchObject({ fontSize: "48px", fontWeight: "700", textTransform: "uppercase", fontVariantNumeric: "normal" })
	expect(Math.abs(Number.parseFloat(title.letterSpacing) + 1.92)).toBeLessThanOrEqual(0.1)
	expectSweepClean(sweep)
	expect(ctx.pageErrors).toEqual([])
})

test("withBlockedAccount raises the verification barrier and hands back an unlocked Home", async ({ registeredExtensionPerTest: ctx }) => {
	const page = await openHome(ctx)
	const before = await readSessionRow(page)
	const shown = await withBlockedAccount(page, () =>
		page.evaluate((barrier: string) => document.querySelector(barrier) !== null, sel("account-integrity-blocked")),
	)

	expect(shown).toBe(true)
	expect(await page.evaluate((barrier: string) => document.querySelector(barrier) === null, sel("account-integrity-blocked"))).toBe(true)
	expect(await page.evaluate(() => window.location.hash)).toBe("#/popup/general")
	expect((await readSessionRow(page))?.profile).toBe(before?.profile)
	const rows = await page.evaluate(async () =>
		Object.keys(await chrome.storage.local.get(null)).filter((key) => key.startsWith("nulo:core:account-integrity-blocked")),
	)
	expect(rows).toEqual([])
	expect(ctx.pageErrors).toEqual([])
})

type PanelLayout = { hash: string; viewportHeight: number; viewportWidth: number; shellHeight: number; navBottom: number }

const MEASURE_PANEL = `
	const doc = content.document;
	const box = (selector) => doc.querySelector(selector)?.getBoundingClientRect();
	return {
		hash: content.location.hash,
		viewportHeight: content.innerHeight,
		viewportWidth: content.innerWidth,
		shellHeight: Math.round(box("#app")?.height ?? -1),
		navBottom: Math.round(box('[data-testid="bottom-nav"]')?.bottom ?? -1),
	};`

/**
 * Firefox re-measures a panel after a DOM change, at once and again ~100 ms later, so a layout
 * holds only when every reading across this window agrees.
 */
const SETTLE_SAMPLES_MS = [0, 150, 300, 600, 1_200]
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe.skipIf(!isFirefox)(FIREFOX_ONLY.toolbarPanel, () => {
	test("in the toolbar panel, Home and Settings hold their layout and no role-bearing text clips", async ({
		registeredExtensionPerTest: ctx,
	}) => {
		await openActionPopup(ctx.browser)
		const inPanel = <T>(body: string) => evaluateInActionPopup<T>(ctx.browser, body)

		for (const tab of ["general", "settings"]) {
			if (tab !== "general") await inPanel(`content.document.querySelector('[data-testid="nav-${tab}"]')?.click(); return null;`)
			// A panel that has just opened passes through the lock screen while the session is restored.
			let streak = 0
			await vi.waitFor(
				async () => {
					const { hash, navBottom } = await inPanel<PanelLayout>(MEASURE_PANEL)
					streak = hash === `#/popup/${tab}` && navBottom > 0 ? streak + 1 : 0
					expect(streak, `settling on ${tab}, last seen ${hash}`).toBeGreaterThanOrEqual(3)
				},
				{ timeout: 20_000, interval: 250 },
			)
			for (const wait of SETTLE_SAMPLES_MS) {
				await sleep(wait)
				const layout = await inPanel<PanelLayout>(MEASURE_PANEL)
				expect(layout, `${tab} +${wait}ms`).toMatchObject({ shellHeight: layout.viewportHeight, navBottom: layout.viewportHeight })
			}
			console.log(`[type-roles] panel ${tab}: ${JSON.stringify(await inPanel<PanelLayout>(MEASURE_PANEL))}`)

			expect(await inPanel<number>(panelBodies.placeProbes())).toBe(typeRoleNames.length)
			try {
				const typography = await inPanel<PageTypography>(panelBodies.read({ kind: "roles" }))
				expect(typography.readings.filter((reading) => reading.testid?.startsWith(PROBE))).toHaveLength(typeRoleNames.length)
				expect(judgeTypography(typography), `${tab}: role values in the panel`).toEqual([])
				const clipped = typography.readings.filter(
					(reading) => reading.scrollWidth > reading.clientWidth && reading.textOverflow !== "ellipsis",
				)
				expect(clipped, `${tab}: role-bearing text clipped without an ellipsis`).toEqual([])
				const widths = typography.readings
					.filter((reading) => !reading.testid?.startsWith(PROBE))
					.map((r) => `${r.testid}:${r.scrollWidth}/${r.clientWidth}`)
				console.log(`[type-roles] panel ${tab} roles beyond the probes: ${widths.join(", ") || "none"}`)
			} finally {
				expect(await inPanel<boolean>(panelBodies.clearProbes())).toBe(true)
			}
		}
		expect(ctx.pageErrors).toEqual([])
	})
})
