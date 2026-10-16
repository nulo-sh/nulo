import type { Page } from "puppeteer"
import type { AztecTestConfig } from "./aztec"
import { clickByTestId, type ExtensionContext } from "./extension"
import { assertPgOk, type PgBundle, selectPgBundle, setPgInput, snapshotResultSeq, waitForPgResult } from "./playground"
import { approveExecute, approveVerify, waitForExecuteContent, waitForPopup } from "./popups"

/**
 * Reconnect a playground page whose origin the wallet remembers, and
 * re-request `bundle` so the page's own account state is populated again — a wallet-initiated
 * disconnect clears it. The discovery is auto-approved for an approved origin and the emoji check
 * opens in its own window; the app's calls wait until it is answered, so it is answered before the
 * request. The page is never reloaded: a reload would hide a broken same-page reconnect.
 */
export async function reconnectPlayground(ctx: ExtensionContext, page: Page, bundle: PgBundle, label: string): Promise<void> {
	const verifyP = waitForPopup(ctx, "verify", { timeout: 60_000 })
	await clickByTestId(page, "pg-btn-connect")
	await approveVerify(await verifyP)
	await page.waitForSelector('[data-testid="pg-status"][data-status="connected"]', { timeout: 60_000 })

	await selectPgBundle(page, bundle)
	const seq = await snapshotResultSeq(page)
	await clickByTestId(page, "pg-btn-requestCapabilities")
	await assertPgOk(page, await waitForPgResult(page, "requestCapabilities", seq, 60_000), label)
}

/**
 * One default `sendTx` of 1 token from the connected account to the minter, approved in the execute
 * window and asserted `ok` — the round trip that needs a live PXE host. `label` names the caller in
 * a failure; `popupTimeoutMs` covers a cold PXE boot before the window can open.
 */
export async function sendDefaultTx(
	ctx: ExtensionContext,
	page: Page,
	config: AztecTestConfig,
	label: string,
	opts: { popupTimeoutMs?: number } = {},
): Promise<void> {
	await setPgInput(page, "tokenAddress", config.tokenAddress)
	await setPgInput(page, "recipient", config.minterAddress)
	await setPgInput(page, "amount", "1")
	const seq = await snapshotResultSeq(page)
	const popupP = waitForPopup(ctx, "execute", { timeout: opts.popupTimeoutMs ?? 60_000 })
	await clickByTestId(page, "pg-btn-sendTx-default")
	const popup = await popupP
	await waitForExecuteContent(popup, 60_000)
	await approveExecute(popup, { approvableTimeoutMs: 120_000 })
	await assertPgOk(page, await waitForPgResult(page, "sendTx", seq, 300_000), label)
}
