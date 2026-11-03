import { ref } from "vue"
import { createRunFence } from "@/composables/runFence"
import type { TaskServiceClient } from "@/wallet/services/task/client"
import { type BalanceUpdateContent, ContentKind, type Task } from "@/wallet/services/task/spec"

interface BalanceTasksDeps {
	/** Connected and disconnected by the parent, which also registers the returned handlers. */
	client: Pick<TaskServiceClient, "getTasks">
	account: () => string | undefined
	/** Captured at a snapshot's start; a snapshot whose fence is false when it lands writes nothing. */
	scopeFence?: () => () => boolean
}

const isBalanceUpdate = (task: Task): task is Task & { content: BalanceUpdateContent } => task.content.kind === ContentKind.BalanceUpdate

/**
 * The active account's balance refreshes still in flight, from a snapshot kept current by the task
 * events. A task names its row and account only, so a caller matches it to the rows it lists.
 */
export function useBalanceTasks(deps: BalanceTasksDeps) {
	const tasks = ref<Task[]>([])
	const reads = createRunFence()

	/** Latest wins; false when a newer snapshot, the fence or `dispose` dropped this one. */
	async function snapshot(): Promise<boolean> {
		const current = reads.begin()
		const inScope = deps.scopeFence?.()
		const all = await deps.client.getTasks()
		if (!current() || (inScope && !inScope())) return false
		const account = deps.account()
		tasks.value = all.filter((task) => isBalanceUpdate(task) && task.content.account === account)
		return true
	}

	/** True when `task` is one of the account's refreshes, kept once. */
	function onTaskCreated(task: Task): boolean {
		if (!isBalanceUpdate(task) || task.content.account !== deps.account()) return false
		if (!tasks.value.some((t) => t.id === task.id)) tasks.value.push(task)
		return true
	}

	const drop = (task: Task) => {
		tasks.value = tasks.value.filter((t) => t.id !== task.id)
	}

	/** True when a refresh finished: a kept unfinished entry would light its row again on the next read. */
	function onTaskUpdated(task: Task): boolean {
		if (!isBalanceUpdate(task) || !task.finishedAt) return false
		drop(task)
		return true
	}

	function onTaskDeleted(task: Task): boolean {
		if (!isBalanceUpdate(task)) return false
		drop(task)
		return true
	}

	const isUpdating = (tbId: unknown) =>
		tasks.value.some((task) => (task.content as BalanceUpdateContent).tbId === tbId && !task.finishedAt)

	return { snapshot, onTaskCreated, onTaskUpdated, onTaskDeleted, isUpdating, dispose: reads.invalidate }
}
