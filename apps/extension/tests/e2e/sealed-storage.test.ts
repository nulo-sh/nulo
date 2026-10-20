import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Page } from "puppeteer"
import { expect, test } from "vitest"
import { isValidAztecAddress } from "@/utils/aztec-address"
import { ensureUnlocked } from "./fixtures/auth"
import { BROWSER } from "./fixtures/browser"
import { type ExtensionContext, launchExtension, openPopup, registerProfile, waitForHash } from "./fixtures/extension"
import { addContact, navigateByHash, navigateToSettings } from "./fixtures/helpers"
import { callService } from "./fixtures/session"

/**
 * Contacts and dApp sessions sealed at rest, in a real browser. The failure mode: a real MV3 service
 * worker (or Firefox event page) doing WebCrypto over storage persisted on disk, across a cold boot
 * that comes back locked. The composition layer runs the same services with real WebCrypto under
 * Bun, but fakes the worker, the browser's storage and the boot, so it cannot prove this.
 *
 * Also times, on each browser, sealing 2 000 plaintext contact rows and the contacts list load
 * (median of 5) over those rows plaintext and then sealed, printed as one `[sealed-storage]` line.
 */

const MARKER = "SEAL-MARKER"
const ROOTS = ["nulo:core:contacts", "nulo:core:dappSessions"]
const SEEDED = 2_000
const LOADS = 5

function validAddress(): string {
	for (;;) {
		let hex = ""
		while (hex.length < 64) hex += Math.floor(Math.random() * 16).toString(16)
		if (isValidAztecAddress(`0x${hex}`)) return `0x${hex}`
	}
}

/** Every stored value under the sealed roots, as an at-rest reader sees it. */
function sealedRootValues(page: Page): Promise<string[]> {
	return page.evaluate(async (roots: string[]) => {
		const all = await chrome.storage.local.get()
		return Object.entries(all)
			.filter(([key]) => roots.some((root) => key.startsWith(`${root}@`)))
			.map(([, value]) => String(value))
	}, ROOTS)
}

const carriesMarker = async (page: Page) => (await sealedRootValues(page)).filter((value) => value.includes(MARKER)).length

/** Writes `SEEDED` contacts and one dApp session as the plaintext rows a build that did not seal
 *  stored, all for `profileId`. */
async function seedPlaintext(page: Page, profileId: string, address: string): Promise<void> {
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
	await page.evaluate((rows: Record<string, string>) => chrome.storage.local.set(rows), items)
}

/** The median round trip, in ms, of `LOADS` contacts list reads after one unmeasured read, from a
 *  popup opened for them so both samples come from the same page state; each must return `count`
 *  rows. */
async function listLoadMs(ctx: ExtensionContext, count: number): Promise<number> {
	const page = await openPopup(ctx)
	try {
		await callService<unknown[]>(page, "contact", "getContacts")
		const times: number[] = []
		for (let i = 0; i < LOADS; i++) {
			const started = performance.now()
			const contacts = await callService<unknown[]>(page, "contact", "getContacts")
			times.push(performance.now() - started)
			expect(contacts).toHaveLength(count)
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
		await seedPlaintext(page, profile.id, address)
		const plaintextLoad = await listLoadMs(ctx, SEEDED + 1)
		await page.close()
		await ctx.close()

		ctx = await launchExtension({ userDataDir: profileDir })
		page = await openPopup(ctx)
		expect(await carriesMarker(page)).toBe(SEEDED + 1)

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
			ROOTS,
			MARKER,
		)
		const conversion = performance.now() - unlocked
		await waitForHash(page, "#/popup/general", 30_000)

		// By hash: the page it lands on mounts 2 001 rows, longer than a nav click's own wait allows.
		await navigateByHash(page, "#/popup/settings/contacts", 30_000)
		await page.waitForFunction(
			(n: number) => document.querySelectorAll('[data-testid="contact-row"]').length === n,
			{ timeout: 60_000 },
			SEEDED + 1,
		)
		const sealedLoad = await listLoadMs(ctx, SEEDED + 1)

		console.log(
			`[sealed-storage] ${BROWSER}: sealed ${SEEDED} rows in ${Math.round(conversion)} ms; list load median ${Math.round(plaintextLoad)} ms plaintext, ${Math.round(sealedLoad)} ms sealed`,
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
