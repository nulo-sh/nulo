import type { SealedStoreName, StoredRow } from "@/wallet/storage/stores"
import { type RetiredEndpoint, retireEndpoints } from "./network/retired-endpoints"
import { appendRelay, RETIRED_DEFAULT_ENDPOINTS, retireDefaultName, seedForKind } from "./network/seeds"
import type { ChainKind } from "./network/spec"

/** The profile's offers of Nulo's relay, by network kind, as its seed-offer record holds them. */
export interface RelayOffers {
	/** Whether `kind`'s network may still be offered the relay; never while the record does not read. */
	pending(kind: ChainKind): boolean
	/** Records `kind` as offered. Awaited before the row the offer changes is committed, so a crash
	 *  between the two loses that append rather than offer a removed relay again. */
	take(kind: ChainKind): Promise<void>
}

/** What a root's service hands its conversions beside the rows. */
export type UnlockContext<R extends SealedStoreName> = R extends "networks" ? { readonly relayOffers: RelayOffers } : undefined

/**
 * A value change a sealed root's rows take once their profile's row keys are in the worker, which
 * the pre-unlock migration engine never holds. `convert` returns the row's converted copy, or
 * `undefined` when the row needs none. It reads only `row`, `rows` (the profile's rows of the root
 * as read before the pass) and `context`, never a build version, so it holds whichever build wrote
 * the row; a change made once per profile records itself through `context`, never on the row. No
 * entry of the list converts its output again, so a second pass writes nothing, and the copy keeps
 * `id` and `profileId`.
 */
export type UnlockConversion<R extends SealedStoreName> = {
	readonly name: string
	readonly root: R
	readonly convert: (
		row: StoredRow<R>,
		rows: readonly StoredRow<R>[],
		context: UnlockContext<R>,
	) => StoredRow<R> | undefined | Promise<StoredRow<R> | undefined>
}

export type AnyUnlockConversion = { [R in SealedStoreName]: UnlockConversion<R> }[SealedStoreName]

/** One entry's run over one profile's rows: fixed fields only, since a row can hold a keyed
 *  endpoint URL and an error message can quote its input. */
export type ConversionRecord = { conversion: string; root: SealedStoreName; converted: number; failed: number }

export const retiredEndpointsConversion = (retired: readonly RetiredEndpoint[]): UnlockConversion<"networks"> => ({
	name: "retired-default-endpoints",
	root: "networks",
	convert: (row) => retireEndpoints(row, retired),
})

const retiredNamesConversion: UnlockConversion<"networks"> = {
	name: "retired-default-names",
	root: "networks",
	convert: (row, rows) => retireDefaultName(row, rows),
}

/** Nulo's relay, once per profile and kind: a row reached with the offer pending takes it, whether
 *  the relay is appended, already held or refused for a primary the person replaced. After the
 *  retired endpoints, so a row moved onto its seed's endpoint is offered it in the same pass. */
const relayEndpointConversion: UnlockConversion<"networks"> = {
	name: "relay-endpoint",
	root: "networks",
	convert: async (row, _rows, { relayOffers }) => {
		const kind = row.kind
		if (kind === undefined || !seedForKind(kind)?.relay || !relayOffers.pending(kind)) return undefined
		const next = appendRelay(row)
		await relayOffers.take(kind)
		return next
	},
}

/** In the order a row takes them; order holds within one root only, since each root's service runs
 *  its own unlock handler. Entries stay for good, as the retired data they read does. */
export const UNLOCK_CONVERSIONS: readonly AnyUnlockConversion[] = [
	retiredEndpointsConversion(RETIRED_DEFAULT_ENDPOINTS),
	retiredNamesConversion,
	relayEndpointConversion,
]

export type UnlockConversionRun<R extends SealedStoreName> = {
	context: UnlockContext<R>
	skip?: (row: StoredRow<R>) => boolean
	/** Persists one changed row; awaited before the next row converts. */
	commit: (before: StoredRow<R>, after: StoredRow<R>) => Promise<void>
	/** `warn` when the conversion threw on a row, as a failed pass always has; `debug` otherwise. */
	log: (level: "debug" | "warn", message: string, record: ConversionRecord) => void
	conversions?: readonly AnyUnlockConversion[]
}

type Run<R extends SealedStoreName> = { entry: UnlockConversion<R>; converted: number; failed: number }

/** `row` through `runs` in order, stopping at the first that throws, so a committed row is the
 *  read row converted by a prefix of the list. */
async function convertRow<R extends SealedStoreName>(
	runs: readonly Run<R>[],
	row: StoredRow<R>,
	rows: readonly StoredRow<R>[],
	context: UnlockContext<R>,
): Promise<StoredRow<R>> {
	let current = row
	for (const run of runs) {
		let next: StoredRow<R> | undefined
		try {
			next = await run.entry.convert(current, rows, context)
		} catch {
			run.failed++
			return current
		}
		if (next === undefined) continue
		run.converted++
		current = next
	}
	return current
}

/**
 * Applies every conversion of `root` to `rows`, one row at a time, committing each changed row
 * before the next converts, and logs one {@link ConversionRecord} per conversion, also when a
 * commit rejects. A conversion that throws is counted and ends that row's conversions; a rejected commit
 * ends the run and rejects with its error.
 */
export async function runUnlockConversions<R extends SealedStoreName>(
	root: R,
	rows: readonly StoredRow<R>[],
	{ context, skip, commit, log, conversions = UNLOCK_CONVERSIONS }: UnlockConversionRun<R>,
): Promise<void> {
	const ofRoot = (entry: AnyUnlockConversion): entry is AnyUnlockConversion & UnlockConversion<R> => entry.root === root
	const runs: Run<R>[] = conversions.filter(ofRoot).map((entry) => ({ entry, converted: 0, failed: 0 }))
	try {
		for (const row of rows) {
			if (skip?.(row)) continue
			const next = await convertRow(runs, row, rows, context)
			if (next !== row) await commit(row, next)
		}
	} finally {
		for (const { entry, converted, failed } of runs) {
			const record = { conversion: entry.name, root, converted, failed }
			if (failed === 0) log("debug", "unlock conversion ran", record)
			else log("warn", "an unlock conversion threw; the next worker retries", record)
		}
	}
}
