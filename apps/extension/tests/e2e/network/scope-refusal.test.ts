import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import { SCOPE_VIOLATION_ENVELOPE } from "@/wallet/services/wallet-sdk/error-envelope"
import { clickByTestId, openPopup, test, waitForHash } from "../fixtures/extension"
import { readStoredCapability } from "../fixtures/dappSession"
import { navigateByHash, setDeveloperMode } from "../fixtures/helpers"
import { readSendRecords, waitForSendRecord } from "../fixtures/journal"
import {
	assertPgOk,
	callExpectingNoPopup,
	PLAYGROUND_TEST_URL,
	requestPgBundle,
	setPgInput,
	snapshotResultSeq,
	waitForPgResult,
} from "../fixtures/playground"
import { approveCapabilities, approveExecute, waitForExecuteContent, waitForPopup } from "../fixtures/popups"
import type { AztecTestConfig } from "../fixtures/aztec"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * A send outside the app's transaction grant is refused before any window opens. The app gets the
 * one scope-refusal envelope, and the send's journal record and its History card read as not
 * allowed, the record's developer view showing the refusal's fixed text, which names no address.
 * A call whose selector runs another function than the name its grant check read is refused at
 * execution the same way.
 */

const OTHER = `0x${"0a".repeat(32)}`
const LISTED = { type: "transaction", scope: [{ contract: OTHER, function: "transfer_public_to_public" }] }
const DETAIL_FIELDS = ["journal-detail-category", "journal-detail-context", "journal-detail-state", "journal-detail-error-message"]

/** The journal detail's fields for record `id` once its state row renders; a field the page does
 *  not show reads null. */
async function readJournalDetail(page: Page, id: string): Promise<Record<string, string | null>> {
	await navigateByHash(page, `#/popup/journal/${id}`)
	await page.waitForFunction(
		(sel: string) => (document.querySelector(sel)?.textContent?.trim() ?? "") !== "",
		{ timeout: 10_000, polling: 100 },
		'[data-testid="journal-detail-state"]',
	)
	return page.evaluate(
		(ids: string[]) =>
			Object.fromEntries(ids.map((id) => [id, document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? null])),
		DETAIL_FIELDS,
	)
}

const CARD_SUBTITLE = '[data-testid="tx-terminal-card"] [data-testid="tx-terminal-subtitle"]'

/** The stored error kind of journal record `id`: the send-record view carries none. */
async function readErrorKind(page: Page, id: string): Promise<string | undefined> {
	return page.evaluate(async (key: string) => {
		const raw = (await chrome.storage.local.get(key))[key]
		const record = (typeof raw === "string" ? JSON.parse(raw) : raw) as { error?: { kind?: string } | null } | undefined
		return record?.error?.kind
	}, `nulo:journal@${id}`)
}

/** History's subtitle for the one terminal card it lists, read after the wait: the fixtures'
 *  `waitForSelector` resolves `null`, never an element handle. */
async function readHistoryCard(page: Page): Promise<string | null> {
	await navigateByHash(page, "#/popup/activity")
	await page.waitForSelector(CARD_SUBTITLE, { visible: true, timeout: 15_000 })
	return page.$eval(CARD_SUBTITLE, (el) => el.textContent?.trim() ?? null)
}

test.skipIf(!hasConfig)(
	"scope-refusal — a send outside the listed scope is refused without a window and filed as not allowed",
	{ timeout: 240_000 },
	async ({ dappConnectedExtensionPerTest: ctx }) => {
		const config = aztecConfig as AztecTestConfig
		const page = ctx.playgroundPage

		const seq = await snapshotResultSeq(page)
		const popupP = waitForPopup(ctx, "capabilities", { timeout: 60_000 })
		await requestPgBundle(page, "transaction-listed", { tokenAddress: OTHER })
		const popup = await popupP
		await popup.waitForSelector('[data-testid="cap-account-item"]', { timeout: 60_000 })
		const account = await popup.$eval('[data-testid="cap-account-item"]', (row) => row.getAttribute("data-account-id"))
		await approveCapabilities(popup, { accounts: [account!] })
		const answer = await waitForPgResult(page, "requestCapabilities", seq, 30_000)
		await assertPgOk(page, answer, "scope-refusal:requestCapabilities")
		const granted = (answer.resultJson as { granted?: Array<Record<string, unknown>> })?.granted ?? []
		expect(granted.find((g) => g.type === "transaction")).toEqual(LISTED)
		expect(await readStoredCapability(ctx, new URL(PLAYGROUND_TEST_URL).origin, "transaction")).toEqual(LISTED)

		// The network's token is not the contract the grant lists.
		await setPgInput(page, "tokenAddress", config.tokenAddress)
		await setPgInput(page, "recipient", config.minterAddress)
		await setPgInput(page, "amount", "1")
		const refused = await callExpectingNoPopup(ctx, page, "sendTx", () => clickByTestId(page, "pg-btn-sendTx-default"))

		const wallet = await openPopup(ctx)
		await waitForHash(wallet, "#/popup/general")
		const record = await waitForSendRecord(wallet, (r) => r.kind === "dapp_execute" && r.stage === "failed")
		const sends = (await readSendRecords(wallet)).filter((r) => r.kind === "dapp_execute").map((r) => r.id)
		const detail = await readJournalDetail(wallet, record.id)
		const card = await readHistoryCard(wallet)
		expect({ status: refused.status, error: refused.errorJson, sends, detail, card }).toEqual({
			status: "error",
			error: { message: JSON.stringify(SCOPE_VIOLATION_ENVELOPE) },
			sends: [record.id],
			detail: {
				"journal-detail-category": "Not allowed",
				"journal-detail-context": "The app asked for more than you allowed. Nothing was sent.",
				"journal-detail-state": "Failed",
				"journal-detail-error-message": null,
			},
			card: "Not allowed",
		})

		await setDeveloperMode(wallet, true)
		const message = (await readJournalDetail(wallet, record.id))["journal-detail-error-message"]
		expect(message).toBe("Scope violation: sendTx call not permitted by granted transaction scope")
		expect(message).not.toContain("0x")
	},
)

test.skipIf(!hasConfig)(
	"scope-refusal — a call whose selector runs another function than its name claims is refused as out of scope",
	{ timeout: 360_000 },
	async ({ dappConnectedExtensionWithTransactionCap: ctx }) => {
		const config = aztecConfig as AztecTestConfig
		const page = ctx.playgroundPage
		await setPgInput(page, "tokenAddress", config.tokenAddress)
		await setPgInput(page, "recipient", config.minterAddress)
		await setPgInput(page, "amount", "1")
		// A raw protocol client: the call claims a read-only name while its selector stays the transfer's.
		await page.evaluate(() => {
			const encode = TextEncoder.prototype.encode
			TextEncoder.prototype.encode = function (input?: string) {
				const claimed =
					typeof input === "string" ? input.replace(/"name":"transfer_public_to_public"/g, '"name":"balance_of_public"') : input
				return encode.call(this, claimed)
			}
		})

		const seq = await snapshotResultSeq(page)
		const opened = waitForPopup(ctx, "execute", { timeout: 60_000 })
		await clickByTestId(page, "pg-btn-sendTx-default")
		const execute = await opened
		await waitForExecuteContent(execute)
		await approveExecute(execute, { approvableTimeoutMs: 120_000 })
		const answer = await waitForPgResult(page, "sendTx", seq, 120_000)

		const wallet = await openPopup(ctx)
		await waitForHash(wallet, "#/popup/general")
		const record = await waitForSendRecord(wallet, (r) => r.kind === "dapp_execute" && r.stage === "failed", 120_000)
		expect({
			status: answer.status,
			error: answer.errorJson,
			kind: await readErrorKind(wallet, record.id),
			detail: await readJournalDetail(wallet, record.id),
			card: await readHistoryCard(wallet),
		}).toEqual({
			status: "error",
			error: { message: JSON.stringify(SCOPE_VIOLATION_ENVELOPE) },
			kind: "scope_refused",
			detail: {
				"journal-detail-category": "Not allowed",
				"journal-detail-context": "The app asked for more than you allowed. Nothing was sent.",
				"journal-detail-state": "Failed",
				"journal-detail-error-message": null,
			},
			card: "Not allowed",
		})

		await setDeveloperMode(wallet, true)
		const detail = await readJournalDetail(wallet, record.id)
		expect(detail["journal-detail-error-message"]).toBe("Scope violation: call name does not match selector's function")
		const raw = await wallet.$eval('[data-testid="journal-detail-error-raw"]', (el) => el.textContent ?? "")
		expect(raw).toContain('"name":"ScopeViolationError"')
		expect(raw).toContain(`"message":"Scope violation: call name does not match selector's function"`)
	},
)
