import { afterEach, describe, expect, test, vi } from "vitest"
import { effectScope, ref } from "vue"
import { deferred, EventHandler } from "@nulo/wallet-core/utils"
import type { OperationRecord } from "@/wallet/services/operation-journal/spec"
import { ContentKind, type Task, TaskStatus } from "@/wallet/services/task/spec"
import { useExecutingTask } from "./useExecutingTask"

const A = "0xa"
const B = "0xb"

function transferTask(id: string, over: Partial<Task> = {}, sender = A): Task {
	return {
		id,
		status: TaskStatus.Processing,
		createdAt: 10,
		subtasks: [],
		content: { kind: ContentKind.Transfer, label: "Transfer", tokenId: 1, senderAddress: sender } as Task["content"],
		...over,
	}
}

const step = (id: string, parentId: string, status: TaskStatus, label = "Proving"): Task => ({
	id,
	parentId,
	status,
	createdAt: 11,
	subtasks: [],
	content: { kind: ContentKind.Step, label },
})

function record(id: string, over: Partial<OperationRecord> = {}): OperationRecord {
	return {
		id,
		kind: "transfer",
		origin: "popup",
		profileId: "p",
		accountAddress: A,
		tokenId: 1,
		progress: { stage: "cancelled" },
		error: null,
		terminalAt: Date.now(),
		attempts: 0,
		createdAt: 20,
		updatedAt: 20,
		...over,
	} as OperationRecord
}

function harness() {
	const account = ref<string | undefined>(A)
	const rows = ref<OperationRecord[]>([])
	const getTasks = vi.fn<() => Promise<Task[]>>(async () => [])
	const events = { created: new EventHandler<Task>(), updated: new EventHandler<Task>(), deleted: new EventHandler<Task>() }
	const accept = (t: Task) => !t.finishedAt && (t.content as { senderAddress?: string }).senderAddress === account.value
	const scope = effectScope()
	const executing = scope.run(() =>
		useExecutingTask({ taskService: { getTasks }, accept, account: () => account.value, journalRows: () => rows.value }),
	)
	if (!executing) throw new Error("no scope")
	events.created.add(executing.onTaskCreated)
	events.updated.add(executing.onTaskUpdated)
	events.deleted.add(executing.onTaskDeleted)
	return { account, rows, getTasks, events, executing, stop: () => scope.stop() }
}

afterEach(() => vi.useRealTimers())

describe("useExecutingTask — snapshots", () => {
	test("lands the newest accepted task with its steps, never a refused one", async () => {
		const h = harness()
		const older = transferTask("t1", { createdAt: 1 })
		const newer = transferTask("t2", { createdAt: 5, subtasks: [step("s", "t2", TaskStatus.Processing)] })
		h.getTasks.mockResolvedValue([older, transferTask("t3", { createdAt: 9 }, B), newer])
		await h.executing.snapshot()
		expect(h.executing.task.value?.id).toBe("t2")
		expect(h.executing.subtasks.value.map((s) => s.id)).toEqual(["s"])
	})

	test("a snapshot whose account changed while it was out lands nothing", async () => {
		const h = harness()
		const tasks = deferred<Task[]>()
		h.getTasks.mockReturnValue(tasks.promise)
		const run = h.executing.snapshot()
		h.account.value = B
		tasks.resolve([transferTask("t1", {}, B)])
		await run
		expect(h.executing.task.value).toBeNull()
	})

	test("a later snapshot supersedes one in flight, which lands nothing when it settles last", async () => {
		const h = harness()
		const first = deferred<Task[]>()
		h.getTasks.mockReturnValueOnce(first.promise).mockResolvedValueOnce([transferTask("fresh")])
		const stale = h.executing.snapshot()
		await h.executing.snapshot()
		first.resolve([transferTask("stale", { createdAt: 99 })])
		await stale
		expect(h.executing.task.value?.id).toBe("fresh")
	})

	test("reset() ends the run in flight before it clears, so a parked snapshot never lands after it", async () => {
		const h = harness()
		h.events.created.invoke(transferTask("t0", { subtasks: [step("s", "t0", TaskStatus.Processing)] }))
		h.executing.markCancelling("job")
		const parked = deferred<Task[]>()
		h.getTasks.mockReturnValue(parked.promise)
		const run = h.executing.snapshot()
		h.executing.reset()
		expect([h.executing.task.value, h.executing.subtasks.value, [...h.executing.pendingCancels.value]]).toEqual([null, [], []])
		parked.resolve([transferTask("late")])
		await run
		expect(h.executing.task.value).toBeNull()
	})

	test("a snapshot begun after reset() is current and lands", async () => {
		const h = harness()
		h.executing.reset()
		h.getTasks.mockResolvedValue([transferTask("t1")])
		await h.executing.snapshot()
		expect(h.executing.task.value?.id).toBe("t1")
	})

	test("a refused read lands nothing and settles quietly", async () => {
		const h = harness()
		h.getTasks.mockRejectedValue(new Error("port closed"))
		await expect(h.executing.snapshot()).resolves.toBeUndefined()
		expect(h.executing.task.value).toBeNull()
	})

	test("a task that lands after its own record ended within 30 s is cleared at once", async () => {
		const h = harness()
		h.rows.value = [record("r1", { createdAt: 20 })]
		h.getTasks.mockResolvedValue([transferTask("t1", { createdAt: 10 })])
		await h.executing.snapshot()
		expect(h.executing.task.value).toBeNull()
	})
})

describe("useExecutingTask — task events", () => {
	test("an accepted task replaces the shown one; a refused one changes nothing", () => {
		const h = harness()
		h.events.created.invoke(transferTask("t1"))
		h.events.created.invoke(transferTask("t2", {}, B))
		expect(h.executing.task.value?.id).toBe("t1")
	})

	test("steps join, update in place and name the running one with an ellipsis", () => {
		const h = harness()
		h.events.created.invoke(transferTask("t1"))
		expect(h.executing.activeStepLabel.value).toBeNull()
		h.events.created.invoke(step("s1", "t1", TaskStatus.Pending, "Simulating"))
		h.events.updated.invoke(step("s1", "t1", TaskStatus.Processing, "Simulating"))
		h.events.updated.invoke(step("s2", "t1", TaskStatus.Pending, "Proving"))
		h.events.created.invoke(step("x", "other", TaskStatus.Processing, "Elsewhere"))
		expect(h.executing.subtasks.value.map((s) => s.id)).toEqual(["s1", "s2"])
		expect(h.executing.activeStepLabel.value).toBe("Simulating...")
	})

	test("the task finishing or being deleted clears it and its steps; another task's do not", () => {
		const h = harness()
		h.events.created.invoke(transferTask("t1", { subtasks: [step("s", "t1", TaskStatus.Processing)] }))
		h.events.updated.invoke(transferTask("other", { finishedAt: 1 }))
		h.events.deleted.invoke(transferTask("other"))
		expect(h.executing.task.value?.id).toBe("t1")
		h.events.updated.invoke(transferTask("t1", { finishedAt: 1 }))
		expect([h.executing.task.value, h.executing.subtasks.value]).toEqual([null, []])
		h.events.created.invoke(transferTask("t2"))
		h.events.deleted.invoke(transferTask("t2"))
		expect(h.executing.task.value).toBeNull()
	})
})

describe("useExecutingTask — journal records", () => {
	test("a cancel the person asked for clears the task by id when its record ends, whatever it matches", () => {
		const h = harness()
		h.events.created.invoke(transferTask("t1"))
		h.executing.markCancelling("job")
		h.executing.onJournalRecord(record("job", { terminalAt: null }))
		expect(h.executing.task.value?.id).toBe("t1")
		h.executing.onJournalRecord(record("job", { tokenId: 7, createdAt: 0 }))
		expect(h.executing.task.value).toBeNull()
		expect(h.executing.pendingCancels.value.has("job")).toBe(false)
	})

	test("another account's record ending neither clears the task nor spends the cancel mark", () => {
		const h = harness()
		h.events.created.invoke(transferTask("t1"))
		h.executing.markCancelling("job")
		h.executing.onJournalRecord(record("job", { accountAddress: B }))
		expect(h.executing.task.value?.id).toBe("t1")
		expect(h.executing.pendingCancels.value.has("job")).toBe(true)
	})

	test("the task's own record ending clears it; an earlier send's record of the same token does not", () => {
		const h = harness()
		h.events.created.invoke(transferTask("t1", { createdAt: 10 }))
		h.executing.onJournalRecord(record("earlier", { createdAt: 5 }))
		expect(h.executing.task.value?.id).toBe("t1")
		h.executing.onJournalRecord(record("own", { createdAt: 12 }))
		expect(h.executing.task.value).toBeNull()
	})

	test("a journal snapshot clears the task for its own record ended within 30 s, never an older one", () => {
		vi.useFakeTimers({ now: 100_000 })
		const h = harness()
		h.events.created.invoke(transferTask("t1", { createdAt: 10 }))
		h.rows.value = [record("old", { terminalAt: 100_000 - 30_001 })]
		h.executing.onJournalSnapshot()
		expect(h.executing.task.value?.id).toBe("t1")
		h.rows.value = [record("recent", { terminalAt: 100_000 - 30_000 })]
		h.executing.onJournalSnapshot()
		expect(h.executing.task.value).toBeNull()
	})
})

describe("useExecutingTask — dispose", () => {
	test("after dispose() a snapshot never requests, one out lands nothing, and no event or record assigns", async () => {
		const h = harness()
		const out = deferred<Task[]>()
		h.getTasks.mockReturnValueOnce(out.promise)
		const run = h.executing.snapshot()
		h.executing.dispose()
		out.resolve([transferTask("late")])
		await run
		await h.executing.snapshot()
		expect(h.getTasks).toHaveBeenCalledTimes(1)
		h.events.created.invoke(transferTask("t1"))
		expect(h.executing.task.value).toBeNull()

		const shown = harness()
		shown.events.created.invoke(transferTask("t1"))
		shown.executing.dispose()
		shown.events.updated.invoke(transferTask("t1", { finishedAt: 1 }))
		shown.events.deleted.invoke(transferTask("t1"))
		shown.executing.onJournalRecord(record("own", { createdAt: 12 }))
		shown.executing.onJournalSnapshot()
		expect(shown.executing.task.value?.id).toBe("t1")
		h.stop()
		shown.stop()
	})
})
