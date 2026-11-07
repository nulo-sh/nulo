import { describe, expect, test } from "vitest"
import { LogLevel } from "@nulo/wallet-core/logger"
import type { Log } from "@nulo/wallet-core/logger"
import { REQUEST_LOG_LIMITS as L, RequestLog, type JournalSnapshot } from "./request-log"
import { trim } from "./utils"

const ADDRESS = "0x1f2e3d4c5b6a79881f2e3d4c5b6a79881f2e3d4c5b6a79881f2e3d4c5b6a7988"
const meta = (method = "getAccounts") => ({ method, originHost: "app.example", chainId: 31337 })
const hex = (n: number, width: number) => n.toString(16).padStart(width, "0")
const traceId = (n: number) => hex(n, 8)
const journalId = (n: number) => hex(n, 16)
const line = (walletTraceId: string, text: unknown, context: Log["context"] = "sw"): Log => ({
	id: 1,
	timestamp: 1_000,
	source: "wallet-sdk",
	level: LogLevel.Error,
	context,
	data: trim([text, { walletTraceId }]) as unknown[],
})
const row = (id: string, stage: string, over: Partial<JournalSnapshot> = {}): JournalSnapshot => ({
	id,
	progress: { stage },
	error: null,
	terminalAt: null,
	createdAt: 10,
	updatedAt: 20,
	...over,
})
const failed = { code: 4100, message: "outside", data: { walletErrorCode: "SCOPE_VIOLATION", walletTraceId: "ignored" } }
const serialized = (log: RequestLog, id: string) => new TextEncoder().encode(JSON.stringify(log.get(id))).length

function store(on = true) {
	return new RequestLog(() => on)
}

/** `count` sends, each aliased to its own journal row. */
function fillAliased(log: RequestLog, count: number, from = 0) {
	for (let n = from; n < from + count; n++) {
		log.begin(traceId(n), meta("sendTx"))
		log.alias(traceId(n), { journalId: journalId(n) })
	}
}

describe("RequestLog", () => {
	test("records nothing without developer mode", () => {
		const log = store(false)
		log.begin(traceId(1), meta())
		log.take(line(traceId(1), "x"))
		expect(log.get(traceId(1))).toBeUndefined()
		expect(log.snapshot()).toEqual([])
	})

	test("deletes an unaliased capture at its end and keeps one a journal row names", () => {
		const log = store()
		log.begin(traceId(1), meta())
		log.begin(traceId(2), meta("sendTx"))
		log.alias(traceId(2), { journalId: journalId(2) })
		log.end(traceId(1), { envelope: failed })
		log.end(traceId(2), { envelope: failed })
		expect(log.get(traceId(1))).toBeUndefined()
		expect(log.find({ journalId: journalId(2) })).toBe(traceId(2))
		expect(log.get(traceId(2))?.stages.at(-1)).toMatchObject({
			kind: "request",
			stage: "request sendTx",
			outcome: "failed 4100 SCOPE_VIOLATION",
		})
	})

	test("the first end wins", () => {
		const log = store()
		fillAliased(log, 1)
		log.end(traceId(0), { envelope: failed })
		const before = structuredClone(log.get(traceId(0)))
		log.end(traceId(0), "dropped")
		log.end(traceId(0), {})
		expect(log.get(traceId(0))).toEqual(before)
	})

	test("takes a worker line tagged with an open capture, and refuses a popup line and a line after the end", () => {
		const log = store()
		fillAliased(log, 1)
		const id = traceId(0)
		log.take(line(id, "kept"))
		log.take(line(id, "popup", "popup"))
		log.take(line(traceId(9), "another request"))
		log.end(id, {})
		log.take(line(id, "late"))
		expect(log.get(id)?.lines.map((l) => l.text)).toEqual([`kept {"walletTraceId":"${id}"}`])
	})

	test("an error line holding a tab-split address and a field element renders neither; the ids beside them survive", () => {
		const log = store()
		fillAliased(log, 1)
		const split = `0x${ADDRESS.slice(2).match(/.{8}/g)?.join("\t")}`
		const error = new Error(`assertion failed: owner ${split} selector 0x1a2b3c4d`)
		log.take(line(traceId(0), { error, field: 2n ** 250n, journal: journalId(0) }))
		const [captured] = log.get(traceId(0))?.lines ?? []
		for (const piece of ADDRESS.slice(2).match(/.{8}/g) ?? []) expect(captured.text).not.toContain(piece)
		expect(captured.text).not.toContain("\\t")
		expect(captured.text).toContain("0x1a2b3c4d")
		expect(captured.text).toContain(journalId(0))
		expect(captured.text).toContain(traceId(0))
		expect(captured.text).toContain("[32 bytes]")
	})

	test("past every ordinary bound, the request's end, its envelope and the journal's terminal entry still land", () => {
		const log = store()
		fillAliased(log, 1)
		const id = traceId(0)
		const wide = "€".repeat(L.lineChars)
		for (let n = 0; n < 400; n++) log.take(line(id, wide))
		for (let n = 0; n < 150; n++) log.stage(id, { kind: "task", stage: `step ${n}`, start: n, end: n + 1, outcome: "€".repeat(400) })
		log.journalEvent(row(journalId(0), "failed", { terminalAt: 30, error: { kind: "app_assertion", message: "€".repeat(2_000) } }))
		log.end(id, { envelope: { ...failed, message: "€".repeat(2_000) } })
		const capture = log.get(id)
		expect(capture?.dropped).toBeGreaterThan(0)
		expect(capture?.stages.length).toBeLessThanOrEqual(L.stages)
		expect(capture?.stages.slice(-2).map((s) => s.stage)).toEqual(["journal failed", "request sendTx"])
		expect(capture?.journalError?.length).toBeLessThanOrEqual(L.journalErrorChars + 1)
		expect(capture?.envelope?.code).toBe(4100)
		expect(serialized(log, id)).toBeLessThanOrEqual(L.bytes)
	})

	test("with 50 sends retained, 60 ordinary requests, some overlapping, evict none and are not captured", () => {
		const log = store()
		fillAliased(log, 50)
		for (let n = 100; n < 160; n++) log.begin(traceId(n), meta())
		for (let n = 100; n < 160; n += 2) log.end(traceId(n), {})
		expect(log.snapshot().map((c) => c.walletTraceId)).toEqual(Array.from({ length: 50 }, (_, n) => traceId(n)))
	})

	test("with 49 sends retained, two overlapping ordinary requests evict none of the 49", () => {
		const log = store()
		fillAliased(log, 49)
		log.begin(traceId(100), meta())
		log.begin(traceId(101), meta())
		log.end(traceId(101), {})
		log.end(traceId(100), {})
		expect(log.snapshot().map((c) => c.walletTraceId)).toEqual(Array.from({ length: 49 }, (_, n) => traceId(n)))
	})

	test("with 50 sends retained, a new send is captured before its alias arrives, and evicts the oldest", async () => {
		const log = store()
		fillAliased(log, 50)
		log.begin(traceId(200), meta("sendTx"))
		await Promise.resolve()
		log.alias(traceId(200), { journalId: journalId(200) })
		expect(log.get(traceId(0))).toBeUndefined()
		expect(log.find({ journalId: journalId(0) })).toBeUndefined()
		expect(log.find({ journalId: journalId(200) })).toBe(traceId(200))
		expect(log.snapshot()).toHaveLength(50)
	})

	test("journal entries seed `journal created` on the first event after the alias, and each runs to the next of its kind", () => {
		const log = store()
		fillAliased(log, 1)
		const id = journalId(0)
		log.journalEvent(row(id, "pending", { updatedAt: 20 }))
		log.journalEvent(row(id, "pending", { updatedAt: 21 }))
		log.stage(traceId(0), { kind: "task", stage: "Simulating transaction", start: 22, end: 40, outcome: "ok" })
		log.journalEvent(row(id, "proving", { updatedAt: 41 }))
		log.journalEvent(row(id, "failed", { terminalAt: 60, error: { kind: "simulation_failed", message: `bad ${ADDRESS}` } }))
		const stages = log.get(traceId(0))?.stages ?? []
		expect(stages.map((s) => [s.stage, s.start, s.end])).toEqual([
			["journal created", 10, 20],
			["journal pending", 20, 41],
			["Simulating transaction", 22, 40],
			["journal proving", 41, 60],
			["journal failed", 60, undefined],
		])
		expect(log.get(traceId(0))?.journalError).toBe("bad [hex]")
	})

	test("restores valid captures and drops an invalid or oversized one", () => {
		const log = store()
		fillAliased(log, 2)
		const [good, other] = log.snapshot()
		const restored = store()
		restored.restore([good, { ...other, walletTraceId: "not-hex" }, { ...other, lines: [{ ...good, text: 1 }] }, "junk"])
		expect(restored.snapshot().map((c) => c.walletTraceId)).toEqual([traceId(0)])
		expect(restored.find({ journalId: journalId(0) })).toBe(traceId(0))
	})

	test("clear empties the store, and an event for a cleared capture creates nothing", () => {
		const log = store()
		fillAliased(log, 1)
		log.clear()
		log.journalEvent(row(journalId(0), "failed", { terminalAt: 1 }))
		log.take(line(traceId(0), "late"))
		log.end(traceId(0), {})
		expect(log.snapshot()).toEqual([])
		expect(log.find({ journalId: journalId(0) })).toBeUndefined()
	})
})
