import { describe, expect, test } from "vitest"
import { TransferType } from "@/wallet/services/transaction/spec"
import { MAX_WAIT_MS, SendSequencer, SUBMITTED_HOLD_MS } from "./send-sequencer"

const SCOPE = { chainId: 1, account: "0xMe" }
const K = (...k: string[]) => new Set(k)

type PendingRow = { hash: string; chainId: number; account: string; calls: never[] | object[]; createdAt: number; feeSpender?: string }

/** A sequencer on a manual clock: every sleep advances it by the requested time. */
function harness() {
	const clock = { now: 0 }
	const pending: PendingRow[] = []
	const sequencer = new SendSequencer({
		pendingTxs: () => pending as never,
		sleep: async (ms) => {
			clock.now += ms
			await Promise.resolve()
		},
		now: () => clock.now,
	})
	return { sequencer, clock, pending }
}

const live = () => new AbortController().signal

describe("SendSequencer", () => {
	test("a later send sharing a key waits for the earlier one; disjoint keys and other scopes do not", async () => {
		const { sequencer } = harness()
		const a = sequencer.enter(SCOPE, K("seq:t:me"))
		expect(await a.waitTurn(live())).toBe("turn")
		expect(sequencer.isBlocked(SCOPE, K("seq:t:me"))).toBe(true)
		expect(sequencer.isBlocked(SCOPE, K("seq:u:me"))).toBe(false)
		expect(sequencer.isBlocked({ chainId: 2, account: "0xme" }, K("seq:t:me"))).toBe(false)
		const b = sequencer.enter(SCOPE, K("seq:t:me"))
		const turn = b.waitTurn(live())
		a.release()
		expect(await turn).toBe("turn")
	})

	test("a sent tx holds until its receipt settles, not when the send ends or its record goes", () => {
		const { sequencer, clock } = harness()
		const a = sequencer.enter(SCOPE, K("fpc:f"))
		a.sent("0xHASH")
		a.release()
		clock.now += SUBMITTED_HOLD_MS / 2
		expect(sequencer.isBlocked(SCOPE, K("fpc:f"))).toBe(true)
		sequencer.settled("0xhash")
		expect(sequencer.isBlocked(SCOPE, K("fpc:f"))).toBe(false)
	})

	test("a sent tx that never settles stops holding after the bound, counted from its send", () => {
		const { sequencer, clock } = harness()
		const a = sequencer.enter(SCOPE, K("init"))
		clock.now += 5 * SUBMITTED_HOLD_MS
		a.sent("0xh")
		a.release()
		clock.now += SUBMITTED_HOLD_MS - 1
		expect(sequencer.isBlocked(SCOPE, K("init"))).toBe(true)
		clock.now += 1
		expect(sequencer.isBlocked(SCOPE, K("init"))).toBe(false)
	})

	test("a recorded pending tx holds through its keys until the bound from its creation", () => {
		const { sequencer, clock, pending } = harness()
		const transfers = [{ type: TransferType.PrivateToPublic, from: "0xme", to: "0xbob" }]
		pending.push({ hash: "0xp", chainId: 1, account: "0xme", calls: [{ contract: "0xT", transfers }], createdAt: 0 })
		expect(sequencer.isBlocked(SCOPE, K("seq:0xt:0xme"))).toBe(true)
		expect(sequencer.isBlocked(SCOPE, K("seq:0xt:0xbob"))).toBe(false)
		clock.now = SUBMITTED_HOLD_MS
		expect(sequencer.isBlocked(SCOPE, K("seq:0xt:0xme"))).toBe(false)
	})

	test("after a restart, a pending row that names its fee spender holds a send through that contract only", () => {
		const { sequencer, pending } = harness()
		const transfers = [{ type: TransferType.Public, from: "0xme", to: "0xbob" }]
		pending.push({ hash: "0xp", chainId: 1, account: "0xme", calls: [{ contract: "0xT", transfers }], createdAt: 0, feeSpender: "0xF" })
		expect(sequencer.enter(SCOPE, K("fpc:0xf")).blocked()).toBe(true)
		expect(sequencer.enter(SCOPE, K("fpc:0xg")).blocked()).toBe(false)
	})

	test("a ticket entered with an earlier deadline keeps it; none outlives its cap from enter", () => {
		const { sequencer, clock } = harness()
		clock.now = 1_000
		expect(sequencer.enter(SCOPE, K("init"), 5_000).deadline).toBe(5_000)
		expect(sequencer.enter(SCOPE, K("init"), 10 * MAX_WAIT_MS).deadline).toBe(1_000 + MAX_WAIT_MS)
		expect(sequencer.enter(SCOPE, K("init")).deadline).toBe(1_000 + MAX_WAIT_MS)
	})

	test("an estimate's hold delays later sends, never estimates, and is refused while blocked", async () => {
		const { sequencer } = harness()
		const hold = sequencer.beginEstimate(SCOPE, K("seq:t:me"))
		expect(hold).toBeDefined()
		expect(sequencer.isBlocked(SCOPE, K("seq:t:me"))).toBe(false)
		const send = sequencer.enter(SCOPE, K("seq:t:me"))
		expect(sequencer.beginEstimate(SCOPE, K("seq:t:me"))).toBeUndefined()
		const turn = send.waitTurn(live())
		hold?.end()
		expect(await turn).toBe("turn")
	})

	test("the wait ends on abort and expires at its cap; the epoch counts sends that reached the node", async () => {
		const { sequencer } = harness()
		sequencer.enter(SCOPE, K("init"))
		const controller = new AbortController()
		controller.abort()
		expect(await sequencer.enter(SCOPE, K("init")).waitTurn(controller.signal)).toBe("aborted")
		expect(await sequencer.enter(SCOPE, K("init")).waitTurn(live())).toBe("expired")
		expect(MAX_WAIT_MS).toBeGreaterThan(SUBMITTED_HOLD_MS)
		expect(sequencer.epoch(SCOPE)).toBe(0)
		sequencer.enter(SCOPE, K()).sent("0x1")
		expect(sequencer.epoch({ chainId: 1, account: "0xME" })).toBe(1)
	})

	test("a dApp tx that reached the node holds every ticket sharing a key, earlier or later, until it settles", () => {
		const { sequencer } = harness()
		const earlier = sequencer.enter(SCOPE, K("seq:t:me"))
		sequencer.externalSent(SCOPE, "0xDAPP", K("seq:t:*"))
		expect(sequencer.epoch(SCOPE)).toBe(1)
		expect(earlier.blocked()).toBe(true)
		expect(sequencer.isBlocked(SCOPE, K("seq:t:you"))).toBe(true)
		expect(sequencer.isBlocked(SCOPE, K("seq:u:me"))).toBe(false)
		sequencer.settled("0xdapp")
		expect(earlier.blocked()).toBe(false)
	})

	test("one deadline from enter covers every wait of a ticket", async () => {
		const { sequencer, clock } = harness()
		sequencer.enter(SCOPE, K("init"))
		const ticket = sequencer.enter(SCOPE, K("init"))
		clock.now += MAX_WAIT_MS - 1_000
		expect(ticket.remainingMs()).toBe(1_000)
		expect(await ticket.waitTurn(live())).toBe("expired")
		expect(ticket.remainingMs()).toBe(0)
		expect(await ticket.waitTurn(live())).toBe("expired")
	})

	test("a ticket whose deadline passed is expired even when its predecessor has just cleared", async () => {
		const { sequencer, clock } = harness()
		const first = sequencer.enter(SCOPE, K("init"))
		const ticket = sequencer.enter(SCOPE, K("init"))
		clock.now += MAX_WAIT_MS
		first.release()
		expect(await ticket.waitTurn(live())).toBe("expired")
	})

	test("finished estimates and settled dApp sends are dropped as new holders arrive", () => {
		const { sequencer, clock } = harness()
		const holders = () => (sequencer as unknown as { holders: unknown[] }).holders.length
		for (let i = 0; i < 50; i++) sequencer.beginEstimate(SCOPE, K())?.end()
		sequencer.externalSent(SCOPE, "0xdapp", K("init"))
		sequencer.settled("0xdapp")
		clock.now += 1
		sequencer.beginEstimate(SCOPE, K())?.end()
		expect(holders()).toBe(1)
	})

	test("a pending row stamped in the future holds nothing", () => {
		const { sequencer, pending, clock } = harness()
		clock.now = 1_000
		pending.push({ hash: "0xf", chainId: 1, account: "0xme", calls: [{ contract: "t" }], createdAt: 5_000 })
		expect(sequencer.isBlocked(SCOPE, K("seq:t:me"))).toBe(false)
	})

	test("a ticket reads whether it is blocked now, by earlier tickets and pending txs only", () => {
		const { sequencer, pending } = harness()
		const first = sequencer.enter(SCOPE, K("seq:t:me"))
		const second = sequencer.enter(SCOPE, K("seq:t:me"))
		expect(first.blocked()).toBe(false)
		expect(second.blocked()).toBe(true)
		first.release()
		expect(second.blocked()).toBe(false)
		pending.push({ hash: "0xd", chainId: 1, account: "0xme", calls: [{ contract: "t" }], createdAt: 0 })
		expect(second.blocked()).toBe(true)
	})
})
