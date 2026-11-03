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

type Replay = (rows: OperationRecord[]) => OperationRecord[]

/**
 * The part of the operation journal a view lists, kept by snapshots and live events. A run begun
 * later supersedes one in flight, and a snapshot lands only while its run is current. An event that
 * reaches it while a read is out is replayed over that read's snapshot, in arrival order: the worker
 * reads its rows before it answers, so a snapshot can predate a change it would otherwise undo. A
 * refused read keeps the rows shown and still rejects to the caller; while its run is current it is
 * read again on that run every 2 s until one answers. The parent subscribes the returned handlers
 * and its reconnect, and calls `dispose()` in its teardown.
 */
export function useJournalMirror(deps: JournalMirrorDeps) {
	const { read, accept, place, onRecord, onSnapshot } = deps
	const rows: Ref<OperationRecord[]> = ref([])
	const fence = createRunFence()
	let disposed = false
	let retryTimer: ReturnType<typeof setTimeout> | undefined
	/** What reached the mirror during each read still out; a read's own list goes when it settles. */
	const reading = new Set<Replay[]>()

	/** A run begun after `dispose()` is never current. Every read out belongs to a run it supersedes. */
	function begin(): () => boolean {
		reading.clear()
		const isCurrent = fence.begin()
		return () => !disposed && isCurrent()
	}

	function apply(replay: Replay) {
		rows.value = replay(rows.value)
		for (const missed of reading) missed.push(replay)
	}

	/** A stale run reads nothing: after unmount a request would reconnect the client. */
	async function resnapshot(run = begin()): Promise<void> {
		if (!run()) return
		const missed: Replay[] = []
		reading.add(missed)
		let fetched: OperationRecord[] | undefined
		try {
			fetched = await read()
		} catch (error) {
			if (run()) {
				clearTimeout(retryTimer)
				retryTimer = setTimeout(() => void resnapshot(run).catch(() => undefined), RETRY_MS)
			}
			throw error
		} finally {
			reading.delete(missed)
		}
		if (!run() || fetched === undefined) return
		rows.value = missed.reduce((list, replay) => replay(list), fetched)
		onSnapshot?.()
	}

	function onOperationAdded(op: OperationRecord) {
		if (disposed || !accept(op)) return
		apply((list) => journalAdded(list, op, place))
		onRecord?.(op)
	}

	function onOperationUpdated(op: OperationRecord) {
		if (disposed || !accept(op)) return
		apply((list) => journalUpdated(list, op, place))
		onRecord?.(op)
	}

	function onOperationDeleted(op: OperationRecord) {
		if (disposed) return
		apply((list) => journalDeleted(list, op))
	}

	function dispose() {
		disposed = true
		fence.invalidate()
		clearTimeout(retryTimer)
		reading.clear()
	}

	return { rows, begin, resnapshot, onOperationAdded, onOperationUpdated, onOperationDeleted, dispose }
}
