import { CLAIM_AND_END_SETUP_SELECTOR, FEE_JUICE_CONTRACT } from "@nulo/wallet-bridge"
import { describe, expect, test } from "vitest"
import { PRIVATE_FPC_ADDRESS } from "@/wallet/services/fpc/private-fpc-address"
import { waitsForFeeFigure } from "./fee-figure"
import type { DraftUIOperation } from "./types"

const OWNER = `0x${"0a".repeat(32)}`
const APP_FPC = `0x${"0f".repeat(32)}`
const CLAIM = {
	name: "claim_and_end_setup",
	to: FEE_JUICE_CONTRACT,
	selector: CLAIM_AND_END_SETUP_SELECTOR,
	type: "private",
	isStatic: false,
	hideMsgSender: false,
	args: [OWNER, "100", "0x1", "0x2"],
}
const sendTx = (exec: object, opts: object = {}) =>
	({ kind: "aztec_sendTx", exec, opts: { from: OWNER, ...opts } }) as unknown as DraftUIOperation

describe("waitsForFeeFigure", () => {
	test.each([
		["a fee the wallet picks", sendTx({ calls: [] })],
		["a requested self-pay", sendTx({ calls: [], feePayer: OWNER })],
		["an app's claim to the account", sendTx({ calls: [CLAIM], feePayer: OWNER })],
		[
			"an app's own fee contract with its own cap",
			sendTx({ calls: [], feePayer: APP_FPC }, { fee: { gasSettings: { maxFeesPerGas: {} } } }),
		],
		["a send_transaction the wallet pays", { kind: "send_transaction", actions: [] } as unknown as DraftUIOperation],
		["an app's payment naming the PrivateFPC as payer", sendTx({ calls: [], feePayer: PRIVATE_FPC_ADDRESS })],
	])("waits for %s", (_case, op) => {
		expect(waitsForFeeFigure(op)).toBe(true)
	})

	test.each([
		["an app's own fee contract", sendTx({ calls: [], feePayer: APP_FPC })],
		["a default-entrypoint send", { ...(sendTx({ calls: [] }) as object), executionMode: "default_entrypoint" } as DraftUIOperation],
		[
			"a send_transaction an app's contract pays",
			{ kind: "send_transaction", fee: { embeddedFeePayment: "fpc" } } as unknown as DraftUIOperation,
		],
		["a read", { kind: "aztec_getChainInfo" } as unknown as DraftUIOperation],
	])("does not wait for %s", (_case, op) => {
		expect(waitsForFeeFigure(op)).toBe(false)
	})
})
