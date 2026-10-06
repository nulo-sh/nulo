/** Sandbox-free pins for the balance-queue barrier's trail parser. */
import { expect, test } from "vitest"
import { tickStateBefore } from "./fixtures/balance-queue-trail"

const START = "Syncing 1 token balances"
const END = "Token balances synced in 12ms"
const M = "e2e-balance-queue-barrier-abc"

test("reads the tick state at the marker's latest line", () => {
	expect(tickStateBefore([END, M, START, M], M)).toEqual({ kind: "open" })
	expect(tickStateBefore([START, M, END, M], M)).toEqual({ kind: "idle", linesSinceEnd: 0 })
	expect(tickStateBefore([START, END, "other", "other", M], M)).toEqual({ kind: "idle", linesSinceEnd: 2 })
})

test("a trail with no tick line before the marker, or no marker, is never idle", () => {
	expect(tickStateBefore(["other", "other", M], M)).toEqual({ kind: "unknown" })
	expect(tickStateBefore([END, "other"], M)).toEqual({ kind: "absent" })
})
