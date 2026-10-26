/** Full backups for the profile chaos drivers: export through Settings, restore through the import
 *  page, and the corrupted copies a restore must refuse. */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { clickByTestId, pickFileByTestId, replaceInputValue } from "../../fixtures/dom"
import { downloadEncryptedBackup, downloadPlainPasskeyBackup } from "../backup-export"
import { setInputs } from "../import-drivers"
import type { ModelFile, ModelProfile, ParamsMap } from "./model"
import { type Driven, type RunState, secretFor, wrongSecret } from "./state"
import { answerConfirm, confirmLeft, firstSignal, HOME, openRoute, type Signal, settle, timed } from "./ui"

const EXPORT_MS = 240_000
const RESTORE_MS = 300_000

export async function exportFullBackup(s: RunState, open: ModelProfile, file: ModelFile): Promise<Driven> {
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
	} else {
		text = await downloadPlainPasskeyBackup(page)
		await confirmLeft(page)
	}
	const path = join(s.dir, `${file.ref}.json`)
	writeFileSync(path, text)
	s.files.set(file.ref, { path, kind: "backup" })
	return timed(t0, EXPORT_MS, "committed")
}

/** One character changed in the middle of the file's longest encoded run, its syntax kept. */
function flipOne(text: string): string {
	const runs = [...text.matchAll(/[A-Za-z0-9+/]{24,}/g)].sort((a, b) => b[0].length - a[0].length)
	const run = runs[0]
	if (!run || run.index === undefined) throw new Error("no encoded run to flip")
	const at = run.index + Math.floor(run[0].length / 2)
	return `${text.slice(0, at)}${text[at] === "A" ? "B" : "A"}${text.slice(at + 1)}`
}

function variantPath(s: RunState, file: ModelFile, variant: ParamsMap["importBackup"]["variant"]): string {
	const held = s.files.get(file.ref)
	if (!held) throw new Error(`${file.ref} is not on disk`)
	if (variant === "right" || variant === "wrong-password") return held.path
	const text = readFileSync(held.path, "utf8")
	const path = join(s.dir, `${file.ref}-${variant}-${Date.now().toString(36)}.json`)
	writeFileSync(path, variant === "truncated" ? text.slice(0, Math.floor(text.length * 0.6)) : flipOne(text))
	return path
}

const ERROR: Signal = { label: "refused", testid: "import-full-backup-error" }
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

/** Decrypts with the file's password, or another one; true once the form asks for the new one. */
async function decrypt(s: RunState, file: ModelFile, wrong: boolean): Promise<boolean> {
	const page = s.anchor
	await replaceInputValue(
		page,
		'[data-testid="import-full-backup-decrypt-password-input"]',
		wrong ? wrongSecret() : secretFor(s, file.password as never),
	)
	await clickByTestId(page, "import-full-backup-decrypt-btn")
	const { label } = await firstSignal(page, [ERROR, { label: "form", testid: "import-full-backup-password-input" }], 60_000)
	return label === "form"
}

/** Submits and answers a duplicate warning as asked; an errors screen's Continue goes on to Home. */
async function submitRestore(s: RunState, duplicate: ParamsMap["importBackup"]["duplicate"]): Promise<Driven> {
	const page = s.anchor
	await clickByTestId(page, "import-full-backup-submit-btn")
	const warn: Signal = { label: "warned", testid: "confirm-submit" }
	const first = await firstSignal(page, [warn, HOME, CONTINUE, ERROR], RESTORE_MS)
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
	const seen = first.label === "warned" ? await firstSignal(page, [HOME, CONTINUE, ERROR], RESTORE_MS) : first
	if (seen.label === "continue") {
		await clickByTestId(page, "import-full-backup-continue-btn")
		return settle(page, [HOME], { home: "committed" }, RESTORE_MS)
	}
	return settle(page, [HOME, ERROR], { home: "committed", refused: "refused" }, 1_000)
}

/** Picks `file` on the import page the caller opened and fills the form up to its submit; false
 *  when the wallet refused the file on the way. */
export async function fillRestore(s: RunState, file: ModelFile, p: ParamsMap["importBackup"]): Promise<boolean> {
	const page = s.anchor
	await clickByTestId(page, "import-option-full-backup")
	await pickFileByTestId(page, "import-full-backup-pick-file", variantPath(s, file, p.variant))
	const picked = await afterPick(s)
	if (picked === "refused" || picked === undefined) return false
	if (picked === "decrypt" && !(await decrypt(s, file, p.variant === "wrong-password"))) return false
	if (file.method === "password") {
		const password = secretFor(s, p.password)
		await setInputs(page, {
			'[data-testid="import-full-backup-password-input"] input': password,
			'[data-testid="import-full-backup-password-confirm-input"] input': password,
		})
	}
	return true
}

/** Restores `file` from the import page the caller opened, as `p` says. */
export async function restoreFile(s: RunState, file: ModelFile, p: ParamsMap["importBackup"]): Promise<Driven> {
	const t0 = Date.now()
	if (!(await fillRestore(s, file, p))) return timed(t0, RESTORE_MS, "refused")
	return submitRestore(s, p.duplicate)
}
