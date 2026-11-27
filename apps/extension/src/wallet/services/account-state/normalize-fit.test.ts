import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { jsonSanitize } from "@nulo/wallet-core/utils"
import { describe, expect, test, vi } from "vitest"
import { MAX_BACKUP_FILE_BYTES, MAX_SEALABLE_TEXT_BYTES, remapNetworkIdByChain, utf8Length } from "@/utils/full-backup-helpers"
import { ACCOUNT_STATE_CAPS, accountStatePartCodeUnits, fitAccountStatePart, normalizeAccountStateSlice } from "./normalize"
import type { AccountStateSlice, AccountStateSliceV2 } from "./spec"

const CAP = ACCOUNT_STATE_CAPS.maxSliceCodeUnits
const NETWORK_ID = "0a1b2c3d"
const EMPTY_REST = { compactBytes: 0, prettyBytes: 0 }

const classId = (n: number) => `0x${n.toString(16).padStart(64, "0")}`
const address = (n: number) => `0x${(n + 0x100).toString(16).padStart(64, "0")}`
const artifactOf = (name: string, pad: unknown) => ({ name, functions: [], pad })

/** A format-2 part with one contract and one sender per class, every class an `artifactOf(name, pad)`. */
function partOf(classes: { id: number; name: string; pad: unknown }[], networkId = NETWORK_ID): AccountStateSliceV2 {
	return {
		format: 2,
		classes: classes.map((c) => ({ classId: classId(c.id), artifact: artifactOf(c.name, c.pad) as never })),
		items: [
			{
				networkId,
				chainId: 7,
				senders: classes.map((c) => ({ address: address(c.id + 0x1000) })),
				contracts: classes.map((c) => ({
					address: address(c.id),
					instance: { address: address(c.id), currentContractClassId: classId(c.id) } as never,
				})),
			},
		],
	}
}

const wire = (part: AccountStateSlice) => JSON.parse(JSON.stringify(part)) as AccountStateSliceV2
const keptIds = (part: AccountStateSlice) => (part as AccountStateSliceV2).classes.map((c) => c.classId)
const noWalletClasses = async () => new Set<string>()

/** UTF-8 bytes the part takes in a file's pretty text, measured on a file of the same depth. */
const prettyInFile = (part: unknown) =>
	utf8Length(JSON.stringify({ data: { "account-state": part } }, null, 2)) -
	utf8Length(JSON.stringify({ data: { "account-state": 0 } }, null, 2)) +
	1

describe("fitAccountStatePart", () => {
	test("a part that fits comes back as the same object, without reading the wallet's classes", async () => {
		const part = partOf([
			{ id: 1, name: "App", pad: "a".repeat(1000) },
			{ id: 2, name: "Token", pad: "t".repeat(500) },
		])
		const walletClassIds = vi.fn(noWalletClasses)
		const fitted = await fitAccountStatePart(part, EMPTY_REST, walletClassIds)
		expect(fitted.part).toBe(part)
		expect(fitted.left).toEqual([])
		expect(fitted.codeUnits).toBe(JSON.stringify(part).length)
		expect(walletClassIds).not.toHaveBeenCalled()
	})

	test("at the import's cap the part is written whole; one code unit over, the largest app code is left out", async () => {
		const shape = [
			{ id: 1, name: "Big", pad: "" },
			{ id: 2, name: "Small", pad: "s".repeat(100) },
		]
		const frame = JSON.stringify(partOf(shape)).length
		const atCap = partOf([{ ...shape[0], pad: "b".repeat(CAP - frame) }, shape[1]])
		expect(JSON.stringify(atCap).length).toBe(CAP)
		expect((await fitAccountStatePart(atCap, EMPTY_REST, noWalletClasses)).part).toBe(atCap)

		const over = partOf([{ ...shape[0], pad: "b".repeat(CAP + 1 - frame) }, shape[1]])
		const fitted = await fitAccountStatePart(over, EMPTY_REST, noWalletClasses)
		expect(keptIds(fitted.part)).toEqual([classId(2)])
		expect(fitted.left.map((c) => c.name)).toEqual(["Big"])
		expect(normalizeAccountStateSlice(wire(fitted.part)).violations).toEqual([])
	})

	test("leaves out app code before the wallet's, each largest first, ties by class id, and keeps the rest in order", async () => {
		const classes = [
			{ id: 5, name: "WalletBig", pad: "w".repeat(4000) },
			{ id: 4, name: "AppTieB", pad: "x".repeat(2000) },
			{ id: 1, name: "AppSmall", pad: "y".repeat(1000) },
			{ id: 3, name: "AppTieA", pad: "z".repeat(2000) },
			{ id: 2, name: "WalletSmall", pad: "v".repeat(100) },
		]
		const part = partOf(classes)
		const wallet = async () => new Set([classId(5), classId(2)])
		const everyClass = { compactBytes: MAX_SEALABLE_TEXT_BYTES, prettyBytes: 0 }
		const order = ["AppTieA", "AppTieB", "AppSmall", "WalletBig", "WalletSmall"]
		expect((await fitAccountStatePart(part, everyClass, wallet)).left.map((c) => c.name)).toEqual(order)
		const reordered = partOf([...classes].reverse())
		expect((await fitAccountStatePart(reordered, everyClass, wallet)).left.map((c) => c.name)).toEqual(order)

		const oneByteOver = { compactBytes: 0, prettyBytes: MAX_BACKUP_FILE_BYTES - prettyInFile(wire(part)) + 1 }
		const fitted = await fitAccountStatePart(part, oneByteOver, wallet)
		expect(fitted.left.map((c) => c.name)).toEqual(["AppTieA"])
		expect(keptIds(fitted.part)).toEqual([classId(5), classId(4), classId(1), classId(2)])
	})

	test("never touches an item, an entry or a sender, nor the bytes of a kept class", async () => {
		const part = partOf([
			{ id: 1, name: "Gone", pad: "g".repeat(5000) },
			{ id: 2, name: "Kept", pad: "k".repeat(100) },
		])
		const before = JSON.stringify(part)
		const fitted = await fitAccountStatePart(part, { compactBytes: MAX_SEALABLE_TEXT_BYTES - 3000, prettyBytes: 0 }, noWalletClasses)
		const result = fitted.part as AccountStateSliceV2
		expect(result.items).toBe(part.items)
		expect(result.classes).toEqual([part.classes[1]])
		expect(result.classes[0]).toBe(part.classes[1])
		expect(JSON.stringify(part)).toBe(before)
	})

	test("sizes code as the file carries it: bytecode as base64 and class ids as hex", async () => {
		const ids = [new Fr(1n), new Fr(2n)]
		const part = {
			format: 2,
			classes: ids.map((id, i) => ({
				classId: id.toString(),
				artifact: { name: `C${i + 1}`, functions: [{ name: "f", bytecode: Buffer.alloc(3000 * (i + 1), i + 1) }] },
			})),
			items: [
				{
					networkId: NETWORK_ID,
					chainId: 7,
					senders: [],
					contracts: ids.map((id, i) => ({ address: address(i), instance: { address: address(i), currentContractClassId: id } })),
				},
			],
		} as unknown as AccountStateSliceV2
		const bytes = utf8Length(JSON.stringify(jsonSanitize(part)))
		const at = await fitAccountStatePart(part, { compactBytes: MAX_SEALABLE_TEXT_BYTES - bytes, prettyBytes: 0 }, noWalletClasses)
		expect(at.part).toBe(part)
		expect(at.codeUnits).toBe(JSON.stringify(jsonSanitize(part)).length)
		const over = await fitAccountStatePart(part, { compactBytes: MAX_SEALABLE_TEXT_BYTES - bytes + 1, prettyBytes: 0 }, noWalletClasses)
		expect(over.left.map((c) => c.name)).toEqual(["C2"])
	})

	test("UTF-8 past what the sealed file leaves goes, though its code units fit", async () => {
		const part = partOf([
			{ id: 1, name: "Wide", pad: "語".repeat(1000) },
			{ id: 2, name: "Narrow", pad: "n".repeat(1500) },
		])
		const bytes = utf8Length(JSON.stringify(part))
		expect(
			(await fitAccountStatePart(part, { compactBytes: MAX_SEALABLE_TEXT_BYTES - bytes, prettyBytes: 0 }, noWalletClasses)).part,
		).toBe(part)
		const fitted = await fitAccountStatePart(
			part,
			{ compactBytes: MAX_SEALABLE_TEXT_BYTES - bytes + 1, prettyBytes: 0 },
			noWalletClasses,
		)
		expect(fitted.left.map((c) => c.name)).toEqual(["Wide"])
	})

	test("a pretty text past what the pretty file leaves goes, though its compact text fits", async () => {
		const part = partOf([
			{ id: 1, name: "Deep", pad: Array.from({ length: 300 }, () => [[0]]) },
			{ id: 2, name: "Flat", pad: "f".repeat(2000) },
		])
		const pretty = prettyInFile(wire(part))
		expect(
			(await fitAccountStatePart(part, { compactBytes: 0, prettyBytes: MAX_BACKUP_FILE_BYTES - pretty }, noWalletClasses)).part,
		).toBe(part)
		const fitted = await fitAccountStatePart(
			part,
			{ compactBytes: 0, prettyBytes: MAX_BACKUP_FILE_BYTES - pretty + 1 },
			noWalletClasses,
		)
		expect(fitted.left.map((c) => c.name)).toEqual(["Deep"])
	})

	test("the import's remap of a short network id to a seeded one cannot carry the part past the cap", async () => {
		const shape = [
			{ id: 1, name: "Big", pad: "" },
			{ id: 2, name: "Small", pad: "s" },
		]
		const frame = JSON.stringify(partOf(shape, "net-a")).length
		const part = partOf([{ ...shape[0], pad: "b".repeat(CAP - frame) }, shape[1]], "net-a")
		expect(JSON.stringify(part).length).toBe(CAP)
		const fitted = await fitAccountStatePart(part, EMPTY_REST, noWalletClasses)
		expect(fitted.left.map((c) => c.name)).toEqual(["Big"])

		const data: Record<string, unknown> = { "account-state": wire(fitted.part) }
		remapNetworkIdByChain(data, [{ id: NETWORK_ID, chainId: 7 }], ["account-state"])
		expect(normalizeAccountStateSlice(data["account-state"]).violations).toEqual([])
	})

	test("when every class must go, every entry and sender stays", async () => {
		const part = partOf([
			{ id: 1, name: "App", pad: "a".repeat(800) },
			{ id: 2, name: "Wallet", pad: "w".repeat(800) },
		])
		const fitted = await fitAccountStatePart(
			part,
			{ compactBytes: MAX_SEALABLE_TEXT_BYTES - 10, prettyBytes: 0 },
			async () => new Set([classId(2)]),
		)
		const result = fitted.part as AccountStateSliceV2
		expect(result.classes).toEqual([])
		expect(result.items).toBe(part.items)
		expect(fitted.left.map((c) => c.name)).toEqual(["App", "Wallet"])
	})

	test("fitting a fitted part changes nothing", async () => {
		const part = partOf([
			{ id: 1, name: "Gone", pad: "g".repeat(4000) },
			{ id: 2, name: "Kept", pad: "k".repeat(100) },
		])
		const rest = { compactBytes: MAX_SEALABLE_TEXT_BYTES - 2500, prettyBytes: 0 }
		const once = await fitAccountStatePart(part, rest, noWalletClasses)
		const twice = await fitAccountStatePart(once.part, rest, noWalletClasses)
		expect(twice.part).toBe(once.part)
		expect(twice.left).toEqual([])
	})

	test("serializes each class once however many must go", async () => {
		const part = partOf(Array.from({ length: 2000 }, (_, i) => ({ id: i + 1, name: `C${i}`, pad: "p".repeat(50) })))
		const stringify = vi.spyOn(JSON, "stringify")
		const fitted = await fitAccountStatePart(part, { compactBytes: MAX_SEALABLE_TEXT_BYTES - 300_000, prettyBytes: 0 }, noWalletClasses)
		const calls = stringify.mock.calls.length
		stringify.mockRestore()
		expect(fitted.left.length).toBeGreaterThan(1000)
		expect(calls).toBeLessThanOrEqual(2 * 2000 + 8)
	})

	test("refuses a part whose items alone are over the import's cap, and a failed read of the wallet's classes", async () => {
		const items = partOf([{ id: 1, name: "App", pad: "a" }])
		items.items[0].senders[0].address = "s".repeat(CAP)
		await expect(fitAccountStatePart(items, EMPTY_REST, noWalletClasses)).rejects.toThrow("too large without contract code")

		const over = partOf([{ id: 1, name: "App", pad: "a".repeat(5000) }])
		const failing = async () => {
			throw new Error("catalog unavailable")
		}
		await expect(fitAccountStatePart(over, { compactBytes: MAX_SEALABLE_TEXT_BYTES - 100, prettyBytes: 0 }, failing)).rejects.toThrow(
			"catalog unavailable",
		)
	})

	test("a format-1 part is written only when it already fits", async () => {
		const part = [{ networkId: NETWORK_ID, chainId: 7, senders: [], contracts: [] }] as AccountStateSlice
		expect((await fitAccountStatePart(part, EMPTY_REST, noWalletClasses)).part).toBe(part)
		await expect(fitAccountStatePart(part, { compactBytes: MAX_SEALABLE_TEXT_BYTES, prettyBytes: 0 }, noWalletClasses)).rejects.toThrow(
			"too large to write",
		)
	})

	test("measures the part the way the import does", () => {
		const part = wire(partOf([{ id: 1, name: "App", pad: "a" }]))
		expect(accountStatePartCodeUnits(part)).toBe(JSON.stringify(part).length)
	})
})
