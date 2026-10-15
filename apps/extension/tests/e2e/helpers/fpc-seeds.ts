import type { Page } from "puppeteer"
import { FPC_STORAGE_ROOT } from "@/wallet/services/fpc/spec"
import type { ActivityScope } from "./activity-seeds"

const FPC_KEY_PREFIX = `${FPC_STORAGE_ROOT}@`

/** The canonical protocol FPC addresses `src/wallet/services/fpc/protocol-fpcs.test.ts` pins. */
const PROTOCOL_FPCS = [
	{ type: 1, name: "Sponsored", address: "0x2adfb70e860909f0db8268b3fec80bce52a94559963444f5c0341816b8412130" },
	{ type: 2, name: "Private Fee Juice", address: "0x2e189d0c28cb86234a17951a94131e19620cda595fa8f9c5c10c24268ceb6db4" },
] as const

const seededId = (type: number) => `e2e-protocol-fpc-${type}`

/** The row id the sponsor, the one protocol FPC a wallet with no balance can pay with, is seeded under. */
export const SEEDED_SPONSOR_FPC_ID = seededId(1)

export const SEEDED_FPC_IDS: readonly string[] = PROTOCOL_FPCS.map(({ type }) => seededId(type))

/**
 * Stores the two protocol FPC rows the wallet's discovery writes, so the Send page lists Nulo's
 * sponsor without a node: with both rows present `getFpcs` returns them and never discovers. Discovery
 * can start as soon as the profile exists, so they stand alone only if the spec holds the node from
 * before then.
 */
export async function seedProtocolFpcs(page: Page, scope: ActivityScope): Promise<void> {
	const rows = Object.fromEntries(
		PROTOCOL_FPCS.map(({ type, name, address }) => {
			const id = seededId(type)
			return [
				`${FPC_KEY_PREFIX}${id}`,
				JSON.stringify({ id, profileId: scope.profileId, chainId: scope.chainId, type, address, name }),
			]
		}),
	)
	await page.evaluate((entries: Record<string, string>) => chrome.storage.local.set(entries), rows)
}

/** Every stored FPC row's id, sorted, read from the raw keys so a row that would not parse counts too. */
export async function fpcRowIds(page: Page): Promise<string[]> {
	const keys = await page.evaluate(async () => Object.keys(await chrome.storage.local.get(null)))
	return keys
		.filter((key) => key.startsWith(FPC_KEY_PREFIX))
		.map((key) => key.slice(FPC_KEY_PREFIX.length))
		.sort()
}
