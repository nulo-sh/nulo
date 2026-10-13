import { describe, expect, test } from "vitest"
import { MAX_PENDING_PER_SESSION, type VerificationHold, VerificationHolds } from "./verification-hold"

const HASH_A = "a1".repeat(32)
const HASH_B = "b2".repeat(32)

/** The hold's outcome if it has settled, `"pending"` otherwise. */
async function outcomeOf(hold: VerificationHold): Promise<string> {
	return Promise.race([hold.outcome, new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 0))])
}

describe("VerificationHolds", () => {
	test("confirming the session's own hash releases its hold, which stays readable and admits a call", async () => {
		const holds = new VerificationHolds()
		const hold = holds.open("s1", HASH_A)
		expect(await outcomeOf(hold)).toBe("pending")

		expect(holds.confirm(HASH_A)).toBe(true)
		expect(await outcomeOf(hold)).toBe("released")
		expect(holds.get("s1")).toBe(hold)
		expect(hold.admit()).toBeDefined()
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

	// A released hold refuses too: the bound covers a confirmed session's calls, not only held ones.
	test(`a hold admits ${MAX_PENDING_PER_SESSION} calls, settled or not, and one more per release; a second release frees nothing`, () => {
		const holds = new VerificationHolds()
		const hold = holds.open("s1", HASH_A)
		const releases = Array.from({ length: MAX_PENDING_PER_SESSION }, () => hold.admit())
		expect(releases.every((release) => release !== undefined)).toBe(true)
		expect(hold.admit()).toBeUndefined()

		hold.release()
		expect(hold.admit()).toBeUndefined()
		releases[0]?.()
		releases[0]?.()
		expect(hold.admit()).toBeDefined()
		expect(hold.admit()).toBeUndefined()
	})

	test("two sessions' holds count apart", () => {
		const holds = new VerificationHolds()
		const full = holds.open("s1", HASH_A)
		for (let i = 0; i < MAX_PENDING_PER_SESSION; i++) full.admit()
		expect(full.admit()).toBeUndefined()
		expect(holds.open("s2", HASH_B).admit()).toBeDefined()
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
