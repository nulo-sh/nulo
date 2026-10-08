/**
 * Drives Settings → Contacts (the list, import and export) through the real UI and reads back what
 * the person sees and what the wallet stored. Every element is found by its test id; a row is told
 * apart by its own `data-contact-name`.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Page } from "puppeteer"
import { TESTNET_RPC_URL } from "@/wallet/constants/network-endpoints"
import { type ArmedInterception, interceptRpc, pickFile } from "../fixtures/browser"
import { clickByTestId, clickSelector, type ExtensionContext, withTimeoutMessage } from "../fixtures/extension"
import { settleClosedPopup } from "../fixtures/popup-leave"
import { armBackupDownloadCapture, readCapturedBackupDownload } from "./backup-export"

const sel = (testid: string) => `[data-testid="${testid}"]`
export const importRow = (name: string) => `${sel("import-contact-row")}[data-contact-name="${name}"]`
/** The contacts list's row for `name`. */
export const contactRow = (name: string) => `${sel("contact-row")}[data-contact-name="${name}"]`
/** The sender chip on the contacts list's row for `name`. */
export const senderChip = (name: string) => `${contactRow(name)} ${sel("contact-sender-chip")}`

/** Temp files for one spec; `cleanup` removes them. */
export function contactsFiles(): { write: (content: unknown) => string; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), "nulo-e2e-contacts-"))
	let count = 0
	return {
		write: (content) => {
			const path = join(dir, `contacts-${++count}.json`)
			writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content))
			return path
		},
		cleanup: () => rmSync(dir, { recursive: true, force: true }),
	}
}

/** Refuses the Testnet RPC for the rest of the launch: the Contacts page asks every network's PXE
 *  for its senders, and the export probes every network, so a run would otherwise depend on the
 *  public endpoint. Stop it before the launch closes. */
export function refuseTestnet(ctx: ExtensionContext): Promise<ArmedInterception> {
	return interceptRpc(ctx.browser, ctx.extensionId, new URL(TESTNET_RPC_URL).origin, { kind: "refuse" })
}

/** Picks `path` from the Contacts menu and waits for the popup's rows. */
export async function pickContactsFile(page: Page, path: string): Promise<void> {
	await clickByTestId(page, "contacts-menu-trigger")
	await page.waitForSelector(sel("contacts-menu-import"), { visible: true, timeout: 5_000 })
	await pickFile(page, () => clickByTestId(page, "contacts-menu-import"), path)
	await page.waitForSelector(sel("import-contact-row"), { visible: true, timeout: 15_000 })
}

/** Exports the book from the Contacts menu and returns the file as the wallet wrote it. */
export async function exportContactsFile(page: Page): Promise<string> {
	await clickByTestId(page, "contacts-menu-trigger")
	await page.waitForSelector(sel("contacts-menu-export"), { visible: true, timeout: 5_000 })
	await armBackupDownloadCapture(page, { gzip: false })
	await toastAfter(page, () => clickByTestId(page, "contacts-menu-export"), "Contacts exported successfully")
	return readCapturedBackupDownload(page)
}

export type ShownRow = { name: string; kind: string; selected: boolean }

/** The popup's rows in screen order, as the row elements state them. */
export function shownRows(page: Page): Promise<ShownRow[]> {
	return page.evaluate((s: string) => {
		return [...document.querySelectorAll(s)].map((el) => ({
			name: el.getAttribute("data-contact-name") ?? "",
			kind: el.getAttribute("data-row-kind") ?? "",
			selected: el.getAttribute("data-selected") === "true",
		}))
	}, sel("import-contact-row"))
}

/** Each shown section and the count its label states. */
export function sectionCounts(page: Page): Promise<Record<string, string>> {
	return page.evaluate((s: string) => {
		const counts: Record<string, string> = {}
		for (const section of document.querySelectorAll(s)) {
			const key = section.getAttribute("data-section") ?? ""
			counts[key] = section.querySelector(`[data-testid="import-contacts-${key}-count"]`)?.textContent?.trim() ?? ""
		}
		return counts
	}, sel("import-contacts-section"))
}

/** The popup's sender line as it reads, or null when it shows none. */
export function senderLine(page: Page): Promise<string | null> {
	return page.evaluate(
		(s: string) => document.querySelector(s)?.textContent?.replace(/\s+/g, " ").trim() ?? null,
		sel("import-contacts-senders"),
	)
}

/** Where keyboard focus is: an import row's target or edit button with its row's name, else the
 *  focused control's test id. */
export function focused(page: Page): Promise<string> {
	return page.evaluate(() => {
		const el = document.activeElement
		const testid = el?.closest("[data-testid]")?.getAttribute("data-testid") ?? el?.tagName ?? "none"
		const row = el?.closest('[data-testid="import-contact-row"]')?.getAttribute("data-contact-name")
		return row ? `${testid} ${row}` : testid
	})
}

export async function tabWalk(page: Page, stops: number): Promise<string[]> {
	const visited: string[] = []
	for (let i = 0; i < stops; i++) {
		await page.keyboard.press("Tab")
		visited.push(await focused(page))
	}
	return visited
}

export async function waitForSelected(page: Page, name: string, selected: boolean): Promise<void> {
	await withTimeoutMessage(
		page.waitForSelector(`${importRow(name)}${selected ? '[data-selected="true"]' : ":not([data-selected])"}`, { timeout: 5_000 }),
		async () =>
			`${name} never became ${selected ? "selected" : "unselected"}: rows ${JSON.stringify(await shownRows(page))}, focus on ${await focused(page)}`,
	)
}

/** Waits until keyboard focus is on the element `selector` finds. */
export async function waitForFocusOn(page: Page, selector: string): Promise<void> {
	await withTimeoutMessage(
		page.waitForFunction(
			(s: string) => document.activeElement === document.querySelector(s),
			{ timeout: 5_000, polling: 100 },
			selector,
		),
		async () => `focus is on ${await focused(page)}, not on ${selector}`,
	)
}

/** Waits until the native input with test id `testid` holds `value`: the edit form fills its
 *  inputs after it opens, and a value typed before that would be overwritten. */
export async function waitForInputValue(page: Page, testid: string, value: string): Promise<void> {
	await withTimeoutMessage(
		page.waitForFunction(
			(s: string, v: string) => document.querySelector<HTMLInputElement>(s)?.value === v,
			{ timeout: 10_000, polling: 100 },
			sel(testid),
			value,
		),
		async () =>
			`${testid} holds ${JSON.stringify(await page.evaluate((s: string) => document.querySelector<HTMLInputElement>(s)?.value ?? null, sel(testid)))}, not ${value}`,
	)
}

/** Presses a row on its target, the button that covers the row. A row that can't be imported keeps
 *  its target pressable (it explains itself), so this does not wait for an enabled one. */
export function pressRow(page: Page, name: string): Promise<void> {
	return clickSelector(page, `${importRow(name)} ${sel("import-contact-target")}`)
}

/** Presses the popup's Cancel or Import selected and waits for the popup to have closed. */
export async function closeImportWith(page: Page, testid: "import-contacts-submit" | "import-contacts-cancel"): Promise<void> {
	await clickByTestId(page, testid)
	await settleClosedPopup(page, "import-contacts-submit")
}

type ToastLog = { titles: string[]; observer: MutationObserver }

/** Runs `act` and waits for a toast reading `text` that was not on screen before it. Toasts are
 *  recorded from before `act` starts, so one that has already left by the time `act` returns (a
 *  success toast lasts six seconds) still counts. */
export async function toastAfter(page: Page, act: () => Promise<void>, text: string, timeout = 15_000): Promise<void> {
	await page.evaluate((s: string) => {
		const w = window as unknown as { __e2eToastLog?: ToastLog }
		w.__e2eToastLog?.observer.disconnect()
		for (const card of document.querySelectorAll(s)) card.setAttribute("data-e2e-seen", "")
		const titles: string[] = []
		const record = () => {
			for (const card of document.querySelectorAll(`${s}:not([data-e2e-seen])`)) {
				const title = card.querySelector('[data-testid="snackbar-title"]')?.textContent ?? ""
				if (!titles.includes(title)) titles.push(title)
			}
		}
		const observer = new MutationObserver(record)
		observer.observe(document.body, { childList: true, subtree: true, characterData: true })
		w.__e2eToastLog = { titles, observer }
	}, sel("snackbar"))
	try {
		await act()
		await withTimeoutMessage(
			page.waitForFunction(
				(t: string) => (window as unknown as { __e2eToastLog?: ToastLog }).__e2eToastLog?.titles.some((title) => title.includes(t)),
				{ timeout, polling: 100 },
				text,
			),
			async () => {
				const seen = await page.evaluate(() => (window as unknown as { __e2eToastLog?: ToastLog }).__e2eToastLog?.titles)
				return `no new toast reading "${text}"; new toasts: ${JSON.stringify(seen)}`
			},
		)
	} finally {
		await page
			.evaluate(() => {
				const w = window as unknown as { __e2eToastLog?: ToastLog }
				w.__e2eToastLog?.observer.disconnect()
				w.__e2eToastLog = undefined
			})
			.catch(() => {})
	}
}

export type StoredContact = { id: string; profileId: string; name: string; address: string; abbr: string }

/** Every stored contact row, ordered by id. */
export function storedContacts(page: Page): Promise<StoredContact[]> {
	return page.evaluate(async () => {
		const all = await chrome.storage.local.get()
		return Object.entries(all)
			.filter(([key]) => key.startsWith("nulo:core:contacts@"))
			.map(([, value]) => JSON.parse(value as string) as StoredContact)
			.sort((x, y) => x.id.localeCompare(y.id))
	})
}

/** The book as name → address, which is what an import may change. */
export async function book(page: Page): Promise<Record<string, string>> {
	return Object.fromEntries((await storedContacts(page)).map((c) => [c.name, c.address]))
}

/** Waits until the contacts list shows exactly `names`, in its own order. */
export async function waitForListed(page: Page, names: string[]): Promise<void> {
	const listed = (s: string) => [...document.querySelectorAll(s)].map((el) => el.getAttribute("data-contact-name"))
	await withTimeoutMessage(
		page.waitForFunction(
			(s: string, expected: string[]) =>
				JSON.stringify([...document.querySelectorAll(s)].map((el) => el.getAttribute("data-contact-name"))) ===
				JSON.stringify(expected),
			{ timeout: 10_000, polling: 100 },
			sel("contact-row"),
			names,
		),
		async () => `the list shows ${JSON.stringify(await page.evaluate(listed, sel("contact-row")))}, not ${JSON.stringify(names)}`,
	)
}

/** The shortened address a list row shows. */
export function listedAddress(page: Page, name: string): Promise<string | null> {
	return page.evaluate(
		(s: string) => document.querySelector(s)?.textContent?.trim() ?? null,
		`${contactRow(name)} ${sel("contact-row-address")}`,
	)
}

/** Waits until a list row shows `shown` as its shortened address: an address change keeps the row's
 *  name, so waiting for the names alone does not wait for the update. */
export async function waitForListedAddress(page: Page, name: string, shown: string): Promise<void> {
	await withTimeoutMessage(
		page.waitForFunction(
			(s: string, expected: string) => document.querySelector(s)?.textContent?.trim() === expected,
			{ timeout: 10_000, polling: 100 },
			`${contactRow(name)} ${sel("contact-row-address")}`,
			shown,
		),
		async () => `${name} shows ${JSON.stringify(await listedAddress(page, name))}, not ${shown}`,
	)
}

/** Whether a list row shows the sender chip. */
export function listedAsSender(page: Page, name: string): Promise<boolean> {
	return page.evaluate((s: string) => document.querySelector(s) !== null, senderChip(name))
}
