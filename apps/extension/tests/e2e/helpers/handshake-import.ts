/**
 * The handshake-note import scenario shared by `network/import-handshake-note*.test.ts`.
 *
 * The sender lives in its own PXE, which holds none of the wallet's keys, so the token tags the
 * note with a non-interactive handshake (`handshake-delivery.sources.test.ts` pins that default).
 * The HandshakeRegistry's sync moves its per-account cursor past every handshake it scans,
 * decrypted or not, so one sync of an account the fresh PXE holds no keys for loses that note.
 *
 * The note goes to the profile's SECOND account, which stays inactive after the import. On the
 * sandbox the restored balance rows project every account within seconds, and a projection
 * registers the account, so the loss only shows on a node slow enough to let a scan in first. The
 * projection gate makes that order deterministic: it parks the receiver's projections after they
 * register the token and before they register the receiver, while the incoming-transfer scheduler
 * scans every visible account every 30 s. The note must be discovered INSIDE the hold, which only
 * a scan that registers the receiver itself can do; a scan that merely refuses finds it later.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Page } from "puppeteer"
import { expect } from "vitest"
import type { AztecTestConfig } from "../fixtures/aztec"
import { TEST_PASSWORD } from "../fixtures/constants"
import {
	clickByTestId,
	clickSelector,
	type ExtensionContext,
	openPopup,
	pickFileByTestId,
	registerProfile,
	replaceInputValue,
	waitForHash,
} from "../fixtures/extension"
import {
	captureBalanceBaseline,
	createAndActivateProfile,
	createSecondAccount,
	getAccountAddress,
	importToken,
	lockWallet,
	navigateByHash,
	readSessionRow,
	resetProfile,
	switchAccountByAddress,
	switchToLocalNetwork,
	unlockProfile,
	waitForFreshBalanceRow,
	waitForProfilePurged,
} from "../fixtures/helpers"
import { type PasskeyAuthSetup, registerPasskeyProfile, setupPasskeyVirtualAuth } from "../fixtures/passkey"
import { holdAccountRegistration, isAccountRegistrationHeld, releaseAccountRegistration } from "../fixtures/projection-gate"
import {
	accountChainId,
	armBackupDownloadCapture,
	keepChainAccountState,
	type PlainBackup,
	readCapturedBackupDownload,
	sealPlainBackup,
} from "./backup-export"
import { importFullBackup, POPUP_IMPORT_SHELL } from "./import-drivers"

const AMOUNT = 25n * 10n ** 18n
const OTHER_PASSWORD = "OtherProfilePw123!"
/** Several incoming-transfer poll intervals (30 s each). */
const DISCOVERY_TIMEOUT_MS = 150_000

export type Credential = "password" | "passkey"
export type DeleteFrom = "lock-view" | "settings"
export type ImportRow = { credential: Credential; deleteFrom: DeleteFrom }

export const importRowName = (row: ImportRow) =>
	`${row.credential} profile, deleted from the ${row.deleteFrom}: the handshake-delivered note comes back`

/** Full backup, profile delete, import; then the receiver's note must come back. */
export async function runHandshakeImport(ctx: ExtensionContext, aztecConfig: AztecTestConfig, row: ImportRow): Promise<void> {
	const dir = mkdtempSync(join(tmpdir(), "nulo-e2e-handshake-"))
	let auth: PasskeyAuthSetup | undefined
	let page: Page | undefined
	try {
		page = await registerFirstProfile(ctx, row.credential, (setup) => {
			auth = setup
		})
		await switchToLocalNetwork(page)
		const profileId = (await readSessionRow(page))?.profile
		if (!profileId) throw new Error("no unlocked profile after registration")
		const first = await getAccountAddress(page)
		await importToken(page, aztecConfig.tokenAddress)
		const receiver = await createSecondAccount(page, "Receiver")

		const txHash = await deliverHandshakeNote(aztecConfig, receiver)
		await navigateByHash(page, "#/popup/general")
		await expectPrivateBalance(page, receiver, aztecConfig.tokenAddress, "before the backup")
		await switchAccountByAddress(page, first)

		await createAndActivateProfile(page, "Other", OTHER_PASSWORD)
		await lockWallet(page)
		await unlock(page, row.credential, profileId)
		const file = await exportBackup(page, row.credential, first, aztecConfig.tokenAddress, dir)

		await deleteProfile(page, row.deleteFrom)
		await waitForProfilePurged(page, profileId)
		await waitForHash(page, "#/popup/auth", 30_000)

		await holdAccountRegistration(page, receiver)
		await navigateByHash(page, "#/popup/import")
		if (row.credential === "passkey") await importPasskeyFullBackup(page, file)
		else await importFullBackup(page, file, TEST_PASSWORD, POPUP_IMPORT_SHELL)
		await switchToLocalNetwork(page)
		expect(await getAccountAddress(page)).not.toBe(receiver)

		await waitForHeldProjection(page)
		await waitForIncomingRecord(page, receiver, txHash)
		await releaseAccountRegistration(page)
		await switchAccountByAddress(page, receiver)
		await expectPrivateBalance(page, receiver, aztecConfig.tokenAddress, "after the import")
	} finally {
		if (page) await releaseAccountRegistration(page).catch(() => {})
		await auth?.cleanup().catch(() => {})
		rmSync(dir, { recursive: true, force: true })
	}
}

/** Every passkey ceremony later runs on the returned page: Chrome scopes the virtual credential to it. */
async function registerFirstProfile(
	ctx: ExtensionContext,
	credential: Credential,
	onAuth: (auth: PasskeyAuthSetup) => void,
): Promise<Page> {
	if (credential === "password") await registerProfile(ctx)
	const page = await openPopup(ctx)
	if (credential === "passkey") {
		const auth = await setupPasskeyVirtualAuth(ctx.browser, page)
		onAuth(auth)
		await registerPasskeyProfile(page)
	}
	await waitForHash(page, "#/popup/general", 30_000)
	return page
}

/** A private mint from the sandbox minter, in a PXE of its own that never learns the receiver's keys. */
async function deliverHandshakeNote(config: AztecTestConfig, receiver: string): Promise<string> {
	const { createTestWallet, createSponsoredFeeOptions, mintPrivateTokens } = await import("../fixtures/aztec")
	const sender = await createTestWallet(config.nodeUrl)
	try {
		const fee = await createSponsoredFeeOptions(sender.wallet)
		return await mintPrivateTokens(sender.wallet, sender.node, config.tokenAddress, receiver, AMOUNT, config.minterAddress, fee)
	} finally {
		await sender.cleanup()
	}
}

/** A projection newer than the call must read the minted amount; a cached row cannot satisfy it. */
async function expectPrivateBalance(page: Page, account: string, token: string, when: string): Promise<void> {
	const baselineUpdatedAt = await captureBalanceBaseline(page, account, token)
	await waitForFreshBalanceRow(page, {
		account,
		tokenContract: token,
		expectedPublicRaw: "0",
		expectedPrivateRaw: AMOUNT.toString(),
		baselineUpdatedAt,
		timeoutMs: 180_000,
	}).catch((err: unknown) => {
		throw new Error(`the receiver's private balance did not read ${AMOUNT} ${when}: ${String(err)}`)
	})
}

async function unlock(page: Page, credential: Credential, profileId: string): Promise<void> {
	if (credential === "password") return unlockProfile(page, profileId, TEST_PASSWORD)
	await page.waitForSelector('[data-testid="auth-profile"]', { visible: true, timeout: 15_000 })
	await clickByTestId(page, "auth-profile")
	const row = `[data-testid="select-profile-row"][data-profile-id="${profileId}"]`
	await page.waitForSelector(row, { visible: true, timeout: 10_000 })
	await clickSelector(page, row)
	await page.waitForFunction(() => !document.querySelector('[data-testid="select-profile-row"]'), { timeout: 10_000 })
	await page.waitForFunction(
		() => {
			const button = document.querySelector<HTMLButtonElement>('[data-testid="auth-submit"]')
			return button !== null && !button.disabled
		},
		{ timeout: 15_000 },
	)
	await clickByTestId(page, "auth-submit")
	await waitForHash(page, "#/popup/general", 60_000)
}

/** The unlocked profile's full backup, kept to the sandbox chain so the import dials no public RPC. */
export async function exportBackup(page: Page, credential: Credential, account: string, token: string, dir: string): Promise<string> {
	await navigateByHash(page, "#/popup/settings/security/export/full")
	await clickByTestId(page, "agree-continue-btn")
	if (credential === "password") {
		await page.waitForSelector('[data-testid="unlock-password-input"]', { visible: true, timeout: 10_000 })
		await replaceInputValue(page, '[data-testid="unlock-password-input"]', TEST_PASSWORD)
		await clickByTestId(page, "unlock-submit-btn")
	}
	await page.waitForFunction(
		() => {
			const button = document.querySelector<HTMLButtonElement>('[data-testid="download-backup-btn"]')
			return !!button && !button.disabled
		},
		{ timeout: 180_000, polling: 250 },
	)
	await armBackupDownloadCapture(page)
	await clickByTestId(page, "download-backup-btn")
	const backup = JSON.parse(await readCapturedBackupDownload(page)) as PlainBackup
	keepChainAccountState(backup.data, accountChainId(backup, account), token)
	const file = join(dir, "backup.json")
	writeFileSync(file, sealPlainBackup(backup))
	await navigateByHash(page, "#/popup/general")
	return file
}

/** Deletes the unlocked profile; the lock view reaches the same reset page through "Delete profile". */
export async function deleteProfile(page: Page, from: DeleteFrom): Promise<void> {
	if (from === "settings") return resetProfile(page)
	await lockWallet(page)
	await clickByTestId(page, "auth-reset")
	await page.waitForSelector('[data-testid="forgot-reset-btn"]', { visible: true, timeout: 10_000 })
	await clickByTestId(page, "forgot-reset-btn")
	await waitForHash(page, "#/popup/settings/security/reset", 10_000)
	await resetProfile(page)
}

/** A passkey backup asks for no password: its keys are sealed to the credential. */
async function importPasskeyFullBackup(page: Page, file: string): Promise<void> {
	await page.waitForSelector('[data-testid="import-option-full-backup"]', { visible: true, timeout: 15_000 })
	await clickByTestId(page, "import-option-full-backup")
	await page.waitForSelector('[data-testid="import-full-backup-pick-file"]', { visible: true, timeout: 10_000 })
	await pickFileByTestId(page, "import-full-backup-pick-file", file)
	await page.waitForFunction(
		() => {
			const button = document.querySelector<HTMLButtonElement>('[data-testid="import-full-backup-submit-btn"]')
			return !!button && !button.disabled
		},
		{ timeout: 15_000 },
	)
	await clickByTestId(page, "import-full-backup-submit-btn")
	await waitForHash(page, "#/popup/general", 300_000)
}

/** The gate's acknowledgement: from here on the token is registered and the receiver is not. */
export async function waitForHeldProjection(page: Page): Promise<void> {
	const deadline = Date.now() + 180_000
	while (!(await isAccountRegistrationHeld(page))) {
		if (Date.now() > deadline) throw new Error("no projection of the receiver parked on the gate; is the build proverless-armed?")
		await new Promise((resolve) => setTimeout(resolve, 500))
	}
}

/** The incoming-transfer scan's committed record of the note, read from storage: the card has no per-hash testid. */
async function waitForIncomingRecord(page: Page, account: string, txHash: string): Promise<void> {
	const deadline = Date.now() + DISCOVERY_TIMEOUT_MS
	const found = () =>
		page.evaluate(
			async (want: { account: string; txHash: string }) => {
				for (const [key, value] of Object.entries(await chrome.storage.local.get(null))) {
					if (!key.startsWith("nulo:core:incoming-transfers@") || typeof value !== "string") continue
					const rec = JSON.parse(value) as { txHash?: string; accountAddress?: string }
					if (rec.txHash === want.txHash && rec.accountAddress === want.account) return true
				}
				return false
			},
			{ account, txHash },
		)
	while (!(await found())) {
		if (Date.now() > deadline)
			throw new Error("the incoming-transfer scan never discovered the receiver's note while its projections were held")
		await new Promise((resolve) => setTimeout(resolve, 1_000))
	}
}
