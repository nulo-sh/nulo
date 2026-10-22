/**
 * JournalGC — terminal-record cap-and-sweep contract tests.
 *
 * Drives the GC against a real OperationJournalService + FakeBrowserApi.
 * Caps are dialed down via the constructor option so each test seeds a
 * realistic number of records without time-skewing or N=50 fixtures.
 *
 * Note: each `service.createOperation` increments `Date.now()`, so the
 * order of creation maps to the order of `terminalAt` — newest record is
 * the most recently transitioned, oldest is the first. The GC keeps the
 * newest `cap` entries per scope.
 */

import { fakeBrowser } from "@webext-core/fake-browser"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { JournalGC } from "./gc"
import { profileKeysStub } from "../composition-harness"
import { OperationJournalService } from "./service"
import type { NewOperationInput } from "./spec"

const TRANSFER: NewOperationInput = {
	kind: "transfer",
	origin: "popup",
	profileId: "profile-a",
	accountAddress: "0xacc1",
}

async function started(): Promise<{ api: FakeBrowserApi; service: OperationJournalService; logger: LoggerStore }> {
	const api = new FakeBrowserApi()
	api.reset()
	const logger = new LoggerStore(new ConfigStore())
	const service = new OperationJournalService(logger, api)
	const services = new ServiceCollection()
	services.add(await profileKeysStub("p-a", "p-b", "profile-a", "profile-b"))
	services.add(service)
	await services.start()
	return { api, service, logger }
}

async function makeSucceeded(service: OperationJournalService, input: NewOperationInput): Promise<string> {
	const rec = await service.createOperation(input)
	await service.transitionOperation(rec.id, { stage: "simulating" })
	await service.transitionOperation(rec.id, { stage: "proving", enteredProveAt: Date.now() })
	await service.transitionOperation(rec.id, { stage: "submitting" })
	await service.transitionOperation(rec.id, { stage: "succeeded", txHash: `0x${rec.id}` })
	return rec.id
}

async function makeFailed(service: OperationJournalService, input: NewOperationInput): Promise<string> {
	const rec = await service.createOperation(input)
	await service.transitionOperation(rec.id, { stage: "simulating" })
	await service.transitionOperation(rec.id, { stage: "failed" }, { kind: "simulation", message: "boom", normalizedRaw: null })
	return rec.id
}

const DAPP_SEND: NewOperationInput = {
	kind: "dapp_execute",
	origin: "dapp",
	profileId: "profile-a",
	accountAddress: "0xacc1",
	sessionId: "session-1",
	initialStage: { stage: "queued" },
}

/** A dApp request the wallet failed before claiming it, as the wallet-sdk ingress records one. */
async function makeRefused(service: OperationJournalService, kind: string): Promise<string> {
	const rec = await service.createOperation(DAPP_SEND)
	await service.transitionOperation(rec.id, { stage: "failed" }, { kind, message: "refused", normalizedRaw: null })
	return rec.id
}

/** A dApp send the node was handed, then failed with `kind`. */
async function makeFailedAfterSubmit(service: OperationJournalService, kind = "network"): Promise<string> {
	const rec = await service.createOperation(DAPP_SEND)
	await service.transitionOperation(rec.id, { stage: "pending" })
	await service.transitionOperation(rec.id, { stage: "simulating" })
	await service.transitionOperation(rec.id, { stage: "proving", enteredProveAt: Date.now() })
	await service.transitionOperation(rec.id, { stage: "submitting", txHash: `0x${rec.id}` })
	await service.transitionOperation(rec.id, { stage: "failed" }, { kind, message: "dropped", normalizedRaw: null })
	return rec.id
}

/** Gives `ids` distinct, increasing `terminalAt` in their order: transitions within one tick collide. */
async function restamp(api: FakeBrowserApi, service: OperationJournalService, ids: string[]): Promise<void> {
	for (let i = 0; i < ids.length; i++) {
		const op = await service.getOperation(ids[i])
		if (!op) throw new Error("setup: record vanished")
		await api.storage.local.set({ [`nulo:journal@${op.id}`]: JSON.stringify({ ...op, terminalAt: 1_000_000 + i * 10 }) })
	}
}

const REFUSAL_KINDS = ["scope_refused", "registry_refused", "malformed_request", "terms_refused", "wallet_refused", "too_many_pending"]

async function makeCancelled(service: OperationJournalService, input: NewOperationInput): Promise<string> {
	const rec = await service.createOperation(input)
	await service.transitionOperation(rec.id, { stage: "cancelled" })
	return rec.id
}

describe("JournalGC.sweep", () => {
	let api: FakeBrowserApi
	let service: OperationJournalService
	let logger: LoggerStore

	beforeEach(async () => {
		;({ api, service, logger } = await started())
	})

	test("evicts oldest beyond cap; keeps newest within cap", async () => {
		// Stamp terminalAt with a manual nowFn so we get distinct, monotonically
		// increasing timestamps even when records terminate within the same
		// Date.now() tick. We pin terminalAt by writing directly through the
		// storage primitive — service-level transitions reuse Date.now() and
		// would collide.
		const ids: string[] = []
		for (let i = 0; i < 5; i++) ids.push(await makeSucceeded(service, TRANSFER))

		// Re-stamp terminalAt deterministically: id index 0 = oldest, 4 = newest.
		for (let i = 0; i < ids.length; i++) {
			const op = await service.getOperation(ids[i])
			if (!op) throw new Error("setup: record vanished")
			await api.storage.local.set({
				[`nulo:journal@${op.id}`]: JSON.stringify({ ...op, terminalAt: 1_000_000 + i * 10 }),
			})
		}

		const gc = new JournalGC(service, api.alarms, logger, { capPerScope: 3 })
		await gc.sweep()

		const remaining = await service.getOperations({ isTerminal: true })
		expect(remaining).toHaveLength(3)
		// The 3 newest (highest terminalAt) should survive: ids[2], ids[3], ids[4].
		expect(remaining.map((r) => r.id).sort()).toEqual(ids.slice(2).sort())
	})

	test("groups under cap are left alone", async () => {
		for (let i = 0; i < 3; i++) await makeSucceeded(service, TRANSFER)
		const gc = new JournalGC(service, api.alarms, logger, { capPerScope: 5 })

		await gc.sweep()

		const remaining = await service.getOperations({ isTerminal: true })
		expect(remaining).toHaveLength(3)
	})

	test("non-terminal records are never touched", async () => {
		const inflight = await service.createOperation(TRANSFER)
		await service.transitionOperation(inflight.id, { stage: "simulating" })
		// Also pile up terminal records to trip the cap.
		for (let i = 0; i < 4; i++) await makeSucceeded(service, TRANSFER)
		const gc = new JournalGC(service, api.alarms, logger, { capPerScope: 1 })

		await gc.sweep()

		const still = await service.getOperation(inflight.id)
		expect(still?.progress.stage).toBe("simulating")
		expect(still?.terminalAt).toBeNull()
	})

	test("per (profile, account) isolation: one busy scope does not evict another's history", async () => {
		const SCOPE_A: NewOperationInput = { kind: "transfer", origin: "popup", profileId: "p-a", accountAddress: "0xA" }
		const SCOPE_B: NewOperationInput = { kind: "transfer", origin: "popup", profileId: "p-a", accountAddress: "0xB" }

		// Scope A overflows the cap; scope B is small.
		for (let i = 0; i < 5; i++) await makeSucceeded(service, SCOPE_A)
		for (let i = 0; i < 2; i++) await makeSucceeded(service, SCOPE_B)
		const gc = new JournalGC(service, api.alarms, logger, { capPerScope: 3 })

		await gc.sweep()

		const surviving = await service.getOperations({ isTerminal: true })
		const aCount = surviving.filter((r) => r.accountAddress === "0xA").length
		const bCount = surviving.filter((r) => r.accountAddress === "0xB").length
		expect(aCount).toBe(3)
		expect(bCount).toBe(2)
	})

	test("failed records are preserved past the cap (user-visible history)", async () => {
		// Failed records are pure journal artifacts — no on-chain truth
		// elsewhere. Losing them is data loss: only a failure refused before
		// sending is ever an eviction candidate.
		for (let i = 0; i < 5; i++) await makeFailed(service, TRANSFER)
		const gc = new JournalGC(service, api.alarms, logger, { capPerScope: 2 })

		await gc.sweep()

		const remaining = await service.getOperations({ isTerminal: true })
		// All 5 survive — cap doesn't apply to failed records.
		expect(remaining).toHaveLength(5)
		expect(remaining.every((r) => r.progress.stage === "failed")).toBe(true)
	})

	test("cancelled records are preserved past the cap (user-visible history)", async () => {
		for (let i = 0; i < 5; i++) await makeCancelled(service, TRANSFER)
		const gc = new JournalGC(service, api.alarms, logger, { capPerScope: 2 })

		await gc.sweep()

		const remaining = await service.getOperations({ isTerminal: true })
		expect(remaining).toHaveLength(5)
		expect(remaining.every((r) => r.progress.stage === "cancelled")).toBe(true)
	})

	test("mixed scope: only succeeded records are evicted; failed/cancelled retained", async () => {
		// 4 succeeded (over cap), 2 failed, 2 cancelled. Cap = 2.
		// Expected: 2 succeeded survive + 2 failed + 2 cancelled = 6.
		for (let i = 0; i < 4; i++) await makeSucceeded(service, TRANSFER)
		for (let i = 0; i < 2; i++) await makeFailed(service, TRANSFER)
		for (let i = 0; i < 2; i++) await makeCancelled(service, TRANSFER)
		const gc = new JournalGC(service, api.alarms, logger, { capPerScope: 2 })

		await gc.sweep()

		const remaining = await service.getOperations({ isTerminal: true })
		const byStage = remaining.reduce<Record<string, number>>((acc, r) => {
			acc[r.progress.stage] = (acc[r.progress.stage] ?? 0) + 1
			return acc
		}, {})
		expect(byStage.succeeded).toBe(2)
		expect(byStage.failed).toBe(2)
		expect(byStage.cancelled).toBe(2)
	})

	test("60 requests refused before sending keep the newest 50", async () => {
		const ids: string[] = []
		for (let i = 0; i < 60; i++) ids.push(await makeRefused(service, "scope_refused"))
		await restamp(api, service, ids)

		await new JournalGC(service, api.alarms, logger).sweep()

		const remaining = await service.getOperations({ isTerminal: true })
		expect(remaining.map((r) => r.id).sort()).toEqual(ids.slice(10).sort())
	})

	test("refused requests never push out completed sends: 60 refused beside 10 completed keep all 10", async () => {
		const completed: string[] = []
		for (let i = 0; i < 10; i++) completed.push(await makeSucceeded(service, TRANSFER))
		for (let i = 0; i < 60; i++) await makeRefused(service, "terms_refused")

		await new JournalGC(service, api.alarms, logger).sweep()

		const remaining = await service.getOperations({ isTerminal: true })
		expect(
			remaining
				.filter((r) => r.progress.stage === "succeeded")
				.map((r) => r.id)
				.sort(),
		).toEqual(completed.sort())
		expect(remaining.filter((r) => r.progress.stage === "failed")).toHaveLength(50)
	})

	test("failed sends the node was handed are never evicted, however many", async () => {
		for (let i = 0; i < 60; i++) await makeFailedAfterSubmit(service)

		await new JournalGC(service, api.alarms, logger).sweep()

		const remaining = await service.getOperations({ isTerminal: true })
		expect(remaining).toHaveLength(60)
		expect(remaining.every((r) => r.progress.stage === "failed" && r.progress.txHash)).toBe(true)
	})

	test.each(REFUSAL_KINDS)("a request refused as %s is under the refused cap", async (kind) => {
		for (let i = 0; i < 3; i++) await makeRefused(service, kind)

		await new JournalGC(service, api.alarms, logger, { capPerScope: 1 }).sweep()

		expect(await service.getOperations({ isTerminal: true })).toHaveLength(1)
	})

	test("a refusal kind on a send that reached submitting is never evicted", async () => {
		for (let i = 0; i < 3; i++) await makeFailedAfterSubmit(service, "terms_refused")

		await new JournalGC(service, api.alarms, logger, { capPerScope: 1 }).sweep()

		expect(await service.getOperations({ isTerminal: true })).toHaveLength(3)
	})

	test.each(["popup_bound", "session_ended"])("a request that failed as %s is never evicted", async (kind) => {
		for (let i = 0; i < 3; i++) await makeRefused(service, kind)

		await new JournalGC(service, api.alarms, logger, { capPerScope: 1 }).sweep()

		expect(await service.getOperations({ isTerminal: true })).toHaveLength(3)
	})

	test("alarm tick fires sweep; stop() removes alarm + listener", async () => {
		for (let i = 0; i < 4; i++) await makeSucceeded(service, TRANSFER)
		const gc = new JournalGC(service, api.alarms, logger, { capPerScope: 2 })
		const sweepSpy = vi.spyOn(gc, "sweep")

		await gc.start()
		// start() runs an immediate boot sweep.
		expect(sweepSpy).toHaveBeenCalledTimes(1)
		expect((await service.getOperations({ isTerminal: true })).length).toBe(2)

		// Pile up again, then synthesize an alarm tick via fake-browser.
		for (let i = 0; i < 3; i++) await makeSucceeded(service, TRANSFER)
		fakeBrowser.alarms.onAlarm.trigger({
			name: "nulo:journal:gc",
			scheduledTime: Date.now(),
			periodInMinutes: 60,
			persistAcrossSessions: false,
		})
		// Yield for the fire-and-forget catch chain inside onAlarmFired.
		await Promise.resolve()
		await Promise.resolve()
		expect(sweepSpy).toHaveBeenCalledTimes(2)

		await gc.stop()
		// After stop, no further alarms should drive sweeps.
		fakeBrowser.alarms.onAlarm.trigger({
			name: "nulo:journal:gc",
			scheduledTime: Date.now(),
			periodInMinutes: 60,
			persistAcrossSessions: false,
		})
		await Promise.resolve()
		expect(sweepSpy).toHaveBeenCalledTimes(2)
	})
})
