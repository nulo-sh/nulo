import type { Page } from "puppeteer"
import { LEGACY_SELECTED_ACCOUNT_KEY, SELECTED_ACCOUNT_ROOT, SELECTED_ACCOUNT_ROW_ID } from "@/wallet/services/ui-preference/spec"
import { parseEnvelope } from "@/wallet/storage/sealed-entity-storage"
import type { StoredShapeName } from "@/wallet/storage/stored-shapes"
import { STORES } from "@/wallet/storage/stores"
import { FIXTURE_PREFIX, shapeOfKey, unreadRows } from "./stored-rows"

/** Every overlay a boot raises instead of opening the wallet, except the reset's takeover. */
export const BARRIERS = ["migration-blocked", "migration-updating", "migration-degraded", "account-integrity-blocked"] as const
/** The full-screen takeover a quarantined or moved chain shows. */
export const TAKEOVER = "stale-network-takeover"

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

/** Every key family a populated release holds, so a populate step that silently writes nothing, or
 *  a recording made before it, fails at once rather than as a check left with nothing to read. */
export const HELD: readonly StoredShapeName[] = [
	"accountIntegrityVerified",
	"accounts",
	"activeNetwork",
	"config",
	"contacts",
	"dappSessions",
	"fpcs",
	"importedAccountKeys",
	"incomingArrivals",
	"incomingPublicCursors",
	"incomingTransfers",
	"incomingTrust",
	"journal",
	"legalAccepted",
	"networks",
	"onboardingCompleted",
	"profiles",
	"schemaVersion",
	"tokenBalances",
	"tokens",
	"txs",
	"uiActiveAccount",
	"uiFeePicks",
	"uiLastActiveProfile",
	"uiPinnedTokens",
	"uiSendFeePicks",
]

export const missingFamilies = (entries: Record<string, unknown>): StoredShapeName[] =>
	HELD.filter((name) => !Object.keys(entries).some((key) => shapeOfKey(key) === name))

/** Roots whose rows move key when the unlock seals them, so they are counted rather than matched by key. */
const REKEYED: ReadonlySet<string> = new Set(
	Object.entries(STORES).flatMap(([name, store]) => ("sealedRoot" in store && store.sealedRoot?.keyed ? [name] : [])),
)

const SELECTED_ACCOUNT_KEY = `${SELECTED_ACCOUNT_ROOT}@${SELECTED_ACCOUNT_ROW_ID}`

/** Whether a stored value is a sealed row's envelope. */
export const isEnvelope = (raw: unknown): boolean => {
	if (typeof raw !== "string") return false
	try {
		return parseEnvelope(JSON.parse(raw)) !== undefined
	} catch {
		return false
	}
}

/** The release's plaintext selection, which a profile's first read moves into the sealed device
 *  row: gone from `after` is moved, not lost, only while that row is stored sealed. */
const moved = (key: string, after: Record<string, unknown>) =>
	key === LEGACY_SELECTED_ACCOUNT_KEY && isEnvelope(after[SELECTED_ACCOUNT_KEY])

/** Queues a running wallet drains: a row is deleted once its balance refresh succeeds. */
const QUEUES: ReadonlySet<string> = new Set<string>(["incomingBalanceOutbox"] satisfies StoredShapeName[])

/**
 * Why `after`, the storage a build booted over `before`, does not still hold and read `before`: a
 * key the update lost, a refusal the boot wrote, or a row of `after` that does not read under this
 * build's registry. Empty when it does. The release's selection counts as moved once the sealed
 * selection row is stored. A drained queue row counts as lost unless
 * `balancesAsserted`: the caller asserts every balance such a row would refresh, so a row dropped
 * before its refresh shows there as a stale balance.
 */
export async function updateProblems(
	before: Record<string, unknown>,
	after: Record<string, unknown>,
	opts: { balancesAsserted?: true } = {},
): Promise<string[]> {
	const drained = (name: string | undefined) => opts.balancesAsserted === true && name !== undefined && QUEUES.has(name)
	const rekeyed = (key: string) => REKEYED.has(shapeOfKey(key) ?? "")
	const lost = Object.keys(before)
		.filter(
			(key) => !key.startsWith(FIXTURE_PREFIX) && !(key in after) && !drained(shapeOfKey(key)) && !rekeyed(key) && !moved(key, after),
		)
		.map((key) => `${key}: lost in the update`)
	const rowsOf = (entries: Record<string, unknown>, name: string) => Object.keys(entries).filter((key) => shapeOfKey(key) === name).length
	const shrunk = [...REKEYED]
		.filter((name) => !drained(name) && rowsOf(after, name) < rowsOf(before, name))
		.map((name) => `${name}: ${rowsOf(before, name) - rowsOf(after, name)} row(s) lost in the update`)
	const refused = Object.keys(after)
		.filter((key) => {
			const name = shapeOfKey(key)
			return name !== undefined && REFUSALS.has(name)
		})
		.map((key) => `${key}: the boot refused what it found`)
	return [...lost, ...shrunk, ...refused, ...(await unreadRows(after))]
}
