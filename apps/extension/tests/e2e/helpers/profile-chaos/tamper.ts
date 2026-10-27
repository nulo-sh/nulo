/**
 * Stored rows changed under the wallet: a profile row edited while a passkey unlock waits at its
 * prompt, and a sealed slot with one byte flipped. The page writes `chrome.storage.local` as anything
 * else holding the profile's storage could, and puts the row back byte for byte once the step ends,
 * so the census sees the step write nothing.
 */
import { randomBytes } from "node:crypto"
import type { Page } from "puppeteer"
import { PASSKEY_COPY } from "@/utils/passkey-copy"
import { clickByTestId } from "../../fixtures/dom"
import { holdNextGet } from "../../fixtures/passkey"
import type { ModelProfile, ParamsMap } from "./model"
import { type Driven, profileId, type RunState, secretFor } from "./state"
import { authSubmitReady, HOME, openRoute, pickOnLockScreen, settle, typePasswordAndSubmit, unlockAttemptEnded } from "./ui"

const UNLOCK_MS = 60_000

/** The lock screen's passkey failure and the password form's, as the refusal a step reports. */
export const UNLOCK_REFUSALS = [
	{ label: "refused", testid: "error-text" },
	{ label: "refused", text: PASSKEY_COPY.unlockFailed, hash: "/popup/auth" },
]

const rowKey = (id: string): string => `nulo:core:profiles@${id}`

async function readRow(page: Page, id: string): Promise<string> {
	const raw = await page.evaluate(async (key: string) => (await chrome.storage.local.get(key))[key], rowKey(id))
	if (typeof raw !== "string") throw new Error(`${rowKey(id)} holds no row`)
	return raw
}

async function writeRow(page: Page, id: string, raw: string): Promise<void> {
	await page.evaluate(async (key: string, value: string) => chrome.storage.local.set({ [key]: value }), rowKey(id), raw)
}

/** The base64 value with its last byte, a frame's tag byte, changed. */
function flipLast(b64: string): string {
	const bytes = Buffer.from(b64, "base64")
	if (!bytes.length) throw new Error("an empty slot")
	bytes[bytes.length - 1] ^= 0x01
	return bytes.toString("base64")
}

/** The row with `field` changed as something holding storage could change it; a forged `prfSalt`
 *  becomes a needle that may sit nowhere once the row is back. */
function edited(s: RunState, raw: string, field: ParamsMap["editRowDuringUnlock"]["field"]): string {
	const row = JSON.parse(raw) as Record<string, unknown>
	if (field === "type") row.type = "password"
	else if (field === "secret") row.secret = flipLast(row.secret as string)
	else row[field] = randomBytes(field === "prfSalt" ? 32 : 16).toString("base64url")
	if (field === "prfSalt") s.salts.set(`forged/prf-salt-${s.salts.size}`, { value: row.prfSalt as string })
	return JSON.stringify(row)
}

/** Puts the original row back only where it still holds what the harness wrote, so a write or a
 *  delete the wallet made to it during the step stays for the census to judge. */
async function restoreRow(page: Page, id: string, wrote: string, original: string): Promise<void> {
	const now = await page.evaluate(async (key: string) => (await chrome.storage.local.get(key))[key], rowKey(id))
	if (now === wrote) await writeRow(page, id, original)
}

/** Runs `step` with the row of `id` changed by `change`, then puts it back as `restoreRow` says. */
async function withRow(page: Page, id: string, change: (raw: string) => string, step: () => Promise<Driven>): Promise<Driven> {
	const original = await readRow(page, id)
	const wrote = change(original)
	await writeRow(page, id, wrote)
	try {
		return await step()
	} finally {
		await restoreRow(page, id, wrote, original)
	}
}

/** The unlock reads the row again once the prompt answered, so the change lands between the two. */
export async function editRowDuringUnlock(s: RunState, p: ParamsMap["editRowDuringUnlock"], selected: ModelProfile): Promise<Driven> {
	const page = s.anchor
	const id = profileId(s, selected.ref)
	await openRoute(page, "#/popup/auth")
	await pickOnLockScreen(page, id)
	await authSubmitReady(page)
	const original = await readRow(page, id)
	const hold = await holdNextGet(page)
	await clickByTestId(page, "auth-submit")
	await hold.reached()
	const wrote = edited(s, original, p.field)
	await writeRow(page, id, wrote)
	try {
		await hold.release()
		await unlockAttemptEnded(page, UNLOCK_MS)
		return await settle(page, [HOME, ...UNLOCK_REFUSALS], { home: "committed", refused: "refused" }, UNLOCK_MS)
	} finally {
		await restoreRow(page, id, wrote, original)
	}
}

/** A slot whose tag byte changed, opened with the profile's own password or passkey. */
export async function tamperedUnlock(s: RunState, p: ParamsMap["tamperedUnlock"], target: ModelProfile): Promise<Driven> {
	const page = s.anchor
	const id = profileId(s, target.ref)
	await openRoute(page, "#/popup/auth")
	await pickOnLockScreen(page, id)
	const flip = (raw: string): string => {
		const row = JSON.parse(raw) as Record<string, unknown>
		row[p.slot] = flipLast(row[p.slot] as string)
		return JSON.stringify(row)
	}
	return withRow(page, id, flip, async () => {
		if (target.method === "password") await typePasswordAndSubmit(page, secretFor(s, target.password as never))
		else {
			await authSubmitReady(page)
			await clickByTestId(page, "auth-submit")
		}
		return settle(page, [HOME, ...UNLOCK_REFUSALS], { home: "committed", refused: "refused" }, UNLOCK_MS)
	})
}
