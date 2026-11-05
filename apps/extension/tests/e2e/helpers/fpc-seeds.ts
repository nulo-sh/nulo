import type { Page } from "puppeteer"
import { FPC_STORAGE_ROOT, FpcType } from "@/wallet/services/fpc/spec"
import { offersSponsoredFpc } from "@/wallet/services/fpc/sponsored-fpc-chains"
import type { ActivityScope } from "./activity-seeds"
import { PROTOCOL_FPCS } from "./protocol-fpc-pins"

const FPC_KEY_PREFIX = `${FPC_STORAGE_ROOT}@`

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
