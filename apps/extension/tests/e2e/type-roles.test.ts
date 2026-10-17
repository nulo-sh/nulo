/**
 * The type roles reach a real page: one probe per role computes to its record, the site reader
 * judges the element it should, the faces they ask for load, History's hero title takes
 * `title-hero` through its composed module rule, every page the smoke suite sweeps holds its roles
 * and its identifier sites, as do the native fields and each `Button` variant and size in today's
 * box, no figure on any of them loses a digit to a clip or an ellipsis, and in Firefox's real
 * toolbar panel the role-bearing text neither clips nor moves the layout.
 */
import { typeRoleNames, typeRoles } from "@nulo/design/tokens"
import type { Page } from "puppeteer"
import { describe, expect, vi } from "vitest"
import { extensionUrl, FIREFOX_ONLY, isFirefox, stopBackground } from "./fixtures/browser"
import { evaluateInActionPopup, openActionPopup } from "./fixtures/browser/firefox-action-popup"
import { clickByTestId, type ExtensionContext, openOnboarding, openPopup, replaceInputValue, test, waitForHash } from "./fixtures/extension"
import {
	addContact,
	clickNavTab,
	closeStuckPopup,
	ensureUnlocked,
	lockWallet,
	navigateByHash,
	navigateToSettings,
	openHoldings,
	openNetworkDetail,
	readSessionRow,
	setDeveloperMode,
	unlockAfterBackgroundDeath,
} from "./fixtures/helpers"
import { holdNextPasskeyRequest, openPasskeyRegister, setupPasskeyVirtualAuth } from "./fixtures/passkey"
import { settleClosedPopup } from "./fixtures/popup-leave"
import {
	checkFontFaces,
	clearTypeRoleProbes,
	coverageOf,
	expectSitesClean,
	expectSweepClean,
	firstFamily,
	type IdentifierObservation,
	identifierSites,
	judgeTypography,
	observeIdentifierSites,
	type PageTypography,
	panelBodies,
	PROBE_TEXT,
	placeTypeRoleProbes,
	readHexOutsideMono,
	readPageTypography,
	type SiteEntry,
	siteSuite,
	sweepTypeRoles,
	type TypeReading,
	withBlockedAccount,
} from "./fixtures/type-roles"
import { skipUnlessListPrices } from "./fixtures/token-list"
import {
	type ActivityScope,
	readActivityScope,
	seedArrivalRow,
	seedJournalRecord,
	seedPublicReceipt,
	seedTokenImport,
	seedTokenRow,
	seedTransaction,
} from "./helpers/activity-seeds"
import { exportAccountBody, FIRST_ACCOUNT_NAME, previewImport } from "./helpers/account-io"
import { seedAuthwits } from "./helpers/authwit-seeds"
import { closeImportWith, contactsFiles, pickContactsFile, refuseTestnet } from "./helpers/contacts"
import { seedFpcs, seedProtocolFpcs } from "./helpers/fpc-seeds"
import { pressEscape } from "./helpers/pointer-probes"
import { seedStaleNetwork, takeoverScreen } from "./helpers/stale-network"

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
		<input class="type--input" data-testid="tr-mini-input" value="12" />
		<input class="type--input-data" data-testid="tr-mini-data" value="0x1a" />
	</div>
	<div data-testid="tr-field"><span class="type--label">To</span><input class="type--input-data" value="0x1a" /></div>
	<span class="type--name" data-testid="tr-name" data-address-shows="name">Alice</span>
	<span class="type--data" data-testid="tr-twin">0x1a</span>
	<span class="type--meta" data-testid="tr-twin" hidden>0x1a</span>
	<span class="type--data" data-testid="tr-gone" hidden>0x1a</span>`

const fixtureSite = (selector: string, role: SiteEntry["role"]): SiteEntry => ({
	file: "fixture.vue",
	expression: selector,
	branch: "",
	ordinal: 0,
	role,
	selector,
	surface: "fixture",
	state: "fixture",
})

test("a site reads its value or its native field, a name shown is judged as name, a hidden match is never read, an override holds only its role in its scope", async ({
	registeredExtension: ctx,
}) => {
	const page = await openHome(ctx)
	await page.evaluate((html: string) => {
		const host = document.createElement("div")
		host.setAttribute("data-testid", "tr-host")
		host.innerHTML = html
		// Through the CSSOM: `style-src` refuses a parsed `style` attribute.
		for (const id of ["tr-mini-input", "tr-mini-data"]) {
			const input = host.querySelector(`[data-testid="${id}"]`)
			if (!(input instanceof HTMLElement)) throw new Error(`the fixture has no ${id}`)
			input.style.fontSize = "12px"
		}
		document.body.appendChild(host)
	}, FIXTURE_HTML)
	try {
		const failures = judgeTypography(await readPageTypography(page, { kind: "at", selector: '[data-testid="tr-host"] input' }))
		expect(failures.map(({ testid, property }) => `${testid} ${property}`)).toEqual(["tr-mini-data font-size"])

		const sites = ["tr-field", "tr-name", "tr-twin", "tr-gone"].map((testid, i) =>
			fixtureSite(testid, (["input-data", "data-lead", "data", "data"] as const)[i]),
		)
		const { sites: observed } = await observeIdentifierSites(page, "fixture", "fixture", { sites })
		expect(observed.map(({ readings }) => readings.map(({ roles }) => roles.join(" ")))).toEqual([
			["input-data"],
			["name"],
			["data"],
			[],
		])
		expect(observed.flatMap(({ failures }) => failures.map(({ property, actual }) => `${property}: ${actual}`))).toEqual([
			"selector: 1 hidden",
		])
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

const VISIBLE = { visible: true, timeout: 15_000 } as const
/** Every seeded hash and field is wire-shaped: 0x and 64 hex under the field modulus. */
const TX_HASH = `0x1e${"5e".repeat(31)}`
/** About 123 trillion of the scope's token: at $1, a figure Home's fit draws only below full size. */
const longBalance = (decimals: number) => `123456789012345${"678901234567890123456789".slice(0, decimals)}`
/** Wire-shaped: 0x and 64 hex, the x coordinate of a Grumpkin point. */
const RECIPIENT = "0x09c1c9d2ce72c53c2451f8e9add86ccb8cb284dd4dc4f0eaf301b40b38a9459b"
const BLOCK = { number: 42, hash: `0x0b${"4e".repeat(31)}` }
const CHUNK_NONCE = `0x0c${"5a".repeat(31)}`
/** The fee lookup parses a receipt's tx hash before it reaches the node. */
const RECEIPT_TX_HASH = `0x${"1d".repeat(32)}`
/** On the curve, as a contract's address is. */
const IMPORT_CONTRACT = `0x0a${"6b".repeat(31)}`
/** 16 hex, as the journal mints its ids. */
const JOURNAL_ID = "a1b2c3d4e5f60718"
const IMPORT_ID = "0f1e2d3c4b5a6978"

type SiteState = readonly [surface: string, state: string]

const SEEDED_TX = "the seedTransaction row"
const WITH_EXPLORER = "on the testnet chain with an explorer"
const WITHOUT_EXPLORER = "without an explorer"
const RECEIPT = "a seedReceipt note"
const PUBLIC_RECEIPT = "a public seedReceipt note with a block number"
const JOURNAL = "a journal operation with a recipient"
const DEBUG_PANEL = "Developer mode on, the debug toggle clicked"
const AUTHWITS = "popup-settings-developer-account-state-authwits"
const AUTHWITS_ROUTE = "#/popup/settings/developer/account-state/authwits"

/** Every state this file observed whose sites passed; the coverage test reads it last. */
const observed: IdentifierObservation[] = []

/**
 * A person reads these to the digit, so none may lose one: not to its own clip or ellipsis, nor to
 * an ancestor's. An unpriced token row shows its contract-supplied name in the fiat line's place,
 * clipped on purpose.
 */
const FIGURE_ROLES = new Set(["amount-hero", "amount-total", "amount-row", "amount-detail", "fiat"])

const cutFigures = (readings: readonly TypeReading[]) =>
	readings
		.filter(
			(reading) =>
				reading.visible &&
				reading.roles.some((role) => FIGURE_ROLES.has(role)) &&
				reading.testid !== "token-name" &&
				(reading.clippedBy !== null ||
					reading.ellipsizedBy !== null ||
					(reading.overflowX !== "visible" && reading.scrollWidth > reading.clientWidth)),
		)
		.map(({ testid, text, scrollWidth, clientWidth, clippedBy, ellipsizedBy }) => ({
			testid,
			text,
			scrollWidth,
			clientWidth,
			clippedBy,
			ellipsizedBy,
		}))

/**
 * The faces and roles of the page as it stands, then the identifier sites and hex text of each
 * state it renders, or the hex text alone when it names no state.
 */
async function expectPageClean(page: Page, label: string, states: readonly SiteState[] = []): Promise<void> {
	const sweep = await sweepTypeRoles(page)
	expectSweepClean(sweep, label)
	expect(cutFigures(sweep.readings), `${label}: figures cut`).toEqual([])
	for (const [surface, state] of states) {
		const observation = await observeIdentifierSites(page, surface, state)
		expectSitesClean(observation)
		observed.push(observation)
	}
	if (states.length === 0) expect(await readHexOutsideMono(page), `${label}: hex outside a mono role`).toEqual([])
}

/** Holdings' offer to add a pasted address no row holds: the address in `data`, inside the button's box. */
async function expectAddTokenOffer(page: Page): Promise<void> {
	await replaceInputValue(page, sel("holdings-search"), RECIPIENT)
	await page.waitForSelector(sel("holdings-add-token-address"), VISIBLE)
	await expectPageClean(page, "Holdings add-token", [["popup-holdings", "a pasted address no listed token matches"]])
	// The label's text, not its box: under `nowrap` text can run past a box that fits, and the button clips it.
	const fit = await page.$eval(sel("holdings-add-token-address"), (address) => {
		const button = address.closest("button") as HTMLElement
		const pad = getComputedStyle(button)
		const outer = button.getBoundingClientRect()
		const start = outer.left + button.clientLeft + Number.parseFloat(pad.paddingLeft)
		const end = outer.left + button.clientLeft + button.clientWidth - Number.parseFloat(pad.paddingRight)
		const range = document.createRange()
		range.selectNodeContents(address.parentElement as HTMLElement)
		const text = range.getBoundingClientRect()
		return { width: text.width, room: end - start, inset: Math.min(text.left - start, end - text.right) }
	})
	console.log(`[type-roles] holdings add-token label ${fit.width}px in ${fit.room}px, inset ${fit.inset}px`)
	expect(fit.inset).toBeGreaterThanOrEqual(0)
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
 * Seeds a token row, its long private balance, a quote, a transfer to an outside address in a
 * block, a public receipt the feed has seen, a send's failed record and an authwit of every kind but
 * the encoded call, then restarts the background: the balance service reads its token map only as
 * it starts. The caller holds the Testnet RPC refused, or a balance refresh writes the real zero
 * over the seed.
 */
async function openSeededHome(ctx: ExtensionContext): Promise<{ page: Page; scope: ActivityScope; receipt: string }> {
	const seeder = await openHome(ctx)
	await seeder
		.waitForFunction(() => document.querySelector('[data-testid="tokens-list"]')?.getAttribute("data-settled") === "true", {
			timeout: 30_000,
		})
		.catch(() => undefined)
	const scope = await readActivityScope(seeder, { priced: true })
	const priceId = scope.token.priceId
	if (priceId === undefined) throw new Error("the held list prices no token on this chain")
	await seedTokenRow(seeder, scope, 1)
	await seedTransaction(seeder, scope, { hash: TX_HASH, amount: "1500000", to: RECIPIENT, block: BLOCK, chunkNonce: CHUNK_NONCE })
	const receipt = await seedPublicReceipt(seeder, scope, { tokenId: 1, amount: "2500000", txHash: RECEIPT_TX_HASH })
	await seedArrivalRow(seeder, scope)
	await seedJournalRecord(seeder, scope, {
		id: JOURNAL_ID,
		tokenId: 1,
		amount: "700000",
		progress: { stage: "failed", from: "simulating" },
		errorKind: "transfer",
	})
	await seedAuthwits(seeder, scope, ["call", "intent", "message_hash"])
	await seeder.evaluate((items: Record<string, string>) => chrome.storage.local.set(items), {
		"nulo:core:token-balances@1": JSON.stringify({
			id: 1,
			token: 1,
			account: scope.account,
			profileId: scope.profileId,
			chainId: scope.chainId,
			contract: scope.token.contract,
			publicBalance: "0",
			privateBalance: longBalance(scope.token.decimals),
			updatedAt: Date.now(),
		}),
		"nulo:core:token-prices": JSON.stringify({
			[priceId]: { coingeckoId: priceId, usd: 1, fetchedAt: Date.now(), providerUpdatedAt: null },
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
	return { page, scope, receipt }
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

type FittedHero = {
	family: string
	weight: string
	fontSize: number
	letterSpacing: number
	scale: number
	symbolLetterSpacing: number | null
	overflow: number
}

/**
 * The visible figure, not its container or the hidden ruler: the em tracking must compute at the
 * fitted size. Only a token's page draws the symbol, which must inherit the figure's px tracking, not
 * recompute it at its half size; that page refreshes on entry and the seed does not survive, so its
 * figure may stand at full size.
 */
async function expectHero(page: Page, onTokenPage: boolean): Promise<void> {
	const hero = await page.$eval(sel("balance-amount"), (amount): FittedHero | null => {
		const fit = [...amount.children].find(
			(el): el is HTMLElement => el instanceof HTMLElement && el.style.getPropertyValue("--hero-scale") !== "",
		)
		if (!fit) return null
		const style = getComputedStyle(fit)
		const symbol = fit.querySelector("span")
		return {
			family: style.fontFamily,
			weight: style.fontWeight,
			fontSize: Number.parseFloat(style.fontSize),
			letterSpacing: Number.parseFloat(style.letterSpacing),
			scale: Number.parseFloat(fit.style.getPropertyValue("--hero-scale")),
			symbolLetterSpacing: symbol ? Number.parseFloat(getComputedStyle(symbol).letterSpacing) : null,
			overflow: amount.scrollWidth - amount.clientWidth,
		}
	})
	console.log(`[type-roles] fitted hero: ${JSON.stringify(hero)}`)
	expect(hero).not.toBeNull()
	const fitted = hero as FittedHero
	expect(fitted.scale).toBeGreaterThan(0)
	if (onTokenPage) expect(fitted.scale).toBeLessThanOrEqual(1)
	else expect(fitted.scale).toBeLessThan(1)
	expect(firstFamily(fitted.family)).toBe("Space Grotesk")
	expect(fitted.weight).toBe("700")
	expect(Math.abs(fitted.letterSpacing / fitted.fontSize + 0.04)).toBeLessThanOrEqual(0.002)
	if (onTokenPage) expect(fitted.symbolLetterSpacing).toBeCloseTo(fitted.letterSpacing, 2)
	else expect(fitted.symbolLetterSpacing).toBeNull()
	expect(fitted.overflow).toBeLessThanOrEqual(0)
}

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

/** Closes the popup holding `inner` the way a person does, by Escape. */
async function closeByEscape(page: Page, inner: string): Promise<void> {
	expect(await pressEscape(page), `Escape over ${inner}`).toBe(true)
	await settleClosedPopup(page, inner)
}

/** Which forms the file's `AddressDisplay` readings took: the judge treats `name` and `address` apart. */
const addressForms = (): string[] =>
	[
		...new Set(
			observed.flatMap(({ sites }) => sites.flatMap(({ readings }) => readings.flatMap(({ addressShows }) => addressShows ?? []))),
		),
	].sort()

/** The seeded receipt's detail and the seeded send's record, with the explorer on or set to None. */
async function expectReceiptAndJournal(page: Page, receipt: string, explorer: boolean): Promise<void> {
	const tail = explorer ? WITH_EXPLORER : WITHOUT_EXPLORER
	// States no explorer branch decides, read once, on the visit with the explorer on.
	const once: SiteState[] = [
		["popup-received-id", RECEIPT],
		["popup-received-id", `${RECEIPT} from an address`],
	]
	await goAndSweep(page, `#/popup/received/${receipt}`, explorer ? "tx-explorer-link" : "tx-hash-copy", `received detail ${tail}`, [
		...(explorer ? once : []),
		["popup-received-id", `${RECEIPT} ${tail}`],
		["popup-received-id", `${PUBLIC_RECEIPT} ${tail}`],
	])
	const recipient = explorer ? "journal-detail-recipient-link" : "journal-detail-recipient"
	await goAndSweep(page, `#/popup/journal/${JOURNAL_ID}`, recipient, `journal detail ${tail}`, [
		["popup-journal-id", `${JOURNAL} ${tail}`],
	])
}

/** The token page's metadata popup, from its menu. */
async function expectTokenMetadata(page: Page): Promise<void> {
	await clickByTestId(page, "token-menu-trigger")
	await page.waitForSelector(sel("token-menu-metadata"), VISIBLE)
	await openAndSweep(page, "token-menu-metadata", "token-metadata-id", "token metadata", [["popup:token_metadata", ""]])
	await closeByEscape(page, "token-metadata-id")
}

/** Home again with a token import in flight, written after the worker's last start, then New token from its menu. */
async function expectImportAndNewToken(page: Page, scope: ActivityScope): Promise<void> {
	await seedTokenImport(page, scope, { id: IMPORT_ID, contract: IMPORT_CONTRACT })
	await goAndSweep(page, "#/popup/general", "token-import-spinner", "Home, an import in flight", [
		["popup-general", "a token import in flight whose token has no name"],
	])
	await clickByTestId(page, "tokens-menu-trigger")
	await page.waitForSelector(sel("tokens-menu-import"), VISIBLE)
	await openAndSweep(page, "tokens-menu-import", "token-address-input", "New token", [["popup:new_token", ""]])
	await closeByEscape(page, "token-address-input")
}

/**
 * With the explorer set to None, every value that was a link renders bare. Activity's row hash keeps
 * one testid on both branches, so its explorer action's absence proves which one was read.
 */
async function expectWithoutExplorer(page: Page, receipt: string): Promise<void> {
	await navigateByHash(page, "#/popup/general", 10_000)
	await navigateToSettings(page, "privacy")
	await clickByTestId(page, "explorer-trigger")
	await clickByTestId(page, "explorer-none-btn")
	await goAndSweep(page, `#/popup/tx/${TX_HASH}`, "tx-hash", `tx detail ${WITHOUT_EXPLORER}`, [
		["popup-tx-id", `${SEEDED_TX} ${WITHOUT_EXPLORER}`],
		["popup-tx-id", `${SEEDED_TX} with a block ${WITHOUT_EXPLORER}`],
	])
	expect(await page.$(sel("tx-hash-link"))).toBeNull()
	await goAndSweep(page, "#/popup/activity", "activity-row-hash", `Activity ${WITHOUT_EXPLORER}`, [
		["popup-activity", `${SEEDED_TX} ${WITHOUT_EXPLORER}`],
	])
	expect(await page.$(sel("activity-row-explorer"))).toBeNull()
	await expectReceiptAndJournal(page, receipt, false)
}

/** Developer mode's debug panel on the tx page, opened: the hash and the call's chunk nonce. */
async function expectTxDebugPanel(page: Page): Promise<void> {
	await setDeveloperMode(page, true)
	await navigateByHash(page, `#/popup/tx/${TX_HASH}`, 10_000)
	await page.waitForSelector(sel("tx-debug-toggle"), VISIBLE)
	await openAndSweep(page, "tx-debug-toggle", "tx-debug-chunk-nonce", "tx debug panel", [
		["popup-tx-id", `${SEEDED_TX}, ${DEBUG_PANEL}`],
		["popup-tx-id", `a call with a chunkNonce, ${DEBUG_PANEL}`],
	])
}

/**
 * One authwit record of each kind on the developer authwits page. The call and encoded-call kinds
 * show their caller under one testid, so the encoded call is stored and read on a second visit,
 * alone with its caller.
 */
async function expectAuthwits(page: Page, scope: ActivityScope): Promise<void> {
	await goAndSweep(page, AUTHWITS_ROUTE, "record-hash", "authwits", [
		[AUTHWITS, "a public authwit granted"],
		[AUTHWITS, "a backup restored with an intent authwit record"],
		[AUTHWITS, "a backup restored with a message_hash authwit record"],
	])
	expect(await page.$$(sel("record-caller"))).toHaveLength(1)
	await seedAuthwits(page, scope, ["encoded_call"])
	await navigateByHash(page, "#/popup/general", 10_000)
	await page.waitForSelector(sel("tokens-menu-trigger"), VISIBLE)
	await goAndSweep(page, AUTHWITS_ROUTE, "record-selector", "authwits, an encoded call", [
		[AUTHWITS, "a backup restored with an encoded_call authwit record"],
	])
	expect(await page.$$(sel("record-caller"))).toHaveLength(1)
}

/** From the lock screen: Testnet's row moved as a network reset moves it, the takeover, and its reset confirmation. */
async function expectStaleTakeover(page: Page): Promise<void> {
	await seedStaleNetwork(page, "network-reset")
	await ensureUnlocked(page)
	expect(await takeoverScreen(page)).toBe("network-reset")
	await openAndSweep(page, "stale-network-reset", "stale-confirm-account-address", "stale network confirmation", [
		["overlay:StaleNetworkTakeover", "A3 opened from A1 on a stale Testnet seeded by seedStaleNetwork"],
	])
}

test("a seeded wallet's Home, Holdings, Activity, its tx, receipt and send details with an explorer and without, token metadata, New token, Accounts, the debug panel, authwits, unlock and a stale takeover", async ({
	listedExtensionPerTest: ctx,
	skip,
}) => {
	skipUnlessListPrices(skip)
	const refusal = await refuseTestnet(ctx)
	try {
		const { page, scope, receipt } = await openSeededHome(ctx)
		await waitForFittedHero(page)
		await expectHero(page, false)
		await expectPageClean(page, "Home", [["overlay:Header", ""]])
		await expectRoleAt(page, "holdings-section-label", "label-section")
		await expectButtons(page, "tokens-menu-trigger")

		await openAndSweep(page, "actions-receive", "receive-address", "Receive", [["popup:receive", ""]])
		await expectButtons(page, "receive-close")
		await clickByTestId(page, "receive-close")
		await page.waitForSelector(sel("receive-address"), { hidden: true, timeout: 15_000 })

		await openHoldings(page)
		await expectPageClean(page, "Holdings")
		await expectAddTokenOffer(page)
		await clickNavTab(page, "activity")
		await waitForHash(page, "#/popup/activity")
		await page.waitForSelector(sel("activity-incoming-hash"), VISIBLE)
		await expectPageClean(page, "Activity", [
			["popup-activity", `${SEEDED_TX} ${WITH_EXPLORER}`],
			["popup-activity", RECEIPT],
		])
		expect(await page.$(sel("activity-row-explorer"))).not.toBeNull()
		await goAndSweep(page, `#/popup/tx/${TX_HASH}`, "tx-from-address", "tx detail", [
			["popup-tx-id", SEEDED_TX],
			["popup-tx-id", `${SEEDED_TX} ${WITH_EXPLORER}`],
			["popup-tx-id", `${SEEDED_TX} with a nonce`],
			["popup-tx-id", `${SEEDED_TX} with a user call`],
			["popup-tx-id", `${SEEDED_TX} with a block ${WITH_EXPLORER}`],
		])
		// The wallet's own account shows by name and the outside recipient by address.
		expect(addressForms()).toEqual(["address", "name"])
		const amounts = (await sweepTypeRoles(page)).readings.filter(({ roles }) => roles.includes("amount-detail"))
		expect(amounts.map(({ fontSize }) => fontSize)).toEqual(["24px"])
		await expectReceiptAndJournal(page, receipt, true)
		await navigateByHash(page, "#/popup/tokens/1", 10_000)
		await vi.waitFor(() => expectHero(page, true), { timeout: 15_000, interval: 500 })
		await expectTokenMetadata(page)

		await expectImportAndNewToken(page, scope)
		await page.waitForSelector(sel("account-avatar-btn"), VISIBLE)
		await openAndSweep(page, "account-avatar-btn", "account-item", "Accounts", [["popup:accounts", ""]])
		await closeByEscape(page, "account-item")

		await expectWithoutExplorer(page, receipt)
		await expectTxDebugPanel(page)
		await expectAuthwits(page, scope)
		await lockWallet(page)
		await page.waitForSelector(sel("auth-submit"), VISIBLE)
		await expectPageClean(page, "unlock")
		await expectRoleAt(page, "auth-password-input", "input", true)
		await expectButtons(page, "auth-submit")
		await expectStaleTakeover(page)
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
	await goAndSweep(page, "#/popup/settings/accounts", "manage-accounts-row", "Manage accounts", [["popup-settings-accounts", ""]])
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

/** Wire-shaped and on the curve, as a contact's address must be. */
const ALICE = "0x01904dba18e847d163097ce15dcd8597e763fb11fe19ef1273d266d6e959ec4a"
const ALICE_ELSEWHERE = "0x02056523b85ea4e550facca78516f7270f18bddb0f5474177d406f6bf0e58617"
const BOB = "0x048b29517cddb7566a05a2a292624eb2c5350dbe44350763cefe4c9207344c10"
/** A sponsor at an address on the curve that no protocol FPC holds, so its row offers Edit. */
const UNNAMED_FPC = { id: "e2e-unnamed-fpc", type: 1, address: `0x0d${"7c".repeat(30)}00` }
const FPC_ROW = `${sel("fpc-row")}[data-fpc-id="${UNNAMED_FPC.id}"]`

/** A saved contact in Contacts, then on Send: suggested for a partial name, chosen, revealed. */
async function expectContactOnSend(page: Page): Promise<void> {
	await navigateToSettings(page, "contacts")
	await page.waitForSelector(sel("contacts-new-btn"), VISIBLE)
	await addContact(page, "Alice", ALICE)
	await expectPageClean(page, "Contacts, a saved contact", [["popup-settings-contacts", "a saved contact"]])
	await goAndSweep(page, "#/popup/send", "send-destination-field", "Send")
	await replaceInputValue(page, `${sel("send-destination-field")} input`, "Ali")
	await page.waitForSelector(sel("recipient-suggestion-address"), VISIBLE)
	await expectPageClean(page, "Send, a contact suggested", [["popup-send", "a saved contact and a partial recipient typed"]])
	await expectRoleAt(page, "send-destination-field", "input-data", true)
	await openAndSweep(page, "recipient-suggestion-address", "recipient-card-masked", "Send, a recipient chosen", [
		["popup-send", "a chosen recipient"],
	])
	await openAndSweep(page, "recipient-card-reveal", "recipient-card-full-address", "Send, the recipient revealed", [
		["popup-send", "a chosen recipient with recipient-card-reveal clicked"],
	])
}

/** A contacts file naming the saved Alice at another address, and Bob, whom the book lacks. */
async function expectContactsImport(page: Page): Promise<void> {
	const files = contactsFiles()
	try {
		const file = files.write({
			version: 2,
			contacts: [
				{ name: "Alice", address: ALICE_ELSEWHERE },
				{ name: "Bob", address: BOB },
			],
		})
		await navigateByHash(page, "#/popup/settings/contacts", 10_000)
		await page.waitForSelector(sel("contacts-new-btn"), VISIBLE)
		await pickContactsFile(page, file)
		await expectPageClean(page, "contacts import", [
			["popup:import_contacts", "a new contact in the file"],
			["popup:import_contacts", "a saved Alice and a file naming Alice at another address (address-change)"],
		])
		await closeImportWith(page, "import-contacts-cancel")
	} finally {
		files.cleanup()
	}
}

/** An unnamed sponsor's FPC row and Edit popup, New FPC, New sender, the profile's id, Export's accounts. */
async function expectSettingsForms(page: Page): Promise<void> {
	await navigateByHash(page, "#/popup/settings/fpcs", 10_000)
	await page.waitForSelector(FPC_ROW, VISIBLE)
	await expectPageClean(page, "FPCs", [["popup-settings-fpcs", "a seeded FPC with no name"]])
	await page.$eval(`${FPC_ROW} ${sel("fpc-edit-btn")}`, (button) => (button as HTMLElement).click())
	await page.waitForSelector(sel("edit-fpc-address-input"), VISIBLE)
	await expectPageClean(page, "Edit FPC", [
		["popup:edit_fpc", ""],
		["popup:edit_fpc", "a seeded FPC with no name, opened for editing"],
	])
	await closeByEscape(page, "edit-fpc-address-input")
	await openAndSweep(page, "fpc-new-btn", "fpc-address-input", "New FPC", [["popup:new_fpc", ""]])
	await closeByEscape(page, "fpc-address-input")
	await goAndSweep(page, "#/popup/settings/developer/account-state/senders", "senders-add-btn", "Senders")
	await openAndSweep(page, "senders-add-btn", "new-sender-address-input", "New sender", [["popup:new_sender", ""]])
	await closeByEscape(page, "new-sender-address-input")
	await goAndSweep(page, "#/popup/settings/profile", "identity-id-value", "Profile", [["popup-settings-profile", ""]])
	await goAndSweep(page, "#/popup/settings/security/export/account", "export-account-row", "Export account", [
		["popup-settings-security-export-account", ""],
	])
}

/** A second account hidden from Manage accounts, then the first one's file previewed for import. */
async function expectHiddenAccountAndImport(page: Page): Promise<void> {
	await navigateByHash(page, "#/popup/settings/accounts", 10_000)
	await clickByTestId(page, "accounts-new-btn")
	await replaceInputValue(page, sel("account-name-input"), "Hidden")
	await clickByTestId(page, "new-account-submit")
	const row = `${sel("manage-accounts-row")}[data-account-name="Hidden"]`
	await page.waitForSelector(row, VISIBLE)
	await closeStuckPopup(page)
	await page.$eval(`${row} ${sel("account-hide")}`, (button) => (button as HTMLElement).click())
	await page.waitForSelector(`${sel("manage-accounts-hidden-row")}[data-account-name="Hidden"]`, VISIBLE)
	await expectPageClean(page, "Manage accounts, a hidden account", [["popup-settings-accounts", "a hidden account"]])
	const body = await exportAccountBody(page, FIRST_ACCOUNT_NAME, false)
	expect(await previewImport(page, body)).toMatch(/^0x/)
	await expectPageClean(page, "Import account, a file previewed", [
		["popup-settings-accounts-import", "an account file pasted into Import account"],
	])
}

test("a contact on Send and in Contacts, a contacts file, an unnamed FPC, New sender, the profile, a hidden account and an account file", async ({
	registeredExtensionPerTest: ctx,
}) => {
	const refusal = await refuseTestnet(ctx)
	try {
		const page = await openHome(ctx)
		const scope = await readActivityScope(page)
		await seedProtocolFpcs(page, scope)
		await seedFpcs(page, scope, [UNNAMED_FPC])
		await expectContactOnSend(page)
		await expectContactsImport(page)
		await expectSettingsForms(page)
		await expectHiddenAccountAndImport(page)
		expect(await refusal.failures()).toEqual([])
	} finally {
		await refusal.stop()
	}
	expect(ctx.pageErrors).toEqual([])
}, 240_000)

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
					(reading) =>
						reading.visible &&
						(reading.clippedBy !== null ||
							(reading.overflowX !== "visible" &&
								reading.scrollWidth > reading.clientWidth &&
								reading.textOverflow !== "ellipsis")),
				)
				expect(clipped, `${tab}: role-bearing text clipped without an ellipsis`).toEqual([])
				expect(cutFigures(typography.readings), `${tab}: figures cut in the panel`).toEqual([])
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

test("every identifier site the smoke suite owns was read in its role", ({ skip }) => {
	// The seeded test's precondition: without its states the count is not this file's to make.
	skipUnlessListPrices(skip)
	const sites = identifierSites().filter((site) => site.role !== "none")
	const coverage = coverageOf(observed, { sites: sites.filter((site) => siteSuite(site) === "smoke") })
	const live = (suite: ReturnType<typeof siteSuite>) => sites.filter((site) => !site.unreachable && siteSuite(site) === suite).length
	const unreachable = sites.filter((site) => site.unreachable).length
	console.log(
		`[type-roles] identifier sites: ${coverage.live} smoke-owned live, ${live("network")} network-owned, ${live("component")} component-test, ${unreachable} unreachable`,
	)
	// An AddressDisplay of the wallet's own account shows its name, so its address form goes unjudged.
	const forms = observed.flatMap(({ sites }) =>
		sites.flatMap(({ key, readings }) => readings.map(({ addressShows }) => [key, addressShows] as const)),
	)
	const nameOnly = [...new Set(forms.filter(([, form]) => form === "name").map(([key]) => key))].filter(
		(key) => !forms.some(([other, form]) => other === key && form === "address"),
	)
	console.log(`[type-roles] read only as a name: ${nameOnly.join(", ") || "none"}`)
	expect(coverage.live).toBeGreaterThan(0)
	expect(coverage.unobserved).toEqual([])
})
