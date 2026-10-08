/**
 * Capture a full-backup download IN-PAGE, without the native permission
 * prompt or the filesystem: `downloads` is an OPTIONAL manifest permission
 * (its browser prompt is un-clickable from puppeteer), so the stub grants the
 * permission check, replaces `chrome.downloads.download`, fetches the blob
 * URL INSIDE the stub (before `downloadFile`'s `finally` revokes it) and
 * gunzips it with the page's own `DecompressionStream`.
 *
 * Two-phase on purpose: `armBackupDownloadCapture` BEFORE clicking the
 * download CTA, `readCapturedBackupDownload` after. The captured string is
 * the decompressed file content — parsed JSON for a plain backup, the base64
 * ciphertext for an encrypted one. `{ gzip: false }` captures a download the
 * wallet writes uncompressed (the contacts export) as it was written.
 */
import { createHash } from "node:crypto"
import type { Page } from "puppeteer"
import { TEST_PASSWORD } from "../fixtures/constants"
import { clickByTestId, type ExtensionContext, openPopup, replaceInputValue, waitForHash } from "../fixtures/extension"
import { navigateByHash } from "../fixtures/helpers"
import { openFullBackupText } from "@/utils/full-backup-helpers"

/** A full backup's content: the plain file's JSON, or an encrypted file's once opened. */
export type PlainBackup = { checksum?: string; data: Record<string, unknown> } & Record<string, unknown>

/** A press on a testid: `clickByTestId`, or real pointer input where a spec proves nothing covers it. */
export type Press = (page: Page, testid: string) => Promise<void>

const enabled = (testid: string) => {
	const el = document.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)
	return !!el && !el.disabled
}

export async function armBackupDownloadCapture(page: Page, { gzip = true }: { gzip?: boolean } = {}): Promise<void> {
	await page.evaluate((gunzip: boolean) => {
		const w = window as unknown as { __backupCapture?: Promise<string> }
		w.__backupCapture = new Promise<string>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("backup download was not captured within 30s")), 30_000)
			const c = chrome as unknown as {
				permissions: { contains: (p: unknown, cb: (has: boolean) => void) => void }
				downloads: { download: (opts: { url: string }, cb: (id: number) => void) => void }
			}
			c.permissions.contains = (_perms, cb) => cb(true)
			c.downloads = {
				download: (opts, cb) => {
					fetch(opts.url)
						.then((r) => r.blob())
						.then(async (blob) => {
							const text = gunzip
								? await new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).text()
								: await blob.text()
							clearTimeout(timer)
							resolve(text)
							cb(1)
						})
						.catch((err) => {
							clearTimeout(timer)
							reject(err instanceof Error ? err : new Error(String(err)))
						})
				},
			}
		})
		// Swallow the (test-only) unhandled rejection if the click never fires.
		w.__backupCapture.catch(() => {})
	}, gzip)
}

export async function readCapturedBackupDownload(page: Page): Promise<string> {
	return await page.evaluate(() => (window as unknown as { __backupCapture: Promise<string> }).__backupCapture)
}

/** A password profile's ready backup, encrypted with the profile password and downloaded: its file
 *  never leaves the page unencrypted. Returns the file's text. */
export async function downloadEncryptedBackup(page: Page, press: Press = clickByTestId, readyMs = 120_000): Promise<string> {
	await page.waitForFunction(enabled, { timeout: readyMs, polling: 250 }, "protect-password-btn")
	await press(page, "protect-password-btn")
	await page.waitForFunction(enabled, { timeout: 60_000, polling: 250 }, "download-backup-btn")
	await armBackupDownloadCapture(page)
	await press(page, "download-backup-btn")
	return await readCapturedBackupDownload(page)
}

/** A passkey profile's ready backup, downloaded unencrypted through the confirmation that names what
 *  the file exposes. Returns the file's text. */
export async function downloadPlainPasskeyBackup(page: Page, press: Press = clickByTestId, readyMs = 180_000): Promise<string> {
	await page.waitForFunction(enabled, { timeout: readyMs, polling: 250 }, "download-backup-btn")
	await armBackupDownloadCapture(page)
	await press(page, "download-backup-btn")
	await press(page, "confirm-submit")
	return await readCapturedBackupDownload(page)
}

/** An encrypted full backup's content, opened with the production codec the restore runs. */
export async function openEncryptedBackup(text: string, password = TEST_PASSWORD): Promise<PlainBackup> {
	return JSON.parse(await openFullBackupText(text, password)) as PlainBackup
}

/** Exports the unlocked password profile's full backup through Settings on a page of its own, which
 *  it closes, and returns its content. */
export async function exportBackupContent(ctx: ExtensionContext): Promise<PlainBackup> {
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general")
	await navigateByHash(page, "#/popup/settings/security/export/full")
	await clickByTestId(page, "agree-continue-btn")
	await page.waitForSelector('[data-testid="unlock-password-input"]', { visible: true, timeout: 10_000 })
	await replaceInputValue(page, '[data-testid="unlock-password-input"]', TEST_PASSWORD)
	await clickByTestId(page, "unlock-submit-btn")
	const exported = await downloadEncryptedBackup(page)
	await page.close()
	return await openEncryptedBackup(exported)
}

/** The chain `address`'s account row names; the wallet seeds several networks, and the funded
 *  account lives on one of them, not necessarily the first. */
export function accountChainId(backup: PlainBackup, address: string): number {
	const accounts = (backup.data.account ?? []) as Array<{ address?: string; chainId?: number }>
	const chainId = accounts.find((a) => a.address === address)?.chainId
	if (chainId === undefined) throw new Error(`account ${address} is missing from the exported backup`)
	return chainId
}

/** The file content of `backup` with its checksum recomputed over the doctored body: a plain
 *  backup's checksum detects corruption and authenticates nothing. */
export function sealPlainBackup(backup: PlainBackup): string {
	const { checksum: _stale, ...body } = backup
	const checksum = createHash("sha256").update(JSON.stringify(body)).digest("hex")
	return JSON.stringify({ ...body, checksum })
}

/** Keeps only `chainId`'s account-state items: public-chain recovery material would make the import
 *  register contracts over public RPC. Throws unless a kept item still lists `tokenAddress`. */
export function keepChainAccountState(data: Record<string, unknown>, chainId: number, tokenAddress: string): void {
	const items = (data["account-state"] ?? []) as Array<{ chainId?: number; contracts?: Array<{ address?: string }> }>
	const kept = items.filter((item) => item.chainId === chainId)
	const token = tokenAddress.toLowerCase()
	if (!kept.some((item) => item.contracts?.some((c) => c.address?.toLowerCase() === token))) {
		throw new Error(`no account-state item of chain ${chainId} lists the funded token's contract`)
	}
	data["account-state"] = kept
}
