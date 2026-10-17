import { FunctionSelector } from "@aztec-labs/stdlib/abi"
import { expect, test } from "vitest"
import { CLAIM_AND_END_SETUP_SELECTOR } from "./fee-payer"

test("the claim's selector is pinned as the protocol computes it", async () => {
	const computed = await FunctionSelector.fromSignature("claim_and_end_setup((Field),u128,Field,Field)")
	expect(computed.toString()).toBe(CLAIM_AND_END_SETUP_SELECTOR)
})
