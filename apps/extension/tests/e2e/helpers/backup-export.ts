import type { Page } from "puppeteer"
import { openFullBackupText } from "@/utils/full-backup-helpers"
import { TEST_PASSWORD } from "../fixtures/constants"
import { clickByTestId, type ExtensionContext, openPopup, replaceInputValue, waitForHash } from "../fixtures/extension"
import { navigateByHash } from "../fixtures/helpers"
import type { PlainBackup } from "./backup-seal"
import { armDownloadCapture, readCapturedDownload } from "./download-capture"

/** A press on a testid: `clickByTestId`, or real pointer input where a spec proves nothing covers it. */
export type Press = (page: Page, testid: string) => Promise<void>

const enabled = (testid: string) => {
	const el = document.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)
	return !!el && !el.disabled
}

/** A password profile's ready backup, encrypted with the profile password and downloaded: its file
 *  never leaves the page unencrypted. Returns the file's text. */
export async function downloadEncryptedBackup(page: Page, press: Press = clickByTestId, readyMs = 120_000): Promise<string> {
	await page.waitForFunction(enabled, { timeout: readyMs, polling: 250 }, "protect-password-btn")
	await press(page, "protect-password-btn")
	await page.waitForFunction(enabled, { timeout: 60_000, polling: 250 }, "download-backup-btn")
	await armDownloadCapture(page, { gzip: true })
	await press(page, "download-backup-btn")
	return await readCapturedDownload(page)
}

/** The file password the e2e protects a passkey profile's backup with: the export asks at least 8
 *  characters, typed twice. */
export const FILE_PASSWORD = "FilePassword123!"

/** A passkey profile's ready backup, protected with a file password of its own and downloaded: the
 *  file holds the recovery phrase, so it never leaves the page unencrypted. Returns the file's text. */
export async function downloadPasskeyBackup(
	page: Page,
	filePassword = FILE_PASSWORD,
	press: Press = clickByTestId,
	readyMs = 180_000,
): Promise<string> {
	await page.waitForSelector('[data-testid="backup-encrypt-password-input"]', { visible: true, timeout: readyMs })
	await replaceInputValue(page, '[data-testid="backup-encrypt-password-input"]', filePassword)
	await replaceInputValue(page, '[data-testid="backup-encrypt-password-confirm-input"]', filePassword)
	await page.waitForFunction(enabled, { timeout: 10_000, polling: 250 }, "protect-password-btn")
	await press(page, "protect-password-btn")
	await page.waitForFunction(enabled, { timeout: 60_000, polling: 250 }, "download-backup-btn")
	await armDownloadCapture(page, { gzip: true })
	await press(page, "download-backup-btn")
	return await readCapturedDownload(page)
}

/** An encrypted full backup's content, opened with the production codec the restore runs. */
export async function openEncryptedBackup(text: string, password = TEST_PASSWORD): Promise<PlainBackup> {
	return JSON.parse(await openFullBackupText(text, password)) as PlainBackup
}

/** Exports the unlocked password profile's full backup through Settings on a page of its own, which
 *  it closes, and returns its content. */
export async function exportBackupContent(ctx: ExtensionContext): Promise<PlainBackup> {
	return await openEncryptedBackup(await exportBackupFile(ctx))
}

/** {@link exportBackupContent}'s file, encrypted, as the browser downloaded it. */
export async function exportBackupFile(ctx: ExtensionContext): Promise<string> {
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general")
	await navigateByHash(page, "#/popup/settings/security/export/full")
	await clickByTestId(page, "agree-continue-btn")
	await page.waitForSelector('[data-testid="unlock-password-input"]', { visible: true, timeout: 10_000 })
	await replaceInputValue(page, '[data-testid="unlock-password-input"]', TEST_PASSWORD)
	await clickByTestId(page, "unlock-submit-btn")
	const exported = await downloadEncryptedBackup(page)
	await page.close()
	return exported
}

/** The chain `address`'s account row names; the wallet seeds several networks, and the funded
 *  account lives on one of them, not necessarily the first. */
export function accountChainId(backup: PlainBackup, address: string): number {
	const accounts = (backup.data.account ?? []) as Array<{ address?: string; chainId?: number }>
	const chainId = accounts.find((a) => a.address === address)?.chainId
	if (chainId === undefined) throw new Error(`account ${address} is missing from the exported backup`)
	return chainId
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
