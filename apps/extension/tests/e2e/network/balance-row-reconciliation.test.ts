/**
 * A token whose balance row is gone must come back — with a real projection —
 * once the wallet is restarted and unlocked.
 *
 * The gap this repairs is produced in production by an MV3 worker death inside
 * `createTokenBalance`, between the token row landing and its balance backfill.
 * Seeding the gap directly is deliberate: parking a worker mid-write and killing
 * it there proves MV3 nondeterminism, not the recovery that actually shipped.
 *
 * Scope: this asserts END-TO-END recovery across restart + unlock. It does not
 * isolate the sweep's own enqueue — `auth.vue` refreshes balances on unlock — so
 * the enqueue itself is pinned by the service-level task-spy test instead.
 */

import { describe, expect, inject } from "vitest"
import { stopBackground } from "../fixtures/browser"
import { clickByTestId, openPopup, replaceInputValue, test, waitForHash } from "../fixtures/extension"
import { TEST_PASSWORD } from "../fixtures/constants"
import { waitForFreshBalanceRow, waitForLockScreen, waitForTokenCardAmount } from "../fixtures/helpers"
import type { AztecTestConfig } from "../fixtures/aztec"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

const BALANCE_ROOT = "nulo:core:token-balances"

describe("balance-row reconciliation", () => {
	test.skipIf(!hasConfig)(
		"a token whose balance row vanished is repaired and re-projected on the next worker boot",
		{ timeout: 240_000 },
		async ({ tokenReadyExtension }) => {
			const page = await openPopup(tokenReadyExtension)
			await waitForHash(page, "#/popup/general")

			// The fixture minted 1000 tokens and imported them, so a projected row exists before anything
			// is deleted. `tokenReadyExtension` is file-scoped and this spec mutates it: a failure before
			// the unlock leaves the wallet locked with its rows gone, so a retry fails at its first route wait.
			await waitForTokenCardAmount(page, "1,000", "TST", 60_000)

			await page.close()
			await stopBackground(tokenReadyExtension)

			// The gap is made while the successor is locked (strict mode drops the session on a worker
			// death), where nothing projects or creates a balance row: the state a worker death leaves,
			// and the one the UNLOCK — via `onActiveProfileChanged` — must repair.
			const reopened = await openPopup(tokenReadyExtension)
			await waitForLockScreen(reopened, 30_000)

			const { deleted, gapMadeAt } = await reopened.evaluate(async (root: string) => {
				const all = await chrome.storage.local.get(null)
				const keys = Object.keys(all).filter((k) => k.startsWith(`${root}@`))
				await chrome.storage.local.remove(keys)
				return { deleted: keys.length, gapMadeAt: Date.now() }
			}, BALANCE_ROOT)
			expect(deleted, "fixture should have left at least one balance row to delete").toBeGreaterThan(0)

			// Prove the gap is real before relying on the repair.
			const remaining = await reopened.evaluate(async (root: string) => {
				const all = await chrome.storage.local.get(null)
				return Object.keys(all).filter((k) => k.startsWith(`${root}@`)).length
			}, BALANCE_ROOT)
			expect(remaining).toBe(0)

			await reopened.waitForSelector('[data-testid="auth-password-input"]', { visible: true, timeout: 15_000 })
			await replaceInputValue(reopened, '[data-testid="auth-password-input"]', TEST_PASSWORD)
			await clickByTestId(reopened, "auth-submit")
			await waitForHash(reopened, "#/popup/general", 60_000)

			const accountAddress = tokenReadyExtension.accountAddress
			// maxRefreshes: 0 stops the HELPER from re-kicking refreshes. It does not
			// isolate the sweep's own enqueue — `auth.vue` calls refreshBalances on
			// unlock — so this asserts end-to-end recovery, not the enqueue in
			// isolation. The service test with the task spy is what pins that.
			await waitForFreshBalanceRow(reopened, {
				account: accountAddress,
				tokenContract: aztecConfig!.tokenAddress,
				expectedPublicRaw: (1000n * 10n ** 18n).toString(),
				// A row stamped before the gap, by the stopped worker, cannot pass as the repair.
				baselineUpdatedAt: gapMadeAt,
				maxRefreshes: 0,
				timeoutMs: 90_000,
			})

			// Exactly one row for the pair — the sweep must repair, not duplicate.
			const rowCount = await reopened.evaluate(async (root: string) => {
				const all = await chrome.storage.local.get(null)
				return Object.keys(all).filter((k) => k.startsWith(`${root}@`)).length
			}, BALANCE_ROOT)
			expect(rowCount).toBe(1)

			await waitForTokenCardAmount(reopened, "1,000", "TST", 60_000)
			expect(tokenReadyExtension.pageErrors).toEqual([])
		},
	)
})
