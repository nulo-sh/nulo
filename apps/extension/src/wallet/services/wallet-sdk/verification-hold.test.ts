import { describe, expect, test } from "vitest"
import { MAX_HELD_PER_SESSION, type VerificationHold, VerificationHolds } from "./verification-hold"

const HASH_A = "a1".repeat(32)
const HASH_B = "b2".repeat(32)

/** The hold's outcome if it has settled, `"pending"` otherwise. */
async function outcomeOf(hold: VerificationHold): Promise<string> {
	return Promise.race([hold.outcome, new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 0))])
}

describe("VerificationHolds", () => {
	test("confirming the session's own hash releases its hold, which stays readable and admits every call", async () => {
		const holds = new VerificationHolds()
		const hold = holds.open("s1", HASH_A)
		expect(await outcomeOf(hold)).toBe("pending")

		expect(holds.confirm(HASH_A)).toBe(true)
		expect(await outcomeOf(hold)).toBe("released")
		expect(holds.get("s1")).toBe(hold)
		expect(hold.admit()).toBe(true)
	})

	test("an unknown hash, or the hash of a settled hold, releases nothing", async () => {
		const holds = new VerificationHolds()
		const held = holds.open("s1", HASH_A)
		expect(holds.confirm(HASH_B)).toBe(false)
		expect(await outcomeOf(held)).toBe("pending")

		const dropped = holds.open("s2", HASH_B)
		dropped.drop("wallet_refused")
		expect(holds.confirm(HASH_B)).toBe(false)
		expect(await outcomeOf(dropped)).toBe("wallet_refused")
		expect(await outcomeOf(held)).toBe("pending")
	})

	test("the first settle wins: a lock's drop is not overwritten by the termination that follows", async () => {
		const holds = new VerificationHolds()
		const hold = holds.open("s1", HASH_A)
		hold.drop("session_ended")
		holds.end("s1", "wallet_refused")
		hold.release()
		expect(await outcomeOf(hold)).toBe("session_ended")
	})

	test("a re-key settles the previous hold, whose hash then releases nothing; the new hash releases the new hold", async () => {
		const holds = new VerificationHolds()
		const before = holds.open("s1", HASH_A)
		const after = holds.open("s1", HASH_B)
		expect(await outcomeOf(before)).toBe("wallet_refused")
		expect(holds.get("s1")).toBe(after)

		expect(holds.confirm(HASH_A)).toBe(false)
		expect(await outcomeOf(after)).toBe("pending")
		expect(holds.confirm(HASH_B)).toBe(true)
		expect(await outcomeOf(after)).toBe("released")
	})

	test(`an unsettled hold admits ${MAX_HELD_PER_SESSION} calls and refuses the next; a released one admits every call`, () => {
		const holds = new VerificationHolds()
		const hold = holds.open("s1", HASH_A)
		for (let i = 0; i < MAX_HELD_PER_SESSION; i++) expect(hold.admit()).toBe(true)
		expect(hold.admit()).toBe(false)

		hold.release()
		for (let i = 0; i <= MAX_HELD_PER_SESSION; i++) expect(hold.admit()).toBe(true)
	})

	test("unsettled lists only open holds; end drops an unsettled hold and removes any hold from the map", async () => {
		const holds = new VerificationHolds()
		const open = holds.open("s1", HASH_A)
		const released = holds.open("s2", HASH_B)
		released.release()
		expect(holds.unsettled()).toEqual([open])

		holds.end("s1", "wallet_refused")
		holds.end("s2", "wallet_refused")
		expect(await outcomeOf(open)).toBe("wallet_refused")
		expect(await outcomeOf(released)).toBe("released")
		expect(holds.get("s1")).toBeUndefined()
		expect(holds.get("s2")).toBeUndefined()
		expect(holds.unsettled()).toEqual([])
	})
})
