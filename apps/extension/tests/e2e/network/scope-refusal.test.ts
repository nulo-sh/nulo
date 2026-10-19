import { expect, inject } from "vitest"
import { SCOPE_VIOLATION_ENVELOPE } from "@/wallet/services/wallet-sdk/error-envelope"
import { clickByTestId, openPopup, test, waitForHash } from "../fixtures/extension"
import { readStoredCapability } from "../fixtures/dappSession"
import { setDeveloperMode } from "../fixtures/helpers"
import { readSendRecords, waitForSendRecord } from "../fixtures/journal"
import { readErrorKind, readJournalDetail, readTerminalCard } from "../fixtures/journal-page"
import {
	assertPgOk,
	callExpectingNoPopup,
	PLAYGROUND_TEST_URL,
	requestPgBundle,
	setPgInput,
	snapshotResultSeq,
	waitForPgResult,
} from "../fixtures/playground"
import { approveCapabilities, rejectExecute, waitForExecuteContent, waitForPopup } from "../fixtures/popups"
import type { AztecTestConfig } from "../fixtures/aztec"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * A send outside the app's transaction grant is refused before any window opens. The app gets the
 * one scope-refusal envelope, and the send's journal record and its History card read as not
 * allowed, the record's developer view showing the refusal's fixed text, which names no address.
 * A call whose selector runs another function than the name its grant check read is refused while
 * its window estimates the fee: the window offers only Reject, which answers the same refusal.
 * A refused row is titled by what the wallet resolved, never by the name the app claimed:
 * "Transaction" when nothing resolved it, the selector's function otherwise.
 */

const OTHER = `0x${"0a".repeat(32)}`
const LISTED = { type: "transaction", scope: [{ contract: OTHER, function: "transfer_public_to_public" }] }
const readHistoryCard = (page: Parameters<typeof readTerminalCard>[0], shot?: string) => readTerminalCard(page, "#/popup/activity", shot)

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
		const detail = await readJournalDetail(wallet, record.id, "refused-scope-detail")
		const card = await readHistoryCard(wallet, "refused-scope-card")
		expect({ status: refused.status, error: refused.errorJson, sends, detail, card }).toEqual({
			status: "error",
			error: { message: JSON.stringify(SCOPE_VIOLATION_ENVELOPE) },
			sends: [record.id],
			detail: {
				"journal-detail-category": "Not allowed",
				"journal-detail-context": "The app asked for more than you allowed. Nothing was sent.",
				"journal-detail-state": "Failed",
				"journal-detail-method": "Transaction",
				"journal-detail-error-message": null,
			},
			card: { title: "Transaction", subtitle: "Not allowed" },
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
		await execute.waitForSelector('[data-testid="execute-op-refusal"]', { visible: true, timeout: 120_000 })
		expect(await execute.$eval('[data-testid="execute-op-refusal"]', (el) => el.getAttribute("data-kind"))).toBe("call")
		expect(await execute.$('[data-testid="execute-confirm-btn"]')).toBeNull()
		await rejectExecute(execute)
		const answer = await waitForPgResult(page, "sendTx", seq, 120_000)

		const wallet = await openPopup(ctx)
		await waitForHash(wallet, "#/popup/general")
		const record = await waitForSendRecord(wallet, (r) => r.kind === "dapp_execute" && r.stage === "failed", 120_000)
		expect({
			status: answer.status,
			error: answer.errorJson,
			kind: await readErrorKind(wallet, record.id),
			home: await readTerminalCard(wallet, "#/popup/general", "refused-binding-card"),
			detail: await readJournalDetail(wallet, record.id, "refused-binding-detail"),
			card: await readHistoryCard(wallet),
		}).toEqual({
			status: "error",
			error: { message: JSON.stringify(SCOPE_VIOLATION_ENVELOPE) },
			kind: "scope_refused",
			// Titled by the function the selector runs, not the "balance_of_public" the call claimed, as its
			// contract spells it: no build recorded the class a movement label needs.
			home: { title: "Transfer Public To Public", subtitle: "Not allowed" },
			detail: {
				"journal-detail-category": "Not allowed",
				"journal-detail-context": "The app asked for more than you allowed. Nothing was sent.",
				"journal-detail-state": "Failed",
				"journal-detail-method": "Transfer Public To Public",
				"journal-detail-error-message": null,
			},
			card: { title: "Transfer Public To Public", subtitle: "Not allowed" },
		})

		await setDeveloperMode(wallet, true)
		const detail = await readJournalDetail(wallet, record.id)
		expect(detail["journal-detail-error-message"]).toBe("Scope violation: call name does not match selector's function")
		// Refused before any claim, so the record carries no raw error.
		expect(await wallet.$('[data-testid="journal-detail-error-raw"]')).toBeNull()
	},
)
