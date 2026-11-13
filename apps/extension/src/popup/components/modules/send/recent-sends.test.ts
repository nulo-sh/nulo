import { describe, expect, test } from "vitest"
import type { OperationRecord } from "@/wallet/services/operation-journal/spec"
import { TransferType } from "@/wallet/services/transaction/spec"
import { isKnownAddress, lastSendTo, type PastSend, parseSends, recentRecipients, sendWords, sentAgo } from "./recent-sends"

const ANA = "0x13c29548b3340707017c5d1a457c23d8b6c29548b3340706e39bf608a5aab172"
const BEN = "0x1259300cc3f28f7051594427d01711cacf0a7c1eecd0035e5ee8f744e3ca4059"
const CLO = "0x1af8872a3d197b09fbce3ce8e0b9156f69fb65bf721189027867e31337adf7f4"
const DAN = "0x01ee8d0b1d52c2d9275fe3a01e6ed5b55dccb43edd25e1c594c32240d0022333"
const EVE = "0x01e0e924a54c1d96428aa0e0033debb66d9cfb4376bf94712e489ac0e25d28e8"
const OWN = "0x1998178760f6baf47c78a29638c93c17c3a5328585096d40d7cb18d8a81aca17"
/** Hex, 64 digits, but not a point's x coordinate. */
const NOT_A_POINT = `0x0${"3".repeat(63)}`

const SCOPE = { profileId: "p1", networkId: "n1", accountAddress: OWN }
const TOKENS = new Set([7, 8])

function sent(overrides: Partial<OperationRecord> = {}): OperationRecord {
	return {
		id: "op",
		kind: "transfer",
		origin: "popup",
		profileId: "p1",
		networkId: "n1",
		accountAddress: OWN,
		recipientAddress: ANA,
		amountRaw: "10000000",
		tokenId: 7,
		transferType: TransferType.PrivateToPublic,
		progress: { stage: "succeeded" },
		error: null,
		terminalAt: 1_000,
		attempts: 0,
		createdAt: 900,
		updatedAt: 1_000,
		...overrides,
	}
}

const send = (address: string, at: number, arrival: PastSend["arrival"] = "private"): PastSend => ({
	address,
	tokenId: 7,
	amountRaw: 1n,
	arrival,
	at,
})

describe("parseSends", () => {
	test("keeps a succeeded popup transfer of this profile, network and account, with its sides", () => {
		expect(parseSends([sent()], SCOPE, TOKENS)).toEqual([
			{ address: ANA, tokenId: 7, amountRaw: 10_000_000n, arrival: "public", at: 1_000 },
		])
	})

	test.each([
		["an address that is no point", { recipientAddress: NOT_A_POINT }],
		["no address", { recipientAddress: undefined }],
		["an amount that is not whole base units", { amountRaw: "1.5" }],
		["a negative amount", { amountRaw: "-1" }],
		["a token the list lacks", { tokenId: 9 }],
		["a dApp's transfer", { origin: "dapp" as const }],
		["a send the node did not take", { progress: { stage: "failed" as const, from: "submitting" as const } }],
		["another network", { networkId: "n2" }],
		["no network", { networkId: undefined }],
		["another profile", { profileId: "p2" }],
		["another account", { accountAddress: BEN }],
		["another kind", { kind: "dapp_execute" as const }],
	])("skips %s", (_, overrides) => {
		expect(parseSends([sent(overrides as Partial<OperationRecord>)], SCOPE, TOKENS)).toEqual([])
	})

	test("a record with no sides counts as a send but names no arrival, beside a private one that does", () => {
		const legacy = sent({ id: "a", recipientAddress: ANA, transferType: undefined, terminalAt: 2_000 })
		const privateOne = sent({ id: "b", recipientAddress: BEN, transferType: TransferType.Private, terminalAt: 1_000 })
		const sends = parseSends([privateOne, legacy], SCOPE, TOKENS)
		expect(sends.map((s) => [s.address, s.arrival])).toEqual([
			[ANA, null],
			[BEN, "private"],
		])
		expect(recentRecipients(sends, []).map((s) => s.address)).toEqual([ANA, BEN])
		expect(lastSendTo(sends, ANA)?.arrival).toBeNull()
		expect(lastSendTo(sends, BEN)?.arrival).toBe("private")
	})

	test("reads nothing without a whole scope", () => {
		expect(parseSends([sent()], { ...SCOPE, accountAddress: undefined }, TOKENS)).toEqual([])
	})
})

describe("recentRecipients", () => {
	test("newest first, one row per address in any case, own accounts out, at most four", () => {
		const sends = [
			send(ANA, 9),
			send(ANA.toUpperCase().replace("0X", "0x"), 8),
			send(OWN, 7),
			send(BEN, 6),
			send(CLO, 5),
			send(DAN, 4),
			send(EVE, 3),
		]
		expect(recentRecipients(sends, [OWN.toUpperCase()]).map((s) => [s.address, s.at])).toEqual([
			[ANA, 9],
			[BEN, 6],
			[CLO, 5],
			[DAN, 4],
		])
	})
})

describe("isKnownAddress", () => {
	const known = { contacts: [{ address: BEN }], accounts: [{ address: OWN }], sends: [send(CLO, 1)] }

	test("a contact, an own account or a past send, in any case", () => {
		for (const address of [BEN, OWN, CLO.toUpperCase().replace("0X", "0x")]) expect(isKnownAddress(address, known), address).toBe(true)
	})

	test("an address with no record is unknown", () => {
		expect(isKnownAddress(DAN, known)).toBe(false)
	})
})

describe("sentAgo", () => {
	const now = 10 * 86_400_000
	test.each([
		[now - 10_000, "just now"],
		[now - 5 * 60_000, "5 min ago"],
		[now - 3 * 3_600_000, "3 h ago"],
		[now - 26 * 3_600_000, "yesterday"],
		[now - 4 * 86_400_000, "4 days ago"],
	])("%#: %s", (at, words) => {
		expect(sentAgo(at, now)).toBe(words)
	})
})

describe("sendWords", () => {
	test("names the arrival as the person picked it, and nothing for a record that kept none", () => {
		expect(sendWords("10", "USDC", "private")).toBe("10 USDC, privately")
		expect(sendWords("45", "EURC", "public")).toBe("45 EURC, publicly")
		expect(sendWords("1", "TST", null)).toBe("1 TST")
	})
})
