/** Full backups for the profile chaos drivers: export through Settings, restore through the import
 *  page, and the corrupted copies a restore must refuse. */
import { randomBytes } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Page } from "puppeteer"
import { openFullBackupText, sealFullBackupText } from "@/utils/full-backup-helpers"
import { PASSKEY_COPY } from "@/utils/passkey-copy"
import { clickByTestId, pickFileByTestId, replaceInputValue } from "../../fixtures/dom"
import { downloadEncryptedBackup, downloadPasskeyBackup } from "../backup-export"
import { type PlainBackup, sealPlainBackup } from "../backup-seal"
import { setInputs } from "../import-drivers"
import type { ModelFile, ModelProfile, ParamsMap, SecretRef } from "./model"
import { pickDiscovered } from "./prf-capture"
import { type Driven, type RunState, secretFor, wrongSecret } from "./state"
import { answerConfirm, firstSignal, HOME, openRoute, type Signal, settle, timed } from "./ui"

const EXPORT_MS = 240_000
const EARLIER_BACKUP = join(import.meta.dirname, "../../../../src/composables/fixtures/earlier-passkey-backup.json")
const RESTORE_MS = 300_000

/** Seven random characters, one short of the file password rule a passkey profile's export applies,
 *  kept as the step's secret so O7 searches for it too. */
export function shortFilePassword(s: RunState, ref: SecretRef): string {
	const value = randomBytes(6).toString("base64url").slice(0, 7)
	s.secrets.set(ref, value)
	return value
}

/** A file password section and the button it enables. */
export type FilePasswordForm = { field: "backup-encrypt-password" | "account-file-password"; button: string }

const BACKUP_FILE_PASSWORD: FilePasswordForm = { field: "backup-encrypt-password", button: "protect-password-btn" }

/** True once the file password is typed and the page still refuses to encrypt with it. */
export async function refusesShortPassword(page: Page, short: string, form: FilePasswordForm = BACKUP_FILE_PASSWORD): Promise<boolean> {
	await page.waitForSelector(`[data-testid="${form.field}-input"]`, { visible: true, timeout: 180_000 })
	await replaceInputValue(page, `[data-testid="${form.field}-input"]`, short)
	await replaceInputValue(page, `[data-testid="${form.field}-confirm-input"]`, short)
	await new Promise((resolve) => setTimeout(resolve, 500))
	return page.$eval(`[data-testid="${form.button}"]`, (el) => (el as HTMLButtonElement).disabled)
}

/** The passkey ceremony starts on agree; a password profile types its password first. */
export async function exportFullBackup(s: RunState, open: ModelProfile, p: ParamsMap["exportBackup"]): Promise<Driven> {
	const page = s.anchor
	const t0 = Date.now()
	await openRoute(page, "#/popup/settings/security/export/full")
	await clickByTestId(page, "agree-continue-btn")
	let text: string
	if (open.method === "password") {
		await page.waitForSelector('[data-testid="unlock-password-input"]', { visible: true, timeout: 15_000 })
		await replaceInputValue(page, '[data-testid="unlock-password-input"]', secretFor(s, open.password as never))
		await clickByTestId(page, "unlock-submit-btn")
		text = await downloadEncryptedBackup(page)
	} else if (p.variant === "short") {
		const short = shortFilePassword(s, p.password as SecretRef)
		// An enabled button is pressed, as a person would, so a file the rule let through is seen.
		if (await refusesShortPassword(page, short)) return timed(t0, EXPORT_MS, "refused")
		text = await downloadPasskeyBackup(page, short)
	} else {
		text = await downloadPasskeyBackup(page, secretFor(s, p.password as never))
	}
	const path = join(s.dir, `${p.file}.json`)
	writeFileSync(path, text)
	s.files.set(p.file, { path, kind: "backup" })
	return timed(t0, EXPORT_MS, "committed")
}

/** The held file opened with its password, its recovery phrase field made a number, then sealed
 *  again under the same password: the body an earlier passkey profile wrote, by its shape. */
async function earlierShape(s: RunState, file: ModelFile, text: string): Promise<string> {
	const password = secretFor(s, file.password as never)
	const body = JSON.parse(await openFullBackupText(text, password)) as PlainBackup
	if (typeof body.entropy !== "string") throw new Error(`${file.ref}'s body carries no recovery phrase field`)
	body.entropy = 0
	return sealFullBackupText(sealPlainBackup(body), password)
}

/** One character changed in the middle of the file's longest encoded run, its syntax kept. */
function flipOne(text: string): string {
	const runs = [...text.matchAll(/[A-Za-z0-9+/]{24,}/g)].sort((a, b) => b[0].length - a[0].length)
	const run = runs[0]
	if (!run || run.index === undefined) throw new Error("no encoded run to flip")
	const at = run.index + Math.floor(run[0].length / 2)
	return `${text.slice(0, at)}${text[at] === "A" ? "B" : "A"}${text.slice(at + 1)}`
}

async function variantPath(s: RunState, file: ModelFile, variant: ParamsMap["importBackup"]["variant"]): Promise<string> {
	const held = s.files.get(file.ref)
	if (!held) throw new Error(`${file.ref} is not on disk`)
	if (variant === "right" || variant === "wrong-password") return held.path
	const text = readFileSync(held.path, "utf8")
	const path = join(s.dir, `${file.ref}-${variant}-${Date.now().toString(36)}.json`)
	const copy = {
		truncated: () => text.slice(0, Math.floor(text.length * 0.6)),
		flipped: () => flipOne(text),
		"earlier-shape": () => earlierShape(s, file, text),
	}
	writeFileSync(path, await copy[variant]())
	return path
}

/** The title the import page's refusal shows. */
async function refusalTitle(page: Page): Promise<string | undefined> {
	return page.$eval('[data-testid="import-full-backup-error-title"]', (el) => el.textContent?.trim()).catch(() => undefined)
}

const ERROR: Signal = { label: "refused", testid: "import-full-backup-error" }
/** A passkey card's failure, which the import page reports in a toast. */
const PASSKEY_REFUSED: Signal[] = [PASSKEY_COPY.notConfirmed, PASSKEY_COPY.noPrf].map((text) => ({ label: "refused", text }))
const CONTINUE: Signal = { label: "continue", testid: "import-full-backup-continue-btn" }

/** After the pick: refused at once, a decrypt step, or the form ready to submit. */
async function afterPick(s: RunState): Promise<string | undefined> {
	await new Promise((resolve) => setTimeout(resolve, 1_500))
	const { label } = await firstSignal(
		s.anchor,
		[
			ERROR,
			{ label: "decrypt", testid: "import-full-backup-decrypt-password-input" },
			{ label: "ready", testid: "import-full-backup-submit-btn" },
		],
		30_000,
	)
	return label
}

/** Decrypts with the file's password or another; true once the form asks how to unlock. */
async function decrypt(s: RunState, file: ModelFile, wrong: boolean): Promise<boolean> {
	const page = s.anchor
	await replaceInputValue(
		page,
		'[data-testid="import-full-backup-decrypt-password-input"]',
		wrong ? wrongSecret() : secretFor(s, file.password as never),
	)
	await clickByTestId(page, "import-full-backup-decrypt-btn")
	const { label } = await firstSignal(page, [ERROR, { label: "form", testid: "import-full-backup-method-password" }], 60_000)
	if (label === undefined) throw new Error("the decrypt step showed neither a refusal nor the form")
	return label === "form"
}

/** Picks the backup a passkey profile made before 1.1, as the wallet's own tests record it, on the
 *  import page the caller opened. */
export async function pickEarlierBackup(s: RunState): Promise<Driven> {
	const page = s.anchor
	const t0 = Date.now()
	await clickByTestId(page, "import-option-full-backup")
	await pickFileByTestId(page, "import-full-backup-pick-file", EARLIER_BACKUP)
	const picked = await afterPick(s)
	if (picked === undefined) throw new Error("the import page showed nothing after the pick")
	// Any other screen is the file offered: a person would go on, and the model allows no commit.
	const driven = timed(t0, RESTORE_MS, picked === "refused" ? "refused" : "committed")
	if (picked === "refused") driven.shows = await refusalTitle(page)
	return driven
}

/** Submits with `press` and answers a duplicate warning as asked; an errors screen's Continue goes on
 *  to Home. */
async function submitRestore(s: RunState, duplicate: ParamsMap["importBackup"]["duplicate"], press: string): Promise<Driven> {
	const page = s.anchor
	await clickByTestId(page, press)
	const warn: Signal = { label: "warned", testid: "confirm-submit" }
	const first = await firstSignal(page, [warn, HOME, CONTINUE, ERROR, ...PASSKEY_REFUSED], RESTORE_MS)
	if (first.label === "warned") {
		if (duplicate !== "confirm") {
			await answerConfirm(page, "cancel")
			return {
				outcome: duplicate === "decline" ? "cancelled" : "refused",
				settle: { reached: duplicate === "decline", elapsedMs: first.elapsedMs, boundMs: RESTORE_MS },
			}
		}
		await answerConfirm(page, "submit")
	}
	const seen = first.label === "warned" ? await firstSignal(page, [HOME, CONTINUE, ERROR, ...PASSKEY_REFUSED], RESTORE_MS) : first
	if (seen.label === "continue") {
		await clickByTestId(page, "import-full-backup-continue-btn")
		return settle(page, [HOME], { home: "committed" }, RESTORE_MS)
	}
	return settle(page, [HOME, ERROR, ...PASSKEY_REFUSED], { home: "committed", refused: "refused" }, 1_000)
}

/** Presses an errors screen's Continue, as a person keeping the restored profile would, and waits
 *  for Home, or for the lock screen a profile with no session lands on; false when the page shows
 *  none. The session oracle judges which. */
export async function continuePastErrors(page: Page): Promise<boolean> {
	const shown = await page.evaluate(() => !!document.querySelector('[data-testid="import-full-backup-continue-btn"]'))
	if (!shown) return false
	await clickByTestId(page, "import-full-backup-continue-btn")
	const landed = await settle(page, [HOME, { label: "lock", hash: "/popup/auth" }], { home: "committed", lock: "committed" }, RESTORE_MS)
	if (!landed.settle.reached) throw new Error("the errors screen's Continue never left the import page")
	return true
}

/** Picks `file` on the import page the caller opened and fills the form up to its submit; false
 *  when the wallet refused the file on the way. */
export async function fillRestore(s: RunState, file: ModelFile, p: ParamsMap["importBackup"]): Promise<boolean> {
	const page = s.anchor
	await clickByTestId(page, "import-option-full-backup")
	await pickFileByTestId(page, "import-full-backup-pick-file", await variantPath(s, file, p.variant))
	const picked = await afterPick(s)
	if (picked === undefined) throw new Error("the import page showed nothing after the pick")
	if (picked === "refused") return false
	if (picked === "decrypt" && !(await decrypt(s, file, p.variant === "wrong-password"))) return false
	// The form opens on the method the backup was made with; the step names the one it restores under.
	if (p.method === "passkey") {
		await clickByTestId(page, "import-full-backup-method-passkey")
		await page.waitForSelector('[data-testid="import-full-backup-method-passkey"][aria-selected="true"]', { timeout: 10_000 })
		return true
	}
	await clickByTestId(page, "import-full-backup-method-password")
	await page.waitForSelector('[data-testid="import-full-backup-password-input"] input', { visible: true, timeout: 10_000 })
	const password = secretFor(s, p.password as SecretRef)
	await setInputs(page, {
		'[data-testid="import-full-backup-password-input"] input': password,
		'[data-testid="import-full-backup-password-confirm-input"] input': password,
	})
	return true
}

/** Restores `file` from the import page the caller opened, as `p` says: `reused`, the id of a
 *  passkey the browser's chooser picks through "Use a passkey I already have". */
export async function restoreFile(s: RunState, file: ModelFile, p: ParamsMap["importBackup"], reused?: string): Promise<Driven> {
	const t0 = Date.now()
	if (!(await fillRestore(s, file, p))) {
		const driven = timed(t0, RESTORE_MS, "refused")
		driven.shows = await refusalTitle(s.anchor)
		return driven
	}
	if (reused === undefined) return submitRestore(s, p.duplicate, "import-full-backup-submit-btn")
	await pickDiscovered(s.anchor, reused)
	return submitRestore(s, p.duplicate, "import-full-backup-passkey-reuse")
}
