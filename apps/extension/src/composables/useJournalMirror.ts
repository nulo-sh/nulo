import { type Ref, ref } from "vue"
import { createRunFence } from "@/composables/runFence"
import { type JournalAddRules, journalAdded, journalDeleted, journalUpdated } from "@/utils/journal-mirror"
import type { OperationRecord } from "@/wallet/services/operation-journal/spec"

interface JournalMirrorDeps extends JournalAddRules {
	/** The snapshot as the list shows it; `undefined` lands nothing. */
	read: () => Promise<OperationRecord[] | undefined>
	/** A refused event runs no `onRecord`, and a refused add changes nothing; a delete is never
	 *  refused. */
	accept: (op: OperationRecord) => boolean
	/** A refused update drops its row rather than changing nothing. */
	dropRefusedUpdate?: boolean
	/** A run begun later supersedes one in flight (the default); off, every read lands as it
	 *  answers. */
	supersede?: boolean
	/** Runs after an accepted add or update has landed. */
	onRecord?: (op: OperationRecord) => void
	/** Runs after a snapshot has landed. */
	onSnapshot?: () => void
}

/**
 * The part of the operation journal a view lists, kept by snapshots and live events. A snapshot
 * lands only while its run is current; a refused read rejects to the caller, whose retry policy it
 * is. The parent subscribes the returned handlers and its reconnect, and calls `dispose()` in its
 * teardown.
 */
export function useJournalMirror(deps: JournalMirrorDeps) {
	const { read, accept, onRecord, onSnapshot } = deps
	const rows: Ref<OperationRecord[]> = ref([])
	const fence = createRunFence()
	let disposed = false

	/** A run begun after `dispose()` is never current. */
	function begin(): () => boolean {
		const isCurrent = deps.supersede === false ? fence.snapshot() : fence.begin()
		return () => !disposed && isCurrent()
	}

	/** A stale run reads nothing: after unmount a request would reconnect the client. */
	async function resnapshot(run = begin()): Promise<void> {
		if (!run()) return
		const fetched = await read()
		if (!run() || fetched === undefined) return
		rows.value = fetched
		onSnapshot?.()
	}

	function onOperationAdded(op: OperationRecord) {
		if (disposed || !accept(op)) return
		rows.value = journalAdded(rows.value, op, deps)
		onRecord?.(op)
	}

	function onOperationUpdated(op: OperationRecord) {
		if (disposed) return
		if (!accept(op)) {
			if (deps.dropRefusedUpdate) rows.value = journalDeleted(rows.value, op)
			return
		}
		rows.value = journalUpdated(rows.value, op, deps.place)
		onRecord?.(op)
	}

	function onOperationDeleted(op: OperationRecord) {
		if (disposed) return
		rows.value = journalDeleted(rows.value, op)
	}

	function dispose() {
		disposed = true
		fence.invalidate()
	}

	return { rows, begin, resnapshot, onOperationAdded, onOperationUpdated, onOperationDeleted, dispose }
}
