import { computed, type Ref, ref } from "vue"
import { createRunFence } from "@/composables/runFence"
import { isOwnTerminalRecord } from "@/popup/components/modules/general/recent-activity-handlers"
import type { OperationRecord } from "@/wallet/services/operation-journal/spec"
import type { TaskServiceClient } from "@/wallet/services/task/client"
import { type Task, TaskStatus } from "@/wallet/services/task/spec"

interface ExecutingTaskDeps {
	taskService: Pick<TaskServiceClient, "getTasks">
	/** Whether a task belongs in this view; judged on every event and on each snapshot's tasks. */
	accept: (task: Task) => boolean
	/** The active account's address: a snapshot lands only while it is unchanged. */
	account: () => string | undefined
	/** The journal's rows, read when a journal snapshot lands. */
	journalRows: () => readonly OperationRecord[]
}

/**
 * A snapshot ends no earlier record: one that ended within this window is the task's own when a popup
 * closed mid-cancel reopens, an older one never is.
 */
const SNAPSHOT_TERMINAL_WINDOW_MS = 30_000

/**
 * The one in-flight task a view shows, kept by snapshots and TaskService events, and cleared the
 * moment its own journal record ends. A snapshot begun later supersedes one in flight; `reset()` ends
 * the current run before it clears, so a snapshot out for the previous scope never lands. The parent
 * subscribes the three task handlers and calls `dispose()` in its teardown; after it, nothing is
 * requested or assigned, since a request would reconnect the disconnected client.
 */
export function useExecutingTask(deps: ExecutingTaskDeps) {
	const { taskService, accept, account, journalRows } = deps
	const task: Ref<Task | null> = ref(null)
	const subtasks: Ref<Task[]> = ref([])
	/** Jobs the person asked to cancel: their record ending clears the task by id, whatever it matches. */
	const pendingCancels: Ref<Set<string>> = ref(new Set())
	const fence = createRunFence()
	let disposed = false

	const activeStepLabel = computed(() => {
		const active = subtasks.value.find((s) => s.status === TaskStatus.Processing)
		return active ? `${active.content.label}...` : null
	})

	function clear() {
		task.value = null
		subtasks.value = []
	}

	function onTaskCreated(created: Task) {
		if (disposed) return
		if (accept(created)) {
			task.value = created
			subtasks.value = created.subtasks || []
			return
		}
		if (created.parentId && task.value && created.parentId === task.value.id) subtasks.value.push(created)
	}

	function onTaskUpdated(updated: Task) {
		if (disposed) return
		if (task.value && updated.id === task.value.id) {
			if (updated.finishedAt) clear()
			else task.value = updated
			return
		}
		if (updated.parentId && task.value && updated.parentId === task.value.id) {
			const idx = subtasks.value.findIndex((s) => s.id === updated.id)
			if (idx !== -1) subtasks.value[idx] = updated
			else subtasks.value.push(updated)
		}
	}

	function onTaskDeleted(deleted: Task) {
		if (disposed) return
		if (task.value && deleted.id === task.value.id) clear()
	}

	/** The newest accepted task of the snapshot, or none; a stale run or another account lands nothing. */
	async function snapshot(): Promise<void> {
		if (disposed) return
		const isCurrent = fence.begin()
		const captured = account()
		try {
			const all = await taskService.getTasks()
			if (disposed || !isCurrent() || captured !== account()) return
			const newest = all.filter((t) => accept(t)).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0]
			if (newest) {
				task.value = newest
				subtasks.value = newest.subtasks || []
			}
			// The journal snapshot may land first; whichever lands second reconciles the two.
			onJournalSnapshot()
		} catch {
			// Non-fatal; a later task event or reconnect re-snapshots.
		}
	}

	function markCancelling(jobId: string) {
		pendingCancels.value.add(jobId)
	}

	/** An accepted journal add or update: a cancel the person asked for, or the task's own record, ended. */
	function onJournalRecord(op: OperationRecord) {
		if (disposed) return
		if (pendingCancels.value.has(op.id) && op.terminalAt !== null && op.accountAddress === account()) {
			pendingCancels.value.delete(op.id)
			clear()
		}
		if (task.value && isOwnTerminalRecord(task.value, op, account())) clear()
	}

	/** After a journal snapshot lands: the task's own record ended within the window clears it. */
	function onJournalSnapshot() {
		if (disposed || !task.value) return
		const current = task.value
		const cutoff = Date.now() - SNAPSHOT_TERMINAL_WINDOW_MS
		const address = account()
		if (journalRows().some((op) => isOwnTerminalRecord(current, op, address) && (op.terminalAt ?? 0) >= cutoff)) clear()
	}

	/** Ends the run in flight, then clears the task, its steps and the pending cancels. */
	function reset() {
		fence.invalidate()
		clear()
		pendingCancels.value = new Set()
	}

	function dispose() {
		disposed = true
		fence.invalidate()
	}

	return {
		task,
		subtasks,
		pendingCancels,
		activeStepLabel,
		onTaskCreated,
		onTaskUpdated,
		onTaskDeleted,
		snapshot,
		markCancelling,
		onJournalRecord,
		onJournalSnapshot,
		reset,
		dispose,
	}
}
