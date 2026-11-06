import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { effectScope, nextTick, ref } from "vue"
import { deferred, EventHandler } from "@nulo/wallet-core/utils"
import { useToast } from "@/composables/toast.js"
import type { OperationFilter, OperationRecord } from "@/wallet/services/operation-journal/spec"
import type { TokenDeleted } from "@/wallet/services/token/spec"
import { type SendsScope, type SendToken, sendingLabel, useSendsInProgress } from "./useSendsInProgress"

const TO = "0x04d7bb8a4a0239077d7d246279076fdab66f5ed6167bd01882fad6131199457a"
const OFF_CURVE = "0x24f20fb6e501242936eb1f47e2f51610f15e6c07486ed62012774e5f14ebd583"
const A: SendsScope = { profileId: "pA", networkId: "n", account: "0xa" }
const B: SendsScope = { profileId: "pB", networkId: "n", account: "0xa" }
const TST: SendToken = { symbol: "TST", decimals: 6, hasDecimals: true }

let seq = 0
function send(over: Partial<OperationRecord> = {}, scope: SendsScope = A): OperationRecord {
	seq++
	return {
		id: `op${seq}`,
		kind: "transfer",
		origin: "popup",
		profileId: scope.profileId,
		networkId: scope.networkId,
		accountAddress: scope.account,
		tokenId: 1,
		amountRaw: "10000000",
		recipientAddress: TO,
		progress: { stage: "proving", enteredProveAt: 1 },
		error: null,
		terminalAt: null,
		attempts: 0,
		createdAt: seq,
		updatedAt: seq,
		...over,
	} as OperationRecord
}
const ended = (op: OperationRecord): OperationRecord => ({ ...op, progress: { stage: "succeeded" }, terminalAt: 99 })

/** `chrome.storage.session` as one browser session holds it, shared by every document of a test. */
function sessionArea(data: Record<string, unknown> = {}) {
	return {
		data,
		get: vi.fn(async (key: string) => (key in data ? { [key]: data[key] } : {})),
		set: vi.fn(async (items: Record<string, unknown>) => {
			Object.assign(data, items)
		}),
	}
}
const dismissedKey = (op: OperationRecord) => `nulo:sending:dismissed:${op.id}`

function harness(
	opts: {
		stored?: OperationRecord[]
		lookup?: (id: number) => Promise<SendToken | undefined>
		area?: ReturnType<typeof sessionArea>
		session?: () => Promise<string | undefined>
	} = {},
) {
	const stored = opts.stored ?? []
	const area = opts.area ?? sessionArea()
	Object.assign(chrome.storage, { session: area })
	const handle = ref<string | undefined>("w:1")
	const session = vi.fn(opts.session ?? (async () => handle.value))
	const scope = ref<SendsScope | undefined>(A)
	const svc = {
		getOperations: vi.fn(async (f?: OperationFilter) =>
			stored.filter((op) => op.accountAddress === f?.accountAddress && (f?.isTerminal !== false || op.terminalAt === null)),
		),
		onOperationAdded: new EventHandler<OperationRecord>(),
		onOperationUpdated: new EventHandler<OperationRecord>(),
		onOperationDeleted: new EventHandler<OperationRecord>(),
		onConnected: new EventHandler<void>(),
	}
	const lookupToken = vi.fn(opts.lookup ?? (async () => TST))
	const tokenEvents = { onTokenDeleted: new EventHandler<TokenDeleted>() }
	const toasts = useToast()
	const openToast = vi.fn(toasts.openToast)
	const effect = effectScope()
	const sends = effect.run(() =>
		useSendsInProgress({
			journalService: svc,
			scope: () => scope.value,
			lookupToken,
			tokenEvents,
			session,
			toast: toasts.toast,
			openToast,
			updateToast: toasts.updateToast,
			closeToast: toasts.closeToast,
		}),
	)
	if (!sends) throw new Error("no scope")
	const label = () => toasts.toast.value?.label ?? null
	const stop = () => {
		sends.dispose()
		effect.stop()
	}
	return { svc, scope, sends, lookupToken, tokenEvents, toasts, label, stop, area, handle, session, openToast }
}

/** Lets reads, lookups and the watchers that follow them settle. */
async function settle() {
	for (let i = 0; i < 4; i++) {
		await Promise.resolve()
		await nextTick()
	}
}

let stops: (() => void)[] = []
const track = <T extends { stop: () => void }>(h: T) => {
	stops.push(h.stop)
	return h
}

beforeEach(() => {
	useToast().closeToast()
})
afterEach(() => {
	for (const stop of stops) stop()
	stops = []
	useToast().closeToast()
	vi.useRealTimers()
})

describe("useSendsInProgress — the toast follows the sends", () => {
	test("a send in flight when the popup opens shows once its token is read, and History reads the same record", async () => {
		const op = send()
		const h = track(harness({ stored: [op] }))
		await settle()
		expect(h.label()).toBe("Sending 10 TST to 0x04d7…457a")
		expect(h.toasts.toast.value?.kind).toBe("info")
		expect(h.sends.records.value.map((r) => r.id)).toEqual([op.id])
	})

	test("a send added later shows; the newest names the toast, the older again once the newest ends, then it closes", async () => {
		const h = track(harness())
		await settle()
		expect(h.label()).toBeNull()
		const older = send()
		h.svc.onOperationAdded.invoke(older)
		await settle()
		expect(h.label()).toBe("Sending 10 TST to 0x04d7…457a")
		const id = h.toasts.toast.value?.id
		const newer = send({ amountRaw: "2500000" })
		h.svc.onOperationAdded.invoke(newer)
		await settle()
		expect([h.label(), h.toasts.toast.value?.id]).toEqual(["Sending 2.5 TST to 0x04d7…457a", id])
		h.svc.onOperationUpdated.invoke(ended(newer))
		await settle()
		expect(h.label()).toBe("Sending 10 TST to 0x04d7…457a")
		h.svc.onOperationUpdated.invoke(ended(older))
		await settle()
		expect(h.toasts.toast.value).toBeNull()
	})

	test("another message replaces it; once that closes it comes back while the send runs, and not after it ends", async () => {
		vi.useFakeTimers()
		const op = send()
		const h = track(harness({ stored: [op] }))
		await settle()
		h.toasts.openToast({ kind: "success", label: "Address is copied" })
		await settle()
		expect(h.label()).toBe("Address is copied")
		await vi.advanceTimersByTimeAsync(2_000)
		await settle()
		expect(h.label()).toBe("Sending 10 TST to 0x04d7…457a")

		h.toasts.openToast({ kind: "success", label: "Transaction submitted" })
		h.svc.onOperationUpdated.invoke(ended(op))
		await settle()
		expect(h.label()).toBe("Transaction submitted")
		await vi.advanceTimersByTimeAsync(2_000)
		await settle()
		expect(h.toasts.toast.value).toBeNull()
	})

	test("the × keeps it closed for the sends then running; a send started after shows", async () => {
		const op = send()
		const h = track(harness({ stored: [op] }))
		await settle()
		h.toasts.closeToast()
		await settle()
		h.svc.onOperationUpdated.invoke({ ...op, progress: { stage: "submitting" } })
		await settle()
		expect(h.toasts.toast.value).toBeNull()
		h.svc.onOperationAdded.invoke(send({ amountRaw: "3000000" }))
		await settle()
		expect(h.label()).toBe("Sending 3 TST to 0x04d7…457a")
	})

	test("the × dismisses every send running then: the newest ending does not bring an older one back", async () => {
		const older = send({ amountRaw: "3000000" })
		const newer = send()
		const h = track(harness({ stored: [older, newer] }))
		await settle()
		expect(h.label()).toBe("Sending 10 TST to 0x04d7…457a")
		h.toasts.closeToast()
		await settle()
		h.svc.onOperationUpdated.invoke(ended(newer))
		await settle()
		expect(h.toasts.toast.value).toBeNull()
	})

	test("the send it names ends while an older send's token is read: it closes, then names the older", async () => {
		const older = send({ amountRaw: "3000000" })
		const newer = send()
		const slow = deferred<SendToken | undefined>()
		const h = track(harness({ stored: [older, newer] }))
		h.lookupToken.mockImplementationOnce(async () => TST).mockImplementationOnce(() => slow.promise)
		await settle()
		expect(h.label()).toBe("Sending 10 TST to 0x04d7…457a")
		h.svc.onOperationUpdated.invoke(ended(newer))
		await settle()
		expect(h.toasts.toast.value).toBeNull()
		slow.resolve(TST)
		await settle()
		expect(h.label()).toBe("Sending 3 TST to 0x04d7…457a")
	})

	test("a lock closes it at once and drops the ×'s dismissal; after the unlock a send still running shows again", async () => {
		const op = send()
		const h = track(harness({ stored: [op] }))
		await settle()
		h.scope.value = undefined
		expect(h.toasts.toast.value).toBeNull()
		await settle()
		expect(h.sends.records.value).toEqual([])
		h.scope.value = A
		await settle()
		expect(h.label()).toBe("Sending 10 TST to 0x04d7…457a")
		h.toasts.closeToast()
		h.scope.value = undefined
		await settle()
		h.handle.value = "w:2"
		h.scope.value = A
		await settle()
		expect(h.label()).toBe("Sending 10 TST to 0x04d7…457a")
	})

	test("a profile switch on the same address closes its own toast at once and shows only that profile's sends; back, A's shows again", async () => {
		const a = send()
		const b = send({ amountRaw: "7000000" }, B)
		const h = track(harness({ stored: [a, b] }))
		await settle()
		expect(h.label()).toBe("Sending 10 TST to 0x04d7…457a")
		h.scope.value = B
		expect(h.toasts.toast.value).toBeNull()
		await settle()
		expect(h.label()).toBe("Sending 7 TST to 0x04d7…457a")
		expect(h.sends.records.value.map((r) => r.id)).toEqual([b.id])
		h.scope.value = A
		await settle()
		expect(h.label()).toBe("Sending 10 TST to 0x04d7…457a")
	})

	test("it never closes another caller's message", async () => {
		const op = send()
		const h = track(harness({ stored: [op] }))
		await settle()
		h.toasts.openToast({ kind: "error", label: "Couldn't estimate fee. Try again." })
		h.svc.onOperationUpdated.invoke(ended(op))
		await settle()
		expect(h.label()).toBe("Couldn't estimate fee. Try again.")
	})
})

describe("useSendsInProgress — a dismissal lasts its session", () => {
	test("the × writes one key per popup send running, under the handle the scope's reset read", async () => {
		const older = send({ amountRaw: "3000000" })
		const newer = send()
		const dapp = send({ kind: "dapp_execute", origin: "dapp", tokenId: undefined, amountRaw: undefined, recipientAddress: undefined })
		const h = track(harness({ stored: [older, newer, dapp] }))
		await settle()
		h.toasts.closeToast()
		await settle()
		expect(h.area.set).toHaveBeenCalledTimes(1)
		expect(h.area.data).toStrictEqual({ [dismissedKey(older)]: "w:1", [dismissedKey(newer)]: "w:1" })
	})

	test("another document under the same handle shows no toast for a dismissed send, and shows a newer one", async () => {
		const op = send()
		const area = sessionArea()
		const first = harness({ stored: [op], area })
		await settle()
		first.toasts.closeToast()
		await settle()
		first.stop()

		const second = track(harness({ stored: [op], area }))
		await settle()
		expect(second.toasts.toast.value).toBeNull()
		second.svc.onOperationAdded.invoke(send({ amountRaw: "3000000" }))
		await settle()
		expect(second.label()).toBe("Sending 3 TST to 0x04d7…457a")
	})

	test("under another handle, a new unlock or a restarted worker, the same send shows", async () => {
		const op = send()
		const h = track(harness({ stored: [op], area: sessionArea({ [dismissedKey(op)]: "w:1" }), session: async () => "w:2" }))
		await settle()
		expect(h.label()).toBe("Sending 10 TST to 0x04d7…457a")
	})

	test("a × after the worker's session moved writes under the handle read at the reset, never the new one", async () => {
		const op = send()
		const h = track(harness({ stored: [op] }))
		await settle()
		h.handle.value = "w:2"
		h.toasts.closeToast()
		await settle()
		expect(h.area.data).toStrictEqual({ [dismissedKey(op)]: "w:1" })
		expect(h.session).toHaveBeenCalledTimes(1)
		h.scope.value = undefined
		h.scope.value = A
		await settle()
		expect(h.label()).toBe("Sending 10 TST to 0x04d7…457a")
	})

	test("a lock a stale document hears late never overwrites the next session's dismissal", async () => {
		// A send at submitting outlives a lock; under the next session another document already closed its toast.
		const op = send({ progress: { stage: "submitting" } })
		const area = sessionArea({ [dismissedKey(op)]: "w:2" })
		const stale = track(harness({ stored: [op], area }))
		await settle()
		expect(stale.label()).toBe("Sending 10 TST to 0x04d7…457a")
		// Its lock ends the toast's scope, then closes the shell's messages, then resets the scope.
		stale.sends.endScope()
		expect(stale.toasts.toast.value).toBeNull()
		stale.toasts.closeToast()
		stale.scope.value = undefined
		await settle()
		expect(area.set).not.toHaveBeenCalled()
		expect(area.data).toStrictEqual({ [dismissedKey(op)]: "w:2" })
		stale.stop()

		const reopened = track(harness({ stored: [op], area, session: async () => "w:2" }))
		await settle()
		expect(reopened.toasts.toast.value).toBeNull()
	})

	test("a dismissed send's toast never opens, not even before its key is read", async () => {
		const op = send()
		const read = deferred<Record<string, unknown>>()
		const area = sessionArea()
		area.get.mockImplementationOnce(() => read.promise)
		const h = track(harness({ stored: [op], area }))
		await settle()
		expect(h.openToast).not.toHaveBeenCalled()
		read.resolve({ [dismissedKey(op)]: "w:1" })
		await settle()
		expect(h.openToast).not.toHaveBeenCalled()
		expect(h.toasts.toast.value).toBeNull()
	})

	test("a token deletion or a reset while the key is read: the stale read lands nothing, the fresh one decides", async () => {
		const op = send()
		const stale = deferred<Record<string, unknown>>()
		const area = sessionArea()
		area.get.mockImplementationOnce(() => stale.promise)
		const h = harness({ stored: [op], area })
		await settle()
		h.tokenEvents.onTokenDeleted.invoke({ id: 1, profileId: A.profileId } as TokenDeleted)
		await settle()
		expect(h.label()).toBe("Sending 10 TST to 0x04d7…457a")
		stale.resolve({ [dismissedKey(op)]: "w:1" })
		await settle()
		expect(h.label()).toBe("Sending 10 TST to 0x04d7…457a")

		h.stop()

		const late = deferred<Record<string, unknown>>()
		const before = sessionArea()
		before.get.mockImplementationOnce(() => late.promise)
		const r = track(harness({ stored: [op], area: before }))
		await settle()
		r.scope.value = B
		r.scope.value = A
		await settle()
		expect(r.label()).toBe("Sending 10 TST to 0x04d7…457a")
		late.resolve({ [dismissedKey(op)]: "w:1" })
		await settle()
		expect(r.label()).toBe("Sending 10 TST to 0x04d7…457a")
	})

	test("a malformed stored value, an unreadable key or an unreadable session shows the toast; no handle, no write", async () => {
		const op = send()
		const malformed = track(harness({ stored: [op], area: sessionArea({ [dismissedKey(op)]: { handle: "w:1" } }) }))
		await settle()
		expect(malformed.label()).toBe("Sending 10 TST to 0x04d7…457a")
		malformed.stop()

		const unreadable = sessionArea()
		unreadable.get.mockRejectedValue(new Error("no session storage"))
		const failedRead = track(harness({ stored: [op], area: unreadable }))
		await settle()
		expect(failedRead.label()).toBe("Sending 10 TST to 0x04d7…457a")
		failedRead.stop()

		const locked = track(harness({ stored: [op], session: () => Promise.reject(new Error("not connected")) }))
		await settle()
		expect(locked.label()).toBe("Sending 10 TST to 0x04d7…457a")
		locked.toasts.closeToast()
		await settle()
		expect(locked.area.set).not.toHaveBeenCalled()
	})
})

describe("useSendsInProgress — what it names", () => {
	test("a send whose token the wallet no longer reads names the recipient alone", async () => {
		const h = track(harness({ stored: [send()], lookup: async () => Promise.reject(new Error("token not found")) }))
		await settle()
		expect(h.label()).toBe("Sending to 0x04d7…457a")
	})

	test("a token removed after its label showed: the toast names the recipient alone", async () => {
		const h = track(harness({ stored: [send()] }))
		await settle()
		expect(h.label()).toBe("Sending 10 TST to 0x04d7…457a")
		h.lookupToken.mockImplementation(async () => Promise.reject(new Error("token not found")))
		h.tokenEvents.onTokenDeleted.invoke({ id: 1, profileId: A.profileId } as TokenDeleted)
		await settle()
		expect(h.label()).toBe("Sending to 0x04d7…457a")
	})

	test("a dApp operation and another scope's send are never named; History lists the dApp operation, not the other scope's", async () => {
		const dapp = send({ kind: "dapp_execute", origin: "dapp", tokenId: undefined, amountRaw: undefined, recipientAddress: undefined })
		const h = track(harness({ stored: [dapp] }))
		await settle()
		h.svc.onOperationAdded.invoke(send({}, B))
		await settle()
		expect(h.toasts.toast.value).toBeNull()
		expect(h.sends.records.value.map((r) => r.id)).toEqual([dapp.id])
	})

	test("a recipient that is not an address gets no toast, and still lists", async () => {
		const op = send({ recipientAddress: OFF_CURVE })
		const h = track(harness({ stored: [op] }))
		await settle()
		expect(h.toasts.toast.value).toBeNull()
		expect(h.sends.records.value.map((r) => r.id)).toEqual([op.id])
	})

	test("a send that ends, or a scope that moves, while its token is read announces nothing", async () => {
		const lookup = deferred<SendToken | undefined>()
		const op = send()
		const h = track(harness({ stored: [op], lookup: () => lookup.promise }))
		await settle()
		h.svc.onOperationUpdated.invoke(ended(op))
		lookup.resolve(TST)
		await settle()
		expect(h.toasts.toast.value).toBeNull()

		const late = deferred<SendToken | undefined>()
		h.lookupToken.mockImplementationOnce(() => late.promise)
		const next = send()
		h.svc.getOperations.mockImplementation(async () => [next])
		h.svc.onOperationAdded.invoke(next)
		await settle()
		h.scope.value = B
		h.scope.value = A
		await settle()
		late.resolve({ ...TST, symbol: "OLD" })
		await settle()
		expect(h.label()).toBe("Sending 10 TST to 0x04d7…457a")
	})

	test("a snapshot read before the send ended, landing after, does not bring it back", async () => {
		const op = send()
		const read = deferred<OperationRecord[]>()
		const h = track(harness())
		h.svc.getOperations.mockImplementationOnce(() => read.promise)
		h.svc.onConnected.invoke()
		h.svc.onOperationUpdated.invoke(ended(op))
		read.resolve([op])
		await settle()
		expect(h.sends.records.value).toEqual([])
		expect(h.toasts.toast.value).toBeNull()
	})

	test("dispose is terminal: later events change nothing and its listeners are gone", async () => {
		const h = harness()
		await settle()
		h.stop()
		h.svc.onOperationAdded.invoke(send())
		await settle()
		expect(h.sends.records.value).toEqual([])
		expect(h.toasts.toast.value).toBeNull()
	})
})

describe("sendingLabel", () => {
	test.each([
		["an amount and a token it reads", send(), TST, "Sending 10 TST to 0x04d7…457a"],
		["an amount it cannot parse", send({ amountRaw: "1e5" }), TST, "Sending to 0x04d7…457a"],
		["decimals it does not know", send(), { ...TST, hasDecimals: false }, "Sending to 0x04d7…457a"],
		["no recipient", send({ recipientAddress: undefined }), TST, null],
	])("%s", (_, op, token, label) => {
		expect(sendingLabel(op, token)).toBe(label)
	})
})
