import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import { TOKEN_LIST_SOURCE_KEY } from "@/e2e/chrome-storage-token-list"
import { openScratchPage, prepareKeys } from "../fixtures/browser"
import { sessionChainsForOrigin } from "../fixtures/dappSession"
import { clickByTestId, test } from "../fixtures/extension"
import { PLAYGROUND_TEST_URL, snapshotResultSeq, waitForPgResult, assertPgOk } from "../fixtures/playground"
import { approveExecute, waitForPopup, waitForPopupClosed } from "../fixtures/popups"
import { e2eSigner, requestListRefresh, serveTokenList, signTestList, waitForStoredList } from "../fixtures/token-list"
import type { AztecTestConfig } from "../fixtures/aztec"
import { SPACE, tabTo } from "../helpers/pointer-probes"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * registerToken (Nulo-custom RPC) — happy path.
 *
 * Validates:
 *   - The runtime schema patch in `@nulo/wallet-sdk-schema-patch` makes the
 *     method reachable through `@aztec-labs/wallet-sdk`'s ExtensionWallet proxy.
 *   - The dispatcher routes `registerToken` through DappInteractionService.execute()
 *     (it once bypassed the popup gate).
 *   - The execute popup renders the resolved token name + symbol + decimals
 *     pre-fetched via parseTokenInterface (D7 — anti-phishing surface).
 *   - User Allow → tokenService.addToken with origin "dapp" + dappOrigin set.
 *
 * Drives via the playground, the generic dApp every extension e2e targets. A token the signed list
 * does not flag reads no warning and asks for no acknowledgement.
 *
 * Uses `dappConnectedExtensionWithAccountsCap` so the cap-popup round-trip
 * happens during fixture setup (hookTimeout=300s) rather than during this
 * test's 60s budget. Pre-fix, stacking the cap popup + the execute popup +
 * the token-metadata prefetch in a single test exceeded any reasonable
 * timeout on cold-shard CI (see implementations-plan/archive/e2e-stabilization/plan.md,
 * Cap fixtures).
 */
test.skipIf(!hasConfig)(
	"registerToken — happy path: popup shows resolved metadata, approve persists token",
	{ timeout: 60_000 },
	async ({ dappConnectedExtensionWithAccountsCap }) => {
		const { playgroundPage: page, accountAddress } = dappConnectedExtensionWithAccountsCap

		await fillRegisterInputs(page, aztecConfig!.tokenAddress, accountAddress)

		// Click registerToken — expect execute popup to open (not silent —
		// the explicit `register_token` branch in `isConfirmationNeeded`).
		const seqRegister = await snapshotResultSeq(page)
		const execPopupP = waitForPopup(dappConnectedExtensionWithAccountsCap, "execute", { timeout: 30_000 })
		await clickByTestId(page, "pg-btn-registerToken")
		const execPopup = await execPopupP

		// The popup MUST show the pre-fetched metadata before the user can
		// approve. The Confirm button is disabled until metadata loads.
		await execPopup.waitForSelector('[data-testid="register-token-symbol"]', { visible: true, timeout: 30_000 })
		const symbol = await execPopup.$eval(
			'[data-testid="register-token-symbol"]',
			(el: Element) => (el as HTMLElement).textContent?.trim() ?? "",
		)
		expect(symbol).toBe("TST")

		// Address must always render alongside the metadata (defense against
		// phishing tokens that return misleading name/symbol strings).
		const addressDisplayed = await execPopup.$('[data-testid="register-token-address"]')
		expect(addressDisplayed).not.toBeNull()
		expect(await execPopup.$('[data-testid="token-flagged-banner"]')).toBeNull()
		expect(await execPopup.$('[data-testid="register-token-flag-ack"]')).toBeNull()

		// Approve via approveExecute: it gates on the confirm button's live
		// disabled state (initComplete + tokenMetadataLoading + operations, all
		// async) PLUS the CSS-only loading state, and carries the timeout
		// diagnostics + timing telemetry the suite standardized — a bare
		// clickByTestId waits on the same disabled bit but loses all of that.
		await approveExecute(execPopup)
		const result = await waitForPgResult(page, "registerToken", seqRegister, 30_000)
		await assertPgOk(page, result, "register-token:result")
		await waitForPopupClosed(execPopup)

		expect(dappConnectedExtensionWithAccountsCap.consoleErrors).toEqual([])
		expect(dappConnectedExtensionWithAccountsCap.pageErrors).toEqual([])
	},
)

async function fillRegisterInputs(page: Page, token: string, account: string): Promise<void> {
	await page.evaluate(
		({ token, account }: { token: string; account: string }) => {
			const setVal = (sel: string, v: string) => {
				const input = document.querySelector<HTMLInputElement>(sel)
				if (!input) return
				const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set
				setter?.call(input, v)
				input.dispatchEvent(new Event("input", { bubbles: true }))
			}
			setVal('[data-testid="pg-input-tokenAddress"]', token)
			setVal('[data-testid="pg-input-accountAddress"]', account)
		},
		{ token, account },
	)
}

const confirmDisabled = (popup: Page) => popup.$eval('[data-testid="execute-confirm-btn"]', (el) => (el as HTMLButtonElement).disabled)

/**
 * A token the worker's signed list flags, on the dApp's own chain: the approval carries the list's
 * banner, Confirm stays off until the acknowledgement is ticked, and the tick is a Tab stop before
 * the footer that Space sets without approving anything. Only the real window over the worker's held
 * list proves the flag reaches it; the list carries the flag alone, so it prices nothing.
 */
test.skipIf(!hasConfig)(
	"registerToken — a flagged token: the banner, and Confirm held until the tick, reached and set by keyboard",
	{ timeout: 90_000 },
	async ({ dappConnectedExtensionWithAccountsCap: ctx }) => {
		const { playgroundPage: page, accountAddress } = ctx
		const token = aztecConfig!.tokenAddress
		const [chainId] = await sessionChainsForOrigin(ctx, new URL(PLAYGROUND_TEST_URL).origin)
		const host = await serveTokenList()
		try {
			const envelope = await signTestList({ tokens: [], flagged: [{ chainId: Number(chainId), address: token }] })
			host.serve(envelope)
			const control = await openScratchPage(ctx.browser, ctx.extensionId)
			const { pinned } = await e2eSigner()
			await control.evaluate((key: string, source: unknown) => chrome.storage.session.set({ [key]: source }), TOKEN_LIST_SOURCE_KEY, {
				url: host.url,
				publicKey: pinned.publicKey,
			})
			await requestListRefresh(control)
			await waitForStoredList(control, (state) => state.envelope === envelope)
			await control.close()

			await fillRegisterInputs(page, token, accountAddress)
			const seqRegister = await snapshotResultSeq(page)
			const execPopupP = waitForPopup(ctx, "execute", { timeout: 30_000 })
			await clickByTestId(page, "pg-btn-registerToken")
			const execPopup = await execPopupP

			await execPopup.waitForSelector('[data-testid="token-flagged-banner"]', { visible: true, timeout: 30_000 })
			await execPopup.waitForSelector('[data-testid="register-token-symbol"]', { visible: true, timeout: 30_000 })
			expect(await confirmDisabled(execPopup)).toBe(true)

			await prepareKeys(execPopup)
			const walk = await tabTo(execPopup, "register-token-flag-ack")
			expect(
				walk.filter((id) => id === "execute-reject-btn" || id === "execute-confirm-btn"),
				`the walk: ${walk.join(" → ")}`,
			).toEqual([])
			await execPopup.keyboard.press(SPACE)
			await execPopup.waitForSelector('[data-testid="register-token-flag-ack"][aria-checked="true"]', { timeout: 5_000 })
			// The dApp's row is pending from its request on; only a settled one would mean an answer.
			const settled = await page.evaluate(
				(after) =>
					[...document.querySelectorAll<HTMLElement>('[data-testid="pg-result"][data-method="registerToken"]')].filter(
						(row) =>
							Number(row.getAttribute("data-result-seq") ?? "0") > after && row.getAttribute("data-status") !== "pending",
					).length,
				seqRegister,
			)
			expect(settled).toBe(0)

			await approveExecute(execPopup)
			const result = await waitForPgResult(page, "registerToken", seqRegister, 30_000)
			await assertPgOk(page, result, "register-token-flagged:result")
			await waitForPopupClosed(execPopup)
		} finally {
			await host.stop()
		}
		expect(ctx.consoleErrors).toEqual([])
		expect(ctx.pageErrors).toEqual([])
	},
)
