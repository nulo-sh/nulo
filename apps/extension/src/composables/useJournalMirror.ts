import { type Ref, ref } from "vue"
import { createRunFence } from "@/composables/runFence"
import { type JournalPlace, journalAdded, journalDeleted, journalUpdated } from "@/utils/journal-mirror"
import type { OperationRecord } from "@/wallet/services/operation-journal/spec"

interface JournalMirrorDeps {
	/** The snapshot as the list shows it; `undefined` lands nothing. */
	read: () => Promise<OperationRecord[] | undefined>
	/** A refused event changes nothing and runs no `onRecord`; a delete is never refused. */
	accept: (op: OperationRecord) => boolean
	place: JournalPlace
	/** Runs after an accepted add or update has landed. */
	onRecord?: (op: OperationRecord) => void
	/** Runs after a snapshot has landed. */
	onSnapshot?: () => void
}

/** A snapshot that fails while the port stays up has no reconnect to retry it. */
const RETRY_MS = 2_000

/**
 * The part of the operation journal a view lists, kept by snapshots and live events. A run begun
 * later supersedes one in flight, and a snapshot lands only while its run is current. A refused read
 * keeps the rows shown and still rejects to the caller; while its run is current it is read again
 * on that run every 2 s until one lands. The parent subscribes the returned handlers and its
 * reconnect, and calls `dispose()` in its teardown.
 */
export function useJournalMirror(deps: JournalMirrorDeps) {
	const { read, accept, place, onRecord, onSnapshot } = deps
	const rows: Ref<OperationRecord[]> = ref([])
	const fence = createRunFence()
	let disposed = false
	let retryTimer: ReturnType<typeof setTimeout> | undefined

	/** A run begun after `dispose()` is never current. */
	function begin(): () => boolean {
		const isCurrent = fence.begin()
		return () => !disposed && isCurrent()
	}

	/** A stale run reads nothing: after unmount a request would reconnect the client. */
	async function resnapshot(run = begin()): Promise<void> {
		if (!run()) return
		let fetched: OperationRecord[] | undefined
		try {
			fetched = await read()
		} catch (error) {
			if (run()) {
				clearTimeout(retryTimer)
				retryTimer = setTimeout(() => void resnapshot(run).catch(() => undefined), RETRY_MS)
			}
			throw error
		}
		if (!run() || fetched === undefined) return
		rows.value = fetched
		onSnapshot?.()
	}

	function onOperationAdded(op: OperationRecord) {
		if (disposed || !accept(op)) return
		rows.value = journalAdded(rows.value, op, place)
		onRecord?.(op)
	}

	function onOperationUpdated(op: OperationRecord) {
		if (disposed || !accept(op)) return
		rows.value = journalUpdated(rows.value, op, place)
		onRecord?.(op)
	}

	function onOperationDeleted(op: OperationRecord) {
		if (disposed) return
		rows.value = journalDeleted(rows.value, op)
	}

	function dispose() {
		disposed = true
		fence.invalidate()
		clearTimeout(retryTimer)
	}

	return { rows, begin, resnapshot, onOperationAdded, onOperationUpdated, onOperationDeleted, dispose }
}
