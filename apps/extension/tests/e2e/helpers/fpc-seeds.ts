import type { Page } from "puppeteer"
import { FPC_STORAGE_ROOT, FpcType } from "@/wallet/services/fpc/spec"
import { offersSponsoredFpc } from "@/wallet/services/fpc/sponsored-fpc-chains"
import type { ActivityScope } from "./activity-seeds"

const FPC_KEY_PREFIX = `${FPC_STORAGE_ROOT}@`

/** The canonical protocol FPC addresses `src/wallet/services/fpc/protocol-fpcs.test.ts` pins. */
const PROTOCOL_FPCS = [
	{ type: FpcType.DefaultSponsoredFpc, name: "Sponsored", address: "0x2d8fff82a3b0c15d0a89169e7d8d043e079ab94d52031f1de1e4972ebad169d3" },
	{ type: FpcType.PrivateFpc, name: "Private Fee Juice", address: "0x0516ebb4f9c7988eb3cf6dd9459a47556f7a92db06b17cfa47ffb37fd35c6915" },
] as const

const seededId = (type: number) => `e2e-protocol-fpc-${type}`

/** The row id the sponsor, the one protocol FPC a wallet with no balance can pay with, is seeded under. */
export const SEEDED_SPONSOR_FPC_ID = seededId(FpcType.DefaultSponsoredFpc)

/** Stores FPC rows as the wallet writes them; a row with no `name` is titled by its address. */
export async function seedFpcs(
	page: Page,
	scope: ActivityScope,
	fpcs: readonly { id: string; type: number; address: string; name?: string }[],
): Promise<void> {
	const rows = Object.fromEntries(
		fpcs.map((fpc) => [`${FPC_KEY_PREFIX}${fpc.id}`, JSON.stringify({ ...fpc, profileId: scope.profileId, chainId: scope.chainId })]),
	)
	await page.evaluate((entries: Record<string, string>) => chrome.storage.local.set(entries), rows)
}

/**
 * Stores the protocol FPC rows the wallet's discovery writes on the scope's chain (the sponsor only
 * where it is offered), so the Send page lists them without a node: with every one present `getFpcs`
 * returns them and never discovers. Discovery can start as soon as the profile exists, so they stand
 * alone only if the spec holds the node from before then. Returns their ids, sorted.
 */
export async function seedProtocolFpcs(page: Page, scope: ActivityScope): Promise<string[]> {
	const rows = PROTOCOL_FPCS.filter((fpc) => fpc.type !== FpcType.DefaultSponsoredFpc || offersSponsoredFpc(scope.chainId)).map(
		(fpc) => ({ id: seededId(fpc.type), ...fpc }),
	)
	await seedFpcs(page, scope, rows)
	return rows.map(({ id }) => id).sort()
}

/** Every stored FPC row's id, sorted, read from the raw keys so a row that would not parse counts too. */
export async function fpcRowIds(page: Page): Promise<string[]> {
	const keys = await page.evaluate(async () => Object.keys(await chrome.storage.local.get(null)))
	return keys
		.filter((key) => key.startsWith(FPC_KEY_PREFIX))
		.map((key) => key.slice(FPC_KEY_PREFIX.length))
		.sort()
}
