/**
 * Account-balance orphan closure — the end-to-end proof that a keyless imported account's
 * balance rows die WITH the account, and that re-importing the same key starts fresh.
 *
 * The production defect this pins: a full backup carrying an imported Account row without its
 * key row restores the account's balance rows, then `reconcileImportedAccounts` drops the
 * Account at finalize — pre-fix, the rows were orphaned, and re-importing the key (same key →
 * same address) reattached them silently: `ensurePairsHoldingLock` saw the pair occupied and
 * skipped, so pre-deletion balances rendered until an unscoped refresh happened to run.
 *
 *   1. A donor browser (own master) exports an account file; the token-ready wallet imports it
 *      — the imported account gains a real TST balance row.
 *   2. The wallet exports a full backup; the blob is doctored: the `imported-account-keys`
 *      slice is REMOVED, checksum recomputed (integrity detection, not authentication).
 *   3. A fresh extension imports the doctored backup. The keyless account must be dropped AND
 *      zero balance rows may remain for its (profileId, address) scope — the registered
 *      awaited purge inside `reconcileImportedAccounts` is what this asserts.
 *   4. The same key is re-imported: its balance row must be FRESH (created now), never a
 *      reattached pre-deletion row.
 *
 * Run solo: `bun run e2e:agent tests/e2e/network/account-balance-orphans.test.ts`.
 */
import { createHash } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, inject } from "vitest"
import type { AztecTestConfig } from "../fixtures/aztec"
import {
	clickByTestId,
	launchExtension,
	openPopup,
	registerProfile,
	replaceInputValue,
	test,
	waitForHash,
	pickFileByTestId,
	waitForServiceReady,
} from "../fixtures/extension"
import { navigateByHash, reopenAndRecoverAfterImport } from "../fixtures/helpers"
import { confirmImport, exportAccountBody, FIRST_ACCOUNT_NAME, previewImport } from "../helpers/account-io"
import { downloadEncryptedBackup, openEncryptedBackup } from "../helpers/backup-export"
import { TEST_PASSWORD, writeBackupToTemp } from "../helpers/import-drivers"
import { readSealedRows, SEALED_READ_MESSAGE } from "../fixtures/sealed-rows"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

const BALANCE_ROOT = "nulo:core:token-balances"
const ACCOUNT_ROOT = "nulo:core:accounts"

type BalanceRowView = { account: string; profileId: string; updatedAt: number }

/** The balance rows for one on-chain address, as the wallet reads them; fails when a stored balance
 *  row is one the wallet cannot read, which no assertion below could then see. */
async function balanceRowsFor(page: import("puppeteer").Page, address: string): Promise<BalanceRowView[]> {
	const rows = await readSealedRows<Partial<BalanceRowView>>(page, "tokenBalances")
	const stored = await page.evaluate(
		async (root: string) => Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith(`${root}@`)).length,
		BALANCE_ROOT,
	)
	expect(stored).toBe(rows.length)
	return rows
		.map(({ row }) => row)
		.filter((r) => r.account === address)
		.map((r) => ({ account: r.account as string, profileId: r.profileId ?? "", updatedAt: r.updatedAt ?? -1 }))
}

/** Waits until the wallet reads a balance row for `address`. */
async function waitForBalanceRow(page: import("puppeteer").Page, address: string): Promise<void> {
	await page.waitForFunction(
		async (message: string, addr: string) => {
			const rows = ((await chrome.runtime.sendMessage({ type: message, root: "tokenBalances" })) ?? []) as {
				row: { account?: string }
			}[]
			return rows.some(({ row }) => row.account === addr)
		},
		{ timeout: 60_000, polling: 500 },
		SEALED_READ_MESSAGE,
		address,
	)
}

/** How many account rows the wallet reads at `address`; fails when a stored account row is one the
 *  wallet cannot read, which the count could then not see. */
async function accountRowCountFor(page: import("puppeteer").Page, address: string): Promise<number> {
	const rows = await readSealedRows<{ address?: string }>(page, "accounts")
	const stored = await page.evaluate(
		async (root: string) => Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith(`${root}@`)).length,
		ACCOUNT_ROOT,
	)
	expect(stored).toBe(rows.length)
	return rows.filter(({ row }) => row.address === address).length
}

test("agent-runner contract: a live sandbox must be configured (no false skip)", () => {
	if (process.env.E2E_REQUIRE_SETUP === "1") {
		expect(hasConfig).toBe(true)
	}
})

test.skipIf(!hasConfig)(
	"a keyless import's balance rows are purged with the account, and re-importing the key starts fresh",
	{ timeout: 900_000 },
	async ({ tokenReadyExtension }) => {
		// ── Stage 0: a genuinely foreign account file (second browser, own master) ──
		let foreignBody: string
		{
			const donor = await launchExtension()
			try {
				await registerProfile(donor)
				const donorPage = await openPopup(donor)
				await waitForHash(donorPage, "#/popup/general", 30_000)
				foreignBody = await exportAccountBody(donorPage, FIRST_ACCOUNT_NAME, false)
			} finally {
				await donor.close()
			}
		}

		// ── Stage 1: the token-ready wallet imports the account; a balance row appears ──
		const page = await openPopup(tokenReadyExtension)
		await waitForHash(page, "#/popup/general", 30_000)
		const importedAddress = (await previewImport(page, foreignBody))!
		expect(importedAddress).toBeTruthy()
		await confirmImport(page)
		// The pair backfill (`onAccountAdded` → ensure) is async — wait for the row.
		await waitForBalanceRow(page, importedAddress)

		// ── Stage 2: export a REAL full backup ──
		await navigateByHash(page, "#/popup/settings/security/export/full")
		await clickByTestId(page, "agree-continue-btn")
		await page.waitForSelector('[data-testid="unlock-password-input"]', { visible: true, timeout: 10_000 })
		await replaceInputValue(page, '[data-testid="unlock-password-input"]', TEST_PASSWORD)
		await clickByTestId(page, "unlock-submit-btn")
		const exported = await openEncryptedBackup(await downloadEncryptedBackup(page))
		await page.close()

		// ── Stage 3: doctor — strip the key slice, keep the Account row + balance rows ──
		expect((exported.data["imported-account-keys"] as unknown[]).length).toBe(1)
		// The doctored premise must be real: the blob carries balance row(s) for the account.
		const blobBalances = (exported.data["token-balance"] as Array<{ account?: string }>).filter((b) => b.account === importedAddress)
		expect(blobBalances.length).toBeGreaterThan(0)
		delete exported.data["imported-account-keys"]
		const { checksum: _stale, ...body } = exported
		const checksum = createHash("sha256").update(JSON.stringify(body)).digest("hex")
		const filePath = writeBackupToTemp(JSON.stringify({ ...body, checksum }), "doctored-keyless-import.json")

		// ── Stage 4: a FRESH extension imports the doctored backup ──
		const profileDir = mkdtempSync(join(tmpdir(), "nulo-orphan-e2e-"))
		const ctx2 = await launchExtension({ userDataDir: profileDir })
		try {
			const page2 = await openPopup(ctx2)
			await navigateByHash(page2, "#/popup/import", 15_000)
			await waitForServiceReady(page2, 15_000)
			await page2.waitForSelector('[data-testid="import-option-full-backup"]', { visible: true, timeout: 15_000 })
			await clickByTestId(page2, "import-option-full-backup")
			await pickFileByTestId(page2, "import-full-backup-pick-file", filePath)
			await page2.waitForSelector('[data-testid="import-full-backup-password-input"] input', { visible: true, timeout: 30_000 })
			await replaceInputValue(page2, '[data-testid="import-full-backup-password-input"]', TEST_PASSWORD)
			await replaceInputValue(page2, '[data-testid="import-full-backup-password-confirm-input"]', TEST_PASSWORD)
			await page2.waitForFunction(
				() => {
					const btn = document.querySelector<HTMLButtonElement>('[data-testid="import-full-backup-submit-btn"]')
					return !!btn && !btn.disabled
				},
				{ timeout: 10_000 },
			)
			await clickByTestId(page2, "import-full-backup-submit-btn")

			// Settle via the actionable-screen idiom: general/auth are terminal; a
			// finished-with-errors screen is acknowledged via Continue.
			await page2.waitForFunction(
				() => {
					const h = window.location.hash
					if (h.includes("/popup/general") || h.includes("/popup/auth")) return true
					return !!document.querySelector('[data-testid="import-full-backup-continue-btn"]')
				},
				{ timeout: 300_000, polling: 250 },
			)
			if (await page2.evaluate(() => !!document.querySelector('[data-testid="import-full-backup-continue-btn"]'))) {
				await clickByTestId(page2, "import-full-backup-continue-btn")
				await page2.waitForFunction(
					() => window.location.hash.includes("/popup/general") || window.location.hash.includes("/popup/auth"),
					{ timeout: 60_000, polling: 250 },
				)
			}
			await reopenAndRecoverAfterImport(page2)

			// ── Stage 5: THE pin — the keyless account is gone AND so are its balance rows ──
			expect(await accountRowCountFor(page2, importedAddress)).toBe(0)
			const orphans = await balanceRowsFor(page2, importedAddress)
			// Pre-fix, the doctored restore left these rows behind (the orphan). The
			// registered awaited purge inside reconcileImportedAccounts removes them
			// BEFORE the Account row is deleted.
			expect(orphans).toEqual([])

			// ── Stage 6: re-import the same key — balances must start FRESH ──
			const beforeReimport = Date.now()
			const reviewed = await previewImport(page2, foreignBody)
			expect(reviewed).toBe(importedAddress)
			await confirmImport(page2)
			await waitForBalanceRow(page2, importedAddress)
			const fresh = await balanceRowsFor(page2, importedAddress)
			expect(fresh.length).toBeGreaterThan(0)
			for (const row of fresh) {
				// A reattached pre-deletion row would carry the OLD projection timestamp.
				expect(row.updatedAt === 0 || row.updatedAt >= beforeReimport).toBe(true)
			}

			expect(ctx2.pageErrors.filter((e) => !e.message.includes("Client disconnected"))).toEqual([])
		} finally {
			try {
				await ctx2.close()
			} finally {
				rmSync(profileDir, { recursive: true, force: true })
			}
		}
	},
)
