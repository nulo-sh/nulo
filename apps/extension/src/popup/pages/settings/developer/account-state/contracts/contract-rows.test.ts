import { describe, expect, test } from "vitest"
import type { ContractRow } from "@/wallet/services/account-state/client"
import { PRIVATE_FPC_ADDRESS } from "@/wallet/services/fpc/private-fpc-address"
import { SPONSORED_FPC_ADDRESS } from "@/wallet/services/fpc/sponsored-fpc-address"
import { contractOriginOf } from "./contract-rows"

const CHAIN = 7
const ACCOUNT = `0x${"1b".repeat(32)}`
const TOKEN = `0x${"0a".repeat(32)}`
const OTHER = `0x${"2c".repeat(32)}`
const row = (address: string, builtIn = false): ContractRow => ({ address, builtIn })
const accounts = new Set([ACCOUNT])
const tokens = [
	{ chainId: CHAIN, contract: TOKEN.toUpperCase().replace("0X", "0x") },
	{ chainId: CHAIN + 1, contract: OTHER },
]

describe("contractOriginOf", () => {
	test.each([
		["a built-in", row(`0x${"00".repeat(31)}03`, true), "builtIn"],
		["one of the profile's accounts", row(ACCOUNT), "account"],
		["the PrivateFPC", row(PRIVATE_FPC_ADDRESS), "fees"],
		["the sponsor", row(SPONSORED_FPC_ADDRESS), "fees"],
		["a token row on this chain, in either hex case", row(TOKEN), "token"],
		["a token row on another chain only", row(OTHER), "unknown"],
	])("%s", (_case, contract, origin) => {
		expect(contractOriginOf(contract, accounts, tokens, CHAIN)).toBe(origin)
	})

	test("the first match wins: an account or a built-in a token row also names keeps its own origin", () => {
		const both = [...tokens, { chainId: CHAIN, contract: ACCOUNT }, { chainId: CHAIN, contract: PRIVATE_FPC_ADDRESS }]
		expect(contractOriginOf(row(ACCOUNT), accounts, both, CHAIN)).toBe("account")
		expect(contractOriginOf(row(PRIVATE_FPC_ADDRESS), accounts, both, CHAIN)).toBe("fees")
		expect(contractOriginOf(row(ACCOUNT, true), accounts, both, CHAIN)).toBe("builtIn")
	})
})
