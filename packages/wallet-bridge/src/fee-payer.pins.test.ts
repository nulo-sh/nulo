import { AztecAddress } from "@aztec-labs/aztec.js/addresses"
import { FeeJuicePaymentMethodWithClaim } from "@aztec-labs/aztec.js/fee"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { expect, test } from "vitest"
import { CLAIM_AND_END_SETUP_SELECTOR, isClaimAndEndSetup } from "./fee-payer"

test("the claim aztec.js emits, on the wire, carries the pinned selector and is recognised", async () => {
	const sender = AztecAddress.fromStringUnsafe("0x1a228350bbfa130d71aa1105c93e6432bd8c65476bc46ba579d2dc885e2873d1")
	const method = new FeeJuicePaymentMethodWithClaim(sender, { claimAmount: 5n, claimSecret: new Fr(7n), messageLeafIndex: 9n })
	const wire = JSON.parse(JSON.stringify((await method.getExecutionPayload()).calls[0]))
	expect(wire.selector).toBe(CLAIM_AND_END_SETUP_SELECTOR)
	expect(isClaimAndEndSetup(wire, sender.toString())).toBe(true)
})
