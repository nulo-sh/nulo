import { describe, expect, test } from "vitest"
import {
	FACT_WORDS,
	factWord,
	feeWarning,
	NO_FACTS,
	PAID_BY,
	type PayerDescriptor,
	type PayerKind,
	paidBy,
	payerKindOf,
	publishFacts,
	publishGlyph,
	publishSentence,
	stripSentence,
	TOKEN_CAVEAT,
	type TransferSide,
	UNVOUCHED_FEE_SENTENCE,
	UNVOUCHED_PUBLISH_SENTENCE,
} from "./publish-facts"

describe("publishFacts", () => {
	/** origin → destination · payer = you / recipient / amount / notice shape ("-" = none, so no review). */
	const TABLE: [TransferSide, TransferSide, PayerKind, string][] = [
		["private", "private", "account", "exposed/hidden/hidden/private-private"],
		["private", "private", "contract", "hidden/hidden/hidden/-"],
		["private", "private", "unvouched", "unknown/hidden/hidden/-"],
		["private", "private", null, "unknown/hidden/hidden/-"],
		["private", "public", "account", "exposed/public/public/private-public"],
		["private", "public", "contract", "hidden/public/public/-"],
		["private", "public", "unvouched", "unknown/public/public/-"],
		["private", "public", null, "unknown/public/public/-"],
		["public", "private", "account", "public/hidden/public/-"],
		["public", "private", "contract", "public/hidden/public/-"],
		["public", "private", "unvouched", "public/hidden/public/-"],
		["public", "private", null, "public/hidden/public/-"],
		["public", "public", "account", "public/public/public/-"],
		["public", "public", "contract", "public/public/public/-"],
		["public", "public", "unvouched", "public/public/public/-"],
		["public", "public", null, "public/public/public/-"],
	]

	test.each(TABLE)("%s → %s, payer %s", (origin, destination, payer, expected) => {
		const facts = publishFacts(origin, destination, payer)
		expect(`${facts.you}/${facts.recipient}/${facts.amount}/${facts.noticeShape ?? "-"}`).toBe(expected)
		expect(facts.requiresReview).toBe(facts.you === "exposed")
		expect(facts.requiresReview).toBe(facts.noticeShape !== null)
	})

	test("the table is every cell, and exactly two of them require review", () => {
		expect(new Set(TABLE.map(([o, d, p]) => `${o}/${d}/${p}`)).size).toBe(16)
		expect(TABLE.filter(([o, d, p]) => publishFacts(o, d, p).requiresReview)).toHaveLength(2)
	})

	test("no facts: nothing to review, nothing to tag", () => {
		expect(NO_FACTS).toEqual({ you: "unknown", recipient: "hidden", amount: "hidden", requiresReview: false, noticeShape: null })
		expect(Object.isFrozen(NO_FACTS)).toBe(true)
	})
})

describe("payerKindOf", () => {
	const PROTOCOL: PayerDescriptor = { type: "private_fpc", fpcId: "pfpc", isProtocol: true }
	const HAND_ADDED: PayerDescriptor = { type: "fpc", fpcId: "spon", isProtocol: false }
	const fpc = (fpcId?: string) => ({ paymentMethod: { kind: "fpc", fpcId } })

	test("own Fee Juice names the account whatever the card says", () => {
		for (const payer of [null, PROTOCOL, HAND_ADDED]) expect(payerKindOf({ paymentMethod: { kind: "fj" } }, payer)).toBe("account")
	})

	test("a contract is vouched for only when the card names the same id as protocol-derived", () => {
		expect(payerKindOf(fpc("pfpc"), PROTOCOL)).toBe("contract")
		expect(payerKindOf(fpc("spon"), HAND_ADDED)).toBe("unvouched")
		expect(payerKindOf(fpc("other"), PROTOCOL)).toBeNull()
		expect(payerKindOf(fpc("pfpc"), null)).toBeNull()
		expect(payerKindOf(fpc("pfpc"), { type: "fj", isProtocol: true })).toBeNull()
		expect(payerKindOf(fpc(undefined), { type: "fpc", isProtocol: true })).toBeNull()
	})

	test("isProtocol must be the literal true", () => {
		const truthy = { type: "fpc", fpcId: "spon", isProtocol: "yes" } as unknown as PayerDescriptor
		expect(payerKindOf(fpc("spon"), truthy)).toBe("unvouched")
	})

	test("anything else is no payer, never a guess", () => {
		const shapes = [undefined, {}, { paymentMethod: undefined }, { paymentMethod: {} }, { paymentMethod: { kind: "embedded" } }]
		for (const settings of [...shapes, { paymentMethod: { kind: "fjwc" } }, { kind: "fj" } as object]) {
			expect(payerKindOf(settings, PROTOCOL), JSON.stringify(settings)).toBeNull()
		}
	})
})

describe("publishGlyph", () => {
	test("the private mark only for hidden, the public mark for anything public, nothing when Nulo can't tell", () => {
		expect(publishGlyph("hidden")).toBe("private")
		expect(publishGlyph("public")).toBe("public")
		expect(publishGlyph("exposed")).toBe("public")
		expect(publishGlyph("unknown")).toBeNull()
	})
})

describe("copy", () => {
	test("pins the approved words and sentences", () => {
		expect(FACT_WORDS).toEqual({
			you: { hidden: "HIDDEN", public: "SENDER", exposed: "FEE PAYER", unknown: "—" },
			recipient: { hidden: "HIDDEN", public: "PUBLIC" },
			amount: { hidden: "HIDDEN", public: "PUBLIC" },
		})
		expect(PAID_BY).toEqual({
			account: "paid by your address",
			contract: "paid from your private Fee Juice",
			sponsor: "paid by the sponsor",
		})
		expect(UNVOUCHED_FEE_SENTENCE).toBe("Nulo can't tell what this FPC charges you.")
		expect(TOKEN_CAVEAT).toBe("Nulo can't check this token's contract. What a send publishes depends on its code.")
	})

	test("each cell's word is the one for its visibility", () => {
		const gated = publishFacts("private", "public", "account")
		expect([factWord("you", gated), factWord("recipient", gated), factWord("amount", gated)]).toEqual(["FEE PAYER", "PUBLIC", "PUBLIC"])
		const hidden = publishFacts("private", "private", "contract")
		expect([factWord("you", hidden), factWord("recipient", hidden), factWord("amount", hidden)]).toEqual(["HIDDEN", "HIDDEN", "HIDDEN"])
		expect(factWord("you", publishFacts("public", "private", null))).toBe("SENDER")
		expect(factWord("you", NO_FACTS)).toBe("—")
	})

	test("the fee line names the payer from the settings' reading, and none while pending or hand-added", () => {
		expect(paidBy("account", "fj")).toBe(PAID_BY.account)
		expect(paidBy("account", "fpc")).toBe(PAID_BY.account)
		expect(paidBy("contract", "private_fpc")).toBe(PAID_BY.contract)
		expect(paidBy("contract", "fpc")).toBe(PAID_BY.sponsor)
		expect(paidBy("unvouched", "fpc")).toBeNull()
		expect(paidBy(null, "fj")).toBeNull()
	})
})

describe("the review's strip, heard as one sentence", () => {
	const NOBODY = "nobody watching the chain can see who sent it, who got it or how much."
	/** origin → destination · payer = what a screen reader hears for "Ana". */
	const SPOKEN: [TransferSide, TransferSide, PayerKind, string][] = [
		["private", "private", "account", "From your private balance, received privately: anyone can see your address as the fee payer."],
		["private", "private", "contract", `From your private balance, received privately: ${NOBODY}`],
		["private", "private", "unvouched", `From your private balance, received privately: ${UNVOUCHED_PUBLISH_SENTENCE}`],
		["private", "private", null, "From your private balance, received privately. Your address: not known yet."],
		[
			"private",
			"public",
			"account",
			"From your private balance, received publicly: anyone can see your address as the fee payer, Ana's address and the amount.",
		],
		["private", "public", "contract", "From your private balance, received publicly: anyone can see Ana's address and the amount."],
		[
			"private",
			"public",
			"unvouched",
			`From your private balance, received publicly: ${UNVOUCHED_PUBLISH_SENTENCE} Anyone can see Ana's address and the amount.`,
		],
		[
			"private",
			"public",
			null,
			"From your private balance, received publicly. Anyone can see Ana's address and the amount. Your address: not known yet.",
		],
		[
			"public",
			"private",
			"account",
			"From your public balance, received privately: anyone can see your address as the sender and the amount.",
		],
		[
			"public",
			"private",
			"contract",
			"From your public balance, received privately: anyone can see your address as the sender and the amount.",
		],
		[
			"public",
			"private",
			"unvouched",
			"From your public balance, received privately: anyone can see your address as the sender and the amount.",
		],
		[
			"public",
			"private",
			null,
			"From your public balance, received privately: anyone can see your address as the sender and the amount.",
		],
		[
			"public",
			"public",
			"account",
			"From your public balance, received publicly: anyone can see your address as the sender, Ana's address and the amount.",
		],
		[
			"public",
			"public",
			"contract",
			"From your public balance, received publicly: anyone can see your address as the sender, Ana's address and the amount.",
		],
		[
			"public",
			"public",
			"unvouched",
			"From your public balance, received publicly: anyone can see your address as the sender, Ana's address and the amount.",
		],
		[
			"public",
			"public",
			null,
			"From your public balance, received publicly: anyone can see your address as the sender, Ana's address and the amount.",
		],
	]

	test.each(SPOKEN)("%s → %s, payer %s", (origin, destination, payer, expected) => {
		expect(stripSentence(publishFacts(origin, destination, payer), "Ana", payer)).toBe(expected)
	})

	test("the table is every cell; an unresolved or hand-added payer is never heard as hiding you", () => {
		expect(new Set(SPOKEN.map(([o, d, p]) => `${o}/${d}/${p}`)).size).toBe(16)
		for (const [o, d, p] of SPOKEN) {
			if (publishFacts(o, d, p).you === "unknown") expect(stripSentence(publishFacts(o, d, p), "Ana", p)).not.toContain("nobody")
		}
	})

	test("an unnamed recipient is their address", () => {
		expect(stripSentence(publishFacts("private", "public", "contract"), null, "contract")).toBe(
			"From your private balance, received publicly: anyone can see their address and the amount.",
		)
	})
})

describe("Send's publish line", () => {
	const NOBODY = "Nobody watching the chain can see who sent it, who got it or how much."
	const ALONE = "Paying the fee from your public Fee Juice shows your address: anyone can see this account sent something, and when."
	/** origin → destination · payer = the sentence for "Ana", or `warn` when the line is the warning; "-" = no line. */
	const LINES: [TransferSide, TransferSide, PayerKind, string][] = [
		["private", "private", "account", "warn"],
		["private", "private", "contract", NOBODY],
		["private", "private", "unvouched", UNVOUCHED_PUBLISH_SENTENCE],
		["private", "private", null, "-"],
		["private", "public", "account", "warn"],
		["private", "public", "contract", "Anyone can see Ana's address and the amount."],
		["private", "public", "unvouched", `${UNVOUCHED_PUBLISH_SENTENCE} Anyone can see Ana's address and the amount.`],
		["private", "public", null, "-"],
		["public", "private", "account", "Anyone can see your address as the sender and the amount."],
		["public", "private", "contract", "Anyone can see your address as the sender and the amount."],
		["public", "private", "unvouched", "Anyone can see your address as the sender and the amount."],
		["public", "private", null, "Anyone can see your address as the sender and the amount."],
		["public", "public", "account", "Anyone can see your address as the sender, Ana's address and the amount."],
		["public", "public", "contract", "Anyone can see your address as the sender, Ana's address and the amount."],
		["public", "public", "unvouched", "Anyone can see your address as the sender, Ana's address and the amount."],
		["public", "public", null, "Anyone can see your address as the sender, Ana's address and the amount."],
	]

	test.each(LINES)("%s → %s, payer %s", (origin, destination, payer, expected) => {
		const facts = publishFacts(origin, destination, payer)
		const sentence = publishSentence(facts, "Ana", payer)
		const warning = feeWarning(facts, "Ana")
		// One line at most: a sentence, or the warning, never both.
		expect(sentence !== null && warning !== null).toBe(false)
		if (expected === "warn") expect([sentence, warning !== null]).toEqual([null, true])
		else expect([sentence ?? "-", warning]).toEqual([expected, null])
	})

	test("the table is every cell, and the warning shows exactly where the fee names your account", () => {
		expect(new Set(LINES.map(([o, d, p]) => `${o}/${d}/${p}`)).size).toBe(16)
		for (const [o, d, p] of LINES)
			expect(feeWarning(publishFacts(o, d, p), null) !== null).toBe(publishFacts(o, d, p).you === "exposed")
	})

	test("an unnamed recipient is their address", () => {
		expect(publishSentence(publishFacts("public", "public", "account"), null, "account")).toBe(
			"Anyone can see your address as the sender, their address and the amount.",
		)
		expect(publishSentence(publishFacts("private", "public", "unvouched"), null, "unvouched")).toBe(
			`${UNVOUCHED_PUBLISH_SENTENCE} Anyone can see their address and the amount.`,
		)
	})

	test("the warning names what the fee adds, to whom", () => {
		expect(feeWarning(publishFacts("private", "private", "account"), "Ana")).toBe(ALONE)
		expect(feeWarning(publishFacts("private", "public", "account"), "Ana")).toBe(
			"Paying the fee from your public Fee Juice adds your address to Ana's address and the amount, so anyone can read the whole payment as yours.",
		)
		expect(feeWarning(publishFacts("private", "public", "account"), null)).toContain(
			"adds your address to their address and the amount",
		)
	})

	test("no sendable token, no line", () => {
		expect([publishSentence(NO_FACTS, "Ana", null), feeWarning(NO_FACTS, "Ana")]).toEqual([null, null])
	})
})
