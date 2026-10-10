import type { Page } from "puppeteer"
import type { ActivityScope } from "./activity-seeds"

/** The canonical protocol FPC addresses `src/wallet/services/fpc/protocol-fpcs.test.ts` pins. */
const PROTOCOL_FPCS = [
	{ type: 1, name: "Sponsored", address: "0x06a9fa0208c78509921b0487a6b5cd5c2e93baf17de1a18d310f65a3cc1d924b" },
	{ type: 2, name: "Private Fee Juice", address: "0x0b3bc795b5c077b57920d590ecc163af18705554abf7164cb0f8c52850943c08" },
] as const

/**
 * Stores the two protocol FPC rows the wallet's discovery writes, so the Send page lists Nulo's
 * sponsor without a node: with both rows present `getFpcs` returns them and never discovers.
 */
export async function seedProtocolFpcs(page: Page, scope: ActivityScope): Promise<void> {
	const rows = Object.fromEntries(
		PROTOCOL_FPCS.map(({ type, name, address }) => {
			const id = `e2e-protocol-fpc-${type}`
			return [`nulo:core:fpcs@${id}`, JSON.stringify({ id, profileId: scope.profileId, chainId: scope.chainId, type, address, name })]
		}),
	)
	await page.evaluate((entries: Record<string, string>) => chrome.storage.local.set(entries), rows)
}
