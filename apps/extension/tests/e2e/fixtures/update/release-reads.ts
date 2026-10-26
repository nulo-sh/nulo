import type { PinMap } from "@/utils/pinned-tokens"
import type { FeePicks } from "@/wallet/services/ui-preference/spec"
import type { StoredShapeName } from "@/wallet/storage/stored-shapes"
import { shapeOfKey } from "./stored-rows"

type Row = Record<string, unknown>

/** A profile's pins and fee picks, as the release holds them. */
export type ReleasePreferences = { pins: PinMap; picks: FeePicks }

/** The roots a release that seals them is read back from, each as its service returns it. */
export type ReadRoot =
	| "contacts"
	| "dappSessions"
	| "txs"
	| "journal"
	| "tokens"
	| "fpcs"
	| "tokenBalances"
	| "incomingTransfers"
	| "incomingTrust"

/**
 * What a release reads of its sole profile's rows through its own services, from a page unlocked on
 * that profile: what a replay of a release that seals them expects the candidate to read. Held in
 * memory only: its networks carry their endpoints. The checks here read no more of a network or an
 * account than its address, so they stay free of the page helpers' row types.
 */
export type ReleaseReads<Network = Row, Account extends { address: string } = { address: string }> = {
	profileId: string
	selection: string | undefined
	preferences: ReleasePreferences
	networks: Network[]
	accounts: Account[]
	rows: Record<ReadRoot, Row[]>
}

/** Where each read is stored, so a read can be counted against the rows the release stores. */
const STORED_AS: Readonly<Record<ReadRoot | "networks" | "accounts", StoredShapeName>> = {
	networks: "networks",
	accounts: "accounts",
	contacts: "contacts",
	dappSessions: "dappSessions",
	txs: "txs",
	journal: "journal",
	tokens: "tokens",
	fpcs: "fpcs",
	tokenBalances: "tokenBalances",
	incomingTransfers: "incomingTransfers",
	incomingTrust: "incomingTrust",
}

/** A recorded dApp session must outlive the replay's own checks, or the wallet drops it unread. */
export const SESSION_MARGIN_MS = 600_000

/**
 * Why `reads` cannot stand for the rows `entries` stores, or nothing: a root read back with another
 * count than it stores rows (a row the release dropped, filtered or failed to open, or a read of the
 * wrong profile), no selection, a selection naming none of its accounts, or a dApp session that
 * expires before `now` plus {@link SESSION_MARGIN_MS}.
 */
export function readsProblems(reads: ReleaseReads, entries: Record<string, unknown>, now = Date.now()): string[] {
	const stored = (name: StoredShapeName) => Object.keys(entries).filter((key) => shapeOfKey(key) === name).length
	const read: Record<keyof typeof STORED_AS, number> = {
		networks: reads.networks.length,
		accounts: reads.accounts.length,
		...(Object.fromEntries(Object.entries(reads.rows).map(([root, rows]) => [root, rows.length])) as Record<ReadRoot, number>),
	}
	const counts = Object.entries(STORED_AS).flatMap(([root, name]) => {
		const [got, held] = [read[root as keyof typeof STORED_AS], stored(name)]
		return got === held ? [] : [`${root}: the release read ${got} of the ${held} rows it stores`]
	})
	const selection = reads.accounts.some((account) => account.address === reads.selection)
		? []
		: [`the release's selection ${reads.selection ?? "(none)"} names none of its accounts`]
	const expiring = reads.rows.dappSessions
		.filter((session) => (session.expiry as number) < now + SESSION_MARGIN_MS)
		.map((session) => `a dApp session expires ${new Date(session.expiry as number).toISOString()}: record the release again`)
	return [...counts, ...selection, ...expiring]
}

const LOOPBACK_ORIGIN = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?![\w.-])/g

/** Every loopback origin `value` names anywhere, sorted: the run's own services a release's rows
 *  point at, which a later run must not reach. */
export const loopbackOrigins = (value: unknown): string[] =>
	[...new Set(JSON.stringify(value).match(LOOPBACK_ORIGIN) ?? [])].map((origin) => new URL(origin).origin).sort()

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1"])

/** Whether `url` names a node on this machine. */
export function isLoopbackUrl(url: string): boolean {
	try {
		return LOOPBACK_HOSTS.has(new URL(url).hostname)
	} catch {
		return false
	}
}

/** How many of the hosts `urls` name `value` still names anywhere. A count, never the hosts: a
 *  default endpoint's URL may carry a provider's key. */
export function namedHostCount(value: unknown, urls: readonly string[]): number {
	const text = JSON.stringify(value)
	return [...new Set(urls.map((url) => new URL(url).host))].filter((host) => text.includes(host)).length
}
