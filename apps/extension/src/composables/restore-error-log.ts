import { type Ref, toRaw } from "vue"
import { collectRestoreErrors } from "@/utils/full-backup-helpers"
import { type AccountStateRetryContext, retryReplacedRows } from "./full-backup-restore"

/** Whether `log` holds a row a Retry of `ctx` would not replace; with no context, any row. */
export function hasRowsBeyondRetry(log: Record<string, unknown[]>, ctx: AccountStateRetryContext | null): boolean {
	const replaced = new Set(ctx ? retryReplacedRows(ctx) : [])
	// Rows read back through the reactive log are proxies: compare the raw rows.
	return Object.values(log).some((rows) => rows.some((row) => !replaced.has(toRaw(row))))
}

function reportRestoreErrors(serviceName: string, data: unknown): unknown[] {
	const errors = collectRestoreErrors(serviceName, data) ?? []
	// Names the service and the count only: the rows carry network ids and addresses, which stay
	// in the error viewer and never reach the exportable log.
	if (errors.length) console.warn(`[full-backup-import] ${serviceName} reported ${errors.length} restore error(s)`)
	return errors
}

/** The error log's writers: a stage's append, its collected rows, and a Retry's swap of the rows it
 *  replaces. */
export function errorLogWriters(restoreErrorLog: Ref<Record<string, unknown[]>>) {
	/** Appends even an empty list: the key alone counts as an error. */
	function appendErrors(serviceName: string, records: unknown[]): void {
		restoreErrorLog.value[serviceName] = [...(restoreErrorLog.value[serviceName] ?? []), ...records]
	}
	function recordRestoreErrors(serviceName: string, data: unknown): unknown[] {
		const errors = reportRestoreErrors(serviceName, data)
		// APPEND, not assign: some services already have entries recorded before
		// their restore runs (e.g. token-balance's un-relinkable rows are recorded
		// pre-restore) — a plain assignment would clobber those diagnostics.
		if (errors.length) appendErrors(serviceName, errors)
		return errors
	}
	/** Swaps `stale` rows for `data`'s in ONE assignment, so the screen never passes through an
	 *  empty log; an emptied key is deleted, because a key alone counts as an error. */
	function replaceRestoreErrors(serviceName: string, stale: unknown[], data: unknown): unknown[] {
		const fresh = reportRestoreErrors(serviceName, data)
		// Rows read back through the reactive log are proxies: compare the raw rows.
		const staleRows = new Set(stale.map((row) => toRaw(row)))
		const { [serviceName]: current = [], ...others } = toRaw(restoreErrorLog.value)
		const rows = [...current.filter((row) => !staleRows.has(toRaw(row))), ...fresh]
		restoreErrorLog.value = rows.length ? { ...others, [serviceName]: rows } : others
		return fresh
	}
	return { appendErrors, recordRestoreErrors, replaceRestoreErrors }
}
