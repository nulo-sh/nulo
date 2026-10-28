/** Account files for the profile chaos drivers: export a derived or imported account, import a
 *  file into the open profile, and read every derived address in index order. */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Page } from "puppeteer"
import { decryptAccountExport } from "@nulo/aztec-runtime/account"
import { clickByTestId, replaceInputValue } from "../../fixtures/dom"
import { readActiveNetwork } from "../../fixtures/networks"
import { answerWithCredential } from "../../fixtures/passkey"
import { callService } from "../../fixtures/session"
import { exportAccountBody, openAccountExport, previewImport } from "../account-io"
import { armDownloadCapture, readCapturedDownload } from "../download-capture"
import { refusesShortPassword, shortFilePassword } from "./backups"
import type { ChainAddresses } from "./checkers"
import type { CredentialRef, FileRef, ModelFile, ModelProfile, ParamsMap, SecretRef } from "./model"
import { answeredCredentials, capturePrf, drainPrf } from "./prf-capture"
import { type Driven, type RunState, credentialId, profileId, secretFor } from "./state"
import { PASSKEY_REFUSAL, type Signal, settle, timed } from "./ui"

const ACCOUNT_MS = 120_000
/** Derived accounts' type in `Account.type`; an imported account has another. */
const DERIVED_TYPE = 0

type AccountRow = { address: string; index: number; type: number; name: string }

async function accountsOn(page: Page, id: string): Promise<{ chainId: number; rows: AccountRow[] }> {
	const { chainId } = await readActiveNetwork(page)
	return { chainId, rows: await callService<AccountRow[]>(page, "account", "getAccounts", [id, chainId, true]) }
}

const accountsOf = async (page: Page, id: string): Promise<AccountRow[]> => (await accountsOn(page, id)).rows

/** The open profile's derived addresses on its active chain, by index. */
export async function derivedAddresses(page: Page, id: string): Promise<ChainAddresses> {
	const { chainId, rows } = await accountsOn(page, id)
	const addresses = rows
		.filter((a) => a.type === DERIVED_TYPE)
		.sort((a, b) => a.index - b.index)
		.map((a) => a.address)
	return { chainId, addresses }
}

/** The name an imported account file is given, so a later export finds its row. */
export const importedName = (file: FileRef): string => `Imported ${file}`

async function exportedKey(body: string, password: string): Promise<{ signingKey: string; address: string }> {
	const plain = JSON.parse(await decryptAccountExport(body, password)) as { signingKey: string; address: string }
	return { signingKey: plain.signingKey, address: plain.address }
}

/** The export row's name for the account `which` picks in `open`. */
async function exportRowName(s: RunState, open: ModelProfile, which: ParamsMap["exportAccountFile"]["which"]): Promise<string> {
	if ("sentinel" in which) return importedName(which.sentinel)
	const row = (await accountsOf(s.anchor, profileId(s, open.ref))).find((a) => a.type === DERIVED_TYPE && a.index === which.derivedIndex)
	if (!row) throw new Error(`${open.ref} shows no derived account ${which.derivedIndex}`)
	return row.name
}

const APPROVED: Signal = { label: "approved", testid: "account-file-password-input" }

/** Past the agree gate, Confirm with passkey answered as `p` says: the page asks the file password
 *  once the answer opened the profile. */
async function confirmPasskey(s: RunState, p: Pick<ParamsMap["exportAccountFile"], "variant" | "other">): Promise<Driven> {
	const page = s.anchor
	await clickByTestId(page, "agree-continue-btn")
	await page.waitForSelector('[data-testid="account-file-confirm-passkey-btn"]', { visible: true, timeout: 15_000 })
	const press = async (): Promise<Driven> => {
		await clickByTestId(page, "account-file-confirm-passkey-btn")
		return settle(
			page,
			[APPROVED, ...PASSKEY_REFUSAL],
			{ approved: "committed", cancelled: "cancelled", refused: "refused" },
			ACCOUNT_MS,
		)
	}
	if (p.variant === "refuse") {
		if (!s.auth) throw new Error("a refused passkey needs the run's authenticator")
		const allow = await s.auth.refuseNextStep(page)
		try {
			return await press()
		} finally {
			await allow()
		}
	}
	if (p.variant === "other") await answerWithCredential(page, credentialId(s, p.other))
	return press()
}

const SAVED: Signal[] = [
	{ label: "saved", testid: "account-file-protected-banner" },
	{ label: "refused", text: "Failed to create the file" },
]

/** Save seals the file and downloads it unasked, so the capture is armed before the press. */
async function saveFile(page: Page, button: string, password: string): Promise<{ body: string; password: string } | Driven> {
	await armDownloadCapture(page, { gzip: false })
	await clickByTestId(page, button)
	const saved = await settle(page, SAVED, { saved: "committed", refused: "refused" }, ACCOUNT_MS)
	if (saved.outcome !== "committed" || !saved.settle.reached) return saved
	return { body: await readCapturedDownload(page), password }
}

/** A passkey profile's file: its passkey, then the file password; the body, or how the page refused. */
async function passkeyFile(
	s: RunState,
	name: string,
	p: Pick<ParamsMap["exportAccountFile"], "variant" | "other"> & { password: SecretRef },
): Promise<{ body: string; password: string } | Driven> {
	const t0 = Date.now()
	await openAccountExport(s.anchor, name)
	const confirmed = await confirmPasskey(s, p)
	if (confirmed.outcome !== "committed" || !confirmed.settle.reached) return confirmed
	const form = { field: "account-file-password", button: "account-file-save-btn" } as const
	if (p.variant === "short") {
		const short = shortFilePassword(s, p.password)
		// An enabled Save is pressed, as a person would, so a file the rule let through is seen.
		if (await refusesShortPassword(s.anchor, short, form)) return timed(t0, ACCOUNT_MS, "refused")
		return saveFile(s.anchor, form.button, short)
	}
	const password = secretFor(s, p.password)
	await replaceInputValue(s.anchor, `[data-testid="${form.field}-input"]`, password)
	await replaceInputValue(s.anchor, `[data-testid="${form.field}-confirm-input"]`, password)
	return saveFile(s.anchor, form.button, password)
}

/** A password profile's file opens with its password; a passkey profile's with the file password
 *  its export asked for. */
export async function exportAccount(s: RunState, open: ModelProfile, p: ParamsMap["exportAccountFile"]): Promise<Driven> {
	const t0 = Date.now()
	const name = await exportRowName(s, open, p.which)
	let made: { body: string; password: string }
	if (open.method === "password") {
		const password = secretFor(s, open.password as never)
		made = { body: await exportAccountBody(s.anchor, name, true, password), password }
	} else {
		const file = await passkeyFile(s, name, { ...p, password: p.password as SecretRef })
		if (!("body" in file)) return file
		made = file
	}
	const { signingKey, address } = await exportedKey(made.body, made.password)
	const path = join(s.dir, `${p.file}.json`)
	writeFileSync(path, made.body)
	s.files.set(p.file, { path, kind: "account", signingKey, address })
	return timed(t0, ACCOUNT_MS, "committed")
}

/** The signing key the open profile exports now for the account it imported from `file`: a passkey
 *  profile approves with its own passkey and protects the file under `file`'s own password. */
export async function reexportImported(s: RunState, owner: ModelProfile, file: ModelFile): Promise<string> {
	const name = importedName(file.ref)
	if (owner.method === "password") {
		const password = secretFor(s, owner.password as never)
		return (await exportedKey(await exportAccountBody(s.anchor, name, true, password), password)).signingKey
	}
	// The unlock before it is drained, so the only answer checked is the re-export's own.
	await capturePrf(s.anchor)
	await drainPrf(s, s.anchor)
	const made = await passkeyFile(s, name, { password: file.password as SecretRef })
	if (!("body" in made)) throw new Error(`${owner.ref}'s passkey did not approve re-exporting ${file.ref}`)
	await answeredCredentials(s, s.anchor, [{ kind: "get", credential: owner.credential as CredentialRef }])
	return (await exportedKey(made.body, made.password)).signingKey
}

export async function importAccountFile(s: RunState, file: ModelFile): Promise<Driven> {
	const held = s.files.get(file.ref)
	if (!held) throw new Error(`${file.ref} is not on disk`)
	const page = s.anchor
	const t0 = Date.now()
	const address = await previewImport(page, readFileSync(held.path, "utf8"), secretFor(s, file.password as never))
	if (!address) return timed(t0, ACCOUNT_MS, "refused")
	// An account the profile holds is refused at the preview, which renders with the held line.
	if (await page.$('[data-testid="import-account-held"]')) return timed(t0, ACCOUNT_MS, "refused")
	await page.waitForSelector('[data-testid="import-account-name-input"] input', { visible: true, timeout: 15_000 })
	await replaceInputValue(page, '[data-testid="import-account-name-input"] input', importedName(file.ref))
	await clickByTestId(page, "import-account-submit")
	return settle(
		page,
		[
			{ label: "committed", text: "Account imported" },
			{ label: "refused", testid: "import-account-error" },
		],
		{ committed: "committed", refused: "refused" },
		ACCOUNT_MS,
	)
}
