import type { SealedStoreName, StoredRow } from "@/wallet/storage/stores"
import { type RetiredEndpoint, retireEndpoints } from "./network/retired-endpoints"
import { RETIRED_DEFAULT_ENDPOINTS, retireDefaultName } from "./network/seeds"

/**
 * A value change a sealed root's rows take once their profile's row keys are in the worker, which
 * the pre-unlock migration engine never holds. `convert` returns the row's converted copy, or
 * `undefined` when the row needs none. It reads only `row` and `rows` (the profile's rows of the
 * root as read before the pass), never a build version or a stored marker, so it holds whichever
 * build wrote the row; its own output converts no further, and the copy keeps `id` and `profileId`.
 */
export type UnlockConversion<R extends SealedStoreName> = {
	readonly name: string
	readonly root: R
	readonly convert: (row: StoredRow<R>, rows: readonly StoredRow<R>[]) => StoredRow<R> | undefined | Promise<StoredRow<R> | undefined>
}

export type AnyUnlockConversion = { [R in SealedStoreName]: UnlockConversion<R> }[SealedStoreName]

/** One entry's run over one profile's rows: fixed fields only, since a row can hold a keyed
 *  endpoint URL and an error message can quote its input. */
export type ConversionRecord = { conversion: string; root: SealedStoreName; converted: number; failed: number }

/** An endpoint on a URL an earlier build seeded and this one retired takes the URL that replaces it. */
export const retiredEndpointsConversion = (retired: readonly RetiredEndpoint[]): UnlockConversion<"networks"> => ({
	name: "retired-default-endpoints",
	root: "networks",
	convert: (row) => retireEndpoints(row, retired),
})

/** A seeded row still named as an earlier build seeded its kind takes the seed's current name. */
const retiredNamesConversion: UnlockConversion<"networks"> = {
	name: "retired-default-names",
	root: "networks",
	convert: (row, rows) => retireDefaultName(row, rows),
}

/** In the order a row takes them; order holds within one root only, since each root's service runs
 *  its own unlock handler. Entries stay for good, as the retired data they read does. */
export const UNLOCK_CONVERSIONS: readonly AnyUnlockConversion[] = [
	retiredEndpointsConversion(RETIRED_DEFAULT_ENDPOINTS),
	retiredNamesConversion,
]

export type UnlockConversionRun<R extends SealedStoreName> = {
	/** Rows left as read. */
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
): Promise<StoredRow<R>> {
	let current = row
	for (const run of runs) {
		let next: StoredRow<R> | undefined
		try {
			next = await run.entry.convert(current, rows)
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
 * commit rejects. A conversion that throws is counted and skipped for that row; a rejected commit
 * ends the run and rejects with its error.
 */
export async function runUnlockConversions<R extends SealedStoreName>(
	root: R,
	rows: readonly StoredRow<R>[],
	{ skip, commit, log, conversions = UNLOCK_CONVERSIONS }: UnlockConversionRun<R>,
): Promise<void> {
	const ofRoot = (entry: AnyUnlockConversion): entry is AnyUnlockConversion & UnlockConversion<R> => entry.root === root
	const runs: Run<R>[] = conversions.filter(ofRoot).map((entry) => ({ entry, converted: 0, failed: 0 }))
	try {
		for (const row of rows) {
			if (skip?.(row)) continue
			const next = await convertRow(runs, row, rows)
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
