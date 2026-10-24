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

/** The testids each full-screen surface mounts, by surface: it shows while any one is in the page. */
export type Surfaces = Readonly<Record<string, readonly string[]>>

export const ARRIVAL_SURFACES: Surfaces = { sheet: ["legal-sheet"], arrival: ["network-arrival-takeover"] }

export type SurfaceTrace = {
	/** Every set of surfaces the page showed, in order, as their names joined by "+": two at once
	 *  reads "a+b". An empty set and a repeat of the set before it are left out. */
	shown: string[]
	/** How many arrival elements mounted: a remount counts again. */
	arrivals: number
}

/** Records, from now on, every set of `surfaces` the page shows and every arrival mount. */
export async function traceSurfaces(page: Page, surfaces: Surfaces = ARRIVAL_SURFACES): Promise<void> {
	await page.evaluate(
		(all: Surfaces, arrival: string) => {
			const trace: SurfaceTrace = { shown: [], arrivals: 0 }
			;(window as unknown as { __surfaceTrace: SurfaceTrace }).__surfaceTrace = trace
			const mounted = new WeakSet<Element>()
			const check = () => {
				const now = Object.entries(all)
					.filter(([, ids]) => ids.some((id) => document.querySelector(`[data-testid="${id}"]`) !== null))
					.map(([name]) => name)
					.join("+")
				if (now !== "" && trace.shown[trace.shown.length - 1] !== now) trace.shown.push(now)
				const element = document.querySelector(arrival)
				if (element && !mounted.has(element)) {
					mounted.add(element)
					trace.arrivals++
				}
			}
			new MutationObserver(check).observe(document.body, { childList: true, subtree: true })
			check()
		},
		surfaces,
		ARRIVAL,
	)
}

export async function readSurfaceTrace(page: Page): Promise<SurfaceTrace> {
	return page.evaluate(() => (window as unknown as { __surfaceTrace: SurfaceTrace }).__surfaceTrace)
}
