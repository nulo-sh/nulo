/**
 * A profile as the build that added a default network leaves it after its first open: the seeded
 * network's row, and the offer record announcing it.
 */
import type { Page } from "puppeteer"
import { arrival } from "@/components/network-arrival/copy"
import { seedForKind } from "@/wallet/services/network/seeds"
import { clickByTestId } from "../fixtures/extension"
import { NETWORKS } from "./identity-rows"
import { readNetwork } from "./stale-network"

const OFFERS = "nulo:core:network-seeded@"

export const ARRIVAL = '[data-testid="network-arrival-takeover"]'

/** Announces the seeded Mainnet on the open profile, as a profile made before it was seeded meets it. */
export async function seedNetworkArrival(page: Page): Promise<{ networkId: string; profileId: string }> {
	const { id: networkId, profileId } = await readNetwork(page, "mainnet")
	await page.evaluate(
		(key: string, value: string) => chrome.storage.local.set({ [key]: value }),
		`${OFFERS}${profileId}`,
		JSON.stringify({ offered: ["local", "mainnet", "testnet"], announce: ["mainnet"] }),
	)
	return { networkId, profileId }
}

/** Whether a release's storage `entries` meet this build's Mainnet seed as an arrival: no offer
 *  record offered it and no row holds its kind. A release that seals its networks also writes the
 *  record, which then answers. */
export function arrivalExpected(entries: Record<string, unknown>): boolean {
	const parsed = (prefix: string) =>
		Object.entries(entries).flatMap(([key, raw]) => (key.startsWith(prefix) && typeof raw === "string" ? [JSON.parse(raw)] : []))
	const offered = parsed(OFFERS).some((record: { offered?: string[] }) => record.offered?.includes("mainnet"))
	return !offered && !parsed(NETWORKS).some((row: { kind?: string }) => row.kind === "mainnet")
}

/** Waits for the arrival of the seeded Mainnet and keeps the current network. */
export async function stayOnArrival(page: Page): Promise<void> {
	await page.waitForSelector(ARRIVAL, { visible: true, timeout: 30_000 })
	const seed = seedForKind("mainnet")
	if (!seed) throw new Error("this build seeds no Mainnet")
	const title = await page.$eval('[data-testid="network-arrival-title"]', (el) => el.textContent?.trim())
	if (title !== arrival(seed.name, "").title) throw new Error(`the arrival reads "${title}"`)
	await clickByTestId(page, "network-arrival-stay")
	await page.waitForSelector(ARRIVAL, { hidden: true, timeout: 15_000 })
}

/** Answers an update's arrival with Stay when the release's storage `entries` lack Mainnet;
 *  otherwise holds that the update announced nothing. */
export async function answerArrival(page: Page, entries: Record<string, unknown>): Promise<void> {
	if (arrivalExpected(entries)) return stayOnArrival(page)
	const { profileId } = await readNetwork(page, "testnet")
	const announced = (await readSeedOffers(page, profileId))?.announce ?? []
	if (announced.length > 0) throw new Error(`the update announced ${announced.join(", ")}`)
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
