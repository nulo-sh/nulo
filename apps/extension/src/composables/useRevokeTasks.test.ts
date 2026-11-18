import { describe, expect, test, vi } from "vitest"
import { authwitRowKey } from "@/wallet/services/auth-registry/spec"
import { ContentKind, type Task, TaskStatus } from "@/wallet/services/task/spec"
import { useRevokeTasks } from "./useRevokeTasks"

const SCOPE = { profileId: "p1", chainId: 1, account: `0x${"ab".repeat(32)}` }
/** A row as the page lists it; a later grant that takes a pruned row's id has its own hash and grant. */
const row = (id: number, grant = "a") => ({ ...SCOPE, id, hash: `0x${grant.repeat(64)}`, txHash: `0x${grant.repeat(64)}` })

let clock = 0
function revokeTask(id: string, ids: number[], status = TaskStatus.Processing): Task {
	clock++
	const finished = status === TaskStatus.Completed || status === TaskStatus.Failed || status === TaskStatus.Cancelled
	return {
		id,
		content: {
			kind: ContentKind.RevokeAuthwits,
			label: "Revoke public authwits",
			authwitIds: ids,
			authwitKeys: ids.map((n) => authwitRowKey(row(n))),
		} as Task["content"],
		status,
		createdAt: clock,
		subtasks: [],
		...(finished ? { finishedAt: clock + 1 } : {}),
		...(status === TaskStatus.Failed ? { error: "Authwit #1 is still authorized after the revoke" } : {}),
	}
}
const settle = (task: Task, status: TaskStatus): Task => ({ ...task, status, finishedAt: task.createdAt + 1 })
const balanceTask = (id: string): Task => ({
	id,
	content: { kind: ContentKind.BalanceUpdate, label: "Refresh token balance", tbId: 1, account: "0x1" } as Task["content"],
	status: TaskStatus.Processing,
	createdAt: ++clock,
	subtasks: [],
})

function setup(tasks: Task[] = []) {
	const getTasks = vi.fn(async () => tasks)
	return { getTasks, revokes: useRevokeTasks({ client: { getTasks } }) }
}

describe("useRevokeTasks", () => {
	test("reads nothing before a snapshot or event", () => {
		const { revokes } = setup()
		expect(revokes.stateOf(row(1))).toBeNull()
	})

	test("a snapshot's running revoke reads revoking for each row it names, and no other", async () => {
		const { revokes } = setup([revokeTask("t1", [1, 2])])
		expect(await revokes.snapshot()).toBe(true)
		expect([revokes.stateOf(row(1)), revokes.stateOf(row(2)), revokes.stateOf(row(3))]).toEqual(["revoking", "revoking", null])
	})

	test("a grant that takes a pruned row's id inherits nothing; the revoked row itself still reads", () => {
		const { revokes } = setup()
		revokes.onTaskCreated(settle(revokeTask("t1", [3]), TaskStatus.Failed))
		expect(revokes.stateOf(row(3, "c"))).toBeNull()
		expect(revokes.stateOf(row(3))).toBe("failed")
	})

	test("tasks of any other kind are ignored", async () => {
		const { revokes } = setup([balanceTask("b1")])
		await revokes.snapshot()
		revokes.onTaskCreated(balanceTask("b2"))
		expect(revokes.stateOf(row(1))).toBeNull()
	})

	test("a revoke created after the snapshot reads revoking; completed, its rows read nothing", async () => {
		const { revokes } = setup()
		await revokes.snapshot()
		const task = revokeTask("t1", [4])
		revokes.onTaskCreated(task)
		expect(revokes.stateOf(row(4))).toBe("revoking")
		revokes.onTaskUpdated(settle(task, TaskStatus.Completed))
		expect(revokes.stateOf(row(4))).toBeNull()
	})

	test("a failed revoke reads failed until its task is deleted", () => {
		const { revokes } = setup()
		const task = revokeTask("t1", [5])
		revokes.onTaskCreated(task)
		revokes.onTaskUpdated(settle(task, TaskStatus.Failed))
		expect(revokes.stateOf(row(5))).toBe("failed")
		revokes.onTaskDeleted(task)
		expect(revokes.stateOf(row(5))).toBeNull()
	})

	test("a cancelled revoke reads nothing", () => {
		const { revokes } = setup()
		const task = revokeTask("t1", [6])
		revokes.onTaskCreated(task)
		revokes.onTaskUpdated(settle(task, TaskStatus.Cancelled))
		expect(revokes.stateOf(row(6))).toBeNull()
	})

	test("an update for a task the snapshot never held is kept", () => {
		const { revokes } = setup()
		revokes.onTaskUpdated(revokeTask("t1", [7]))
		expect(revokes.stateOf(row(7))).toBe("revoking")
	})

	test("the latest revoke naming a row decides, whichever order the events arrive in", () => {
		const { revokes } = setup()
		const failed = settle(revokeTask("t1", [8]), TaskStatus.Failed)
		const retry = revokeTask("t2", [8])
		revokes.onTaskCreated(retry)
		revokes.onTaskUpdated(failed)
		expect(revokes.stateOf(row(8))).toBe("revoking")
		revokes.onTaskUpdated(settle(retry, TaskStatus.Failed))
		expect(revokes.stateOf(row(8))).toBe("failed")
	})

	test("a later snapshot replaces what an earlier one held", async () => {
		const tasks = [revokeTask("t1", [9])]
		const { revokes } = setup(tasks)
		await revokes.snapshot()
		tasks.splice(0, 1, settle(tasks[0] as Task, TaskStatus.Completed))
		await revokes.snapshot()
		expect(revokes.stateOf(row(9))).toBeNull()
	})

	test("of two snapshots in flight only the later lands", async () => {
		let answerFirst: (tasks: Task[]) => void = () => {}
		const getTasks = vi
			.fn<() => Promise<Task[]>>()
			.mockImplementationOnce(() => new Promise((resolve) => (answerFirst = resolve)))
			.mockResolvedValueOnce([])
		const revokes = useRevokeTasks({ client: { getTasks } })
		const first = revokes.snapshot()
		expect(await revokes.snapshot()).toBe(true)
		answerFirst([revokeTask("t1", [10])])
		expect(await first).toBe(false)
		expect(revokes.stateOf(row(10))).toBeNull()
	})

	test("a failed read lands nothing and keeps what events brought", async () => {
		const getTasks = vi.fn(async (): Promise<Task[]> => {
			throw new Error("worker gone")
		})
		const revokes = useRevokeTasks({ client: { getTasks } })
		revokes.onTaskCreated(revokeTask("t1", [11]))
		expect(await revokes.snapshot()).toBe(false)
		expect(revokes.stateOf(row(11))).toBe("revoking")
	})

	test("a snapshot answered after dispose lands nothing", async () => {
		let answer: (tasks: Task[]) => void = () => {}
		const getTasks = vi.fn(() => new Promise<Task[]>((resolve) => (answer = resolve)))
		const revokes = useRevokeTasks({ client: { getTasks } })
		const read = revokes.snapshot()
		revokes.dispose()
		answer([revokeTask("t1", [12])])
		expect(await read).toBe(false)
		expect(revokes.stateOf(row(12))).toBeNull()
	})
})
