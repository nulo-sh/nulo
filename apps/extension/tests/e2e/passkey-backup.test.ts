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
 *   1. Export full backup as a passkey profile — modal appears, virtual
 *      authenticator completes, CTAs become available, and an unencrypted
 *      download passes the confirmation that names what the file exposes,
 *      then ends the run; a second run encrypts.
 *      Locks in the `usePasskeyCeremony` wiring on the export page.
 *   2. Export cancel UX — Escape during the modal is marked handled and
 *      returns the user to the agreement gate (`isAgreed = false`), NOT a
 *      dead form or a toast+bounce.
 *   3. In-session import round-trip — register, build a
 *      synthetic passkey backup with the real credentialId, reset storage,
 *      drive the import flow, assert the same address comes back.
 */
import { expect } from "vitest"
import type { Page } from "puppeteer"
import { clickByTestId, openPopup, waitForHash, test, waitForServiceReady } from "./fixtures/extension"
import { confirmProfileReset, selectedAccount } from "./fixtures/helpers"
import { holdNextPasskeyRequest, registerPasskeyProfile, setupPasskeyVirtualAuth, stallNextPasskeyCeremony } from "./fixtures/passkey"
import { shotSend } from "./fixtures/send-page"
import { expectFitsNarrow } from "./fixtures/type-roles"
import { downloadPlainPasskeyBackup } from "./helpers/backup-export"
import { type PlainBackup, passkeyBackupVerifies } from "./helpers/backup-seal"
import { armDownloadCapture } from "./helpers/download-capture"
import {
	buildSyntheticPasskeyBackup,
	readActiveAccount,
	readPasskeyPrf,
	readRegisteredPasskey,
	submitPasskeyFullBackup,
	writeBackupToTemp,
} from "./helpers/import-drivers"
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

/** Drive the full-backup-import flow for a PASSKEY backup from the import page's method picker. */
async function importPasskeyFullBackup(page: Page, filePath: string): Promise<void> {
	await page.waitForSelector('[data-testid="import-option-full-backup"]', { visible: true, timeout: 10_000 })
	await clickByTestId(page, "import-option-full-backup")
	await submitPasskeyFullBackup(page, filePath)
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

test("passkey full-backup export: modal appears + status card + CTAs become available", { timeout: 240_000 }, async ({
	freshExtensionPerTest,
}) => {
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

		// The card unmounts and both CTAs enable once the status reads "finished"; 180 s leaves a
		// loaded hosted runner room without masking a deadlock.
		await page.waitForFunction(
			() => {
				const protect = document.querySelector<HTMLButtonElement>('[data-testid="protect-password-btn"]')
				const download = document.querySelector<HTMLButtonElement>('[data-testid="download-backup-btn"]')
				return !!protect && !protect.disabled && !!download && !download.disabled
			},
			{ timeout: 180_000, polling: 250 },
		)
		expect(await progressSeen(page), "the export never showed its in-progress card with a disabled Creating Backup CTA").toBe(true)
		await shotSend(page, "export-full-ready-passkey", "backup-ready-banner")

		// An unencrypted download asks first: Cancel writes nothing, Download anyway writes the
		// plain file, whose master-key field is only the passkey's credential id.
		await armDownloadCapture(page, { gzip: true })
		await clickByTestId(page, "download-backup-btn")
		await page.waitForSelector('[data-testid="confirm-submit"]', { visible: true, timeout: 5_000 })
		expect(await page.$eval('[data-testid="confirm-title"]', (el) => el.textContent?.trim())).toBe("Download without a password?")
		await shotSend(page, "export-full-confirm-passkey", "confirm-submit")
		await clickByTestId(page, "confirm-cancel")
		await page.waitForFunction(() => !document.querySelector('[data-testid="confirm-submit"]'), { timeout: 5_000 })
		const afterCancel = await page.evaluate(() =>
			Promise.race([
				(window as unknown as { __downloadCapture: Promise<string> }).__downloadCapture.then(() => "downloaded"),
				new Promise<string>((resolve) => setTimeout(() => resolve("nothing"), 1_000)),
			]),
		)
		expect(afterCancel).toBe("nothing")
		const plain = JSON.parse(await downloadPlainPasskeyBackup(page)) as PlainBackup
		const { credentialId } = await readRegisteredPasskey(page)
		expect(plain["master-key"]).toBe(credentialId)
		expect("entropy" in plain).toBe(false)
		const passkey = { id: credentialId, prf: await readPasskeyPrf(page, credentialId) }
		expect(await passkeyBackupVerifies(plain, passkey), "the export's checksum and MAC under its own passkey").toBe(true)

		// The plain file ends the run: the done state names no password, and Close stands alone.
		await page.waitForSelector('[data-testid="backup-close-btn"]', { visible: true, timeout: 5_000 })
		await page.waitForSelector('[data-testid="backup-done-banner"]', { visible: true, timeout: 5_000 })
		expect(await page.$eval('[data-testid="backup-done-banner"]', (el) => el.textContent?.trim())).toBe("Saved to your downloads")
		expect(await page.$('[data-testid="backup-ready-banner"]')).toBeNull()
		expect(await page.$('[data-testid="protect-password-btn"]')).toBeNull()
		expect(await page.$('[data-testid="download-backup-btn"]')).toBeNull()
		await expectFitsNarrow(page, "the done state after a plain file")
		await shotSend(page, "export-full-saved-passkey", "backup-close-btn")

		// A second run, for the encryption path.
		await clickByTestId(page, "backup-close-btn")
		await page.waitForFunction(() => window.location.hash !== "#/popup/settings/security/export/full", { timeout: 5_000 })
		await page.evaluate(() => {
			window.location.hash = "#/popup/settings/security/export/full"
		})
		await waitForHash(page, "#/popup/settings/security/export/full", 5_000)
		await clickByTestId(page, "agree-continue-btn")
		await page.waitForFunction(
			() => {
				const protect = document.querySelector<HTMLButtonElement>('[data-testid="protect-password-btn"]')
				return !!protect && !protect.disabled
			},
			{ timeout: 180_000, polling: 250 },
		)

		// The first Protect click mounts the password fields; the second starts the encryption, whose
		// Encrypting card this run is the only one to show.
		const ENCRYPT_PASSWORD = "EncryptPassword123!"
		await clickByTestId(page, "protect-password-btn")
		await page.waitForSelector('[data-testid="backup-encrypt-password-input"]', { visible: true, timeout: 5_000 })
		await page.evaluate((pwd: string) => {
			const setVal = (sel: string, v: string) => {
				const input = document.querySelector<HTMLInputElement>(`${sel} input`)
				if (!input) throw new Error(`input not found: ${sel}`)
				const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set
				setter?.call(input, v)
				input.dispatchEvent(new Event("input", { bubbles: true }))
			}
			setVal('[data-testid="backup-encrypt-password-input"]', pwd)
			setVal('[data-testid="backup-encrypt-password-confirm-input"]', pwd)
		}, ENCRYPT_PASSWORD)
		// The Encrypting card mounts only for the PBKDF2 + AES-GCM run.
		await armProgressObserver(page, ENCRYPTING)
		await clickByTestId(page, "protect-password-btn")

		// Then the "encrypted" banner appears and Download Backup is enabled.
		await page.waitForFunction(
			() => {
				const download = document.querySelector<HTMLButtonElement>('[data-testid="download-backup-btn"]')
				const body = document.body.textContent ?? ""
				return !!download && !download.disabled && body.includes("Backup is successfully encrypted")
			},
			{ timeout: 15_000, polling: 250 },
		)
		expect(await progressSeen(page), "the encryption never showed its Encrypting card").toBe(true)
		await page.waitForSelector('[data-testid="backup-done-banner"]', { visible: true, timeout: 5_000 })
		await page.waitForSelector('[data-testid="download-backup-btn"]', { visible: true, timeout: 5_000 })
		await expectFitsNarrow(page, "an encrypted backup")

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
		// dialog's onMounted; agree → handleBackup → getPasskeyCredentialId
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

test("passkey full-backup: in-session round-trip (register → reset → import same credential)", async ({ freshExtensionPerTest }) => {
	// Why this test is possible AFTER the Path A migration but wasn't
	// before: Chrome virtual authenticators are per-FrameTreeNode. The
	// previous Path B export/import opened a fresh `chrome.windows.create`
	// popup for each ceremony → each got its own (empty) authenticator →
	// the credential created at register wasn't reachable from the export/
	// import windows. Path A runs everything in the SAME popup's FTN, so
	// the credential persists across register + export + import within a
	// single popup session. (Cross-extension round-trip is still blocked
	// by PRF non-portability — see fixtures/passkey.ts:14-30.)
	const page = await openPopup(freshExtensionPerTest)
	const auth = await setupPasskeyVirtualAuth(freshExtensionPerTest.browser, page)

	try {
		// 1. Register passkey profile. Captures address + the real
		//    credentialId that the virtual authenticator handed out.
		await registerPasskeyProfile(page)
		const addressBefore = await readActiveAccount(page)
		expect(addressBefore.startsWith("0x")).toBe(true)
		const passkey = await readRegisteredPasskey(page)
		expect(passkey.credentialId.length).toBeGreaterThan(0)

		// 2. Build the synthetic backup file with that exact credentialId.
		const filePath = writeBackupToTemp(await buildSyntheticPasskeyBackup(page, passkey), "passkey-backup.json")

		// 3. Reset the wallet via the in-app reset flow — the same pattern
		//    `passkey-paths.test.ts:140-172` uses.
		await resetWallet(page)

		// 4. Drive the import flow.
		await page.evaluate(() => {
			window.location.hash = "#/popup/import"
		})
		await waitForHash(page, "#/popup/import", 5_000)
		await importPasskeyFullBackup(page, filePath)

		// 5. Address comes back identical. Proves the credentialId binding
		//    + master-secret derivation round-tripped through the modal.
		const addressAfter = await readActiveAccount(page)
		expect(addressAfter).toBe(addressBefore)

		// Durable UI pointers populated post-import (same as the password
		// round-trip test in import-paths.test.ts).
		const storage = await page.evaluate(async () => {
			const r = await chrome.storage.local.get(["nulo:ui:lastActiveProfile"])
			return r
		})
		expect(storage["nulo:ui:lastActiveProfile"]).toBeTruthy()
		expect(await selectedAccount(page)).toBeTruthy()

		// Lock-cascade benign errors are the same shape as other Path A tests.
		const nonBenign = freshExtensionPerTest.pageErrors.filter((e) => !e.message.includes("Client disconnected"))
		expect(nonBenign).toEqual([])
	} finally {
		await auth.cleanup()
		await page.close()
	}
}, 120_000)

// A real passkey export → reset → import round trip: the passkey row of
// `network/import-handshake-note-matrix.test.ts`, and `toolbar-panel.test.ts` on Firefox.
