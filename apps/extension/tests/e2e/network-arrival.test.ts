/**
 * The arrival of a new default network in the real popup shell, whose boot no cheaper layer runs:
 * the Terms sheet goes first and the arrival waits for it, the arrival comes back at every open until
 * it is answered, and an answered one stays answered when the popup opens again, none of it with a
 * request to the new network's node. A new profile meets no arrival: it starts on Mainnet.
 *
 * `NETWORK_ARRIVAL_CAPTURES=1` instead writes the arrival over Home, dark and light, into
 * `tests/e2e/.captures/` (Chrome only).
 */
import type { Page } from "puppeteer"
import { describe, expect } from "vitest"
import { CHAIN_IDS, MAINNET_L1_CHAIN_ID, MAINNET_ROLLUP_VERSION } from "@/utils/chain-ids"
import { interceptRpc, isFirefox, setViewport, stopBackground } from "./fixtures/browser"
import { MAINNET_NODE_HOST } from "./fixtures/egress-guard"
import { waitForSelectedAccount } from "./fixtures/accounts"
import { clickByTestId, type ExtensionContext, openPopup, registerProfile, test, waitForHash } from "./fixtures/extension"
import { unlockAfterBackgroundDeath } from "./fixtures/auth"
import { switchToNetwork } from "./fixtures/networks"
import { pointerClick, reloadWithLegalState, waitForSheet } from "./helpers/legal-drivers"
import { ARRIVAL, readSeedOffers, readSurfaceTrace, seedNetworkArrival, traceSurfaces } from "./helpers/network-arrival"
import { nodeInfoResult, startStub } from "./helpers/rpc-stub"
import { readNetwork } from "./helpers/stale-network"
import { CAPTURE_VIEWPORT, capture } from "./helpers/stale-network-capture"

const CAPTURES = process.env.NETWORK_ARRIVAL_CAPTURES === "1"
const HOME = '[data-testid="tokens-menu-trigger"]'

const textOf = (page: Page, testid: string) => page.$eval(`[data-testid="${testid}"]`, (el) => el.textContent?.trim())
const mainnetRequests = (extension: ExtensionContext) => extension.egress?.nodes.find(({ host }) => host === MAINNET_NODE_HOST)?.requests()
/** The rollup the public Mainnet node serves until its v6 upgrade executes. */
const ALPHA_ROLLUP_VERSION = 4248422647

/** Runs `body` with the Mainnet node answering as `rollupVersion`; every other call fails. */
async function onMainnetRollup(
	extension: ExtensionContext,
	rollupVersion: number,
	body: (methods: readonly string[]) => Promise<void>,
): Promise<void> {
	const stub = await startStub((method) =>
		method === "aztec_getNodeInfo" ? nodeInfoResult(MAINNET_L1_CHAIN_ID, rollupVersion) : undefined,
	)
	const node = await interceptRpc(extension.browser, extension.extensionId, `https://${MAINNET_NODE_HOST}`, {
		kind: "redirect",
		to: stub.url,
	})
	try {
		await body(stub.methods)
	} finally {
		await node.stop()
		await stub.close()
	}
}

async function reopen(extension: ExtensionContext, page: Page): Promise<Page> {
	await page.close()
	const next = await openPopup(extension)
	await waitForHash(next, "#/popup/general", 30_000)
	return next
}

describe.skipIf(CAPTURES)("network arrival", () => {
	test("waits for the Terms sheet, shows until answered, and stays answered after Stay", async ({
		registeredExtensionPerTest: extension,
	}) => {
		let page = await openPopup(extension)
		await waitForHash(page, "#/popup/general", 30_000)
		const { profileId } = await seedNetworkArrival(page)
		// A profile made before Mainnet has no Mainnet work in flight; this one started there, as a new
		// profile does, so the background restarts before the count's baseline.
		await page.close()
		await stopBackground(extension)
		page = await openPopup(extension)
		await unlockAfterBackgroundDeath(page)
		await reloadWithLegalState(page, "stale")
		const mainnetBefore = mainnetRequests(extension)
		await traceSurfaces(page)

		await waitForSheet(page, "changed")
		expect(await page.$(ARRIVAL)).toBeNull()
		await pointerClick(page, "legal-consent-checkbox")
		await pointerClick(page, "legal-continue")
		await page.waitForSelector(ARRIVAL, { visible: true, timeout: 15_000 })
		expect(await textOf(page, "network-arrival-title")).toBe("Alpha is in your wallet")
		expect(await readSurfaceTrace(page)).toEqual({ shown: ["sheet", "arrival"], arrivals: 1 })

		// Closed unanswered, it is back at the next open.
		page = await reopen(extension, page)
		await page.waitForSelector(ARRIVAL, { visible: true, timeout: 15_000 })

		await pointerClick(page, "network-arrival-stay")
		await page.waitForSelector(HOME, { visible: true, timeout: 15_000 })
		expect(await page.$(ARRIVAL)).toBeNull()
		expect(await readSeedOffers(page, profileId)).toEqual({ offered: ["local", "mainnet", "testnet"] })

		page = await reopen(extension, page)
		await traceSurfaces(page)
		await page.waitForSelector(HOME, { visible: true, timeout: 15_000 })
		expect(await readSurfaceTrace(page)).toEqual({ shown: [], arrivals: 0 })
		await page.close()
		expect(mainnetBefore).toBeTypeOf("number")
		expect(mainnetRequests(extension)).toBe(mainnetBefore)
		expect(extension.egress?.guard.attempts().filter(({ host }) => host === MAINNET_NODE_HOST)).toEqual([])
	}, 180_000)

	test.for([
		["before its v6 upgrade, as the public node is today, reads invalid", ALPHA_ROLLUP_VERSION, "invalidchain"],
		["serving the pinned chain reads active, with no token list or sponsor", MAINNET_ROLLUP_VERSION, "active"],
	] as const)(
		"a new profile starts on Mainnet with no arrival, also after a cold start; its node %s; Testnet is one switch away",
		{ timeout: 180_000 },
		async ([, rollupVersion, status], { freshExtensionPerTest: extension }) => {
			await onMainnetRollup(extension, rollupVersion, async (methods) => {
				await registerProfile(extension)
				let page = await openPopup(extension)
				await waitForHash(page, "#/popup/general", 30_000)
				const mainnet = await readNetwork(page, "mainnet")
				expect(mainnet.chainId).toBe(CHAIN_IDS.MAINNET)
				const active = await page.evaluate(
					async (key: string) => (await chrome.storage.local.get(key))[key],
					`nulo:core:active-network@${mainnet.profileId}`,
				)
				expect(active).toBe(mainnet.id)
				const onMainnet = await waitForSelectedAccount(page, (address) => !!address, "a Mainnet account is selected", 30_000)

				await page.close()
				await stopBackground(extension)
				page = await openPopup(extension)
				await unlockAfterBackgroundDeath(page)
				await page.waitForSelector(`[data-testid="network-button"][data-status="${status}"]`, { visible: true, timeout: 30_000 })
				expect(await textOf(page, "network-name")).toBe("Alpha")
				expect(await page.$(ARRIVAL)).toBeNull()
				await waitForSelectedAccount(page, (address) => address === onMainnet, "the same Mainnet account is selected", 30_000)

				await switchToNetwork(page, "Testnet")
				await waitForSelectedAccount(page, (address) => !!address && address !== onMainnet, "a Testnet account is selected", 30_000)
				await page.close()
				expect(methods).toContain("aztec_getNodeInfo")
			})
		},
	)
})

describe.skipIf(!CAPTURES || isFirefox)("network arrival captures", () => {
	test("the arrival over Home, dark and light", { timeout: 300_000, retry: 0 }, async ({ registeredExtension: ctx }) => {
		const page = await openPopup(ctx)
		await setViewport(page, CAPTURE_VIEWPORT)
		await waitForHash(page, "#/popup/general", 30_000)
		await seedNetworkArrival(page)
		await reloadWithLegalState(page, "current")
		await page.waitForSelector(ARRIVAL, { visible: true, timeout: 30_000 })
		await capture(page, "arrival")
		await clickByTestId(page, "network-arrival-stay")
		await page.waitForSelector(HOME, { visible: true, timeout: 15_000 })
	})

	test("a new profile's Home on Mainnet, its node on another chain, dark and light", { timeout: 300_000, retry: 0 }, async ({
		registeredExtensionPerTest: ctx,
	}) => {
		await onMainnetRollup(ctx, ALPHA_ROLLUP_VERSION, async () => {
			const page = await openPopup(ctx)
			await setViewport(page, CAPTURE_VIEWPORT)
			await waitForHash(page, "#/popup/general", 30_000)
			await page.waitForSelector('[data-testid="network-button"][data-status="invalidchain"]', { visible: true, timeout: 30_000 })
			await capture(page, "fresh-mainnet-home")
		})
	})
})
