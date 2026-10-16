import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import { mintPublicTokensForAccount, type AztecTestConfig } from "../fixtures/aztec"
import { clickByTestId, type ExtensionContext, openPopup, test, waitForHash } from "../fixtures/extension"
import { importTokenAndWaitForBalance } from "../fixtures/helpers"
import { setPgInput, snapshotResultSeq, waitForPgResult } from "../fixtures/playground"
import { openExecuteDetails, rejectExecute, waitForExecuteContent, waitForPopup } from "../fixtures/popups"
import { shotSend } from "../fixtures/send-page"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * The standard Token's `transfer_public_to_public`, whose nonce is named `_nonce`, reads as the
 * wallet's own transfer on both windows a dApp opens with it, the transaction and an authorization
 * for the same call with a random nonce: on the first as the summary's line at rest and the transfer
 * row under "Show all details", on the second as the transfer row. Each transfer function that
 * touches a private balance reads the same way on the transaction window. The decode, the selector
 * check and the token's units all run for real here; every window is rejected, since proving the
 * call is other files' job.
 */

const sel = (testid: string) => `[data-testid="${testid}"]`
const AMOUNT = "5000000000000000000"
/** Above 2^64, the size of nonce a dApp draws at random. */
const NONCE = "0x0f3c7a91e24b6d08c5f1a39e7b2d40c86e9a1f53b7d20c4e8a6f91b3d5c07e2a"

const textOf = (page: Page, selector: string) => page.$eval(selector, (el) => (el.textContent ?? "").replace(/\s+/g, " ").trim())
const senderKind = (page: Page, testid: string) => page.$eval(sel(testid), (el) => el.getAttribute("data-sender-kind"))
const trimmed = (address: string) => `${address.slice(0, 8)}..${address.slice(-4)}`

/** The summary's line for the transfer, at rest: the wallet's reading, its sender by account name. */
async function expectTransferLine(page: Page, recipient: string): Promise<void> {
	const line = `${sel("execute-op-summary-call")}[data-intent-kind="transfer"] ${sel("execute-op-call-line")}`
	await page.waitForSelector(line, { visible: true, timeout: 60_000 })
	const name = await page.$eval(sel("execute-op-from-account"), (el) => el.getAttribute("data-account-name"))
	expect(await senderKind(page, "execute-op-call-line")).toBe("explicit")
	expect(await textOf(page, line)).toBe(`5 TST from ${name} to ${trimmed(recipient)}`)
	expect(await page.$(sel("execute-op-details"))).toBeNull()
}

/** The card reads an amount in a token's units only for a token the wallet holds. */
async function holdToken(ctx: ExtensionContext, accountAddress: string): Promise<void> {
	await mintPublicTokensForAccount(aztecConfig!, accountAddress)
	const home = await openPopup(ctx)
	await waitForHash(home, "#/popup/general")
	await importTokenAndWaitForBalance(home, accountAddress, aztecConfig!.tokenAddress, "100000000000000000000")
	await home.close()
}

async function openWindow(ctx: ExtensionContext, page: Page, button: string): Promise<Page> {
	const opened = waitForPopup(ctx, "execute", { timeout: 60_000 })
	await clickByTestId(page, button)
	const execute = await opened
	await waitForExecuteContent(execute)
	return execute
}

test.skipIf(!hasConfig)(
	"tx-transfer-row — a standard Token transfer reads with its named sender and the Amount in TST, sent or authorized",
	{ timeout: 360_000 },
	async ({ dappConnectedExtensionWithTransactionCap: ctx }) => {
		const { playgroundPage: page, accountAddress } = ctx
		const { tokenAddress, minterAddress } = aztecConfig!
		await holdToken(ctx, accountAddress)

		await setPgInput(page, "tokenAddress", tokenAddress)
		await setPgInput(page, "recipient", minterAddress)
		await setPgInput(page, "amount", AMOUNT)
		const sendSeq = await snapshotResultSeq(page)
		const send = await openWindow(ctx, page, "pg-btn-sendTx-default")
		// The decode and the token list land after the window opens; the line turns once both have.
		await expectTransferLine(send, minterAddress)
		expect(await textOf(send, sel("execute-op-summary-call-head"))).toMatch(/^Transfer \(public\) on /)
		await openExecuteDetails(send)
		const row = `${sel("execute-op-payload-row")}[data-intent-kind="transfer"]`
		await send.waitForSelector(row, { visible: true, timeout: 60_000 })
		expect(await textOf(send, row)).toMatch(/^Transfer \(public\)/)
		expect(await senderKind(send, "execute-op-transfer-sender")).toBe("explicit")
		expect(await textOf(send, sel("execute-op-amount"))).toBe("5 TST")
		expect(await send.$(sel("execute-op-transfer-nonce"))).toBeNull()
		await shotSend(send, "transfer-row-send", "execute-op-structured-args")
		await rejectExecute(send)
		expect((await waitForPgResult(page, "sendTx", sendSeq, 30_000)).status).toBe("error")

		await setPgInput(page, "authwitAmount", AMOUNT)
		await setPgInput(page, "authwitNonce", NONCE)
		const authSeq = await snapshotResultSeq(page)
		const auth = await openWindow(ctx, page, "pg-btn-createAuthWit-callIntent")
		expect(await textOf(auth, sel("execute-op-title"))).toBe("Authorization")
		await auth.waitForSelector(sel("execute-authwit-structured-args"), { visible: true, timeout: 60_000 })
		expect(await textOf(auth, sel("execute-authwit-function"))).toBe("Transfer (public)")
		expect(await senderKind(auth, "execute-authwit-transfer-sender")).toBe("explicit")
		expect(await textOf(auth, sel("execute-authwit-amount"))).toBe("5 TST")
		const nonce = await auth.$eval(sel("execute-authwit-transfer-nonce-value"), (el) => ({
			text: (el.textContent ?? "").trim(),
			title: el.getAttribute("title"),
		}))
		expect(nonce).toEqual({ text: "0x0f3c7a91..c07e2a", title: NONCE })
		await shotSend(auth, "transfer-row-authwit", "execute-authwit-structured-args")
		await rejectExecute(auth)
		expect((await waitForPgResult(page, "createAuthWit", authSeq, 30_000)).status).toBe("error")
	},
)

const PRIVATE_KINDS = [
	{ fn: "transfer_private_to_private", label: /^Transfer \(private\)/ },
	{ fn: "transfer_private_to_public", label: /^Transfer to public/ },
	{ fn: "transfer_public_to_private", label: /^Transfer to private/ },
]

test.skipIf(!hasConfig).for(PRIVATE_KINDS)(
	"tx-transfer-row — $fn reads as its own transfer row, with its named sender and the Amount in TST",
	{ timeout: 360_000 },
	async ({ fn, label }, { dappConnectedExtensionWithTransactionCap: ctx }) => {
		const { playgroundPage: page, accountAddress } = ctx
		const { tokenAddress, minterAddress } = aztecConfig!
		await holdToken(ctx, accountAddress)

		await setPgInput(page, "tokenAddress", tokenAddress)
		await setPgInput(page, "recipient", minterAddress)
		await setPgInput(page, "amount", AMOUNT)
		await page.select(sel("pg-select-transferFn"), fn)
		const sendSeq = await snapshotResultSeq(page)
		const send = await openWindow(ctx, page, "pg-btn-sendTx-default")
		await expectTransferLine(send, minterAddress)
		await openExecuteDetails(send)
		const row = `${sel("execute-op-payload-row")}[data-intent-kind="transfer"]`
		await send.waitForSelector(row, { visible: true, timeout: 60_000 })
		expect(await textOf(send, row)).toMatch(label)
		expect(await senderKind(send, "execute-op-transfer-sender")).toBe("explicit")
		expect(await textOf(send, sel("execute-op-amount"))).toBe("5 TST")
		await shotSend(send, `transfer-row-${fn}`, "execute-op-structured-args")
		await rejectExecute(send)
		expect((await waitForPgResult(page, "sendTx", sendSeq, 30_000)).status).toBe("error")
	},
)
