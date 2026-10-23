import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Page } from "puppeteer"
import { expect, test } from "vitest"
import { isValidAztecAddress } from "@/utils/aztec-address"
import { feePicksKey, pinnedTokensKey, sendFeePicksKey } from "@/utils/profile-ui-keys"
import { ensureUnlocked } from "./fixtures/auth"
import { BROWSER } from "./fixtures/browser"
import { type ExtensionContext, launchExtension, openPopup, registerProfile, waitForHash } from "./fixtures/extension"
import { addContact, getAccountAddress, navigateByHash, navigateToSettings, readActiveNetwork } from "./fixtures/helpers"
import { pollUntil } from "./fixtures/poll"
import { callService } from "./fixtures/session"

/**
 * Contacts, dApp sessions and the popup's pins and fee picks sealed at rest, in a real browser. The
 * failure mode: a real MV3 service worker (or Firefox event page) doing WebCrypto over storage
 * persisted on disk, across a cold boot that comes back locked, and over the structured values an
 * earlier build stored the preference maps as. The composition layer runs the same services with
 * real WebCrypto under Bun, but fakes the worker, the browser's storage and the boot, so it cannot
 * prove this.
 *
 * Also times, on each browser, sealing 2 000 plaintext contact rows, 500 journal records and 2 000
 * balance rows, and the contacts list, the activity page's journal read and Home's balance read
 * (median of 5 each) over those rows plaintext and then sealed, printed as one `[sealed-storage]`
 * line. With `NULO_E2E_HOME_TIMING=1`, a second case times popup open → Home ready and Home's first
 * contentful paint over a profile holding the three preference maps, on whichever build the run
 * loads, so the same file times a base build (`EXTENSION_PATH`) and the candidate.
 */

const MARKER = "SEAL-MARKER"
const ROOTS = ["nulo:core:contacts", "nulo:core:dappSessions"]
const MARKED_ROOTS = [...ROOTS, "nulo:journal"]
const SEEDED = 2_000
const JOURNAL_SEEDED = 500
const BALANCES_SEEDED = 2_000
const BALANCE_ROOT = "nulo:core:token-balances"
/** Above any id the profile's own token rows take, so no seeded balance row names a live token. */
const FIRST_SEEDED_TOKEN = 100_000
const LOADS = 5

function validAddress(): string {
	for (;;) {
		let hex = ""
		while (hex.length < 64) hex += Math.floor(Math.random() * 16).toString(16)
		if (isValidAztecAddress(`0x${hex}`)) return `0x${hex}`
	}
}

/** Every stored value under `roots`, as an at-rest reader sees it. */
function sealedRootValues(page: Page, roots = ROOTS): Promise<string[]> {
	return page.evaluate(async (names: string[]) => {
		const all = await chrome.storage.local.get()
		return Object.entries(all)
			.filter(([key]) => names.some((root) => key.startsWith(`${root}@`)))
			.map(([, value]) => String(value))
	}, roots)
}

const carriesMarker = async (page: Page) => (await sealedRootValues(page, MARKED_ROOTS)).filter((value) => value.includes(MARKER)).length

/** Writes `SEEDED` contacts, `JOURNAL_SEEDED` failed transfers, `BALANCES_SEEDED` balance rows of
 *  `account` and one dApp session as the plaintext rows a build that did not seal stored, all for
 *  `profileId`. Each transfer failed before it was sent, with a kind no journal cap evicts. Each
 *  balance row names a token id no token holds, which Home's read drops and no reconcile deletes. */
async function seedPlaintext(page: Page, profileId: string, address: string, account: string): Promise<void> {
	const items: Record<string, string> = {}
	for (let i = 0; i < SEEDED; i++) {
		const id = `seeded-${i}`
		items[`nulo:core:contacts@${id}`] = JSON.stringify({ id, profileId, name: `${MARKER} ${i}`, address, abbr: "SM" })
	}
	const session = {
		id: "seeded-session",
		profileId,
		chainId: "1",
		dappMetadata: { name: MARKER, url: "https://seal-marker.example" },
		permissions: [],
		accounts: [],
		confirmationLevel: 0,
		expiry: Date.now() + 86_400_000,
	}
	items["nulo:core:dappSessions@seeded-session"] = JSON.stringify(session)
	const at = Date.now()
	for (let i = 0; i < JOURNAL_SEEDED; i++) {
		const id = `seeded-journal-${i}`
		items[`nulo:journal@${id}`] = JSON.stringify({
			id,
			kind: "transfer",
			origin: "popup",
			profileId,
			progress: { stage: "failed", from: "proving" },
			error: { kind: "session_ended", message: "Session ended", normalizedRaw: null },
			terminalAt: at,
			attempts: 1,
			createdAt: at,
			updatedAt: at,
			accountAddress: address,
			title: `${MARKER} ${i}`,
		})
	}
	for (let i = 0; i < BALANCES_SEEDED; i++) {
		const id = FIRST_SEEDED_TOKEN + i
		items[`${BALANCE_ROOT}@${id}`] = JSON.stringify({
			id,
			token: id,
			account,
			profileId,
			chainId: 1,
			contract: address,
			publicBalance: "1000000",
			privateBalance: "2000000",
			updatedAt: at,
		})
	}
	await page.evaluate((rows: Record<string, string>) => chrome.storage.local.set(rows), items)
}

type PreferenceMaps = { pins: Record<string, string[]>; app: Record<string, unknown>; send: Record<string, unknown> }

/** The pins and fee picks of `account`, as structured values, the form a build that did not seal
 *  them stored. */
const preferenceMaps = (account: string, contract: string): PreferenceMaps => ({
	pins: { "1": [contract.toLowerCase()] },
	app: { [account]: { type: "fpc", title: MARKER, fpc: { id: "seeded-fpc", isProtocol: false } } },
	send: { [account]: { private: { type: "fj" } } },
})

const preferenceKeys = (profileId: string) => [pinnedTokensKey(profileId), feePicksKey(profileId), sendFeePicksKey(profileId)]

async function seedPreferences(page: Page, profileId: string, maps: PreferenceMaps): Promise<void> {
	const [pins, app, send] = preferenceKeys(profileId)
	await page.evaluate((items: Record<string, unknown>) => chrome.storage.local.set(items), {
		[pins]: maps.pins,
		[app]: maps.app,
		[send]: maps.send,
	})
}

const SELECTED = "nulo:ui:selectedAccount@device"
const BARE_SELECTED = "nulo:ui:activeAccount"

/** The selection as a build that did not seal it stored it: a bare address, no device row. */
async function seedPreSealSelection(page: Page, account: string): Promise<void> {
	await page.evaluate(
		async (sealed: string, bare: string, address: string) => {
			await chrome.storage.local.remove(sealed)
			await chrome.storage.local.set({ [bare]: address })
		},
		SELECTED,
		BARE_SELECTED,
		account,
	)
}

const storedSelection = (page: Page) =>
	page.evaluate(
		async (keys: string[]) => {
			const all = await chrome.storage.local.get(keys)
			return keys.map((key) => all[key])
		},
		[SELECTED, BARE_SELECTED],
	)

const storedPreferences = (page: Page, profileId: string) =>
	page.evaluate(async (keys: string[]) => {
		const all = await chrome.storage.local.get(keys)
		return keys.map((key) => all[key])
	}, preferenceKeys(profileId))

/** How many balance rows are stored, and how many of them are plaintext. */
const balanceRows = (page: Page) =>
	page.evaluate(async (root: string) => {
		const values = Object.entries(await chrome.storage.local.get())
			.filter(([key]) => key.startsWith(`${root}@`))
			.map(([, value]) => String(value))
		return { stored: values.length, plaintext: values.filter((value) => value.includes('"publicBalance"')).length }
	}, BALANCE_ROOT)

type ListRead = (page: Page) => Promise<unknown[]>
const contactList: ListRead = (page) => callService<unknown[]>(page, "contact", "getContacts")
/** The activity page's read of the profile's finished operations. */
const activityList =
	(profileId: string): ListRead =>
	(page) =>
		callService<unknown[]>(page, "operation-journal", "getOperations", [{ profileId, isTerminal: true }])
/** Home's read of the active account's balances. */
const homeBalances =
	(account: string): ListRead =>
	(page) =>
		callService<unknown[]>(page, "token-balance", "getTokenBalances", [undefined, account])

/** The median round trip, in ms, of `LOADS` list reads after one unmeasured read, from a popup
 *  opened for them, with no other popup open, so both samples come from the same page state; each
 *  must return `count` rows. */
async function listLoadMs(ctx: ExtensionContext, read: ListRead, count: number): Promise<number> {
	const page = await openPopup(ctx)
	try {
		await read(page)
		const times: number[] = []
		for (let i = 0; i < LOADS; i++) {
			const started = performance.now()
			const rows = await read(page)
			times.push(performance.now() - started)
			expect(rows).toHaveLength(count)
		}
		return times.sort((a, b) => a - b)[Math.floor(LOADS / 2)] ?? Number.NaN
	} finally {
		await page.close()
	}
}

test("sealed storage: a new contact is written sealed, plaintext rows outlive a locked cold boot, and the unlock seals them", async () => {
	const profileDir = mkdtempSync(join(tmpdir(), "nulo-e2e-sealed-"))
	let ctx: ExtensionContext = await launchExtension({ userDataDir: profileDir })
	try {
		await registerProfile(ctx)
		let page = await openPopup(ctx)
		await waitForHash(page, "#/popup/general", 30_000)
		const address = validAddress()

		await navigateToSettings(page, "contacts")
		await addContact(page, `${MARKER} ui`, address)
		expect(await sealedRootValues(page)).toHaveLength(1)
		expect(await carriesMarker(page)).toBe(0)
		expect((await sealedRootValues(page)).join()).not.toContain(address.slice(2))

		const profile = await callService<{ id: string }>(page, "profile", "getActiveProfile")
		const account = await getAccountAddress(page)
		const finished = (await activityList(profile.id)(page)).length
		const held = (await homeBalances(account)(page)).length
		const ownBalances = (await balanceRows(page)).stored
		await seedPlaintext(page, profile.id, address, account)
		const maps = preferenceMaps(account, address)
		await seedPreferences(page, profile.id, maps)
		await seedPreSealSelection(page, account)
		await page.close()
		const plaintextLoad = await listLoadMs(ctx, contactList, SEEDED + 1)
		const plaintextActivity = await listLoadMs(ctx, activityList(profile.id), finished + JOURNAL_SEEDED)
		const plaintextHome = await listLoadMs(ctx, homeBalances(account), held)
		await ctx.close()

		ctx = await launchExtension({ userDataDir: profileDir })
		page = await openPopup(ctx)
		expect(await carriesMarker(page)).toBe(SEEDED + 1 + JOURNAL_SEEDED)
		expect((await balanceRows(page)).plaintext).toBeGreaterThanOrEqual(BALANCES_SEEDED)
		expect(await storedPreferences(page, profile.id)).toEqual([maps.pins, maps.app, maps.send])
		expect(await storedSelection(page)).toEqual([undefined, account])

		await ensureUnlocked(page)
		const unlocked = performance.now()
		await page.waitForFunction(
			async (roots: string[], marker: string) => {
				const all = await chrome.storage.local.get()
				return !Object.entries(all).some(
					([key, value]) => roots.some((root) => key.startsWith(`${root}@`)) && String(value).includes(marker),
				)
			},
			{ timeout: 120_000, polling: 250 },
			MARKED_ROOTS,
			MARKER,
		)
		await page.waitForFunction(
			async (root: string) =>
				!Object.entries(await chrome.storage.local.get()).some(
					([key, value]) => key.startsWith(`${root}@`) && String(value).includes('"publicBalance"'),
				),
			{ timeout: 120_000, polling: 250 },
			BALANCE_ROOT,
		)
		await page.waitForFunction(
			async (keys: string[], hex: string) => {
				const all = await chrome.storage.local.get(keys)
				return keys.every((key) => typeof all[key] === "string" && !(all[key] as string).toLowerCase().includes(hex))
			},
			{ timeout: 120_000, polling: 250 },
			preferenceKeys(profile.id),
			account.slice(2).toLowerCase(),
		)
		const conversion = performance.now() - unlocked
		expect(await callService(page, "ui-preference", "getPinnedTokens", [profile.id])).toEqual(maps.pins)
		expect(await callService(page, "ui-preference", "getFeePicks", [profile.id])).toEqual({ app: maps.app, send: maps.send })
		// Home's boot moves the bare selection into the sealed device row and opens on it.
		const [sealedSelection, bareSelection] = await pollUntil(
			() => storedSelection(page),
			([sealed, bare]) => typeof sealed === "string" && bare === undefined,
			{ label: "the pre-seal selection moved into the sealed device row", timeoutMs: 60_000, intervalMs: 250 },
		)
		expect(bareSelection).toBeUndefined()
		expect(String(sealedSelection).toLowerCase()).not.toContain(account.slice(2).toLowerCase())
		expect(await callService(page, "ui-preference", "getSelectedAccount", [profile.id])).toBe(account)
		expect((await balanceRows(page)).stored).toBeGreaterThanOrEqual(ownBalances + BALANCES_SEEDED)
		await waitForHash(page, "#/popup/general", 30_000)

		// By hash: the page it lands on mounts 2 001 rows, longer than a nav click's own wait allows.
		await navigateByHash(page, "#/popup/settings/contacts", 30_000)
		await page.waitForFunction(
			(n: number) => document.querySelectorAll('[data-testid="contact-row"]').length === n,
			{ timeout: 60_000 },
			SEEDED + 1,
		)
		await page.close()
		const sealedLoad = await listLoadMs(ctx, contactList, SEEDED + 1)
		const sealedActivity = await listLoadMs(ctx, activityList(profile.id), finished + JOURNAL_SEEDED)
		const sealedHome = await listLoadMs(ctx, homeBalances(account), held)

		console.log(
			`[sealed-storage] ${BROWSER}: sealed ${SEEDED + JOURNAL_SEEDED + BALANCES_SEEDED} rows in ${Math.round(conversion)} ms; contacts list load median ${Math.round(plaintextLoad)} ms plaintext, ${Math.round(sealedLoad)} ms sealed; activity load median ${Math.round(plaintextActivity)} ms plaintext, ${Math.round(sealedActivity)} ms sealed; Home balance load median ${Math.round(plaintextHome)} ms plaintext, ${Math.round(sealedHome)} ms sealed`,
		)
		expect(ctx.pageErrors).toEqual([])
	} finally {
		try {
			await ctx.close()
		} finally {
			rmSync(profileDir, { recursive: true, force: true })
		}
	}
}, 300_000)

/** Home is ready once its hero shows a figure or its unknown mark and the token list has settled. */
async function homeReady(page: Page): Promise<void> {
	await waitForHash(page, "#/popup/general", 30_000)
	await page.waitForFunction(
		() =>
			document.querySelector('[data-testid="balance-hero-loading"]') === null &&
			document.querySelector('[data-testid="balance-amount"], [data-testid="balance-hero-unknown"]') !== null &&
			document.querySelector('[data-testid="tokens-list"]')?.getAttribute("data-settled") === "true",
		{ timeout: 30_000, polling: 16 },
	)
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? Number.NaN

/** Median, over `LOADS` popup opens after one unmeasured open, of open → Home ready and of Home's
 *  first contentful paint, each from a popup opened alone. */
async function homeOpenMs(ctx: ExtensionContext): Promise<{ ready: number; paint: number }> {
	const ready: number[] = []
	const paint: number[] = []
	for (let i = 0; i <= LOADS; i++) {
		const started = performance.now()
		const page = await openPopup(ctx)
		try {
			await homeReady(page)
			const elapsed = performance.now() - started
			const fcp = await page.evaluate(() => performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? Number.NaN)
			if (i === 0) continue
			ready.push(elapsed)
			paint.push(fcp)
		} finally {
			await page.close()
		}
	}
	return { ready: median(ready), paint: median(paint) }
}

test.skipIf(process.env.NULO_E2E_HOME_TIMING !== "1")(
	"Home's open, over a profile holding pins and fee picks, timed on the build the run loads",
	async () => {
		const profileDir = mkdtempSync(join(tmpdir(), "nulo-e2e-home-timing-"))
		let ctx: ExtensionContext = await launchExtension({ userDataDir: profileDir })
		try {
			await registerProfile(ctx)
			let page = await openPopup(ctx)
			await waitForHash(page, "#/popup/general", 30_000)
			const profile = await callService<{ id: string }>(page, "profile", "getActiveProfile")
			// A fresh profile opens on its first account; the base build has no preference service.
			const { chainId } = await readActiveNetwork(page)
			const [first] = await callService<Array<{ address: string }>>(page, "account", "getAccounts", [profile.id, chainId, true])
			await seedPreferences(page, profile.id, preferenceMaps(first.address, validAddress()))
			await page.close()
			await ctx.close()

			ctx = await launchExtension({ userDataDir: profileDir })
			page = await openPopup(ctx)
			await ensureUnlocked(page)
			await homeReady(page)
			await page.close()
			const { ready, paint } = await homeOpenMs(ctx)
			console.log(
				`[sealed-storage] ${BROWSER}: Home open to ready median ${Math.round(ready)} ms, first contentful paint median ${Math.round(paint)} ms`,
			)
			expect(ctx.pageErrors).toEqual([])
		} finally {
			try {
				await ctx.close()
			} finally {
				rmSync(profileDir, { recursive: true, force: true })
			}
		}
	},
	180_000,
)
