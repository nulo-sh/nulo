/**
 * Composition test: the REAL ProfileService (real PBKDF2, HKDF and AES-GCM) and the real journal,
 * reaper and GC over one `FakeBrowserApi`, wired as the runtime wires them. A second boot over the
 * same storage stands for a restarted worker: strict mode keeps no session across it, so it holds
 * no row keys until an unlock. See `apps/extension/tests/COMPOSITION-TESTS.md`.
 */
import { describe, expect, onTestFinished, test, vi } from "vitest"
import type { JobError } from "@nulo/wallet-core/jobs"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { EventHandler } from "@nulo/wallet-core/utils"
import { openRow } from "@nulo/wallet-crypto"
import { ServiceCollection } from "@/wallet/base"
import type { ConfigProp, IConfig } from "@/wallet/config"
import { LoggerStore } from "@/wallet/logger"
import { svc } from "@/wallet/services/composition-harness"
import { PASSKEY_SERVICE_NAME } from "@/wallet/services/passkey/spec"
import { ProfileService } from "@/wallet/services/profile/service"
import { parseEnvelope } from "@/wallet/storage/sealed-entity-storage"
import { JournalGC } from "./gc"
import { JournalReaper } from "./reaper"
import { OperationJournalService } from "./service"

const PW = "pass1234"
const HOUR = 60 * 60_000
const SESSION_ENDED: JobError = { kind: "session_ended", message: "Session ended", normalizedRaw: null }

function fakeConfig(): IConfig {
	const values: Record<string, unknown> = { sessionTtl: 1_800_000, strictSecurityMode: true, debugMode: false }
	return { onUpdate: new EventHandler<ConfigProp>(), get: ((key: string) => values[key]) as IConfig["get"] }
}

/** One worker over `api`, its post-start work armed in the runtime's order. */
async function boot(api: FakeBrowserApi, opts: { tickNow?: () => number } = {}) {
	const bootCutoff = Date.now()
	const config = fakeConfig()
	const logger = new LoggerStore(config)
	const services = new ServiceCollection()
	services.add(svc(PASSKEY_SERVICE_NAME, {}))
	const profiles = new ProfileService(config, logger, api)
	services.add(profiles)
	const journal = new OperationJournalService(logger, api)
	services.add(journal)
	await services.start()
	const reaper = new JournalReaper(journal, api.alarms, logger, opts.tickNow, bootCutoff)
	await reaper.start()
	profiles.onRowKeysReady.add((profileId) => void reaper.reapUnlocked(profileId))
	profiles.replayRowKeysReady()
	const gc = new JournalGC(journal, api.alarms, logger, { capPerScope: 2 })
	return { profiles, journal, reaper, gc }
}
type Worker = Awaited<ReturnType<typeof boot>>

function freshApi(): FakeBrowserApi {
	const api = new FakeBrowserApi()
	api.reset()
	return api
}

const keyOf = (id: string) => `nulo:journal@${id}`
const raw = async (api: FakeBrowserApi, id: string) => (await api.storage.local.get(keyOf(id)))[keyOf(id)] as string | undefined
const rawJournal = async (api: FakeBrowserApi) =>
	Object.fromEntries(Object.entries(await api.storage.local.get()).filter(([key]) => key.startsWith("nulo:journal@")))

/** The record sealed at `id`, opened with the keys of the profile its envelope names. */
async function opened(api: FakeBrowserApi, worker: Worker, id: string): Promise<Record<string, unknown>> {
	const envelope = parseEnvelope(JSON.parse((await raw(api, id)) ?? "null"))
	const keys = envelope && worker.profiles.rowKeys(envelope.profileId)
	if (!envelope || !keys) throw new Error(`${id} is not sealed under a held key`)
	return JSON.parse(await openRow(keys, envelope.sealed, { root: "nulo:journal", storageKey: keyOf(id), profileId: envelope.profileId }))
}

async function atStage(worker: Worker, profileId: string, stage: "simulating" | "proving" | "succeeded") {
	const { id } = await worker.journal.createOperation({ kind: "transfer", origin: "popup", profileId })
	await worker.journal.transitionOperation(id, { stage: "simulating" })
	if (stage === "simulating") return id
	await worker.journal.transitionOperation(id, { stage: "proving", enteredProveAt: Date.now() })
	if (stage === "proving") return id
	await worker.journal.transitionOperation(id, { stage: "submitting", txHash: "0x01" })
	await worker.journal.transitionOperation(id, { stage: "succeeded", txHash: "0x01" })
	return id
}

describe("the sealed journal — the real service graph", () => {
	test("a lock fails the queued and the proving record sealed under the kept keys; both read back after a restart's unlock", async () => {
		const api = freshApi()
		const first = await boot(api)
		const p = await first.profiles.createProfile("P", PW)
		const queued = await first.journal.createOperation({
			kind: "dapp_execute",
			origin: "dapp",
			profileId: p.id,
			sessionId: "session-1",
			initialStage: { stage: "queued" },
		})
		const proving = await atStage(first, p.id, "proving")

		await first.profiles.lockActiveProfile()
		await first.journal.transitionOperation(queued.id, { stage: "failed" }, SESSION_ENDED)
		await first.journal.transitionOperation(proving, { stage: "failed" }, SESSION_ENDED)
		for (const id of [queued.id, proving]) {
			expect(parseEnvelope(JSON.parse((await raw(api, id)) ?? "null"))?.profileId).toBe(p.id)
			expect(await raw(api, id)).not.toContain("session_ended")
			expect(await opened(api, first, id)).toMatchObject({ error: { kind: "session_ended" } })
		}

		const restarted = await boot(api)
		expect(await restarted.journal.getOperation(queued.id)).toBeUndefined()
		await restarted.profiles.unlockProfile(p.id, PW)
		expect(await restarted.journal.getOperation(queued.id)).toMatchObject({
			progress: { stage: "failed", from: "queued" },
			error: { kind: "session_ended" },
		})
		expect(await restarted.journal.getOperation(proving)).toMatchObject({
			progress: { stage: "failed", from: "proving" },
			error: { kind: "session_ended" },
		})
	}, 60_000)

	test("a restarted worker's boot sweep leaves sealed records alone; the unlock fails its profile's dead ones, and nothing else", async () => {
		// A restart's cutoff is later than every record of the dead worker, which a real clock does
		// not guarantee within a millisecond. The clock is held, then moved 1 ms: the dead worker's
		// records sit one below the cutoff, the restart's at it.
		vi.setSystemTime(Date.now())
		onTestFinished(() => {
			vi.useRealTimers()
		})
		const api = freshApi()
		const first = await boot(api)
		const p = await first.profiles.createProfile("P", PW)
		const simulating = await atStage(first, p.id, "simulating")
		const proving = await atStage(first, p.id, "proving")
		const done = await atStage(first, p.id, "succeeded")
		const q = await first.profiles.createProfile("Q", PW)
		const qDead = await atStage(first, q.id, "simulating")
		const before = await rawJournal(api)

		vi.setSystemTime(Date.now() + 1)
		const restartedAt = Date.now()
		const restarted = await boot(api)
		expect(await rawJournal(api)).toEqual(before)

		await restarted.profiles.unlockProfile(q.id, PW)
		await expect.poll(async () => (await restarted.journal.getOperation(qDead))?.progress.stage).toBe("failed")
		const qLive = await atStage(restarted, q.id, "simulating")
		expect((await restarted.journal.getOperation(qLive))?.createdAt).toBe(restartedAt)

		await restarted.profiles.unlockProfile(p.id, PW)
		await expect.poll(async () => (await restarted.journal.getOperation(proving))?.progress.stage).toBe("failed")
		await expect.poll(async () => (await restarted.journal.getOperation(simulating))?.progress.stage).toBe("failed")
		expect((await restarted.journal.getOperation(simulating))?.error?.kind).toBe("stale_on_resume")
		expect((await restarted.journal.getOperation(proving))?.error?.kind).toBe("sw_restart_post_prove")
		expect(await raw(api, done)).toBe(before[keyOf(done)])

		// A replay of the held keys sweeps again; a record from the cutoff's millisecond stays live.
		restarted.profiles.replayRowKeysReady()
		await restarted.reaper.reapUnlocked(q.id)
		expect((await restarted.journal.getOperation(qLive))?.progress.stage).toBe("simulating")
	}, 60_000)

	test("with no keys, the minute tick and GC leave a profile's sealed records alone; once unlocked, GC evicts", async () => {
		const api = freshApi()
		const first = await boot(api)
		const p = await first.profiles.createProfile("P", PW)
		for (let i = 0; i < 4; i += 1) await atStage(first, p.id, "succeeded")
		const before = await rawJournal(api)

		// The tick reads the records an hour later, past every stage's grace window.
		const restarted = await boot(api, { tickNow: () => Date.now() + HOUR })
		await restarted.reaper.reap()
		await restarted.gc.sweep()
		expect(await rawJournal(api)).toEqual(before)

		await restarted.profiles.unlockProfile(p.id, PW)
		await restarted.gc.sweep()
		expect(Object.keys(await rawJournal(api))).toHaveLength(2)
	}, 60_000)

	test("after a switch, the first profile's broadcast completes into its own sealed record", async () => {
		const api = freshApi()
		const worker = await boot(api)
		const a = await worker.profiles.createProfile("A", PW)
		const send = await atStage(worker, a.id, "proving")
		await worker.journal.transitionOperation(send, { stage: "submitting", txHash: "0x02" })
		await worker.profiles.createProfile("B", PW)
		expect((await worker.profiles.getActiveProfile())?.id).not.toBe(a.id)

		await worker.journal.transitionOperation(send, { stage: "succeeded", txHash: "0x02" })
		expect(parseEnvelope(JSON.parse((await raw(api, send)) ?? "null"))?.profileId).toBe(a.id)
		expect(await opened(api, worker, send)).toMatchObject({ profileId: a.id, progress: { stage: "succeeded", txHash: "0x02" } })
	}, 60_000)
})
