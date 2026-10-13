import { EventHandler } from "@nulo/wallet-core/utils"
import { describe, expect, test, vi } from "vitest"
import type { SendStarted } from "@/wallet/services/auth-registry/spec"
import type { OperationRecord } from "@/wallet/services/operation-journal/spec"
import { useSendStageLine } from "./useSendStageLine"

type Listener = (op: OperationRecord | undefined) => void

/** A journal whose subscriptions resolve when the test says so, recording every release. */
function fakeJournal() {
	const subs: { id: string; listener: Listener; resolve: () => void; release: ReturnType<typeof vi.fn> }[] = []
	return {
		subs,
		subscribeJob: vi.fn((id: string, listener: Listener) => {
			const release = vi.fn()
			return new Promise<() => void>((resolve) => subs.push({ id, listener, release, resolve: () => resolve(release) }))
		}),
	}
}

const record = (progress: OperationRecord["progress"], terminalAt: number | null = null) => ({ progress, terminalAt }) as OperationRecord

function setup() {
	const sendStarted = new EventHandler<SendStarted>()
	const journal = fakeJournal()
	const stage = useSendStageLine({ sendStarted, journal })
	return { sendStarted, journal, stage }
}

describe("useSendStageLine", () => {
	test("starts with no line and subscribes to nothing", () => {
		const { journal, stage } = setup()
		expect(stage.line.value).toBeNull()
		expect(journal.subscribeJob).not.toHaveBeenCalled()
	})

	test("follows the record named for its own key and shows each live stage", async () => {
		const { sendStarted, journal, stage } = setup()
		stage.follow("k1")
		sendStarted.invoke({ correlation: "k1", journalId: "j1" })
		expect(journal.subscribeJob).toHaveBeenCalledWith("j1", expect.any(Function))
		const [sub] = journal.subs
		sub.listener(record({ stage: "simulating" }))
		expect(stage.line.value).toBe("Simulating...")
		sub.listener(record({ stage: "proving", enteredProveAt: 1, backend: "browser" }))
		expect(stage.line.value).toBe("Proving in browser…")
		sub.listener(record({ stage: "submitting" }))
		expect(stage.line.value).toBe("Submitting...")
	})

	test("a terminal or missing record clears the line", () => {
		const { sendStarted, journal, stage } = setup()
		stage.follow("k1")
		sendStarted.invoke({ correlation: "k1", journalId: "j1" })
		const [sub] = journal.subs
		sub.listener(record({ stage: "simulating" }))
		sub.listener(record({ stage: "succeeded" }, 5))
		expect(stage.line.value).toBeNull()
		sub.listener(record({ stage: "simulating" }))
		sub.listener(undefined)
		expect(stage.line.value).toBeNull()
	})

	test("another caller's key is ignored", () => {
		const { sendStarted, journal, stage } = setup()
		stage.follow("mine")
		sendStarted.invoke({ correlation: "theirs", journalId: "j9" })
		expect(journal.subscribeJob).not.toHaveBeenCalled()
	})

	test("a send started before follow, or with nothing followed, is ignored", () => {
		const { sendStarted, journal } = setup()
		sendStarted.invoke({ correlation: "k1", journalId: "j1" })
		expect(journal.subscribeJob).not.toHaveBeenCalled()
	})

	test("stop releases a landed subscription and clears the line", async () => {
		const { sendStarted, journal, stage } = setup()
		stage.follow("k1")
		sendStarted.invoke({ correlation: "k1", journalId: "j1" })
		const [sub] = journal.subs
		sub.resolve()
		await Promise.resolve()
		sub.listener(record({ stage: "simulating" }))
		stage.stop()
		expect(sub.release).toHaveBeenCalledTimes(1)
		expect(stage.line.value).toBeNull()
	})

	test("a subscription landing after stop is released at once and keeps no listener", async () => {
		const { sendStarted, journal, stage } = setup()
		stage.follow("k1")
		sendStarted.invoke({ correlation: "k1", journalId: "j1" })
		stage.stop()
		const [sub] = journal.subs
		sub.resolve()
		await Promise.resolve()
		await Promise.resolve()
		expect(sub.release).toHaveBeenCalledTimes(1)
		sub.listener(record({ stage: "simulating" }))
		expect(stage.line.value).toBeNull()
	})

	test("a new follow ends the previous send's epoch", async () => {
		const { sendStarted, journal, stage } = setup()
		stage.follow("k1")
		sendStarted.invoke({ correlation: "k1", journalId: "j1" })
		const [first] = journal.subs
		first.resolve()
		await Promise.resolve()
		stage.follow("k2")
		expect(first.release).toHaveBeenCalledTimes(1)
		first.listener(record({ stage: "proving", enteredProveAt: 1 }))
		expect(stage.line.value).toBeNull()
		sendStarted.invoke({ correlation: "k1", journalId: "j1" })
		expect(journal.subs).toHaveLength(1)
	})

	test("a rejected subscription leaves the line empty and throws nothing", async () => {
		const sendStarted = new EventHandler<SendStarted>()
		const subscribeJob = vi.fn(() => Promise.reject(new Error("port closed")))
		const stage = useSendStageLine({ sendStarted, journal: { subscribeJob } })
		stage.follow("k1")
		expect(() => sendStarted.invoke({ correlation: "k1", journalId: "j1" })).not.toThrow()
		await Promise.resolve()
		expect(stage.line.value).toBeNull()
	})

	test("dispose stops listening for sends", () => {
		const { sendStarted, journal, stage } = setup()
		stage.follow("k1")
		stage.dispose()
		stage.follow("k1")
		sendStarted.invoke({ correlation: "k1", journalId: "j1" })
		expect(journal.subscribeJob).not.toHaveBeenCalled()
	})
})
