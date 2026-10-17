import type { Page } from "puppeteer"
import type { AztecTestConfig } from "./aztec"
import { clickByTestId, type ExtensionContext } from "./extension"
import {
	assertPgOk,
	formatPgMismatch,
	type PgBundle,
	type PgResult,
	selectPgBundle,
	setPgInputs,
	snapshotResultSeq,
	waitForPgResult,
} from "./playground"
import { approveExecute, approveVerify, waitForExecuteContent, waitForPopup } from "./popups"

/**
 * Reconnect a playground page whose origin the wallet approved without trusting its check, and
 * re-request `bundle` so the page's own account state is populated again — a wallet-initiated
 * disconnect clears it. The discovery is auto-approved for an approved origin and the emoji check
 * opens in its own window; the app's calls wait until it is answered, so it is answered before the
 * request. It never reloads the page: a reload would hide a broken same-page reconnect, so a caller
 * that needs a fresh page reloads it first. `timeoutMs` bounds the check window and the connected
 * status.
 */
export async function reconnectPlayground(
	ctx: ExtensionContext,
	page: Page,
	bundle: PgBundle,
	label: string,
	opts: { timeoutMs?: number } = {},
): Promise<void> {
	const timeout = opts.timeoutMs ?? 60_000
	const verifyP = waitForPopup(ctx, "verify", { timeout })
	await clickByTestId(page, "pg-btn-connect")
	await approveVerify(await verifyP)
	await page.waitForSelector('[data-testid="pg-status"][data-status="connected"]', { timeout })

	await selectPgBundle(page, bundle)
	const seq = await snapshotResultSeq(page)
	await clickByTestId(page, "pg-btn-requestCapabilities")
	await assertPgOk(page, await waitForPgResult(page, "requestCapabilities", seq, 60_000), label)
}

/**
 * Click `pg-btn-<button>`, approve the execute window it opens, and return the `method` result,
 * asserted ok. A dApp-side error before the window opens fails the call at once with that error;
 * an ok result still needs the window. `popupTimeoutMs` covers a cold PXE boot before the window
 * can open.
 */
export async function runApprovedPgCall(
	ctx: ExtensionContext,
	page: Page,
	opts: { button: string; method: string; label: string; popupTimeoutMs?: number; contentTimeoutMs?: number },
): Promise<PgResult> {
	const { button, method, label, popupTimeoutMs = 60_000, contentTimeoutMs = 60_000 } = opts
	const seq = await snapshotResultSeq(page)
	const popupP = waitForPopup(ctx, "execute", { timeout: popupTimeoutMs })
	await clickByTestId(page, `pg-btn-${button}`)
	const errorBeforeWindow = new Promise<never>((_, reject) => {
		waitForPgResult(page, method, seq, popupTimeoutMs - 5_000).then(
			(r) => {
				if (r.status === "error") reject(new Error(`[${label}] ${method} errored dApp-side: ${formatPgMismatch(r)}`))
			},
			() => {},
		)
	})
	const popup = await Promise.race([popupP, errorBeforeWindow])
	await waitForExecuteContent(popup, contentTimeoutMs)
	await approveExecute(popup, { approvableTimeoutMs: 120_000 })
	const result = await waitForPgResult(page, method, seq, 300_000)
	await assertPgOk(page, result, label)
	return result
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
	opts: { popupTimeoutMs?: number; contentTimeoutMs?: number } = {},
): Promise<PgResult> {
	await setPgInputs(page, { tokenAddress: config.tokenAddress, recipient: config.minterAddress, amount: "1" })
	return runApprovedPgCall(ctx, page, { button: "sendTx-default", method: "sendTx", label, ...opts })
}
