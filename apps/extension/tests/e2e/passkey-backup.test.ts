/**
 * Non-network e2e coverage for the passkey full-backup flows after the
 * Path A modal migration. Lives next to `passkey-paths.test.ts`; shares
 * the `setupPasskeyVirtualAuth` fixture.
 *
 * Why a separate file: the existing `security-backup.test.ts` smoke runs
 * against a password profile (`registeredExtension`); rewriting it to
 * "expect a modal" would (a) drop the password coverage, (b) not exercise
 * the migrated path. New surface, new file.
 *
 * Coverage:
 *   1. Export full backup as a passkey profile: modal appears, virtual authenticator completes,
 *      the file password is asked (a short one keeps Protect off), the file is encrypted under it,
 *      holds the recovery phrase and no passkey input, and its body restores under a new passkey,
 *      at an input of its own, on the same address after the profile is deleted.
 *   2. Export cancel UX — Escape during the modal is marked handled and
 *      returns the user to the agreement gate (`isAgreed = false`), NOT a
 *      dead form or a toast+bounce.
 */
import { expect } from "vitest"
import type { Page } from "puppeteer"
import { FULL_BACKUP_V2_TAG } from "@/utils/full-backup-helpers"
import { TEST_PASSWORD } from "./fixtures/constants"
import { clickByTestId, openPopup, replaceInputValue, waitForHash, test, waitForServiceReady } from "./fixtures/extension"
import { confirmProfileReset, lockWallet } from "./fixtures/helpers"
import { holdNextPasskeyRequest, registerPasskeyProfile, setupPasskeyVirtualAuth, stallNextPasskeyCeremony } from "./fixtures/passkey"
import { shotSend } from "./fixtures/send-page"
import { expectFitsNarrow } from "./fixtures/type-roles"
import { FILE_PASSWORD, openEncryptedBackup } from "./helpers/backup-export"
import { sealPlainBackup } from "./helpers/backup-seal"
import { armDownloadCapture, readCapturedDownload } from "./helpers/download-capture"
import { POPUP_IMPORT_SHELL, readActiveAccount, restoreFullBackupWithPasskey, writeBackupToTemp } from "./helpers/import-drivers"
import { pressEscape } from "./helpers/pointer-probes"

/** Reset the wallet via the in-app reset flow (Settings → Delete profile).
 *  Cascades through every service (NetworkService.onProfileDeleted, etc.) so
 *  storage AND in-memory SW state are properly cleaned — a plain
 *  `chrome.storage.local.clear()` would leave the SW's cached account map
 *  populated and a subsequent import would hit a spurious "Duplicate
 *  address". Lands on /popup/register with the loader cleared. */
async function resetWallet(page: Page): Promise<void> {
	await page.evaluate(() => {
		window.location.hash = "#/popup/settings/security/reset"
	})
	await waitForHash(page, "#/popup/settings/security/reset", 5_000)
	await confirmProfileReset(page, 5_000)
	await waitForHash(page, "#/popup/register", 10_000)
	await waitForServiceReady(page, 15_000)
}

/** Every stored profile row's type and PRF input. */
const readProfileRows = (page: Page) =>
	page.evaluate(async () => {
		const all = await chrome.storage.local.get(null)
		return Object.entries(all)
			.filter(([key]) => key.startsWith("nulo:core:profiles@"))
			.map(([, raw]) => (typeof raw === "string" ? JSON.parse(raw) : raw) as { type?: string; prfSalt?: string })
	})

/** From the lock screen, the passkey's unlock back to Home. */
async function unlockWithPasskey(page: Page): Promise<void> {
	await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('[data-testid="auth-submit"]')?.disabled === false, {
		timeout: 15_000,
		polling: 200,
	})
	expect(await page.$('[data-testid="auth-password-input"]'), "a passkey profile's lock screen asks a password").toBeNull()
	await clickByTestId(page, "auth-submit")
	await waitForHash(page, "#/popup/general", 60_000)
}

/** The progress card a run shows: its text, and whether the Download CTA must read a disabled
 *  "Creating Backup" beside it. */
interface ProgressCard {
	text: string
	creatingCta: boolean
}

const CREATING: ProgressCard = { text: "Creating your backup", creatingCta: true }
const ENCRYPTING: ProgressCard = { text: "Encrypting your backup", creatingCta: false }

/**
 * A poll can miss the progress card between two ticks. Each callback reads the live DOM, so a card
 * inserted and removed within one batch leaves the flag unset: the observer can miss, never pass
 * falsely. The export awaits worker calls and the encryption awaits WebCrypto between the two, so
 * they never share a batch. Arm it before the click that starts the run.
 */
async function armProgressObserver(page: Page, expected: ProgressCard): Promise<void> {
	await page.evaluate((want: ProgressCard) => {
		const w = window as unknown as { __backupProgressSeen?: boolean }
		w.__backupProgressSeen = false
		const observer = new MutationObserver(() => {
			const card = document.querySelector('[data-testid="backup-status-card"]')
			const download = document.querySelector<HTMLButtonElement>('[data-testid="download-backup-btn"]')
			const ctaHolds = !want.creatingCta || (download?.disabled === true && /Creating Backup/i.test(download.textContent ?? ""))
			if ((card?.textContent ?? "").includes(want.text) && ctaHolds) {
				w.__backupProgressSeen = true
				observer.disconnect()
			}
		})
		observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true })
	}, expected)
}

const progressSeen = (page: Page) => page.evaluate(() => (window as unknown as { __backupProgressSeen?: boolean }).__backupProgressSeen)

test("passkey full-backup export: modal, status card, a file password of its own, and a passkey restore on the same address", {
	timeout: 360_000,
}, async ({ freshExtensionPerTest }) => {
	const page = await openPopup(freshExtensionPerTest)
	const auth = await setupPasskeyVirtualAuth(freshExtensionPerTest.browser, page)

	try {
		await registerPasskeyProfile(page)

		// Navigate to the full-backup export page.
		await page.evaluate(() => {
			window.location.hash = "#/popup/settings/security/export/full"
		})
		await waitForHash(page, "#/popup/settings/security/export/full", 5_000)

		// For a passkey profile, Agree starts the backup and its passkey request (`handleAgree`); there
		// is no Create Backup button.
		await page.waitForSelector('[data-testid="agree-continue-btn"]', { visible: true, timeout: 5_000 })
		// The held passkey request keeps the working card on screen; a run never returns to `progress`,
		// so the card still mounted after the 240 px check proves the check read it.
		const release = await holdNextPasskeyRequest(page)
		try {
			// Without the progress state, the CTA-enabled wait below would pass on a body left blank
			// during the export.
			await armProgressObserver(page, CREATING)
			await clickByTestId(page, "agree-continue-btn")
			await page.waitForSelector('[data-testid="backup-status-card"]', { visible: true, timeout: 5_000 })
			await page.waitForSelector('[data-testid="passkey-ceremony-dialog"]', { visible: true, timeout: 5_000 })
			await expectFitsNarrow(page, "the working card under the passkey dialog")
			expect(await page.$('[data-testid="backup-status-card"]')).not.toBeNull()
			expect(await page.$('[data-testid="passkey-ceremony-dialog"]')).not.toBeNull()
		} finally {
			await release()
		}

		// The card unmounts and the file password is asked once the status reads "finished"; 180 s
		// leaves a loaded hosted runner room without masking a deadlock.
		await page.waitForSelector('[data-testid="backup-encrypt-password-input"]', { visible: true, timeout: 180_000 })
		expect(await progressSeen(page), "the export never showed its in-progress card with a disabled Creating Backup CTA").toBe(true)
		await shotSend(page, "export-full-ready-passkey", "backup-ready-banner")

		// The file holds the recovery phrase, so it is protected with a password of its own: Download
		// waits for it, and a password shorter than 8 characters never reaches the encryption.
		const enabled = (testid: string) =>
			page.$eval(`[data-testid="${testid}"]`, (el) => !(el as HTMLButtonElement).disabled).catch(() => false)
		expect(await enabled("download-backup-btn"), "a passkey backup downloads before it is encrypted").toBe(false)
		await replaceInputValue(page, '[data-testid="backup-encrypt-password-input"]', "short12")
		await replaceInputValue(page, '[data-testid="backup-encrypt-password-confirm-input"]', "short12")
		expect(await enabled("protect-password-btn"), "a 7-character file password reaches the encryption").toBe(false)
		await replaceInputValue(page, '[data-testid="backup-encrypt-password-input"]', FILE_PASSWORD)
		await replaceInputValue(page, '[data-testid="backup-encrypt-password-confirm-input"]', FILE_PASSWORD)
		await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('[data-testid="protect-password-btn"]')?.disabled, {
			timeout: 5_000,
			polling: 100,
		})
		await shotSend(page, "export-full-file-password-passkey", "protect-password-btn")
		// The Encrypting card mounts only for the PBKDF2 + AES-GCM run.
		await armProgressObserver(page, ENCRYPTING)
		await clickByTestId(page, "protect-password-btn")
		await page.waitForFunction(
			() => {
				const download = document.querySelector<HTMLButtonElement>('[data-testid="download-backup-btn"]')
				return !!download && !download.disabled && (document.body.textContent ?? "").includes("Backup is successfully encrypted")
			},
			{ timeout: 60_000, polling: 250 },
		)
		expect(await progressSeen(page), "the encryption never showed its Encrypting card").toBe(true)
		await expectFitsNarrow(page, "an encrypted backup")
		await armDownloadCapture(page, { gzip: true })
		await clickByTestId(page, "download-backup-btn")
		const file = await readCapturedDownload(page)
		await page.waitForSelector('[data-testid="backup-close-btn"]', { visible: true, timeout: 5_000 })
		await shotSend(page, "export-full-saved-passkey", "backup-close-btn")

		// Nothing that leaves the wallet opens with the passkey alone: the file is the password frame,
		// and its body carries the phrase and nothing of the passkey's input.
		expect(file.trim().startsWith(`${FULL_BACKUP_V2_TAG}:`)).toBe(true)
		await expect(openEncryptedBackup(file, TEST_PASSWORD)).rejects.toThrow()
		const backup = await openEncryptedBackup(file, FILE_PASSWORD)
		expect(typeof backup.entropy).toBe("string")
		expect(JSON.stringify(backup)).not.toMatch(/prfSalt|prf-salt|backup-mac/)

		// The body restores under a new passkey, the method it was made with, on the same address.
		// Public-chain state stays out, so the smoke import dials no RPC.
		const addressBefore = await readActiveAccount(page)
		const [original] = await readProfileRows(page)
		const { "account-state": _chainState, ...data } = backup.data
		const plainPath = writeBackupToTemp(sealPlainBackup({ ...backup, data }), "passkey-profile-backup.json")
		await clickByTestId(page, "backup-close-btn")
		await resetWallet(page)
		await page.evaluate(() => {
			window.location.hash = "#/popup/import"
		})
		await waitForHash(page, "#/popup/import", 5_000)
		await restoreFullBackupWithPasskey(page, plainPath, POPUP_IMPORT_SHELL)
		expect(await readActiveAccount(page)).toBe(addressBefore)
		const [restored, ...others] = await readProfileRows(page)
		expect([restored?.type, others.length]).toEqual(["passkey", 0])
		expect(restored?.prfSalt !== original?.prfSalt, "the restore sealed at the deleted profile's input").toBe(true)

		// The restored row opens with its passkey.
		await lockWallet(page)
		await unlockWithPasskey(page)
		expect(await readActiveAccount(page)).toBe(addressBefore)

		// Filter the benign "Client disconnected" cascade that can fire when
		// the export's loop disconnects each backup service client.
		const nonBenign = freshExtensionPerTest.pageErrors.filter((e) => !e.message.includes("Client disconnected"))
		expect(nonBenign).toEqual([])
	} finally {
		await auth.cleanup()
		await page.close()
	}
})

test("passkey full-backup export: Escape during modal resets agreement gate", async ({ freshExtensionPerTest }) => {
	const page = await openPopup(freshExtensionPerTest)

	// IMPORTANT: do NOT attach a virtual authenticator here. Without it,
	// `navigator.credentials.get` would block waiting for the platform
	// authenticator. We rely on the dialog's Escape handler to abort
	// before WebAuthn resolves.
	let auth: Awaited<ReturnType<typeof setupPasskeyVirtualAuth>> | undefined
	try {
		auth = await setupPasskeyVirtualAuth(freshExtensionPerTest.browser, page)
		await registerPasskeyProfile(page)

		await page.evaluate(() => {
			window.location.hash = "#/popup/settings/security/export/full"
		})
		await waitForHash(page, "#/popup/settings/security/export/full", 5_000)

		// Click agree to launch the passkey ceremony, then immediately
		// detach the virtual authenticator so the prompt won't resolve.
		// (Without this, the virtual authenticator's `automaticPresence-
		// Simulation:true` would auto-complete the ceremony before our
		// Escape key fires.)
		await page.waitForSelector('[data-testid="agree-continue-btn"]', { visible: true, timeout: 5_000 })

		// Tear down the virtual authenticator BEFORE clicking agree so
		// navigator.credentials.get hangs, giving the Escape handler a
		// real chance to abort first.
		await stallNextPasskeyCeremony(page, auth)
		auth = undefined

		await clickByTestId(page, "agree-continue-btn")

		// Wait for the ceremony modal to actually MOUNT before pressing Escape.
		// Its Escape handler is a `window` keydown listener attached in the
		// dialog's onMounted; agree → handleBackup → getPasskeyUnlockParams
		// (async) → runCeremony mounts the dialog. On a loaded CI runner that
		// async gap can exceed the old immediate-Escape, so the key was lost and
		// the ceremony hung (authenticator torn down) → gate never reset. Waiting
		// for the dialog first makes the Escape land deterministically.
		await page.waitForSelector('[data-testid="passkey-ceremony-dialog"]', { visible: true, timeout: 15_000 })

		// Chrome closes its toolbar popup, the whole wallet, on an Escape the page leaves unhandled.
		expect(await pressEscape(page), "the dialog's Escape went unhandled; the toolbar popup would close").toBe(true)

		await page.waitForFunction(
			() => {
				// `isAgreed = false` → the "Before you continue" copy is shown
				// AND the agree-continue button is rendered again.
				const btn = document.querySelector<HTMLButtonElement>('[data-testid="agree-continue-btn"]')
				return btn !== null && !btn.disabled
			},
			{ timeout: 10_000, polling: 200 },
		)

		const nonBenign = freshExtensionPerTest.pageErrors.filter((e) => !e.message.includes("Client disconnected"))
		expect(nonBenign).toEqual([])
	} finally {
		if (auth) await auth.cleanup()
		await page.close()
	}
}, 90_000)
