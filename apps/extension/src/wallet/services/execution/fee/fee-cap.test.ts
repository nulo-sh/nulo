import { describe, expect, test, vi } from "vitest"
import { GasFees } from "@aztec-labs/stdlib/gas"
import { committedCapCovers, type FeeCapRule, feeCapFor } from "./fee-cap"

/** Current minimum (100, 200); the slots ahead peak at DA 130 and L2 261, in different slots. */
const node = () => ({
	getCurrentMinFees: vi.fn(async () => new GasFees(100n, 200n)),
	getPredictedMinFees: vi.fn(async () => [new GasFees(130n, 210n), new GasFees(110n, 261n)]),
})
const APP_CAP = { feePerDaGas: "5", feePerL2Gas: "6" }

describe("feeCapFor", () => {
	test.each<[string, FeeCapRule, [bigint, bigint]]>([
		["the account, at the level's multiple", { payer: "account", multiplier: 3 }, [390n, 783n]],
		["the account, with the app's cap", { payer: "account", multiplier: 3, appCap: APP_CAP }, [5n, 6n]],
		["a sponsor, at the level's multiple", { payer: "sponsor", multiplier: 3 }, [390n, 783n]],
		["private fee juice, × 1.2 rounded up", { payer: "private-fee-juice" }, [156n, 314n]],
		["the app's own payment, with no cap of its own", { payer: "app" }, [130n, 261n]],
		["the app's own payment, with its cap", { payer: "app", appCap: APP_CAP }, [5n, 6n]],
	])("%s", async (_case, rule, [da, l2]) => {
		const n = node()
		const cap = await feeCapFor(n, rule)
		expect([cap.feePerDaGas, cap.feePerL2Gas]).toEqual([da, l2])
		expect(n.getCurrentMinFees).not.toHaveBeenCalled()
		expect(n.getPredictedMinFees).toHaveBeenCalledTimes("appCap" in rule ? 0 : 1)
	})
})

describe("committedCapCovers", () => {
	const fresh = { feePerDaGas: 10n, feePerL2Gas: 20n }
	const sponsor: FeeCapRule = { payer: "sponsor", multiplier: 2 }
	const privateFeeJuice: FeeCapRule = { payer: "private-fee-juice" }

	test.each([
		["equal", { feePerDaGas: 10n, feePerL2Gas: 20n }, true, true],
		["above on both gas types", { feePerDaGas: 11n, feePerL2Gas: 21n }, true, false],
		["below on one", { feePerDaGas: 11n, feePerL2Gas: 19n }, false, false],
	])("committed %s: covers on a sponsor %s, on private fee juice %s", (_case, committed, onSponsor, onPrivate) => {
		expect(committedCapCovers(committed, fresh, sponsor)).toBe(onSponsor)
		expect(committedCapCovers(committed, fresh, privateFeeJuice)).toBe(onPrivate)
	})
})
