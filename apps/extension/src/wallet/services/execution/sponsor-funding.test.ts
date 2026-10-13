// @vitest-environment node
// Real poseidon2 (bb.js WASM) in the slot derivation, which crashes under jsdom.
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { computeFeePayerBalanceStorageSlot } from "@aztec-labs/protocol-contracts/fee-juice"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { Gas, GasFees, GasSettings } from "@aztec-labs/stdlib/gas"
import type { PrivateExecutionResult } from "@aztec-labs/stdlib/tx"
import { FEE_JUICE_ADDRESS } from "@aztec-labs/constants"
import { describe, expect, test, vi } from "vitest"
import { trim } from "@/wallet/logger/utils"
import type { PublicStorageReader } from "@/wallet/utils/fee-juice-balance"
import type { FeeEstimate } from "./fee/fee-strategy"
import { SPONSOR_PROBE_TIMEOUT_MS, callsFeeJuice, probeAppPayerFunding, probeSponsorFunding } from "./sponsor-funding"

const SPONSOR = AztecAddress.fromNumberUnsafe(0x5f)
const NETWORK = { id: "net-1", chainId: 7 }
// 2 × 100 DA + 3 × 200 L2: the node's limit leaves the teardown limits out.
const FEE_LIMIT = 800n

function built(named = true): FeeEstimate {
	const gasSettings = new GasSettings(new Gas(100, 200), new Gas(10, 20), new GasFees(2n, 3n), new GasFees(0n, 0n))
	return {
		network: NETWORK,
		txRequest: { txContext: { gasSettings } },
		...(named ? { sponsor: { fpcId: "fpc-1", address: SPONSOR } } : {}),
	} as unknown as FeeEstimate
}

function reader(result: bigint | Error) {
	return vi.fn<PublicStorageReader>(async () => {
		if (result instanceof Error) throw result
		return new Fr(result)
	})
}

describe("probeSponsorFunding", () => {
	test.each([
		{ balance: FEE_LIMIT - 1n, funded: false, outcome: "short" },
		{ balance: FEE_LIMIT, funded: true, outcome: "funded" },
		{ balance: 0n, funded: false, outcome: "short" },
	])("a balance of $balance against the fee limit is funded: $funded", async ({ balance, funded, outcome }) => {
		const read = reader(balance)
		const log = vi.fn()

		expect(await probeSponsorFunding(built(), read, log)).toEqual({ fpcId: "fpc-1", address: SPONSOR.toString(), funded })

		expect(read).toHaveBeenCalledTimes(1)
		const [network, , slot, timeoutMs] = read.mock.calls[0] ?? []
		expect(network).toBe(NETWORK)
		expect(slot?.equals(await computeFeePayerBalanceStorageSlot(SPONSOR))).toBe(true)
		expect(timeoutMs).toBe(SPONSOR_PROBE_TIMEOUT_MS)
		expect(SPONSOR_PROBE_TIMEOUT_MS).toBe(5_000)
		expect(log.mock.calls).toEqual([["sponsor probe", { outcome }]])
	})

	test("no sponsor named: no read, no verdict", async () => {
		const read = reader(0n)
		const log = vi.fn()

		expect(await probeSponsorFunding(built(false), read, log)).toBeUndefined()
		expect(read).not.toHaveBeenCalled()
		expect(log).not.toHaveBeenCalled()
	})

	test("a failed read is no verdict, and nothing it said reaches the log", async () => {
		const leaks = ["https://rpc.example/key-in-path", "123456789", SPONSOR.toString()]
		const read = reader(new Error(`Error 500 from server ${leaks[0]}: balance ${leaks[1]} of ${leaks[2]}`))
		const log = vi.fn()

		expect(await probeSponsorFunding(built(), read, log)).toBeUndefined()

		expect(log.mock.calls).toEqual([["sponsor probe", { outcome: "failed" }]])
		const logged = JSON.stringify(log.mock.calls.map((args) => args.map((arg) => trim(arg))))
		for (const leak of leaks) expect(logged).not.toContain(leak)
	})
})

const APP_PAYER = AztecAddress.fromNumberUnsafe(0xa9)
const FEE_JUICE = AztecAddress.fromNumberUnsafe(FEE_JUICE_ADDRESS)
const OTHER = AztecAddress.fromNumberUnsafe(0x77)

/** A private call to `contract` with these nested calls, as the simulation's tree holds it. */
const call = (contract: AztecAddress, nested: unknown[] = []) => ({
	publicInputs: { callContext: { contractAddress: contract } },
	nestedExecutionResults: nested,
})
const tree = (entrypoint: unknown) => ({ entrypoint }) as unknown as PrivateExecutionResult

function appBuilt(callsFeeJuice: boolean | undefined): FeeEstimate {
	const base = built(false) as unknown as Record<string, unknown>
	return { ...base, ...(callsFeeJuice === undefined ? {} : { appPayer: { address: APP_PAYER, callsFeeJuice } }) } as FeeEstimate
}

describe("callsFeeJuice", () => {
	test.each([
		["no call to Fee Juice anywhere", tree(call(OTHER, [call(OTHER, [call(APP_PAYER)])])), false],
		["a top-level claim", tree(call(OTHER, [call(FEE_JUICE)])), true],
		["a claim nested inside another contract's setup", tree(call(OTHER, [call(OTHER, [call(OTHER, [call(FEE_JUICE)])])])), true],
		["no tree", undefined, true],
		["a call whose target the tree does not carry", tree(call(OTHER, [{ nestedExecutionResults: [] }])), true],
	])("%s: %s", (_case, execution, expected) => {
		expect(callsFeeJuice(execution)).toBe(expected)
	})
})

describe("probeAppPayerFunding", () => {
	test.each([
		{
			case: "short, and nothing in the transaction can credit it",
			callsFeeJuice: false,
			balance: FEE_LIMIT - 1n,
			funded: false,
			provenShort: true,
		},
		{ case: "short, but the transaction calls Fee Juice", callsFeeJuice: true, balance: 0n, funded: false, provenShort: false },
		{ case: "funded", callsFeeJuice: false, balance: FEE_LIMIT, funded: true, provenShort: false },
	])("$case", async ({ callsFeeJuice: calls, balance, funded, provenShort }) => {
		const read = reader(balance)
		const log = vi.fn()
		expect(await probeAppPayerFunding(appBuilt(calls), read, log)).toEqual({ address: APP_PAYER.toString(), funded, provenShort })
		expect(read.mock.calls[0]?.[2]?.equals(await computeFeePayerBalanceStorageSlot(APP_PAYER))).toBe(true)
		expect(log.mock.calls).toEqual([["app payer probe", { outcome: funded ? "funded" : "short" }]])
	})

	test("no app payer, as for a claim to the sender: no read, no verdict", async () => {
		const read = reader(0n)
		expect(await probeAppPayerFunding(appBuilt(undefined), read, vi.fn())).toBeUndefined()
		expect(read).not.toHaveBeenCalled()
	})

	test("a failed read is no verdict", async () => {
		const log = vi.fn()
		expect(await probeAppPayerFunding(appBuilt(false), reader(new Error("down")), log)).toBeUndefined()
		expect(log.mock.calls).toEqual([["app payer probe", { outcome: "failed" }]])
	})
})
