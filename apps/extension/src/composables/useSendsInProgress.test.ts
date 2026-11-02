import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { effectScope, nextTick, ref } from "vue"
import { deferred, EventHandler } from "@nulo/wallet-core/utils"
import { useToast } from "@/composables/toast.js"
import type { OperationFilter, OperationRecord } from "@/wallet/services/operation-journal/spec"
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

function harness(opts: { stored?: OperationRecord[]; lookup?: (id: number) => Promise<SendToken | undefined> } = {}) {
	const stored = opts.stored ?? []
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
	const toasts = useToast()
	const effect = effectScope()
	const sends = effect.run(() =>
		useSendsInProgress({
			journalService: svc,
			scope: () => scope.value,
			lookupToken,
			toast: toasts.toast,
			openToast: toasts.openToast,
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
	return { svc, scope, sends, lookupToken, toasts, label, stop }
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

	test("a lock closes it first and drops the rest; after the unlock a send still running shows again", async () => {
		const op = send()
		const h = track(harness({ stored: [op] }))
		await settle()
		h.toasts.closeToast()
		await settle()
		expect(h.toasts.toast.value).toBeNull()
		h.scope.value = undefined
		await settle()
		expect(h.sends.records.value).toEqual([])
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

describe("useSendsInProgress — what it names", () => {
	test("a send whose token the wallet no longer reads names the recipient alone", async () => {
		const h = track(harness({ stored: [send()], lookup: async () => Promise.reject(new Error("token not found")) }))
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
		h.svc.onOperationAdded.invoke(send())
		await settle()
		h.scope.value = B
		late.resolve(TST)
		await settle()
		expect(h.toasts.toast.value).toBeNull()
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
