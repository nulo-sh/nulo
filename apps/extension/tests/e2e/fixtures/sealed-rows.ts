/**
 * The sealed roots as the wallet reads them, through the build's e2e seam (`src/e2e/sealed-read.ts`,
 * armed by `VITE_NULO_E2E_SEALED_READ=1`, which `e2e:agent` sets): the background answers with every
 * row it can open, its storage key and its owner, so a spec reads while the wallet is locked and
 * reads another profile's rows. A row of a profile this background has not unlocked is absent.
 *
 * Send it from an extension page. A closure that runs in the page (`waitForFunction`) sends the same
 * message itself, with the type passed in as an argument.
 */
import type { Page } from "puppeteer"
import { SEALED_READ_MESSAGE, type SealedReadRow } from "@/e2e/sealed-read-message"
import type { SealedStoreName } from "@/wallet/storage/stores"

export { SEALED_READ_MESSAGE, type SealedReadRow }

/** Every row of `root` the background can open; `stored` reads captured values instead of storage. */
export async function readSealedRows<T = Record<string, unknown>>(
	page: Page,
	root: SealedStoreName,
	stored?: Record<string, unknown>,
): Promise<SealedReadRow<T>[]> {
	const rows = await page.evaluate((message) => chrome.runtime.sendMessage(message), { type: SEALED_READ_MESSAGE, root, stored })
	if (!Array.isArray(rows)) throw new Error(`no sealed-read answer for ${root}: was the build made with VITE_NULO_E2E_SEALED_READ=1?`)
	return rows as SealedReadRow<T>[]
}

/** The row of `root` the wallet reads at `naturalId`, the id its service names it by. */
export async function readSealedRow<T = Record<string, unknown>>(
	page: Page,
	root: SealedStoreName,
	naturalId: string,
): Promise<T | undefined> {
	return (await readSealedRows<T>(page, root)).find((row) => row.naturalId === naturalId)?.row
}

/** Every row of `root` as the wallet reads it: through the seam on a build that has it, else through
 *  `viaService`, the build's own service read, which a release build an update starts from answers
 *  once unlocked, whether or not it seals the root. */
export async function readRowsOnAnyBuild<T = Record<string, unknown>>(
	page: Page,
	root: SealedStoreName,
	viaService: () => Promise<T[]>,
): Promise<T[]> {
	const answer = await page.evaluate((message) => chrome.runtime.sendMessage(message).catch(() => undefined) as Promise<unknown>, {
		type: SEALED_READ_MESSAGE,
		root,
	})
	return Array.isArray(answer) ? (answer as SealedReadRow<T>[]).map(({ row }) => row) : viaService()
}

/** The rows of `root`, decoded, keyed by where each is stored, as `chrome.storage.local.get` keys them. */
export async function readSealedRoot<T = Record<string, unknown>>(page: Page, root: SealedStoreName): Promise<Record<string, T>> {
	return Object.fromEntries((await readSealedRows<T>(page, root)).map(({ storageKey, row }) => [storageKey, row]))
}

/** The stored value at `storageKey`, as written: the envelope of a sealed row. */
export async function readStoredValue(page: Page, storageKey: string): Promise<unknown> {
	return page.evaluate(async (key: string) => (await chrome.storage.local.get(key))[key], storageKey)
}

/** Whether a stored value is a sealed envelope: `{ profileId, sealed }` and nothing else. */
export function isSealedEnvelope(value: unknown): boolean {
	if (typeof value !== "string") return false
	try {
		const parsed = JSON.parse(value) as Record<string, unknown>
		return Object.keys(parsed).sort().join() === "profileId,sealed" && typeof parsed.sealed === "string"
	} catch {
		return false
	}
}
