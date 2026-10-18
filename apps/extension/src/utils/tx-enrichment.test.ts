import { FEE_JUICE_ADDRESS } from "@aztec-labs/constants"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { describe, expect, test } from "vitest"
import { OriginType, TransferType, type TxCall, type TxTransfer } from "@/wallet/services/transaction/spec"
import {
	FEE_METHODS,
	formatTransferType,
	getMethodLabel,
	getOriginLabel,
	getPrimaryCall,
	getTxCategory,
	getTxTitle,
	humanizeMethodName,
	plainMethodName,
	tokenMovementLabel,
} from "./tx-enrichment"
import { TRANSFER_SIGNATURES } from "./token-transfer-vocabulary"

describe("FEE_METHODS — re-exported from primary-method", () => {
	test("re-exports the same set instance", () => {
		expect(FEE_METHODS.has("sponsor_unconditionally")).toBe(true)
		expect(FEE_METHODS.has("transfer")).toBe(false)
	})
})

describe("getMethodLabel — exact-match lookup", () => {
	test("known method gets its friendly label", () => {
		expect(getMethodLabel("transfer")).toBe("Transfer (private)")
		expect(getMethodLabel("mint_to_public")).toBe("Mint (public)")
		expect(getMethodLabel("transfer_to_private")).toBe("Transfer to private")
	})
	test("unknown method → null (NOT title-cased; caller picks the fallback)", () => {
		expect(getMethodLabel("drip_to_private")).toBeNull()
		expect(getMethodLabel("anything_else")).toBeNull()
	})
	test("fee-juice `claim` label is protocol-scoped: suppressed on a third-party contract", () => {
		// A third-party dApp's identically-named claim must NOT inherit fee-juice semantics on a
		// trust surface. FEE_JUICE_ADDRESS = 5 → the L2 protocol address; anything else suppresses.
		const feeJuice = AztecAddress.fromNumberUnsafe(FEE_JUICE_ADDRESS).toString()
		expect(getMethodLabel("claim", feeJuice)).toBe("Claim Fee Juice")
		expect(getMethodLabel("claim", "0x1234")).toBeNull()
		expect(getMethodLabel("claim_and_end_setup", "0xabcd")).toBeNull()
		// No contract given ⇒ legacy behavior (label applies) — non-trust-surface callers.
		expect(getMethodLabel("claim")).toBe("Claim Fee Juice")
	})
})

describe("humanizeMethodName — fallback when no label exists", () => {
	test("known method gets the friendly label", () => {
		expect(humanizeMethodName("transfer_in_private")).toBe("Transfer (private)")
		expect(humanizeMethodName("mint_to_private")).toBe("Mint (private)")
	})
	test("claim_and_end_setup → 'Claim Fee Juice' (D1 UX-friendly label)", () => {
		// Surfaces as the primary method on claim+payment txs; the raw
		// snake_case "Claim And End Setup" was robotic. Pinned so a
		// future METHOD_LABELS edit doesn't silently regress.
		expect(humanizeMethodName("claim_and_end_setup")).toBe("Claim Fee Juice")
	})
	test("a protocol label stays on its contract: a third-party claim is just Claim", () => {
		expect(humanizeMethodName("claim", "0x1234")).toBe("Claim")
		expect(humanizeMethodName("claim_and_end_setup", "0x1234")).toBe("Claim And End Setup")
	})
	test("empty / falsy input → Unknown", () => {
		expect(humanizeMethodName("")).toBe("Unknown")
	})
	test("hex selector longer than 10 chars → truncated with ellipsis", () => {
		expect(humanizeMethodName("0x1234567890abcdef")).toBe("0x12345678...")
	})
	test("short hex selector → unchanged", () => {
		expect(humanizeMethodName("0xabcd")).toBe("0xabcd")
	})
	test("snake_case unknown → title-cased with spaces", () => {
		expect(humanizeMethodName("drip_to_private")).toBe("Drip To Private")
		expect(humanizeMethodName("custom_method")).toBe("Custom Method")
	})
})

describe("tokenMovementLabel and plainMethodName", () => {
	test("the six transfer and mint labels, and only they, claim a token movement", () => {
		const names = [...TRANSFER_SIGNATURES.keys(), "mint_to_private", "mint_to_public"]
		expect(new Set(names.map(tokenMovementLabel))).toEqual(
			new Set([
				"Transfer (private)",
				"Transfer (public)",
				"Transfer to public",
				"Transfer to private",
				"Mint (private)",
				"Mint (public)",
			]),
		)
		for (const name of ["shield", "unshield", "redeem_shield", "claim", "claim_and_end_setup", "burn_private"]) {
			expect(tokenMovementLabel(name)).toBeNull()
		}
	})

	test("a name with a wallet label reads as its contract spells it", () => {
		expect(plainMethodName("transfer_public_to_public")).toBe("Transfer Public To Public")
		expect(plainMethodName("mint_to_private")).toBe("Mint To Private")
		expect(plainMethodName("0x1234567890abcdef")).toBe("0x12345678...")
	})
})

describe("a dApp's function named like an Object.prototype member gets no wallet label", () => {
	const PROTOTYPE_NAMES = ["constructor", "toString", "__proto__", "hasOwnProperty"]

	test.each(PROTOTYPE_NAMES)("%s reads as its contract spells it", (name) => {
		expect(getMethodLabel(name)).toBeNull()
		expect(tokenMovementLabel(name)).toBeNull()
		expect(humanizeMethodName(name)).toBe(plainMethodName(name))
		expect(formatTransferType(name)).toBe(name)
	})

	test("constructor is title-cased; a curated name keeps its label", () => {
		expect(humanizeMethodName("constructor")).toBe("Constructor")
		expect(humanizeMethodName("shield")).toBe("Shield")
		expect(humanizeMethodName("mint_to_public")).toBe("Mint (public)")
	})
})

describe("getPrimaryCall — TxCall wrapper around pickPrimaryMethod", () => {
	test("duplicate-name primary returns the APP call's object, not the fee claim's (index-based)", () => {
		const calls = [
			{ method: "claim", contract: "0xfeejuice" },
			{ method: "mint_and_pay_fee", contract: "0xfpc" },
			{ method: "claim", contract: "0xapp" },
		]
		expect(getPrimaryCall(calls)?.contract).toBe("0xapp")
	})

	test("empty array → undefined", () => {
		expect(getPrimaryCall([])).toBeUndefined()
	})
	test("[sponsor, drip] → drip call object", () => {
		const calls = [
			{ contract: "0x1", method: "sponsor_unconditionally" },
			{ contract: "0x2", method: "drip_to_private" },
		]
		expect(getPrimaryCall(calls)?.method).toBe("drip_to_private")
		expect(getPrimaryCall(calls)?.contract).toBe("0x2")
	})
	test("mint heuristic preserved", () => {
		const calls = [
			{ contract: "0x1", method: "transfer_in_public" },
			{ contract: "0x2", method: "mint_to_private" },
		]
		expect(getPrimaryCall(calls)?.method).toBe("mint_to_private")
	})
	test("(BUG PIN) all-fee-only list returns the first call verbatim", () => {
		const calls = [
			{ contract: "0x1", method: "sponsor_unconditionally" },
			{ contract: "0x2", method: "pay_fee" },
		]
		expect(getPrimaryCall(calls)?.method).toBe("sponsor_unconditionally")
	})
})

describe("getTxCategory and getTxTitle: the wallet's reading of the primary call", () => {
	const field = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}`
	const TOKEN = `0x${"0a".repeat(32)}`
	const DAPP = `0x${"0b".repeat(32)}`
	const ACCOUNT = `0x${"0c".repeat(32)}`
	const FEE_JUICE = AztecAddress.fromNumberUnsafe(FEE_JUICE_ADDRESS).toString()
	const CLASS = field(0xc1a55n)
	const tokens = [{ contract: TOKEN, classId: CLASS }]
	const call = (method: string, args: unknown[], over: Partial<TxCall> = {}): TxCall => ({
		contract: TOKEN,
		method,
		args,
		classId: CLASS,
		...over,
	})
	const transfer4 = [ACCOUNT, DAPP, field(5n), field(0n)]
	const sent: TxTransfer = {
		token: { name: "Test", symbol: "TST", decimals: 18 },
		type: TransferType.Private,
		from: ACCOUNT,
		to: DAPP,
		amount: "5",
	}

	test.each<[string, TxCall[], "transfer" | "mint" | "tx", string]>([
		["the wallet's own send", [call("transfer", [DAPP, field(5n)], { transfers: [sent] })], "transfer", "Transfer (private)"],
		[
			"the wallet's own send through a function it was told to call by another name",
			[call("send_tokens", [DAPP, field(5n)], { transfers: [{ ...sent, type: TransferType.Public }] })],
			"transfer",
			"Transfer (public)",
		],
		[
			"the wallet's own send whose stored type is the enum's name",
			[call("send_tokens", [DAPP, field(5n)], { transfers: [{ ...sent, type: "PublicToPrivate" as never }] })],
			"transfer",
			"Transfer to private",
		],
		[
			"the wallet's own send with a type it does not know reads by its function",
			[call("send_tokens", [DAPP, field(5n)], { transfers: [{ ...sent, type: 9 as never }] })],
			"transfer",
			"Send Tokens",
		],
		[
			"a vocabulary transfer on a listed token with its class",
			[call("transfer_in_private", transfer4)],
			"transfer",
			"Transfer (private)",
		],
		[
			"the same call recorded with no class",
			[call("transfer_in_private", transfer4, { classId: undefined })],
			"tx",
			"Transfer In Private",
		],
		[
			"the same call with another class",
			[call("transfer_in_private", transfer4, { classId: field(0xc1a56n) })],
			"tx",
			"Transfer In Private",
		],
		[
			"the same call on a contract not listed",
			[call("transfer_in_private", transfer4, { contract: DAPP })],
			"tx",
			"Transfer In Private",
		],
		["the same name with an arity the vocabulary lacks", [call("transfer_in_private", [DAPP])], "tx", "Transfer In Private"],
		[
			"an empty transfer list proves nothing",
			[call("transfer", [DAPP, field(5n)], { contract: DAPP, transfers: [] })],
			"tx",
			"Transfer",
		],
		["a non-token call on a listed token", [call("transfer_ownership", [DAPP])], "tx", "Transfer Ownership"],
		["a private mint on a listed token", [call("mint_to_private", [ACCOUNT, field(5n)])], "mint", "Mint (private)"],
		["a public mint on a listed token", [call("mint_to_public", [ACCOUNT, field(5n)])], "mint", "Mint (public)"],
		["a mint with an arity the vocabulary lacks", [call("mint_to_public", [ACCOUNT, field(5n), field(1n)])], "tx", "Mint To Public"],
		[
			"a mint with another class",
			[call("mint_to_private", [ACCOUNT, field(5n)], { classId: field(0xc1a56n) })],
			"tx",
			"Mint To Private",
		],
		["a mint to a commitment on a listed token", [call("mint_to_commitment", [field(9n), field(5n)])], "mint", "Mint To Commitment"],
		["a claim off the Fee Juice contract", [call("claim", [ACCOUNT], { contract: DAPP })], "tx", "Claim"],
		["a claim on the Fee Juice contract", [call("claim", [ACCOUNT], { contract: FEE_JUICE })], "tx", "Claim Fee Juice"],
		[
			"a fee call before the user's call",
			[call("sponsor_unconditionally", []), call("drip_to_private", [], { contract: DAPP })],
			"tx",
			"Drip To Private",
		],
		["no calls", [], "tx", "Transaction"],
	])("%s", (_, calls, category, title) => {
		expect(getTxCategory(calls, tokens)).toBe(category)
		expect(getTxTitle(calls, tokens)).toBe(title)
	})
})

describe("getOriginLabel — dApp identity for DAPP origin only", () => {
	test("DAPP origin with name → name", () => {
		expect(getOriginLabel({ type: OriginType.DAPP, name: "Faucet" })).toBe("Faucet")
	})
	test("DAPP origin without name → 'dApp'", () => {
		expect(getOriginLabel({ type: OriginType.DAPP })).toBe("dApp")
	})
	test("UI origin → null", () => {
		expect(getOriginLabel({ type: OriginType.UI })).toBeNull()
	})
	test("undefined origin → null", () => {
		expect(getOriginLabel(undefined)).toBeNull()
	})
})

describe("formatTransferType — enum and string keys", () => {
	test("numeric enum values", () => {
		expect(formatTransferType(0)).toBe("Private → Private")
		expect(formatTransferType(1)).toBe("Private → Public")
		expect(formatTransferType(2)).toBe("Public → Public")
		expect(formatTransferType(3)).toBe("Public → Private")
	})
	test("string keys", () => {
		expect(formatTransferType("Private")).toBe("Private → Private")
		expect(formatTransferType("PrivateToPublic")).toBe("Private → Public")
	})
	test("unknown → stringified input", () => {
		expect(formatTransferType(999)).toBe("999")
		expect(formatTransferType("bogus")).toBe("bogus")
	})
})
