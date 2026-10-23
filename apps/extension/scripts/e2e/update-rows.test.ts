import { describe, expect, test } from "vitest"
import { committedBaseline, signGoldens, wire } from "@/wallet/storage/stored-shapes/baseline"
import { REFUSALS, updateProblems } from "../../tests/e2e/fixtures/update/verify"

/** Every committed golden of `variant`, as `chrome.storage.local` holds it, split into the boot's
 *  refusals and the rest. */
async function storedGoldens(variant: "full" | "minimal"): Promise<{ held: Record<string, unknown>; refusals: Record<string, unknown> }> {
	const signed = (await signGoldens(committedBaseline().goldens)).filter((golden) => golden.id.endsWith(`.${variant}`))
	const stored = (refusal: boolean) =>
		Object.fromEntries(signed.filter((golden) => REFUSALS.has(golden.shape) === refusal).map((golden) => [golden.key, wire(golden)]))
	return { held: stored(false), refusals: stored(true) }
}

describe("updateProblems", () => {
	test.each(["full", "minimal"] as const)("finds nothing in the %s goldens, read as stored, or in a fixture key", async (variant) => {
		const stored = { ...(await storedGoldens(variant)).held, "nulo:e2e:proof-gate": "held" }
		expect(await updateProblems(stored, stored)).toEqual([])
	})

	test("names a lost key, a refusal the boot wrote, an unclaimed key and a row its read refuses", async () => {
		const { held: before, refusals } = await storedGoldens("minimal")
		const outbox = Object.keys(before).find((key) => key.startsWith("nulo:core:incoming-balance-outbox@")) as string
		const blocked = "nulo:core:account-integrity-blocked@b04e6d18"
		const after: Record<string, unknown> = {
			...before,
			[blocked]: refusals[blocked],
			"nulo:core:accounts@x": "{not json",
			"nulo:core:contacts@x": JSON.stringify({ profileId: "b04e6d18", sealed: 1 }),
			"nulo:unknown": 1,
		}
		delete after["nulo:core:profiles@b04e6d18"]
		delete after[outbox]
		const others = [
			"nulo:core:account-integrity-blocked@b04e6d18: the boot refused what it found",
			"nulo:core:accounts@x: the accounts read returns nothing",
			"nulo:core:contacts@x: the contacts read returns nothing",
			"nulo:unknown: no registered shape claims it",
		]
		const lost = (keys: string[]) => keys.sort().map((key) => `${key}: lost in the update`)
		// The outbox root is keyed, so its rows are counted rather than matched by key.
		expect(await updateProblems(before, after)).toEqual([
			...lost(["nulo:core:profiles@b04e6d18"]),
			"incomingBalanceOutbox: 1 row(s) lost in the update",
			...others,
		])
		// A drained outbox row is excused only where the caller asserts the balances it refreshes.
		expect(await updateProblems(before, after, { balancesAsserted: true })).toEqual([
			...lost(["nulo:core:profiles@b04e6d18"]),
			...others,
		])
	})
})
