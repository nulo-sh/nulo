import { expect, inject } from "vitest"
import { extensionUrl, gotoExtensionPage, newPage } from "../fixtures/browser"
import { editorText, readEditorStyles } from "../fixtures/code-editor"
import { clickByTestId, test } from "../fixtures/extension"
import { snapshotResultSeq, waitForPgResult } from "../fixtures/playground"
import { waitForPopup, waitForExecuteContent, approveCapabilities, rejectExecute } from "../fixtures/popups"
import type { AztecTestConfig } from "../fixtures/aztec"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * Test #34 — user rejects the /windows/execute popup. dApp gets an error. Before the reject, the
 * request's JSON opens full screen, a window that needs a live request.
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

		// The window `execute-show-json-btn` opens, at its own URL: Puppeteer gives that `<svg>` no box.
		const requestId = /requestId=([^&#]+)/.exec(execPopup.url())?.[1]
		if (!requestId) throw new Error(`the execute window carries no request id: ${execPopup.url()}`)
		const jsonWindow = await newPage(dappConnectedExtension.browser)
		await jsonWindow.setViewport({ width: 900, height: 700 })
		await gotoExtensionPage(
			jsonWindow,
			extensionUrl(dappConnectedExtension.extensionId, `/src/popup/index.html?requestId=${requestId}#/windows/json`),
		)
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
	},
)
