import { describe, expect, test } from "vitest"
import { ref } from "vue"
import { type TokenListEntry, type TokenListPair, BUNDLED_TOKEN_CLASS_IDS } from "@nulo/token-list"
import { PRIVATE_FPC_ADDRESS } from "@/wallet/services/fpc/private-fpc-address"
import { SPONSORED_FPC_ADDRESS } from "@/wallet/services/fpc/sponsored-fpc-address"
import { flaggedKeysOf, isFlaggedToken, listKeyOf } from "./token-flag"
import { listedTokensOf, tokenIconFor, tokenIconsOf } from "./token-icon"
import { type ListReader, readContract, readProtocolContract } from "./contract-level"

const CHAIN = 1674512022
const LISTED = "0x0f8df6867e9547fdf90e0f69187ada6fbd7b1f6ad4903ad333200bb032279ecf"
const UNKNOWN = "0x2d8fb63a7b035198295a451cac292a50a2a58fdf4824e2f5c18356146062ff50"
const ICON = "data:image/svg+xml;base64,PHN2Zy8+"
const field = (n: number): string => `0x${n.toString(16).padStart(64, "0")}`

const entry = (chainId: number, address: string): TokenListEntry => ({
	chainId,
	address,
	classId: BUNDLED_TOKEN_CLASS_IDS[0],
	symbol: "TST",
	decimals: 6,
	name: "Test Token",
	icon: ICON,
})

/** A reader over a list as the worker would send it; `mapped: false` stands for a list not yet answered. */
const readerOf = (entries: readonly TokenListEntry[], flagged: readonly TokenListPair[] = [], mapped = true): ListReader => {
	const icons = tokenIconsOf(entries)
	const listed = listedTokensOf(entries)
	const flags = new Set(flaggedKeysOf(flagged))
	return {
		mapped: ref(mapped),
		isFlagged: (t) => mapped && isFlaggedToken(flags, t),
		iconFor: (t) => (mapped ? tokenIconFor(icons, t) : undefined),
		listedAt: (t) => {
			if (!mapped || typeof t?.chainId !== "number" || typeof t.contract !== "string") return undefined
			const key = listKeyOf(t.chainId, t.contract)
			return Object.hasOwn(listed, key) ? listed[key] : undefined
		},
	}
}

describe("readContract", () => {
	test("a contract the list names on this chain is Nulo verified, with the list's symbol, name and picture", () => {
		expect(readContract(readerOf([entry(CHAIN, LISTED)]), CHAIN, LISTED)).toEqual({
			level: "nulo",
			source: "token",
			symbol: "TST",
			name: "Test Token",
			icon: ICON,
		})
	})

	test("the same address listed on another chain is unverified", () => {
		expect(readContract(readerOf([entry(CHAIN + 1, LISTED)]), CHAIN, LISTED)).toEqual({ level: "none", flagged: false })
	})

	test("a flag outranks a listing, even from a reader that holds both", () => {
		const reader = readerOf([entry(CHAIN, LISTED)], [{ chainId: CHAIN, address: LISTED }])
		expect(readContract(reader, CHAIN, LISTED)).toEqual({ level: "none", flagged: true })
	})

	test("the pinned PrivateFPC is Nulo verified before the list answers, and unverified once the list flags it", () => {
		expect(readContract(readerOf([], [], false), CHAIN, PRIVATE_FPC_ADDRESS)).toEqual({ level: "nulo", source: "fpc" })
		expect(readContract(readerOf([]), undefined, PRIVATE_FPC_ADDRESS)).toEqual({ level: "nulo", source: "fpc" })
		const flagged = readerOf([], [{ chainId: CHAIN, address: PRIVATE_FPC_ADDRESS }])
		expect(readContract(flagged, CHAIN, PRIVATE_FPC_ADDRESS)).toEqual({ level: "none", flagged: true })
	})

	test("Nulo's sponsor is Nulo verified on any chain before the list answers, and unverified once the list flags it", () => {
		expect(readContract(readerOf([], [], false), CHAIN, SPONSORED_FPC_ADDRESS)).toEqual({ level: "nulo", source: "sponsor" })
		expect(readContract(readerOf([]), CHAIN + 1, SPONSORED_FPC_ADDRESS.toUpperCase().replace("0X", "0x"))).toEqual({
			level: "nulo",
			source: "sponsor",
		})
		const flagged = readerOf([], [{ chainId: CHAIN, address: SPONSORED_FPC_ADDRESS }])
		expect(readContract(flagged, CHAIN, SPONSORED_FPC_ADDRESS)).toEqual({ level: "none", flagged: true })
	})

	test("an unknown contract is unverified, and so is a listed one with no chain", () => {
		const reader = readerOf([entry(CHAIN, LISTED)])
		expect(readContract(reader, CHAIN, UNKNOWN)).toEqual({ level: "none", flagged: false })
		expect(readContract(reader, undefined, LISTED)).toEqual({ level: "none", flagged: false })
	})

	test("before the list answers every other contract is pending, and an answered empty list raises none", () => {
		expect(readContract(readerOf([entry(CHAIN, LISTED)], [], false), CHAIN, LISTED)).toEqual({ level: "pending" })
		expect(readContract(readerOf([]), CHAIN, LISTED)).toEqual({ level: "none", flagged: false })
	})

	test("the protocol's three contracts are Nulo verified by name on any chain before the list answers, and unverified once the list flags one", () => {
		const protocol = (name: string) => ({ level: "nulo", source: "protocol", name })
		const early = readerOf([], [], false)
		expect([field(1), field(2), field(3)].map((address) => readContract(early, CHAIN, address))).toEqual([
			protocol("Contract class registry"),
			protocol("Contract instance registry"),
			protocol("Fee Juice"),
		])
		expect(readContract(readerOf([]), undefined, field(3).toUpperCase().replace("0X", "0x"))).toEqual(protocol("Fee Juice"))
		const flagged = readerOf([], [{ chainId: CHAIN, address: field(3) }])
		expect(readContract(flagged, CHAIN, field(3))).toEqual({ level: "none", flagged: true })
	})

	test("an address past the protocol's three, or one spelled short, is no protocol contract", () => {
		const reader = readerOf([])
		expect([field(4), field(11), "0x3", 3].map((address) => readContract(reader, CHAIN, address))).toEqual(
			Array(4).fill({ level: "none", flagged: false }),
		)
		expect(readProtocolContract(field(3))).toEqual({ level: "nulo", source: "protocol", name: "Fee Juice" })
		expect([field(0), field(4), "0x3", undefined].map(readProtocolContract)).toEqual(Array(4).fill(undefined))
	})

	test("chain 0 is a chain: a contract listed there is Nulo verified", () => {
		expect(readContract(readerOf([entry(0, LISTED)]), 0, LISTED)).toMatchObject({ level: "nulo", source: "token" })
	})
})
