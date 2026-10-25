/** Account files for the profile chaos drivers: export a derived or imported account, import a
 *  file into the open profile, and read every derived address in index order. */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Page } from "puppeteer"
import { decryptAccountExport } from "@nulo/aztec-runtime/account"
import { clickByTestId, replaceInputValue } from "../../fixtures/dom"
import { readActiveNetwork } from "../../fixtures/networks"
import { callService } from "../../fixtures/session"
import { exportAccountBody, previewImport } from "../account-io"
import type { FileRef, ModelFile, ModelProfile, ParamsMap } from "./model"
import { type Driven, type RunState, profileId, secretFor } from "./state"
import { settle, timed } from "./ui"

const ACCOUNT_MS = 120_000
/** Derived accounts' type in `Account.type`; an imported account has another. */
const DERIVED_TYPE = 0

type AccountRow = { address: string; index: number; type: number; name: string }

async function accountsOf(page: Page, id: string): Promise<AccountRow[]> {
	const { chainId } = await readActiveNetwork(page)
	return callService<AccountRow[]>(page, "account", "getAccounts", [id, chainId, true])
}

/** The open profile's derived addresses, by index. */
export async function derivedAddresses(page: Page, id: string): Promise<string[]> {
	return (await accountsOf(page, id))
		.filter((a) => a.type === DERIVED_TYPE)
		.sort((a, b) => a.index - b.index)
		.map((a) => a.address)
}

/** The name an imported account file is given, so a later export finds its row. */
export const importedName = (file: FileRef): string => `Imported ${file}`

async function exportedKey(body: string, password: string): Promise<{ signingKey: string; address: string }> {
	const plain = JSON.parse(await decryptAccountExport(body, password)) as { signingKey: string; address: string }
	return { signingKey: plain.signingKey, address: plain.address }
}

export async function exportAccount(s: RunState, open: ModelProfile, p: ParamsMap["exportAccountFile"]): Promise<Driven> {
	const t0 = Date.now()
	const password = secretFor(s, open.password as never)
	let name: string
	if ("sentinel" in p.which) name = importedName(p.which.sentinel)
	else {
		const index = p.which.derivedIndex
		const row = (await accountsOf(s.anchor, profileId(s, open.ref))).find((a) => a.type === DERIVED_TYPE && a.index === index)
		if (!row) throw new Error(`${open.ref} shows no derived account ${index}`)
		name = row.name
	}
	const body = await exportAccountBody(s.anchor, name, true, password)
	const { signingKey, address } = await exportedKey(body, password)
	const path = join(s.dir, `${p.file}.json`)
	writeFileSync(path, body)
	s.files.set(p.file, { path, kind: "account", signingKey, address })
	return timed(t0, ACCOUNT_MS, "committed")
}

/** The signing key the open profile exports now for the account it imported from `file`. */
export async function reexportImported(s: RunState, owner: ModelProfile, file: FileRef): Promise<string> {
	const password = secretFor(s, owner.password as never)
	return (await exportedKey(await exportAccountBody(s.anchor, importedName(file), true, password), password)).signingKey
}

export async function importAccountFile(s: RunState, file: ModelFile): Promise<Driven> {
	const held = s.files.get(file.ref)
	if (!held) throw new Error(`${file.ref} is not on disk`)
	const page = s.anchor
	const t0 = Date.now()
	const address = await previewImport(page, readFileSync(held.path, "utf8"), secretFor(s, file.password as never))
	if (!address) return timed(t0, ACCOUNT_MS, "refused")
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
