/**
 * A node URL saved as plain HTTP to `[::1]`, which the wallet no longer dials, on a live sandbox: the
 * popup still starts and the network reads as not responding, and editing the endpoint to the
 * sandbox's own URL brings it back. Smoke has no node to prove the second half against.
 */
import { expect, inject } from "vitest"
import type { Page } from "puppeteer"
import type { AztecTestConfig } from "../fixtures/aztec"
import { clickByTestId, openPopup, replaceInputValue, test, waitForHash } from "../fixtures/extension"
import { captureSoleProfileId, navigateToSettings, openNetworkDetail, waitForToast } from "../fixtures/helpers"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined

/** Startup syncs the status twice and each sync passes through "sync", so the first settled value
 *  is read in the same evaluation that sees it. */
async function settledStatus(page: Page): Promise<string> {
	const settled = await page.waitForFunction(
		() => {
			const status = document.querySelector('[data-testid="network-button"]')?.getAttribute("data-status")
			return status && status !== "sync" ? status : false
		},
		{ timeout: 30_000 },
	)
	return (await settled.jsonValue()) as string
}

test("a saved http://[::1] Local Network endpoint reads inactive until it is edited to the node's URL", { timeout: 120_000 }, async ({
	localNetworkExtension,
}) => {
	expect(aztecConfig, "the network runner provisions a sandbox").toBeDefined()
	const nodeUrl = new URL((aztecConfig as AztecTestConfig).nodeUrl)
	const v6 = new URL(nodeUrl)
	v6.hostname = "[::1]"

	const first = await openPopup(localNetworkExtension)
	await waitForHash(first, "#/popup/general")
	const profileId = await captureSoleProfileId(first)
	const rewritten = await first.evaluate(
		async (pid: string, url: string) => {
			const all = await chrome.storage.local.get(null)
			const key = `nulo:core:networks@${all[`nulo:core:active-network@${pid}`]}`
			const row = JSON.parse(all[key] as string) as {
				kind?: string
				primaryEndpointId: string
				endpoints: { id: string; rpcUrl: string }[]
			}
			const primary = row.endpoints.find((e) => e.id === row.primaryEndpointId)
			if (row.kind !== "local" || !primary) return false
			primary.rpcUrl = url
			await chrome.storage.local.set({ [key]: JSON.stringify(row) })
			return true
		},
		profileId,
		v6.origin,
	)
	expect(rewritten, "the active network is the Local Network").toBe(true)
	await first.close()

	const refused = await openPopup(localNetworkExtension)
	await waitForHash(refused, "#/popup/general")
	expect(await settledStatus(refused)).toBe("inactive")

	await navigateToSettings(refused, "networks")
	await openNetworkDetail(refused, "Local Network")
	await refused.waitForSelector('[data-testid="endpoint-edit-btn"]', { visible: true, timeout: 5_000 })
	await refused.evaluate(() => {
		document
			.querySelector('[data-testid="endpoint-edit-btn"]')
			?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
	})
	await refused.waitForSelector('[data-testid="edit-endpoint-submit"]', { visible: true, timeout: 5_000 })
	await replaceInputValue(refused, '[data-testid="endpoint-rpc-input"]', nodeUrl.origin)
	await clickByTestId(refused, "edit-endpoint-submit")
	await waitForToast(refused, "Endpoint updated", 30_000)
	await refused.close()

	const fixed = await openPopup(localNetworkExtension)
	await waitForHash(fixed, "#/popup/general")
	expect(await settledStatus(fixed)).toBe("active")
	await fixed.close()

	expect(localNetworkExtension.pageErrors).toEqual([])
})
