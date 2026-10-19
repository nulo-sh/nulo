import { UserRejectedError } from "@nulo/extension-messaging/errors"
import { expect, inject } from "vitest"
import { editorText, readEditorStyles } from "../fixtures/code-editor"
import { clickByTestId, openPopup, test, waitForHash } from "../fixtures/extension"
import { waitForSendRecord } from "../fixtures/journal"
import { readErrorKind, readJournalDetail, readTerminalCard } from "../fixtures/journal-page"
import { snapshotResultSeq, waitForPgResult } from "../fixtures/playground"
import { waitForPopup, waitForExecuteContent, approveCapabilities, rejectExecute } from "../fixtures/popups"
import type { AztecTestConfig } from "../fixtures/aztec"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * Test #34 — user rejects the /windows/execute popup. The window closes only once the wallet has
 * taken its Reject, so the dApp reads 4001 `USER_REJECTED` every time, and the queued record reads
 * as cancelled under the name it had while it waited. Before the reject, the request's JSON opens
 * full screen, a window that needs a live request.
 */
test.skipIf(!hasConfig)(
	"tx-sendTx-reject — Reject button surfaces error to dApp",
	{ timeout: 90_000 },
	async ({ dappConnectedExtension }) => {
		const page = dappConnectedExtension.playgroundPage

		await page.evaluate(() => {
			const select = document.querySelector<HTMLSelectElement>('[data-testid="pg-bundle-select"]')!
			select.value = "transaction"
			select.dispatchEvent(new Event("change", { bubbles: true }))
		})
		const seqGrant = await snapshotResultSeq(page)
		const capPopupP = waitForPopup(dappConnectedExtension, "capabilities", { timeout: 30_000 })
		await clickByTestId(page, "pg-btn-requestCapabilities")
		const capPopup = await capPopupP
		await capPopup.waitForSelector('[data-testid="cap-account-item"]', { timeout: 10_000 })
		const accountIds = await capPopup.evaluate(() =>
			[...document.querySelectorAll<HTMLElement>('[data-testid="cap-account-item"]')].map((r) => r.getAttribute("data-account-id")),
		)
		await approveCapabilities(capPopup, { accounts: [accountIds[0]!] })
		await waitForPgResult(page, "requestCapabilities", seqGrant, 30_000)

		await page.evaluate(
			({ token, recipient }: { token: string; recipient: string }) => {
				const setVal = (sel: string, v: string) => {
					const input = document.querySelector<HTMLInputElement>(sel)
					if (!input) return
					const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set
					setter?.call(input, v)
					input.dispatchEvent(new Event("input", { bubbles: true }))
				}
				setVal('[data-testid="pg-input-tokenAddress"]', token)
				setVal('[data-testid="pg-input-recipient"]', recipient)
				setVal('[data-testid="pg-input-amount"]', "1")
			},
			{ token: aztecConfig!.tokenAddress, recipient: aztecConfig!.minterAddress },
		)

		const seqTx = await snapshotResultSeq(page)
		const execPopupP = waitForPopup(dappConnectedExtension, "execute", { timeout: 30_000 })
		await clickByTestId(page, "pg-btn-sendTx-default")
		const execPopup = await execPopupP
		await waitForExecuteContent(execPopup)

		// A pointer reaches the expand control; the click is dispatched, since an `<svg>` has no `click()`.
		const showJson = '[data-testid="execute-show-json-btn"]'
		await execPopup.waitForSelector(showJson, { visible: true, timeout: 30_000 })
		expect(
			await execPopup.$eval(showJson, (el) => {
				el.scrollIntoView({ block: "center" })
				const box = el.getBoundingClientRect()
				return !!document
					.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
					?.closest('[data-testid="execute-show-json-btn"]')
			}),
		).toBe(true)
		const jsonWindowP = waitForPopup(dappConnectedExtension, "json", { timeout: 30_000 })
		await execPopup.$eval(showJson, (el) => el.dispatchEvent(new MouseEvent("click", { bubbles: true })))
		const jsonWindow = await jsonWindowP
		try {
			expect(await editorText(jsonWindow, "json-editor", 30_000)).toMatch(/^\[/)
			expect(await readEditorStyles(jsonWindow, "json-editor")).toEqual({ display: "flex", fontSize: "14px", scrollbarWidth: "none" })
			// Full screen only: the line-number gutter.
			expect(
				await jsonWindow.evaluate(
					() => !!document.querySelector('[data-testid="json-editor"]')?.shadowRoot?.querySelector(".cm-lineNumbers"),
				),
			).toBe(true)
		} finally {
			await jsonWindow.close()
		}
		await rejectExecute(execPopup)

		const result = await waitForPgResult(page, "sendTx", seqTx, 30_000)
		expect(result.status).toBe("error")
		const errorPayload = result.errorJson as string | { message?: string } | undefined
		const errMessage = typeof errorPayload === "string" ? errorPayload : errorPayload?.message
		expect(JSON.parse(errMessage ?? "{}")).toMatchObject({ code: 4001, data: { walletErrorCode: UserRejectedError.CODE } })

		const wallet = await openPopup(dappConnectedExtension)
		await waitForHash(wallet, "#/popup/general", 30_000)
		const record = await waitForSendRecord(wallet, (r) => r.kind === "dapp_execute" && r.stage === "failed", 30_000)
		expect(await readErrorKind(wallet, record.id)).toBe("user_rejected")
		expect(await readTerminalCard(wallet, "#/popup/activity")).toEqual({ title: "Transfer Public To Public", subtitle: "Cancelled" })
		expect(await readJournalDetail(wallet, record.id)).toMatchObject({
			"journal-detail-category": "You rejected",
			"journal-detail-context": "You stopped this transaction.",
			"journal-detail-method": "Transfer Public To Public",
		})
	},
)
