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
	const PRIORITY = { feePerDaGas: "7", feePerL2Gas: "9" }

	test.each<[string, FeeCapRule, [bigint, bigint]]>([
		["the account, at the level's multiple", { payer: "account", multiplier: 3 }, [390n, 783n]],
		["a sponsor, at the level's multiple", { payer: "sponsor", multiplier: 3 }, [390n, 783n]],
		["private fee juice, × 1.2 rounded up", { payer: "private-fee-juice" }, [156n, 314n]],
		["the app's own payment, with no cap of its own", { payer: "app" }, [130n, 261n]],
		["the account, with a priority fee and no cap", { payer: "account", multiplier: 3, appPriority: PRIORITY }, [397n, 792n]],
		["a sponsor, with a priority fee and no cap", { payer: "sponsor", multiplier: 3, appPriority: PRIORITY }, [397n, 792n]],
		["private fee juice, with a priority fee and no cap", { payer: "private-fee-juice", appPriority: PRIORITY }, [163n, 323n]],
		["the app's own payment, with a priority fee and no cap", { payer: "app", appPriority: PRIORITY }, [137n, 270n]],
	])("%s", async (_case, rule, [da, l2]) => {
		const n = node()
		const cap = await feeCapFor(n, rule)
		expect([cap.feePerDaGas, cap.feePerL2Gas]).toEqual([da, l2])
		expect(n.getCurrentMinFees).not.toHaveBeenCalled()
		expect(n.getPredictedMinFees).toHaveBeenCalledTimes(1)
	})

	test.each<FeeCapRule>([
		{ payer: "account", multiplier: 3, appCap: APP_CAP },
		{ payer: "sponsor", multiplier: 3, appCap: APP_CAP },
		{ payer: "private-fee-juice", appCap: APP_CAP },
		{ payer: "app", appCap: APP_CAP },
		{ payer: "private-fee-juice", appCap: APP_CAP, appPriority: PRIORITY },
		{ payer: "app", appCap: APP_CAP, appPriority: PRIORITY },
	])("$payer with the app's cap (priority: $appPriority): the cap verbatim, below the minimum too", async (rule) => {
		const n = node()
		const cap = await feeCapFor(n, rule)
		expect([cap.feePerDaGas, cap.feePerL2Gas]).toEqual([5n, 6n])
		expect(n.getPredictedMinFees).not.toHaveBeenCalled()
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
