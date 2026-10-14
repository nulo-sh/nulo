/**
 * A Local Network edited off its seeded URL, on a live sandbox: the header reads the node's real
 * status, and a full backup carries chain 0's account state as its own item.
 *
 * The edit points the endpoint at the same sandbox under its IPv4 literal, so only the URL leaves
 * the seed's: the node still answers, and only a status check that knows the network's kind reads
 * it as chain 0. The unit layer pins the status rule against a fake node; only the browser shows
 * the header and the exported file agreeing with it through the real popup, export and node.
 */
import { expect, inject } from "vitest"
import type { AztecTestConfig } from "../fixtures/aztec"
import { clickByTestId, openPopup, replaceInputValue, test, waitForHash } from "../fixtures/extension"
import { navigateToSettings, openNetworkDetail, waitForToast } from "../fixtures/helpers"
import { exportBackupContent } from "../helpers/backup-export"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined

test("an edited Local Network that answers reads active and travels in the full backup as chain 0", { timeout: 300_000 }, async ({
	localNetworkExtension,
}) => {
	expect(aztecConfig, "the network runner provisions a sandbox").toBeDefined()
	const page = await openPopup(localNetworkExtension)
	await waitForHash(page, "#/popup/general")
	await navigateToSettings(page, "networks")
	await openNetworkDetail(page, "Local Network")
	const networkId = page.url().split("/popup/settings/networks/")[1]

	await page.waitForSelector('[data-testid="endpoint-edit-btn"]', { visible: true, timeout: 5_000 })
	await page.evaluate(() => {
		document
			.querySelector('[data-testid="endpoint-edit-btn"]')
			?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
	})
	await page.waitForSelector('[data-testid="edit-endpoint-submit"]', { visible: true, timeout: 5_000 })
	const seeded = await page.$eval('[data-testid="endpoint-rpc-input"] input', (el) => (el as HTMLInputElement).value)
	const edited = new URL(seeded)
	expect(edited.hostname, "the runner seeds the Local Network on localhost").toBe("localhost")
	edited.hostname = "127.0.0.1"
	await replaceInputValue(page, '[data-testid="endpoint-rpc-input"]', edited.origin)
	await clickByTestId(page, "edit-endpoint-submit")
	await waitForToast(page, "Endpoint updated", 30_000)
	await page.close()

	const fresh = await openPopup(localNetworkExtension)
	await waitForHash(fresh, "#/popup/general")
	await fresh.waitForSelector('[data-testid="network-button"]:not([data-status="sync"]):not([data-status="undefined"])', {
		timeout: 30_000,
	})
	expect(await fresh.$eval('[data-testid="network-button"]', (el) => el.getAttribute("data-status"))).toBe("active")
	await fresh.close()

	const backup = await exportBackupContent(localNetworkExtension)
	const items = (backup.data["account-state"] ?? []) as Array<{ networkId?: string; chainId?: number }>
	expect(items.filter((item) => item.chainId === 0).map((item) => item.networkId)).toEqual([networkId])

	expect(localNetworkExtension.pageErrors).toEqual([])
})
