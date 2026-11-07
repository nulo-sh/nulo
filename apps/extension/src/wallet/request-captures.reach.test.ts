/**
 * One request's stages, from every producer the runtime wires, land in its own capture: the real
 * task tree and the capture store, over a journal that emits a queued row before the alias exists,
 * as the ingress does.
 */
import { describe, expect, test } from "vitest"
import { EventHandler } from "@nulo/wallet-core/utils"
import type { ServiceCollection } from "./base"
import { LogLevel } from "./logger"
import { type JournalSnapshot, RequestLog } from "./logger/request-log"
import { wireRequestCaptures } from "./request-captures"
import { OperationJournalService } from "./services/operation-journal/service"
import { StepContent, TaskService } from "./services/task/service"
import { startedTaskService } from "./services/task/test-task-service"

const A = "aaaaaaaa"
const B = "bbbbbbbb"
const JA = "000000000000000a"
const JB = "000000000000000b"

async function harness() {
	const { tasks } = await startedTaskService("p1")
	const journal = { onOperationAdded: new EventHandler<JournalSnapshot>(), onOperationUpdated: new EventHandler<JournalSnapshot>() }
	const services = {
		get: (name: string) => (name === TaskService.name ? tasks : name === OperationJournalService.name ? journal : undefined),
	}
	const log = new RequestLog(() => true)
	wireRequestCaptures(services as unknown as ServiceCollection, log)
	const row = (id: string, stage: string, at: number, terminal = false): JournalSnapshot => ({
		id,
		progress: { stage },
		error: terminal ? { kind: "simulation_failed", message: "Assertion failed" } : null,
		terminalAt: terminal ? at : null,
		createdAt: 1,
		updatedAt: at,
	})
	const line = (walletTraceId: string, text: string) => ({
		id: 1,
		timestamp: 5,
		source: "execution",
		level: LogLevel.Debug,
		context: "sw" as const,
		data: [text, { walletTraceId }],
	})
	return { tasks, journal, log, row, line }
}

describe("a request's capture, fed by the wired producers", () => {
	test("two interleaved sends each get their own stages and lines, with per-kind durations", async () => {
		const { tasks, journal, log, row, line } = await harness()
		for (const [id, j] of [
			[A, JA],
			[B, JB],
		]) {
			log.begin(id, { method: "sendTx", originHost: "app.example", chainId: 31337 })
			journal.onOperationAdded.invoke(row(j, "queued", 1))
			log.alias(id, { journalId: j })
		}
		const rootA = tasks.startNewTask(new StepContent("Execute operation"), undefined, undefined, A)
		const rootB = tasks.startNewTask(new StepContent("Execute operation"), undefined, undefined, B)
		journal.onOperationUpdated.invoke(row(JA, "simulating", 10))
		journal.onOperationUpdated.invoke(row(JB, "simulating", 11))
		rootA.startSubtask(new StepContent("Simulating transaction")).complete()
		log.take(line(A, "a only"))
		log.take(line(B, "b only"))
		journal.onOperationUpdated.invoke(row(JA, "proving", 20))
		log.provePhase(JA, "transmit", "presto")
		log.provePhase(JA, "proving", "presto")
		journal.onOperationUpdated.invoke(row(JA, "failed", 30, true))
		rootA.fail("Assertion failed")
		rootB.complete()
		log.end(A, { envelope: { code: -32603, message: "The wallet could not process the request." } })

		const a = log.get(A)
		const b = log.get(B)
		expect(a?.stages.map((s) => s.stage)).toEqual([
			"journal created",
			"journal simulating",
			"Simulating transaction",
			"journal proving",
			"prove transmit (presto)",
			"prove proving (presto)",
			"journal failed",
			"Execute operation",
			"request sendTx",
		])
		expect(b?.stages.map((s) => s.stage)).toEqual(["journal created", "journal simulating", "Execute operation"])
		expect(a?.lines.map((l) => l.text)).toEqual([`a only {"walletTraceId":"${A}"}`])
		expect(b?.lines.map((l) => l.text)).toEqual([`b only {"walletTraceId":"${B}"}`])
		const of = (stage: string) => a?.stages.find((s) => s.stage === stage)
		expect([of("journal simulating")?.start, of("journal simulating")?.end]).toEqual([10, 20])
		expect(of("journal proving")?.end).toBe(30)
		expect(of("prove transmit (presto)")?.end).toBe(of("prove proving (presto)")?.start)
		expect(of("journal failed")?.outcome).toBe("simulation_failed")
		expect(of("Execute operation")?.outcome).toBe("failed: Assertion failed")
		expect(a?.journalError).toBe("Assertion failed")
	})
})
