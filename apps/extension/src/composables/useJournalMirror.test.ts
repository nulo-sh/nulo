import { deferred } from "@nulo/wallet-core/utils"
import { describe, expect, test, vi } from "vitest"
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

	test("without supersede every read lands as it answers, and a later refused one keeps the rows", async () => {
		const { m, read } = mirror({ supersede: false })
		const first = deferred<OperationRecord[]>()
		const second = deferred<OperationRecord[]>()
		read.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
		const runs = [m.resnapshot(), m.resnapshot()]
		second.resolve([op("second")])
		await runs[1]
		first.resolve([op("first")])
		await runs[0]
		expect(ids(m.rows.value)).toEqual(["first"])

		const ok = deferred<OperationRecord[]>()
		const refused = deferred<OperationRecord[]>()
		read.mockReturnValueOnce(ok.promise).mockReturnValueOnce(refused.promise)
		const [landing, failing] = [m.resnapshot(), m.resnapshot()]
		ok.resolve([op("ok")])
		await landing
		refused.reject(new Error("port closed"))
		await expect(failing).rejects.toThrow("port closed")
		expect(ids(m.rows.value)).toEqual(["ok"])
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
	})

	test("a rejected read rejects to the caller and keeps the rows shown", async () => {
		const { m, read, onSnapshot } = mirror()
		read.mockResolvedValueOnce([op("a")])
		await m.resnapshot()
		read.mockRejectedValueOnce(new Error("port closed"))
		await expect(m.resnapshot()).rejects.toThrow("port closed")
		expect(ids(m.rows.value)).toEqual(["a"])
		expect(onSnapshot).toHaveBeenCalledTimes(1)
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

	test("with dropRefusedUpdate a refused update drops its row; a refused add still changes nothing", async () => {
		const { m, read, onRecord } = mirror({ dropRefusedUpdate: true })
		read.mockResolvedValueOnce([op("a"), op("b")])
		await m.resnapshot()
		m.onOperationAdded(op("x", { kind: "token_import" }))
		m.onOperationUpdated(op("a", { kind: "token_import" }))
		expect(ids(m.rows.value)).toEqual(["b"])
		expect(onRecord).not.toHaveBeenCalled()
	})

	test("a delete is never refused and runs no onRecord", async () => {
		const { m, read, onRecord } = mirror()
		read.mockResolvedValueOnce([op("a"), op("b")])
		await m.resnapshot()
		m.onOperationDeleted(op("a", { kind: "token_import" }))
		expect(ids(m.rows.value)).toEqual(["b"])
		expect(onRecord).not.toHaveBeenCalled()
	})

	test("appendAdded lists an add for a listed id again", async () => {
		const { m, read } = mirror({ place: "back", appendAdded: true })
		read.mockResolvedValueOnce([op("a")])
		await m.resnapshot()
		m.onOperationAdded(op("a"))
		expect(ids(m.rows.value)).toEqual(["a", "a"])
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

	test("without supersede, dispose still drops the read in flight", async () => {
		const { m, read } = mirror({ supersede: false })
		const pending = deferred<OperationRecord[]>()
		read.mockReturnValueOnce(pending.promise)
		const inFlight = m.resnapshot()
		m.dispose()
		pending.resolve([op("late")])
		await inFlight
		expect(m.rows.value).toEqual([])
	})
})
