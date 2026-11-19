import type { ServiceCollection } from "./base"
import type { RequestLog, RequestStage } from "./logger/request-log"
import { OperationJournalService } from "./services/operation-journal/service"
import { type Task, TaskService, TaskStatus } from "./services/task/service"

export function wireRequestCaptures(services: ServiceCollection, requests: RequestLog): void {
	const tasks: TaskService = services.get(TaskService.name)
	const journal: OperationJournalService = services.get(OperationJournalService.name)
	const recorded = new WeakSet<Task>()
	tasks.onTaskUpdated.add((task) => {
		const stage = taskStage(task)
		if (!stage || !task.walletTraceId || recorded.has(task)) return
		recorded.add(task)
		requests.stage(task.walletTraceId, stage)
	})
	journal.onOperationAdded.add((record) => requests.journalEvent(record))
	journal.onOperationUpdated.add((record) => requests.journalEvent(record))
}

/** A finished task's stage; `undefined` while it runs. */
export function taskStage(task: Task): RequestStage | undefined {
	if (task.finishedAt === undefined) return undefined
	const start = task.startedAt ?? task.createdAt
	return { kind: "task", stage: task.content.label, start, end: task.finishedAt, outcome: taskOutcome(task) }
}

function taskOutcome(task: Task): string {
	if (task.status === TaskStatus.Completed) return "ok"
	if (task.status === TaskStatus.Cancelled) return "cancelled"
	return `failed: ${task.error ?? "unknown"}`
}
