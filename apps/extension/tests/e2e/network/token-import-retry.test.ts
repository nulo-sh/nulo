import { expect, inject } from "vitest"
import { importFailureSentence } from "@/popup/components/modules/general/token-import-retry"
import type { AztecTestConfig } from "../fixtures/aztec"
import { extensionUrl, stopBackground } from "../fixtures/browser"
import { clickByTestId } from "../fixtures/dom"
import { openPopup, test, waitForHash } from "../fixtures/extension"
import { unlockAfterBackgroundDeath } from "../fixtures/helpers"
import { shotSend } from "../fixtures/send-page"
import { readActivityScope, seedTokenImport } from "../helpers/activity-seeds"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined

const RESTARTED = importFailureSentence({ error: { kind: "interrupted_by_restart", message: "", normalizedRaw: null } })

/**
 * A token import a worker restart ended, retried from its stored record: the reaped row's fields
 * must drive the real parse and the live metadata read, which no composition test can simulate.
 * Its own file, so the sandbox token is not imported yet.
 */
test.skipIf(!aztecConfig)(
	"an import a worker restart ended says so, and Retry completes it",
	{ timeout: 180_000 },
	async ({ localNetworkExtension: ctx }) => {
		let page = await openPopup(ctx)
		await waitForHash(page, "#/popup/general")
		await seedTokenImport(page, await readActivityScope(page), { id: "0a1b2c3d4e5f6a7b", contract: aztecConfig!.tokenAddress })

		// The worker can only be stopped with no extension page holding it.
		for (const open of await ctx.browser.pages()) if (open.url().startsWith(extensionUrl(ctx.extensionId, "/"))) await open.close()
		await stopBackground(ctx)
		page = await openPopup(ctx)
		await unlockAfterBackgroundDeath(page)

		await page.waitForSelector('[data-testid="token-import-retry"]', { visible: true, timeout: 20_000 })
		const said = await page.$eval('[data-testid="token-import-subtitle"]', (el) => el.textContent)
		expect(said).toBe(RESTARTED)
		await shotSend(page, "token-import-restarted", "tokens-list")

		await clickByTestId(page, "token-import-retry")
		await shotSend(page, "token-import-retrying", "tokens-list")

		await page.waitForSelector('[data-testid="token-symbol"][data-symbol="TST"]', { visible: true, timeout: 60_000 })
		await page.waitForFunction(() => document.querySelector('[data-testid="token-import-row"]') === null, { timeout: 10_000 })
		await shotSend(page, "token-import-retried", "tokens-list")
	},
)
