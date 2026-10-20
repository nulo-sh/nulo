import { describe, expect, test } from "vitest"
import { STORED_SHAPES } from "@/wallet/storage/stored-shapes"
import { committedBaseline, signGoldens } from "@/wallet/storage/stored-shapes/baseline"
import { REFUSALS, updateProblems } from "../../tests/e2e/fixtures/update/verify"

/** Every committed golden of `variant`, as `chrome.storage.local` holds it, split into the boot's
 *  refusals and the rest. */
async function storedGoldens(variant: "full" | "minimal"): Promise<{ held: Record<string, unknown>; refusals: Record<string, unknown> }> {
	const signed = (await signGoldens(committedBaseline().goldens)).filter((golden) => golden.id.endsWith(`.${variant}`))
	const stored = (refusal: boolean) =>
		Object.fromEntries(
			signed
				.filter((golden) => REFUSALS.has(golden.shape) === refusal)
				.map((golden) => [
					golden.key,
					STORED_SHAPES[golden.shape].encoding === "json" ? JSON.stringify(golden.value) : golden.value,
				]),
		)
	return { held: stored(false), refusals: stored(true) }
}

describe("updateProblems", () => {
	test.each(["full", "minimal"] as const)("finds nothing in the %s goldens, read as stored, or in a fixture key", async (variant) => {
		const stored = { ...(await storedGoldens(variant)).held, "nulo:e2e:proof-gate": "held" }
		expect(await updateProblems(stored, stored)).toEqual([])
	})

	test("names a lost key, a refusal the boot wrote, an unclaimed key and a row its read refuses", async () => {
		const { held: before, refusals } = await storedGoldens("minimal")
		const blocked = "nulo:core:account-integrity-blocked@b04e6d18"
		const after: Record<string, unknown> = {
			...before,
			[blocked]: refusals[blocked],
			"nulo:core:accounts@x": "{not json",
			"nulo:unknown": 1,
		}
		delete after["nulo:core:profiles@b04e6d18"]
		expect(await updateProblems(before, after)).toEqual([
			"nulo:core:profiles@b04e6d18: lost in the update",
			"nulo:core:account-integrity-blocked@b04e6d18: the boot refused what it found",
			"nulo:core:accounts@x: the accounts read returns nothing",
			"nulo:unknown: no registered shape claims it",
		])
	})
})
