/**
 * A profile as the build that adds a default network leaves it after its first open: the new
 * network's row, and the offer record announcing it. This build seeds no Mainnet, so the planted row
 * is the arrival's only way in, as `seedStaleMainnet` is the takeover's.
 */
import type { Page } from "puppeteer"
import { MAINNET_L1_CHAIN_ID } from "@/utils/chain-ids"
import { addNetwork, E2E_MAINNET_CHAIN_ID, readNetwork } from "./stale-network"

const OFFERS = "nulo:core:network-seeded@"

export const ARRIVAL = '[data-testid="network-arrival-takeover"]'

/** Plants a Mainnet row the person has never answered for, on the open profile. */
export async function seedNetworkArrival(page: Page): Promise<{ networkId: string; profileId: string }> {
	const { networkId } = await addNetwork(page, {
		name: "Mainnet",
		kind: "mainnet",
		chainId: E2E_MAINNET_CHAIN_ID,
		l1ChainId: MAINNET_L1_CHAIN_ID,
		movedAccount: false,
		active: false,
	})
	const { profileId } = await readNetwork(page, "mainnet")
	await page.evaluate(
		(key: string, value: string) => chrome.storage.local.set({ [key]: value }),
		`${OFFERS}${profileId}`,
		JSON.stringify({ offered: ["local", "mainnet", "testnet"], announce: ["mainnet"] }),
	)
	return { networkId, profileId }
}

/** The stored offer record of `profileId`, parsed. */
export async function readSeedOffers(page: Page, profileId: string): Promise<{ offered: string[]; announce?: string[] } | null> {
	const raw = await page.evaluate(async (key: string) => (await chrome.storage.local.get(key))[key], `${OFFERS}${profileId}`)
	return typeof raw === "string" ? JSON.parse(raw) : null
}

/** Records, from now on, whether the arrival ever mounted and whether it ever shared the page with
 *  the Terms sheet. */
export async function traceArrival(page: Page): Promise<void> {
	await page.evaluate((arrival: string) => {
		const trace = { mounted: false, stacked: false }
		;(window as unknown as { __arrivalTrace: typeof trace }).__arrivalTrace = trace
		const check = () => {
			const shown = document.querySelector(arrival) !== null
			trace.mounted ||= shown
			trace.stacked ||= shown && document.querySelector('[data-testid="legal-sheet"]') !== null
		}
		new MutationObserver(check).observe(document.body, { childList: true, subtree: true })
		check()
	}, ARRIVAL)
}

export async function readArrivalTrace(page: Page): Promise<{ mounted: boolean; stacked: boolean }> {
	return page.evaluate(() => (window as unknown as { __arrivalTrace: { mounted: boolean; stacked: boolean } }).__arrivalTrace)
}
