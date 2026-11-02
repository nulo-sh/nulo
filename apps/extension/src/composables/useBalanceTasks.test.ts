import { describe, expect, test, vi } from "vitest"
import { ContentKind, type Task } from "@/wallet/services/task/client"
import { useBalanceTasks } from "./useBalanceTasks"

const task = (id: string, tbId: number, account = "0xacct", over: Partial<Task> = {}) =>
	({ id, content: { kind: ContentKind.BalanceUpdate, label: "", tbId, account }, ...over }) as Task
const step = (id: string) => ({ id, content: { kind: ContentKind.Step, label: "" } }) as Task

const setup = (fence?: () => () => boolean) => {
	const getTasks = vi.fn<() => Promise<Task[]>>(async () => [])
	let account = "0xacct"
	const tasks = useBalanceTasks({ client: { getTasks } as never, account: () => account, scopeFence: fence })
	return { tasks, getTasks, setAccount: (a: string) => (account = a) }
}

describe("useBalanceTasks", () => {
	test("a snapshot keeps the active account's unfinished balance refreshes and nothing else", async () => {
		const { tasks, getTasks } = setup()
		getTasks.mockResolvedValue([task("a", 1), task("b", 2, "0xother"), step("c"), task("d", 3, "0xacct", { finishedAt: 5 })])
		expect(await tasks.snapshot()).toBe(true)
		expect([1, 2, 3].map(tasks.isUpdating)).toEqual([true, false, false])
	})

	test("events: the account's new refresh is kept once; another account's or another kind is not; a finished update or a delete drops it", () => {
		const { tasks } = setup()
		expect(tasks.onTaskCreated(task("a", 1))).toBe(true)
		expect(tasks.onTaskCreated(task("a", 1))).toBe(true)
		expect(tasks.onTaskCreated(task("b", 2, "0xother"))).toBe(false)
		expect(tasks.onTaskCreated(step("c"))).toBe(false)
		expect([1, 2].map(tasks.isUpdating)).toEqual([true, false])
		expect(tasks.onTaskUpdated(task("a", 1))).toBe(false)
		expect(tasks.isUpdating(1)).toBe(true)
		expect(tasks.onTaskUpdated(task("a", 1, "0xacct", { finishedAt: 9 }))).toBe(true)
		expect(tasks.isUpdating(1)).toBe(false)
		tasks.onTaskCreated(task("e", 4))
		expect(tasks.onTaskDeleted(task("e", 4))).toBe(true)
		expect(tasks.onTaskDeleted(step("c"))).toBe(false)
		expect(tasks.isUpdating(4)).toBe(false)
	})

	test("the account is read when the snapshot lands, as the rows are", async () => {
		const { tasks, getTasks, setAccount } = setup()
		getTasks.mockResolvedValue([task("a", 1, "0xnext")])
		const read = tasks.snapshot()
		setAccount("0xnext")
		await read
		expect(tasks.isUpdating(1)).toBe(true)
	})

	test("latest wins: an older snapshot landing late, one past a closed fence, and one after dispose write nothing", async () => {
		let open = true
		const { tasks, getTasks } = setup(() => {
			const at = open
			return () => at && open
		})
		const first = Promise.withResolvers<Task[]>()
		getTasks.mockReturnValueOnce(first.promise).mockResolvedValueOnce([task("new", 2)])
		const older = tasks.snapshot()
		expect(await tasks.snapshot()).toBe(true)
		first.resolve([task("old", 1)])
		expect(await older).toBe(false)
		expect([1, 2].map(tasks.isUpdating)).toEqual([false, true])

		const fenced = Promise.withResolvers<Task[]>()
		getTasks.mockReturnValueOnce(fenced.promise)
		const closing = tasks.snapshot()
		open = false
		fenced.resolve([task("x", 3)])
		expect(await closing).toBe(false)
		expect(tasks.isUpdating(3)).toBe(false)

		open = true
		const late = Promise.withResolvers<Task[]>()
		getTasks.mockReturnValueOnce(late.promise)
		const disposed = tasks.snapshot()
		tasks.dispose()
		late.resolve([task("y", 4)])
		expect(await disposed).toBe(false)
		expect(tasks.isUpdating(4)).toBe(false)
	})
})
