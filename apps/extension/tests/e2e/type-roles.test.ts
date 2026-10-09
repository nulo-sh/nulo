/**
 * The type roles reach a real page: one probe per role computes to its record, the site reader
 * judges the element it should, the faces they ask for load, History's hero title takes
 * `title-hero` through its composed module rule, every page the smoke suite sweeps holds its roles
 * and its identifier sites, as do the native fields and each `Button` variant and size in today's
 * box, and in Firefox's real toolbar panel the role-bearing text neither clips nor moves the layout.
 */
import { typeRoleNames, typeRoles } from "@nulo/design/tokens"
import type { Page } from "puppeteer"
import { describe, expect, vi } from "vitest"
import { extensionUrl, FIREFOX_ONLY, isFirefox, stopBackground } from "./fixtures/browser"
import { evaluateInActionPopup, openActionPopup } from "./fixtures/browser/firefox-action-popup"
import { clickByTestId, type ExtensionContext, openOnboarding, openPopup, replaceInputValue, test, waitForHash } from "./fixtures/extension"
import {
	clickNavTab,
	lockWallet,
	navigateByHash,
	openHoldings,
	openNetworkDetail,
	readSessionRow,
	unlockAfterBackgroundDeath,
} from "./fixtures/helpers"
import { holdNextPasskeyRequest, openPasskeyRegister, setupPasskeyVirtualAuth } from "./fixtures/passkey"
import {
	checkFontFaces,
	clearTypeRoleProbes,
	expectSitesClean,
	expectSweepClean,
	firstFamily,
	judgeTypography,
	observeIdentifierSites,
	type PageTypography,
	panelBodies,
	PROBE_TEXT,
	placeTypeRoleProbes,
	readPageTypography,
	type SiteEntry,
	sweepTypeRoles,
	type TypeReading,
	withBlockedAccount,
} from "./fixtures/type-roles"
import { readActivityScope, seedTokenRow, seedTransaction } from "./helpers/activity-seeds"
import { refuseTestnet } from "./helpers/contacts"

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

const FIXTURE_HTML = `
	<div data-input-size="mini">
		<input class="type--input" data-testid="tr-mini-input" value="12" style="font-size: 12px" />
		<input class="type--input-data" data-testid="tr-mini-data" value="0x1a" style="font-size: 12px" />
	</div>
	<div data-testid="tr-field"><span class="type--label">To</span><input class="type--input-data" value="0x1a" /></div>
	<span class="type--name" data-testid="tr-name" data-address-shows="name">Alice</span>`

const fixtureSite = (selector: string, role: SiteEntry["role"]): SiteEntry => ({
	file: "fixture.vue",
	expression: selector,
	branch: "",
	ordinal: 0,
	role,
	selector,
	surface: "fixture",
	state: "fixture",
	liveFrom: 2,
})

test("a site reads its value or its native field, a name shown is judged as name, an override holds only its role in its scope", async ({
	registeredExtension: ctx,
}) => {
	const page = await openHome(ctx)
	await page.evaluate((html: string) => {
		const host = document.createElement("div")
		host.setAttribute("data-testid", "tr-host")
		host.innerHTML = html
		document.body.appendChild(host)
	}, FIXTURE_HTML)
	try {
		const failures = judgeTypography(await readPageTypography(page, { kind: "at", selector: '[data-testid="tr-host"] input' }))
		expect(failures.map(({ testid, property }) => `${testid} ${property}`)).toEqual(["tr-mini-data font-size"])

		const sites = [fixtureSite("tr-field", "input-data"), fixtureSite("tr-name", "data-lead")]
		const { sites: observed } = await observeIdentifierSites(page, "fixture", "fixture", { arc: 5, sites })
		expect(observed.map(({ readings }) => readings.map(({ roles }) => roles.join(" ")))).toEqual([["input-data"], ["name"]])
		expect(observed.flatMap(({ failures }) => failures)).toEqual([])
	} finally {
		await page.evaluate(() => document.querySelector('[data-testid="tr-host"]')?.remove())
	}
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

const OBSERVE = { arc: 2 } as const
const VISIBLE = { visible: true, timeout: 15_000 } as const
const TX_HASH = `0x${"5e".repeat(32)}`
/** About 123 trillion of the scope's token: at $1, a figure Home's fit draws only below full size. */
const LONG_BALANCE = "123456789012345678901"
/** Wire-shaped: 0x and 64 hex, the x coordinate of a Grumpkin point. */
const RECIPIENT = "0x09c1c9d2ce72c53c2451f8e9add86ccb8cb284dd4dc4f0eaf301b40b38a9459b"

type SiteState = readonly [surface: string, state: string]

/** Sweep steps 1 and 2 over the page as it stands, then the identifier sites of each state it renders. */
async function expectPageClean(page: Page, label: string, states: readonly SiteState[] = []): Promise<void> {
	expectSweepClean(await sweepTypeRoles(page), label)
	for (const [surface, state] of states) expectSitesClean(await observeIdentifierSites(page, surface, state, OBSERVE))
}

async function expectRoleAt(page: Page, testid: string, role: string, native = false): Promise<void> {
	const typography = await readPageTypography(page, { kind: "at", selector: sel(testid), native })
	expect(
		typography.readings.map(({ roles }) => roles),
		testid,
	).toEqual([[role]])
	expect(judgeTypography(typography), testid).toEqual([])
}

type ButtonCase = { role: "button" | "button-md" | null; vertical: number; horizontal: number }

/**
 * One button per `Button` variant and size a smoke page renders: its role, or none, and today's
 * padding. A CTA's padding is its compound rule's at every size but compact; the others' is their
 * size's.
 */
const BUTTONS = {
	"auth-submit": { role: "button", vertical: 20, horizontal: 0 }, // cta, medium
	"reset-submit-btn": { role: "button", vertical: 20, horizontal: 0 }, // cta_destructive, medium
	"onboarding-submit-create": { role: "button", vertical: 20, horizontal: 0 }, // cta, large
	"passkey-ceremony-cancel": { role: "button", vertical: 14, horizontal: 0 }, // cta_outline, compact
	"contacts-new-btn": { role: "button-md", vertical: 0, horizontal: 16 }, // primary, large
	"new-contact-submit": { role: "button-md", vertical: 0, horizontal: 14 }, // primary, medium
	"accounts-import-btn": { role: "button-md", vertical: 0, horizontal: 16 }, // primary_outline, large
	"receive-close": { role: "button-md", vertical: 0, horizontal: 14 }, // primary_outline, medium
	"tokens-menu-trigger": { role: null, vertical: 0, horizontal: 8 }, // secondary, micro
} as const satisfies Record<string, ButtonCase>

type ButtonTestid = keyof typeof BUTTONS

async function expectButtons(page: Page, ...testids: ButtonTestid[]): Promise<void> {
	for (const testid of testids) {
		const { role, vertical, horizontal } = BUTTONS[testid]
		const typography = await readPageTypography(page, { kind: "at", selector: sel(testid) })
		expect(
			typography.readings.map(({ roles }) => roles),
			`${testid} roles`,
		).toEqual([role === null ? [] : [role]])
		if (role !== null) expect(judgeTypography(typography), `${testid} values`).toEqual([])
		const padding = await page.$eval(sel(testid), (el) => {
			const style = getComputedStyle(el)
			return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]
		})
		expect(padding, `${testid} padding`).toEqual([vertical, horizontal, vertical, horizontal].map((n) => `${n}px`))
	}
}

/**
 * Seeds a token row, its long private balance, a quote and a transfer, then restarts the
 * background: the balance service reads its token map only as it starts. The caller holds the
 * Testnet RPC refused, or a balance refresh writes the real zero over the seed.
 */
async function openSeededHome(ctx: ExtensionContext): Promise<Page> {
	const seeder = await openHome(ctx)
	await seeder
		.waitForFunction(() => document.querySelector('[data-testid="tokens-list"]')?.getAttribute("data-settled") === "true", {
			timeout: 30_000,
		})
		.catch(() => undefined)
	const scope = await readActivityScope(seeder)
	await seedTokenRow(seeder, scope, 1)
	await seedTransaction(seeder, scope, { hash: TX_HASH, amount: "1500000" })
	await seeder.evaluate((items: Record<string, string>) => chrome.storage.local.set(items), {
		"nulo:core:token-balances@1": JSON.stringify({
			id: 1,
			token: 1,
			account: scope.account,
			profileId: scope.profileId,
			chainId: scope.chainId,
			contract: scope.token.contract,
			publicBalance: "0",
			privateBalance: LONG_BALANCE,
			updatedAt: Date.now(),
		}),
		"nulo:core:token-prices": JSON.stringify({
			"usd-coin": { coingeckoId: "usd-coin", usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null },
		}),
	})
	// Firefox keeps its event page alive while an extension page is open.
	for (const open of await ctx.browser.pages()) {
		if (open.url().startsWith(extensionUrl(ctx.extensionId, "/"))) await open.close()
	}
	await stopBackground(ctx)
	const page = await openPopup(ctx)
	await unlockAfterBackgroundDeath(page)
	await page.waitForSelector(sel("balance-amount"), VISIBLE)
	return page
}

/** Resolves once the visible figure under `balance-amount` is drawn below full size. */
const waitForFittedHero = (page: Page) =>
	page.waitForFunction(
		(amount: string) =>
			[...(document.querySelector(amount)?.querySelectorAll<HTMLElement>("*") ?? [])].some((el) => {
				const scale = Number.parseFloat(el.style.getPropertyValue("--hero-scale"))
				return scale > 0 && scale < 1
			}),
		{ timeout: 30_000, polling: 200 },
		sel("balance-amount"),
	)

async function openAndSweep(page: Page, opener: string, ready: string, label: string, states: readonly SiteState[] = []): Promise<void> {
	await clickByTestId(page, opener)
	await page.waitForSelector(sel(ready), VISIBLE)
	await expectPageClean(page, label, states)
}

async function goAndSweep(page: Page, hash: string, ready: string, label: string, states: readonly SiteState[] = []): Promise<void> {
	await navigateByHash(page, hash, 10_000)
	await page.waitForSelector(sel(ready), VISIBLE)
	await expectPageClean(page, label, states)
}

test("a seeded wallet's Home with its fitted balance, Holdings, Activity, a tx detail, Receive, Accounts and the unlock screen", async ({
	registeredExtensionPerTest: ctx,
}) => {
	const refusal = await refuseTestnet(ctx)
	try {
		const page = await openSeededHome(ctx)
		await waitForFittedHero(page)
		await expectPageClean(page, "Home")
		await expectRoleAt(page, "holdings-section-label", "label-section")
		await expectButtons(page, "tokens-menu-trigger")

		await openAndSweep(page, "actions-receive", "receive-address", "Receive")
		await expectButtons(page, "receive-close")
		await clickByTestId(page, "receive-close")
		await page.waitForSelector(sel("receive-address"), { hidden: true, timeout: 15_000 })

		await openHoldings(page)
		await expectPageClean(page, "Holdings")
		await clickNavTab(page, "activity")
		await waitForHash(page, "#/popup/activity")
		await page.waitForSelector(sel("page-hero-title"), VISIBLE)
		await expectPageClean(page, "Activity")
		await goAndSweep(page, `#/popup/tx/${TX_HASH}`, "tx-from-address", "tx detail", [["popup-tx-id", "the seedTransaction row"]])

		await navigateByHash(page, "#/popup/general", 10_000)
		await page.waitForSelector(sel("account-avatar-btn"), VISIBLE)
		await openAndSweep(page, "account-avatar-btn", "account-item", "Accounts", [["popup:accounts", ""]])
		await lockWallet(page)
		await page.waitForSelector(sel("auth-submit"), VISIBLE)
		await expectPageClean(page, "unlock")
		await expectRoleAt(page, "auth-password-input", "input", true)
		await expectButtons(page, "auth-submit")
	} finally {
		await refusal.stop()
	}
	expect(ctx.pageErrors).toEqual([])
}, 300_000)

test("Send with a recipient typed, the Settings hub, Display, a network, Manage accounts, Reset, Contacts and New contact", async ({
	registeredExtension: ctx,
}) => {
	const page = await openHome(ctx)
	await goAndSweep(page, "#/popup/send", "send-destination-field", "Send")
	await replaceInputValue(page, `${sel("send-destination-field")} input`, RECIPIENT)
	await expectPageClean(page, "Send, a recipient typed", [["popup-send", ""]])
	await expectRoleAt(page, "send-destination-field", "input-data", true)

	await goAndSweep(page, "#/popup/settings", "settings-page", "Settings hub")
	await goAndSweep(page, "#/popup/settings/display", "theme-trigger", "Display")
	await navigateByHash(page, "#/popup/settings/networks", 10_000)
	await page.waitForSelector(sel("network-row"), VISIBLE)
	const network = await page.$eval(sel("network-row"), (row) => row.getAttribute("data-network-name") ?? "")
	await openNetworkDetail(page, network)
	await page.waitForSelector(sel("network-detail-chain-id"), VISIBLE)
	await expectPageClean(page, "a network", [["popup-settings-networks-id", ""]])
	await goAndSweep(page, "#/popup/settings/accounts", "accounts-import-btn", "Manage accounts")
	await expectButtons(page, "accounts-import-btn")
	await goAndSweep(page, "#/popup/settings/security/reset", "reset-submit-btn", "Reset")
	await expectButtons(page, "reset-submit-btn")

	await goAndSweep(page, "#/popup/settings/contacts", "contacts-new-btn", "Contacts")
	await expectButtons(page, "contacts-new-btn")
	await openAndSweep(page, "contacts-new-btn", "contact-address-input", "New contact", [["popup:new_contact", ""]])
	await expectButtons(page, "new-contact-submit")
	await page.close()
	expect(ctx.pageErrors).toEqual([])
}, 180_000)

test("the large CTA on onboarding's create step holds its role and box", async ({ freshExtensionPerTest: ctx }) => {
	const page = await openOnboarding(ctx)
	await clickByTestId(page, "onboarding-welcome-create")
	await waitForHash(page, "#/onboarding/create")
	await page.waitForSelector(sel("onboarding-submit-create"), VISIBLE)
	await expectPageClean(page, "onboarding create")
	await expectButtons(page, "onboarding-submit-create")
	expect(ctx.pageErrors).toEqual([])
}, 120_000)

test("the compact CTA in the passkey ceremony dialog holds its role and box", async ({ freshExtensionPerTest: ctx }) => {
	const page = await openPopup(ctx)
	const auth = await setupPasskeyVirtualAuth(ctx.browser, page)
	try {
		await openPasskeyRegister(page)
		const release = await holdNextPasskeyRequest(page)
		try {
			await openAndSweep(page, "register-submit-btn", "passkey-ceremony-dialog", "passkey ceremony")
			await expectButtons(page, "passkey-ceremony-cancel")
		} finally {
			await release()
		}
		await waitForHash(page, "#/popup/general", 60_000)
	} finally {
		await auth.cleanup()
	}
	expect(ctx.pageErrors).toEqual([])
}, 180_000)

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
