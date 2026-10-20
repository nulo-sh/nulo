import type { Page } from "puppeteer"
import type { StoredShapeName } from "@/wallet/storage/stored-shapes"
import { FIXTURE_PREFIX, shapeOfKey, unreadRows } from "./stored-rows"

/** Every overlay a boot raises instead of opening the wallet, except the reset's takeover. */
export const BARRIERS = ["migration-blocked", "migration-updating", "migration-degraded", "account-integrity-blocked"] as const
/** The full-screen takeover a quarantined or moved chain shows. */
export const TAKEOVER = "stale-network-takeover"

/** The testids of `ids` that `page` renders now. */
export function shownOverlays(page: Page, ids: readonly string[] = [...BARRIERS, TAKEOVER]): Promise<string[]> {
	return page.evaluate((all: readonly string[]) => all.filter((id) => document.querySelector(`[data-testid="${id}"]`) !== null), ids)
}

/** What a boot writes when it refuses what it found: the engine's refusal or an unfinished run, an
 *  account mismatch, a quarantined chain, a reset under way. */
export const REFUSALS: ReadonlySet<StoredShapeName> = new Set<StoredShapeName>([
	"schemaBlocked",
	"schemaDegraded",
	"schemaRunning",
	"accountIntegrityBlocked",
	"staleNetworks",
	"networkReset",
])

/**
 * Why `after`, the storage a build booted over `before`, does not still hold and read `before`: a
 * key the update lost, a refusal the boot wrote, or a row of `after` that does not read under this
 * build's registry. Empty when it does.
 */
export async function updateProblems(before: Record<string, unknown>, after: Record<string, unknown>): Promise<string[]> {
	const lost = Object.keys(before)
		.filter((key) => !key.startsWith(FIXTURE_PREFIX) && !(key in after))
		.map((key) => `${key}: lost in the update`)
	const refused = Object.keys(after)
		.filter((key) => {
			const name = shapeOfKey(key)
			return name !== undefined && REFUSALS.has(name)
		})
		.map((key) => `${key}: the boot refused what it found`)
	return [...lost, ...refused, ...(await unreadRows(after))]
}
