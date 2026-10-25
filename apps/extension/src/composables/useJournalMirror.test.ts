import { deferred } from "@nulo/wallet-core/utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { OperationRecord } from "@/wallet/services/operation-journal/spec"
import { useJournalMirror } from "./useJournalMirror"

const op = (id: string, over: Partial<OperationRecord> = {}) => ({ id, kind: "transfer", ...over }) as OperationRecord
const ids = (rows: OperationRecord[]) => rows.map((r) => r.id)

function mirror(over: Partial<Parameters<typeof useJournalMirror>[0]> = {}) {
	const read = vi.fn(async (): Promise<OperationRecord[] | undefined> => [])
	const onRecord = vi.fn()
	const onSnapshot = vi.fn()
	const m = useJournalMirror({ read, accept: (o) => o.kind !== "token_import", place: "front", onRecord, onSnapshot, ...over })
	return { m, read, onRecord, onSnapshot }
}

describe("useJournalMirror — snapshots", () => {
	test("a read lands as returned, then onSnapshot runs over the landed rows", async () => {
		const { m, read, onSnapshot } = mirror()
		read.mockResolvedValueOnce([op("a"), op("b")])
		onSnapshot.mockImplementation(() => expect(ids(m.rows.value)).toEqual(["a", "b"]))
		await m.resnapshot()
		expect(ids(m.rows.value)).toEqual(["a", "b"])
		expect(onSnapshot).toHaveBeenCalledTimes(1)
	})

	test("a read answering undefined lands nothing and runs no onSnapshot", async () => {
		const { m, read, onSnapshot } = mirror()
		read.mockResolvedValueOnce([op("a")])
		await m.resnapshot()
		read.mockResolvedValueOnce(undefined)
		await m.resnapshot()
		expect(ids(m.rows.value)).toEqual(["a"])
		expect(onSnapshot).toHaveBeenCalledTimes(1)
	})

	test("a run begun later supersedes one in flight: the older answer, landing last, writes nothing", async () => {
		const { m, read, onSnapshot } = mirror()
		const older = deferred<OperationRecord[]>()
		read.mockReturnValueOnce(older.promise).mockResolvedValueOnce([op("new")])
		const first = m.resnapshot()
		await m.resnapshot()
		older.resolve([op("old")])
		await first
		expect(ids(m.rows.value)).toEqual(["new"])
		expect(onSnapshot).toHaveBeenCalledTimes(1)
	})

	test("a run handed in is the one checked: stale, it reads nothing; current, it lands again on a retry", async () => {
		const { m, read } = mirror()
		const stale = m.begin()
		const run = m.begin()
		await m.resnapshot(stale)
		expect(read).not.toHaveBeenCalled()

		read.mockRejectedValueOnce(new Error("port closed")).mockResolvedValueOnce([op("a")])
		await expect(m.resnapshot(run)).rejects.toThrow("port closed")
		await m.resnapshot(run)
		expect(ids(m.rows.value)).toEqual(["a"])
		m.dispose()
	})

	test("an event during a read is overwritten when the read lands", async () => {
		const { m, read } = mirror()
		const pending = deferred<OperationRecord[]>()
		read.mockReturnValueOnce(pending.promise)
		const run = m.resnapshot()
		m.onOperationAdded(op("live"))
		pending.resolve([op("a")])
		await run
		expect(ids(m.rows.value)).toEqual(["a"])
	})
})

describe("useJournalMirror — events", () => {
	test("an accepted add lands at the list's edge, then onRecord runs over the new rows", async () => {
		const { m, read, onRecord } = mirror()
		read.mockResolvedValueOnce([op("a")])
		await m.resnapshot()
		onRecord.mockImplementation(() => expect(ids(m.rows.value)).toEqual(["b", "a"]))
		m.onOperationAdded(op("b"))
		expect(onRecord).toHaveBeenCalledWith(op("b"))
	})

	test("an accepted update keeps a listed row's position; an unseen one goes to the edge; each runs onRecord", async () => {
		const { m, read, onRecord } = mirror({ place: "back" })
		read.mockResolvedValueOnce([op("a"), op("b")])
		await m.resnapshot()
		m.onOperationUpdated(op("a", { title: "x" }))
		m.onOperationUpdated(op("c"))
		expect(m.rows.value).toEqual([op("a", { title: "x" }), op("b"), op("c")])
		expect(onRecord).toHaveBeenCalledTimes(2)
	})

	test("a refused add or update changes nothing and runs no onRecord", async () => {
		const { m, read, onRecord } = mirror()
		read.mockResolvedValueOnce([op("a")])
		await m.resnapshot()
		m.onOperationAdded(op("x", { kind: "token_import" }))
		m.onOperationUpdated(op("a", { kind: "token_import" }))
		expect(m.rows.value).toEqual([op("a")])
		expect(onRecord).not.toHaveBeenCalled()
		m.onOperationUpdated(op("a", { title: "x" }))
		expect(onRecord).toHaveBeenCalledTimes(1)
	})

	test("a delete is never refused and runs no onRecord", async () => {
		const { m, read, onRecord } = mirror()
		read.mockResolvedValueOnce([op("a"), op("b")])
		await m.resnapshot()
		m.onOperationDeleted(op("a", { kind: "token_import" }))
		expect(ids(m.rows.value)).toEqual(["b"])
		expect(onRecord).not.toHaveBeenCalled()
	})
})

describe("useJournalMirror — dispose", () => {
	test("is terminal: the read in flight lands nothing, later runs read nothing, and events change nothing", async () => {
		const { m, read, onRecord, onSnapshot } = mirror()
		read.mockResolvedValueOnce([op("a")])
		await m.resnapshot()
		const pending = deferred<OperationRecord[]>()
		read.mockReturnValueOnce(pending.promise)
		const inFlight = m.resnapshot()
		m.dispose()
		pending.resolve([op("late")])
		await inFlight
		const reads = read.mock.calls.length
		const run = m.begin()
		expect(run()).toBe(false)
		await m.resnapshot()
		m.onOperationAdded(op("b"))
		m.onOperationUpdated(op("a", { title: "x" }))
		m.onOperationDeleted(op("a"))
		expect(read.mock.calls.length).toBe(reads)
		expect(m.rows.value).toEqual([op("a")])
		expect(onRecord).not.toHaveBeenCalled()
		expect(onSnapshot).toHaveBeenCalledTimes(1)
	})
})

describe("useJournalMirror — a refused read", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	test("rejects to the caller, keeps the rows, and is read again on its run every 2 s until one lands", async () => {
		const { m, read, onSnapshot } = mirror()
		read.mockResolvedValueOnce([op("a")])
		await m.resnapshot()
		read.mockRejectedValueOnce(new Error("port closed"))
			.mockRejectedValueOnce(new Error("port closed"))
			.mockResolvedValueOnce([op("b")])
		await expect(m.resnapshot()).rejects.toThrow("port closed")
		expect(ids(m.rows.value)).toEqual(["a"])
		await vi.advanceTimersByTimeAsync(1_999)
		expect(read).toHaveBeenCalledTimes(2)
		await vi.advanceTimersByTimeAsync(1)
		expect(read).toHaveBeenCalledTimes(3)
		expect(ids(m.rows.value)).toEqual(["a"])
		await vi.advanceTimersByTimeAsync(2_000)
		expect(read).toHaveBeenCalledTimes(4)
		expect(ids(m.rows.value)).toEqual(["b"])
		expect(onSnapshot).toHaveBeenCalledTimes(2)
		await vi.advanceTimersByTimeAsync(10_000)
		expect(read).toHaveBeenCalledTimes(4)
	})

	test("a retry armed for a run a later run superseded reads nothing", async () => {
		const { m, read } = mirror()
		read.mockRejectedValueOnce(new Error("port closed"))
		await expect(m.resnapshot()).rejects.toThrow("port closed")
		read.mockResolvedValueOnce([op("new")])
		await m.resnapshot()
		await vi.advanceTimersByTimeAsync(10_000)
		expect(read).toHaveBeenCalledTimes(2)
		expect(ids(m.rows.value)).toEqual(["new"])
	})

	test("a superseded run's late refusal still rejects, arms nothing, and leaves the current run's retry armed", async () => {
		const { m, read } = mirror()
		const older = deferred<OperationRecord[]>()
		read.mockReturnValueOnce(older.promise)
			.mockRejectedValueOnce(new Error("refused"))
			.mockResolvedValueOnce([op("b")])
		const first = m.resnapshot()
		await expect(m.resnapshot()).rejects.toThrow("refused")
		await vi.advanceTimersByTimeAsync(1_000)
		older.reject(new Error("late"))
		await expect(first).rejects.toThrow("late")
		await vi.advanceTimersByTimeAsync(1_000)
		expect(read).toHaveBeenCalledTimes(3)
		expect(ids(m.rows.value)).toEqual(["b"])
		await vi.advanceTimersByTimeAsync(10_000)
		expect(read).toHaveBeenCalledTimes(3)
	})

	test("dispose cancels an armed retry, and a read refused after it arms none", async () => {
		const armed = mirror()
		armed.read.mockRejectedValueOnce(new Error("refused"))
		await expect(armed.m.resnapshot()).rejects.toThrow("refused")
		expect(vi.getTimerCount()).toBe(1)
		armed.m.dispose()
		expect(vi.getTimerCount()).toBe(0)

		const { m, read } = mirror()
		const pending = deferred<OperationRecord[]>()
		read.mockReturnValueOnce(pending.promise)
		const inFlight = m.resnapshot()
		m.dispose()
		pending.reject(new Error("disconnected"))
		await expect(inFlight).rejects.toThrow("disconnected")
		expect(vi.getTimerCount()).toBe(0)
		await vi.advanceTimersByTimeAsync(10_000)
		expect(read).toHaveBeenCalledTimes(1)
	})
})
