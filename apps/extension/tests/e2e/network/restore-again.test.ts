/**
 * Restore again registers the backup's account state into the same profile's PXE.
 *
 * The local wallet's real export gains one random sender that no contact names, so only an
 * account-state restore can register it. A fresh wallet imports the file with the sandbox node
 * refused, which leaves the local network unrestored and the Home reminder naming it. The refusal
 * lifts; a successful read of the Senders page shows the sender absent (a failed read never counts).
 * Restore again with the same file then shows the toast, the reminder goes, and the sender is listed.
 */
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import { restoreAgainDoneText, restoreAgainIntroText } from "@/components/composite/import/restore-warning"
import type { AztecTestConfig } from "../fixtures/aztec"
import { type ArmedInterception, interceptRpc } from "../fixtures/browser"
import {
	clickByTestId,
	type ExtensionContext,
	launchExtension,
	openPopup,
	pickFileByTestId,
	test,
	waitForHash,
	withTimeoutMessage,
} from "../fixtures/extension"
import { getAccountAddress, navigateByHash, waitForToast } from "../fixtures/helpers"
import { accountChainId, exportBackupContent, sealPlainBackup } from "../helpers/backup-export"
import { readStage } from "../helpers/crash-truth"
import {
	gotoPopupImport,
	POPUP_IMPORT_SHELL,
	submitFullBackupImport,
	submitWhenEnabled,
	TEST_PASSWORD,
	writeBackupToTemp,
} from "../helpers/import-drivers"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

const SENDERS_HASH = "#/popup/settings/developer/account-state/senders"
const BANNER_SENTENCE = "Local Network didn't finish restoring. Restore the backup again to bring them back."

type AccountStateItem = { networkId?: string; chainId?: number; senders?: Array<{ address: string }>; contracts?: unknown[] }

/** The wallet's export with only its own chain's account state, plus `sender` there. */
async function backupWithSender(ctx: ExtensionContext, sender: string): Promise<string> {
	const page = await openPopup(ctx)
	await waitForHash(page, "#/popup/general", 30_000)
	const address = await getAccountAddress(page)
	await page.close()
	const backup = await exportBackupContent(ctx)
	const chainId = accountChainId(backup, address)
	const items = ((backup.data["account-state"] ?? []) as AccountStateItem[]).filter((item) => item.chainId === chainId)
	const local = items[0] ?? { networkId: "local", chainId, senders: [], contracts: [] }
	local.senders = [...(local.senders ?? []), { address: sender }]
	backup.data["account-state"] = [local]
	return writeBackupToTemp(sealPlainBackup(backup), "restore-again.json")
}

/**
 * Whether the active network's Senders page lists `sender`, from a read that succeeded: an error
 * state is retried, and only a rendered list answers.
 */
async function sendersList(page: Page, sender: string): Promise<boolean> {
	await navigateByHash(page, SENDERS_HASH)
	await page.waitForSelector('[data-testid="senders-add-btn"]', { visible: true, timeout: 10_000 })
	const deadline = Date.now() + 120_000
	for (;;) {
		await page.waitForFunction(() => !document.querySelector('[data-testid="loading-state"]'), { timeout: 60_000, polling: 100 })
		const failed = await page.$('[data-testid="async-list-retry"]')
		if (!failed) break
		if (Date.now() > deadline) throw new Error("the Senders page never read successfully")
		await new Promise((resolve) => setTimeout(resolve, 2_000))
		await clickByTestId(page, "async-list-retry")
	}
	const listed = await page.evaluate(
		(address: string) => !!document.querySelector(`[data-testid="sender-row"][data-sender-address="${address}"]`),
		sender,
	)
	await navigateByHash(page, "#/popup/general")
	return listed
}

test("agent-runner contract: a live sandbox must be configured (no false skip)", () => {
	expect(hasConfig).toBe(true)
})

test.skipIf(!hasConfig)(
	"Restore again registers the unrestored network's sender into the same profile once its node answers",
	{ timeout: 300_000 },
	async ({ localNetworkExtension }) => {
		const { AztecAddress } = await import("@aztec-labs/aztec.js/addresses")
		const sender = (await AztecAddress.random()).toString()
		const filePath = await backupWithSender(localNetworkExtension, sender)

		const profileDir = mkdtempSync(join(tmpdir(), "nulo-restore-again-"))
		let ctx: ExtensionContext | undefined
		let armed: ArmedInterception | undefined
		try {
			ctx = await launchExtension({ userDataDir: profileDir })
			armed = await interceptRpc(ctx.browser, ctx.extensionId, new URL(aztecConfig!.nodeUrl).origin, { kind: "refuse" })
			const page = await gotoPopupImport(ctx)
			await submitFullBackupImport(page, filePath, TEST_PASSWORD, POPUP_IMPORT_SHELL)
			// The restore of a one-account export, then the tail's 45 s bound.
			await withTimeoutMessage(
				page.waitForSelector('[data-testid="import-full-backup-continue-btn"]', { visible: true, timeout: 120_000 }),
				async () => `no errors screen (hash ${await page.evaluate(() => window.location.hash)}, stage ${await readStage(page)})`,
			)
			await clickByTestId(page, "import-full-backup-continue-btn")
			await waitForHash(page, "#/popup/general", 60_000)
			await page.waitForFunction(
				(want) =>
					(document.querySelector('[data-testid="restore-outcome-banner"]') as HTMLElement | null)?.innerText.includes(want),
				{ timeout: 30_000, polling: 200 },
				BANNER_SENTENCE,
			)

			expect(await armed.failures(), "rpc interception failures").toEqual([])
			await armed.stop()
			armed = undefined
			expect(await sendersList(page, sender), "the sender before Restore again").toBe(false)

			await clickByTestId(page, "restore-outcome-restore")
			await waitForHash(page, "#/popup/restore-again", 10_000)
			await page.waitForFunction(
				(want) => (document.querySelector('[data-testid="restore-again-intro"]') as HTMLElement | null)?.innerText.trim() === want,
				{ timeout: 10_000, polling: 100 },
				restoreAgainIntroText(["Local Network"]),
			)
			await pickFileByTestId(page, "import-full-backup-pick-file", filePath)
			await submitWhenEnabled(page, "restore-again-submit-btn")
			// One tail: 45 s at most, plus margin.
			await waitForToast(page, restoreAgainDoneText(["Local Network"]), 90_000, { kind: "success" })
			await waitForHash(page, "#/popup/general", 10_000)
			await page.waitForFunction(() => !document.querySelector('[data-testid="restore-outcome-banner"]'), {
				timeout: 10_000,
				polling: 100,
			})

			expect(await sendersList(page, sender), "the sender after Restore again").toBe(true)
		} finally {
			try {
				await armed?.stop()
				await ctx?.close()
			} finally {
				rmSync(profileDir, { recursive: true, force: true })
				// The doctored file embeds the wallet's real (local-chain test) master key.
				rmSync(dirname(filePath), { recursive: true, force: true })
			}
		}
	},
)
