import { asImportedKeysDek, type ImportedKeysDek } from "@nulo/wallet-crypto"
import { afterEach, describe, expect, test, vi } from "vitest"
import { PENDING_RESTORE_TTL_MS, PendingRestoreState } from "./pending-restore-state"

const T0 = 1_000_000

/** A DEK whose wipes are counted: `zeroize` fills a view through its own `fill`. */
function dek(fill: number) {
	const buffer = asImportedKeysDek(new Uint8Array(32).fill(fill))
	return { buffer, wipes: vi.spyOn(buffer, "fill") }
}

function stashed(state: PendingRestoreState, id: string, fill: number) {
	const source = dek(fill)
	const destination = dek(fill + 1)
	state.stash(id, { sourceDek: source.buffer, destinationDek: destination.buffer })
	return { source, destination, wipes: () => [source.wipes.mock.calls.length, destination.wipes.mock.calls.length] }
}

const allZero = (b: ImportedKeysDek) => b.every((x) => x === 0)
const at = (now: number) => vi.spyOn(Date, "now").mockReturnValue(now)

afterEach(() => vi.restoreAllMocks())

describe("PendingRestoreState", () => {
	test("take hands both buffers over once, and later cleanup leaves them untouched", () => {
		at(T0)
		const state = new PendingRestoreState()
		const entry = stashed(state, "p", 1)
		const taken = state.take("p")
		expect(taken?.sourceDek).toBe(entry.source.buffer)
		expect(taken?.destinationDek).toBe(entry.destination.buffer)
		expect(state.take("p")).toBeUndefined()
		state.forgetAll()
		expect(entry.wipes()).toEqual([0, 0])
	})

	test("a sweep keeps an entry until its TTL, then wipes it and takes back its admission", () => {
		const now = at(T0)
		const state = new PendingRestoreState()
		const entry = stashed(state, "p", 1)
		const ticket = state.beginFinalize("p")
		now.mockReturnValue(T0 + PENDING_RESTORE_TTL_MS - 1)
		state.sweep()
		expect([state.admits(ticket), entry.wipes()]).toEqual([true, [0, 0]])
		now.mockReturnValue(T0 + PENDING_RESTORE_TTL_MS)
		state.sweep()
		expect([state.admits(ticket), entry.wipes()]).toEqual([false, [1, 1]])
		expect(allZero(entry.source.buffer) && allZero(entry.destination.buffer)).toBe(true)
		state.forgetAll()
		expect(entry.wipes()).toEqual([1, 1])
	})

	test("a sweep sparing an id keeps its rewrap context but not its admission", () => {
		const now = at(T0)
		const state = new PendingRestoreState()
		const entry = stashed(state, "p", 1)
		const ticket = state.beginFinalize("p")
		now.mockReturnValue(T0 + PENDING_RESTORE_TTL_MS)
		state.sweep("p")
		expect([state.admits(ticket), entry.wipes()]).toEqual([false, [0, 0]])
		expect(state.take("p")).toBeUndefined()
		expect(entry.wipes()).toEqual([1, 1])
		state.forgetAll()
		expect(entry.wipes()).toEqual([1, 1])
	})

	test("forget wipes one id's context whatever its age and takes back its admission, sparing another id", () => {
		at(T0)
		const state = new PendingRestoreState()
		const forgotten = stashed(state, "p", 1)
		const kept = stashed(state, "q", 3)
		const tickets = [state.beginFinalize("p"), state.beginFinalize("q")]
		state.forget("p")
		expect(tickets.map((t) => state.admits(t))).toEqual([false, true])
		expect([forgotten.wipes(), kept.wipes()]).toEqual([
			[1, 1],
			[0, 0],
		])
		expect(state.take("q")?.sourceDek).toBe(kept.source.buffer)
		state.forgetAll()
		expect(forgotten.wipes()).toEqual([1, 1])
	})

	test("forgetAll wipes every fresh context once and takes back every admission", () => {
		at(T0)
		const state = new PendingRestoreState()
		const entries = [stashed(state, "p", 1), stashed(state, "q", 3)]
		const tickets = [state.beginFinalize("p"), state.beginFinalize("q")]
		state.forgetAll()
		state.forgetAll()
		expect(tickets.map((t) => state.admits(t))).toEqual([false, false])
		expect(entries.map((e) => e.wipes())).toEqual([
			[1, 1],
			[1, 1],
		])
	})

	test("a finalize ticket admits, spends and wipes only what it saw, sparing a same-id successor", () => {
		at(T0)
		const state = new PendingRestoreState()
		const first = stashed(state, "p", 1)
		const ticket = state.beginFinalize("p")
		const successor = stashed(state, "p", 3)
		expect(state.admits(ticket)).toBe(false)
		state.spendAdmission(ticket)
		state.endFinalize(ticket)
		expect(state.admits(state.beginFinalize("p"))).toBe(true)
		expect([first.wipes(), successor.wipes()]).toEqual([
			[1, 1],
			[0, 0],
		])
		expect(state.take("p")?.sourceDek).toBe(successor.source.buffer)
	})

	test("an unreplaced ticket's finalize spends its admission and wipes its context once", () => {
		at(T0)
		const state = new PendingRestoreState()
		const entry = stashed(state, "p", 1)
		const ticket = state.beginFinalize("p")
		expect(state.admits(ticket)).toBe(true)
		state.spendAdmission(ticket)
		expect([state.admits(state.beginFinalize("p")), entry.wipes()]).toEqual([false, [0, 0]])
		state.endFinalize(ticket)
		expect(entry.wipes()).toEqual([1, 1])
		state.forgetAll()
		expect(entry.wipes()).toEqual([1, 1])
	})
})
