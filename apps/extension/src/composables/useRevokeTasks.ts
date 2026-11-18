import { computed, ref } from "vue"
import { createRunFence } from "@/composables/runFence"
import type { TaskServiceClient } from "@/wallet/services/task/client"
import { ContentKind, type RevokeAuthwitsContent, type Task, TaskStatus } from "@/wallet/services/task/spec"

export type RevokeState = "revoking" | "failed"

interface RevokeTasksDeps {
	/** Connected and disconnected by the parent, which also registers the returned handlers. */
	client: Pick<TaskServiceClient, "getTasks">
}

const isRevoke = (task: Task): task is Task & { content: RevokeAuthwitsContent } =>
	task.content?.kind === ContentKind.RevokeAuthwits && Array.isArray((task.content as RevokeAuthwitsContent).authwitIds)

/** Running reads `revoking`, failed reads `failed`; completed or cancelled reads nothing. */
function stateOfTask(task: Task): RevokeState | undefined {
	if (!task.finishedAt) return "revoking"
	return task.status === TaskStatus.Failed ? "failed" : undefined
}

/**
 * Each authwit row's revoke, as the worker's revoke tasks tell it. A task names its rows by id from
 * the request until the registry read prunes them, and lives in worker memory, so it outlasts the
 * page and the popup that asked. The latest task naming a row decides.
 */
export function useRevokeTasks(deps: RevokeTasksDeps) {
	const tasks = ref<(Task & { content: RevokeAuthwitsContent })[]>([])
	const reads = createRunFence()

	/** Latest wins; false when a newer snapshot, `dispose` or a failed read dropped this one. */
	async function snapshot(): Promise<boolean> {
		const current = reads.begin()
		try {
			const all = await deps.client.getTasks()
			if (!current()) return false
			tasks.value = all.filter(isRevoke)
			return true
		} catch {
			return false
		}
	}

	/** Created and updated alike: an update may reach a task the snapshot has not landed yet. */
	function onTask(task: Task): void {
		if (!isRevoke(task)) return
		const others = tasks.value.filter((t) => t.id !== task.id)
		tasks.value = [...others, task]
	}

	function onTaskDeleted(task: Task): void {
		tasks.value = tasks.value.filter((t) => t.id !== task.id)
	}

	const states = computed(() => {
		const byId = new Map<number, RevokeState | undefined>()
		for (const task of [...tasks.value].sort((a, b) => a.createdAt - b.createdAt)) {
			const state = stateOfTask(task)
			for (const id of task.content.authwitIds) byId.set(id, state)
		}
		return byId
	})

	const stateOf = (id: number): RevokeState | null => states.value.get(id) ?? null

	return { snapshot, onTaskCreated: onTask, onTaskUpdated: onTask, onTaskDeleted, stateOf, dispose: reads.invalidate }
}
