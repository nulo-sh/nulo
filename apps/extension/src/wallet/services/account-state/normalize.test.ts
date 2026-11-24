import { ProtocolContractAddress } from "@aztec-labs/protocol-contracts"
import { STANDARD_AUTH_REGISTRY_ADDRESS } from "@aztec-labs/standard-contracts/auth-registry/constants"
import { STANDARD_HANDSHAKE_REGISTRY_ADDRESS } from "@aztec-labs/standard-contracts/handshake-registry/constants"
import { STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS } from "@aztec-labs/standard-contracts/multi-call-entrypoint/constants"
import { describe, expect, test } from "vitest"
import {
	ACCOUNT_STATE_CAPS,
	ACCOUNT_STATE_SKIP_UNREACHABLE,
	encodeAccountState,
	isAccountStateV2,
	isConnectivityErrorMessage,
	normalizeAccountStateSlice,
	registrableNetworkIds,
	skippedNetworkRecord,
	truncateErrorMessage,
} from "./normalize"

const sender = (address = `0x${"ab".repeat(32)}`) => ({ address })
const contract = (address = `0x${"cd".repeat(32)}`) => ({ address, instance: { x: 1 }, artifact: { y: 2 } })

describe("normalizeAccountStateSlice", () => {
	test("non-array slice collapses to one violation, zero items", () => {
		const { items, violations } = normalizeAccountStateSlice({ evil: true })
		expect(items).toEqual([])
		expect(violations).toHaveLength(1)
		expect(violations[0].restoreError).toContain("not an array")
	})

	test("empty slice is a clean no-op", () => {
		expect(normalizeAccountStateSlice([])).toEqual({ items: [], violations: [] })
	})

	test("well-formed items pass through with children intact", () => {
		const { items, violations } = normalizeAccountStateSlice([{ networkId: "n1", senders: [sender()], contracts: [contract()] }])
		expect(violations).toEqual([])
		expect(items).toHaveLength(1)
		expect(items[0].senders).toHaveLength(1)
		expect(items[0].contracts).toHaveLength(1)
	})

	test("duplicate networkIds merge BEFORE caps apply (duplicates cannot bypass them)", () => {
		const half = ACCOUNT_STATE_CAPS.maxSendersPerNetwork / 2 + 1
		const mkSenders = (n: number, tag: string) => Array.from({ length: n }, (_, i) => ({ address: `0x${tag}${i}` }))
		const { items, violations } = normalizeAccountStateSlice([
			{ networkId: "n1", senders: mkSenders(half, "a"), contracts: [] },
			{ networkId: "n1", senders: mkSenders(half, "b"), contracts: [] },
		])
		expect(items).toHaveLength(1)
		expect(items[0].senders).toHaveLength(ACCOUNT_STATE_CAPS.maxSendersPerNetwork)
		expect(violations.some((v) => v.restoreError.includes("per-network cap"))).toBe(true)
	})

	test("networks over the cap are dropped with a per-network violation", () => {
		const raw = Array.from({ length: ACCOUNT_STATE_CAPS.maxNetworks + 2 }, (_, i) => ({
			networkId: `n${i}`,
			senders: [sender()],
			contracts: [],
		}))
		const { items, violations } = normalizeAccountStateSlice(raw)
		expect(items).toHaveLength(ACCOUNT_STATE_CAPS.maxNetworks)
		expect(violations.filter((v) => v.restoreError.includes("network cap"))).toHaveLength(2)
	})

	test("items over the input-item cap are dropped with ONE bounded violation", () => {
		const raw = Array.from({ length: ACCOUNT_STATE_CAPS.maxInputItems + 50 }, () => ({
			networkId: "n1",
			senders: [],
			contracts: [],
		}))
		const { violations } = normalizeAccountStateSlice(raw)
		expect(violations.filter((v) => v.restoreError.includes("over the cap were dropped"))).toHaveLength(1)
	})

	test("malformed items/children collapse into fixed-size violations, never per-entry records", () => {
		const { items, violations } = normalizeAccountStateSlice([
			null,
			42,
			{ networkId: "" },
			{ networkId: "n1", senders: [null, { address: "" }, sender()], contracts: [{ address: "x" }, contract()] },
			{ networkId: "n2", senders: null, contracts: [contract()] },
		])
		expect(items.find((i) => i.networkId === "n1")?.senders).toHaveLength(1)
		expect(items.find((i) => i.networkId === "n1")?.contracts).toHaveLength(1)
		// n2's malformed senders coerce to empty but its valid contracts survive.
		expect(items.find((i) => i.networkId === "n2")?.contracts).toHaveLength(1)
		// Bounded: one malformed-items record + one malformed-children record + one not-arrays record.
		expect(violations.filter((v) => v.restoreError.includes("malformed account-state item(s)"))).toHaveLength(1)
		expect(violations.filter((v) => v.restoreError.includes("malformed sender/contract"))).toHaveLength(1)
		expect(violations.filter((v) => v.restoreError.includes("not arrays"))).toHaveLength(1)
	})

	test("oversized slice collapses to one violation", () => {
		const big = [{ networkId: "n1", senders: [{ address: `0x${"a".repeat(ACCOUNT_STATE_CAPS.maxSliceCodeUnits)}` }], contracts: [] }]
		const { items, violations } = normalizeAccountStateSlice(big)
		expect(items).toEqual([])
		expect(violations).toHaveLength(1)
		expect(violations[0].restoreError).toContain("too large")
	})
})

const CLASS_A = `0x${"0a".repeat(32)}`
const CLASS_B = `0x${"0b".repeat(32)}`
const entry = (address: string, classId: string) => ({ address, instance: { address, currentContractClassId: classId } })
const addr = (byte: string) => `0x${byte.repeat(32)}`

describe("normalizeAccountStateSlice, format 2", () => {
	test("decodes into items whose contracts of one class share the table's one artifact object, across networks", () => {
		const artifactA = { name: "A" }
		const artifactB = { name: "B" }
		const { items, violations } = normalizeAccountStateSlice({
			format: 2,
			classes: [
				{ classId: CLASS_A, artifact: artifactA },
				{ classId: CLASS_B, artifact: artifactB },
			],
			items: [
				{ networkId: "n1", chainId: 1, senders: [sender()], contracts: [entry(addr("01"), CLASS_A), entry(addr("02"), CLASS_A)] },
				{ networkId: "n2", chainId: 2, senders: [], contracts: [entry(addr("03"), CLASS_A), entry(addr("04"), CLASS_B)] },
			],
		})
		expect(violations).toEqual([])
		const [n1, n2] = items
		expect(n1.senders).toEqual([sender()])
		expect(n1.contracts.map((c) => c.artifact)).toEqual([artifactA, artifactA])
		expect(n1.contracts[0].artifact).toBe(n1.contracts[1].artifact)
		expect(n2.contracts[0].artifact).toBe(n1.contracts[0].artifact)
		expect(n2.contracts[1].artifact).toBe(artifactB)
	})

	test("an object of any other format is the one record a part this build cannot read, with no items", () => {
		const { items, violations } = normalizeAccountStateSlice({
			format: 3,
			classes: [],
			items: [{ networkId: "n1", senders: [sender()], contracts: [] }],
		})
		expect(items).toEqual([])
		expect(violations).toEqual([
			{ networkId: "(slice)", senders: [], contracts: [], restoreError: "malformed account-state slice (not an array)" },
		])
	})

	test("a contract entry's own artifact key is never read; its code comes from the table only", () => {
		const { items } = normalizeAccountStateSlice({
			format: 2,
			classes: [],
			items: [{ networkId: "n1", senders: [], contracts: [{ ...entry(addr("01"), CLASS_A), artifact: { name: "inline" } }] }],
		})
		expect(items[0].contracts).toEqual([entry(addr("01"), CLASS_A)])
	})

	test.each<[string, unknown]>([
		["a table that is not an array", { [CLASS_A]: { name: "A" } }],
		["a table with no entry for the class", [{ classId: CLASS_B, artifact: { name: "B" } }]],
		["a malformed entry for the class", [null, { classId: CLASS_A, artifact: "code" }, { classId: CLASS_A }]],
		[
			"an entry whose class id is not in the form the export writes",
			[{ classId: CLASS_A.toUpperCase().replace("0X", "0x"), artifact: { name: "A" } }],
		],
	])("%s keeps the entry, with no artifact and no record", (_label, classes) => {
		const { items, violations } = normalizeAccountStateSlice({
			format: 2,
			classes,
			items: [{ networkId: "n1", senders: [], contracts: [entry(addr("01"), CLASS_A)] }],
		})
		expect(violations).toEqual([])
		expect(items[0].contracts).toEqual([entry(addr("01"), CLASS_A)])
	})

	test("the first usable entry for a class wins over malformed and later ones", () => {
		const first = { name: "first" }
		const { items } = normalizeAccountStateSlice({
			format: 2,
			classes: [
				{ classId: CLASS_A, artifact: 7 },
				{ classId: CLASS_A, artifact: first },
				{ classId: CLASS_A, artifact: { name: "second" } },
			],
			items: [{ networkId: "n1", senders: [], contracts: [entry(addr("01"), CLASS_A)] }],
		})
		expect(items[0].contracts[0].artifact).toBe(first)
	})

	test("unreferenced table entries are passed over: nothing they hold reaches an item", () => {
		const artifactA = { name: "A" }
		const bulk = Array.from({ length: 2_000 }, (_, i) => ({ classId: `0x${i.toString(16).padStart(64, "f")}`, artifact: { junk: i } }))
		const { items, violations } = normalizeAccountStateSlice({
			format: 2,
			classes: [...bulk, { classId: CLASS_A, artifact: artifactA }],
			items: [{ networkId: "n1", senders: [], contracts: [entry(addr("01"), CLASS_A)] }],
		})
		expect(violations).toEqual([])
		expect(items[0].contracts).toEqual([{ ...entry(addr("01"), CLASS_A), artifact: artifactA }])
	})

	test("the cap is measured on the part as written, class table included", () => {
		const huge = { name: "A", padding: "x".repeat(ACCOUNT_STATE_CAPS.maxSliceCodeUnits) }
		const { items, violations } = normalizeAccountStateSlice({
			format: 2,
			classes: [{ classId: CLASS_A, artifact: huge }],
			items: [{ networkId: "n1", senders: [], contracts: [entry(addr("01"), CLASS_A)] }],
		})
		expect(items).toEqual([])
		expect(violations).toHaveLength(1)
		expect(violations[0].restoreError).toContain("too large")
	})

	test("items that are not an array are the one unreadable-part record", () => {
		expect(normalizeAccountStateSlice({ format: 2, classes: [], items: {} }).violations[0].restoreError).toBe(
			"malformed account-state slice (not an array)",
		)
	})

	test("isAccountStateV2 holds for a format-2 object only", () => {
		expect(isAccountStateV2({ format: 2 })).toBe(true)
		expect(isAccountStateV2([])).toBe(false)
		expect(isAccountStateV2({ format: "2" })).toBe(false)
		expect(isAccountStateV2(null)).toBe(false)
	})
})

describe("encodeAccountState", () => {
	test("stores each class's artifact once and round-trips through the decoder with every entry kept", () => {
		const artifactA = { name: "A", padding: "a".repeat(1_800_000) }
		const artifactB = { name: "B" }
		const contracts = (n: number, start: number, classId: string, artifact: object) =>
			Array.from({ length: n }, (_, i) => ({ ...entry(addr((start + i).toString(16).padStart(2, "0")), classId), artifact }))
		const items = [
			{ networkId: "n1", chainId: 1, senders: [sender()], contracts: contracts(24, 1, CLASS_A, artifactA) },
			{
				networkId: "n2",
				chainId: 2,
				senders: [],
				contracts: [...contracts(8, 40, CLASS_A, artifactA), ...contracts(1, 60, CLASS_B, artifactB)],
			},
		] as never[]
		const encoded = encodeAccountState(items)
		expect(isAccountStateV2(encoded)).toBe(true)
		const part = encoded as { classes: { classId: string }[]; items: { chainId: number; contracts: object[] }[] }
		expect(part.classes.map((c) => c.classId)).toEqual([CLASS_A, CLASS_B])
		expect(part.items.map((i) => i.chainId)).toEqual([1, 2])
		expect(part.items[0].contracts[0]).toEqual(entry(addr("01"), CLASS_A))
		expect(JSON.stringify(encoded).length).toBeLessThan(2_000_000)

		const { items: decoded, violations } = normalizeAccountStateSlice(JSON.parse(JSON.stringify(encoded)))
		expect(violations).toEqual([])
		expect(decoded.map((i) => i.contracts.length)).toEqual([24, 9])
		expect(decoded[1].contracts[0].artifact).toBe(decoded[0].contracts[0].artifact)
		expect(decoded[1].contracts[8].artifact).toEqual(artifactB)
	})

	test("re-encodes decoded format-2 items compactly, so a second pass never inflates them", () => {
		const shared = { name: "A", padding: "a".repeat(100_000) }
		const raw = {
			format: 2,
			classes: [{ classId: CLASS_A, artifact: shared }],
			items: [
				{
					networkId: "n1",
					senders: [],
					contracts: Array.from({ length: 32 }, (_, i) => entry(addr((i + 1).toString(16).padStart(2, "0")), CLASS_A)),
				},
			],
		}
		const { items } = normalizeAccountStateSlice(raw)
		expect(JSON.stringify(encodeAccountState(items)).length).toBe(JSON.stringify(raw).length)
	})

	test.each<[string, (a: object, b: object) => unknown[]]>([
		[
			"one class with two distinct artifact objects in one item",
			(a, b) => [
				{
					networkId: "n1",
					senders: [],
					contracts: [
						{ ...entry(addr("01"), CLASS_A), artifact: a },
						{ ...entry(addr("02"), CLASS_A), artifact: b },
					],
				},
			],
		],
		[
			"one class with two distinct artifact objects across items",
			(a, b) => [
				{ networkId: "n1", senders: [], contracts: [{ ...entry(addr("01"), CLASS_A), artifact: a }] },
				{ networkId: "n2", senders: [], contracts: [{ ...entry(addr("02"), CLASS_A), artifact: b }] },
			],
		],
		[
			"a contract carrying an artifact whose instance names no class id in the export's form",
			(a) => [
				{
					networkId: "n1",
					senders: [],
					contracts: [{ address: addr("01"), instance: { currentContractClassId: CLASS_A.toUpperCase() }, artifact: a }],
				},
			],
		],
	])("returns its input whole as format 1 for %s", (_label, build) => {
		const items = build({ name: "A" }, { name: "A" }) as never[]
		const encoded = encodeAccountState(items)
		expect(encoded).toEqual(items)
		expect(Array.isArray(encoded)).toBe(true)
	})
})

describe("registrableNetworkIds", () => {
	test("only networks with at least one sender or contract qualify", () => {
		const normalized = normalizeAccountStateSlice([
			{ networkId: "empty", senders: [], contracts: [] },
			{ networkId: "hasSender", senders: [sender()], contracts: [] },
			{ networkId: "hasContract", senders: [], contracts: [contract()] },
		])
		expect(registrableNetworkIds(normalized).sort()).toEqual(["hasContract", "hasSender"])
	})

	test("a network holding only what every PXE boot registers has no work; one dApp contract gives it some", () => {
		const rebuilt = [
			...Object.values(ProtocolContractAddress),
			STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS,
			STANDARD_AUTH_REGISTRY_ADDRESS,
			STANDARD_HANDSHAKE_REGISTRY_ADDRESS,
		].map((a) => contract(a.toString()))
		const normalized = normalizeAccountStateSlice([
			{ networkId: "alpha", senders: [], contracts: rebuilt },
			{ networkId: "testnet", senders: [], contracts: [...rebuilt, contract(`0x${"07".repeat(32)}`)] },
		])
		expect(normalized.items[0].contracts).toHaveLength(rebuilt.length)
		expect(registrableNetworkIds(normalized)).toEqual(["testnet"])
	})
})

describe("isConnectivityErrorMessage", () => {
	test("classifies transport failures, not payload failures", () => {
		expect(isConnectivityErrorMessage("Request to http://x timed out after 5000ms")).toBe(true)
		expect(isConnectivityErrorMessage("Error fetching from host http://x: TypeError: fetch failed")).toBe(true)
		expect(isConnectivityErrorMessage("connect ECONNREFUSED 127.0.0.1:1")).toBe(true)
		expect(isConnectivityErrorMessage("Invalid artifact: missing function abi")).toBe(false)
		expect(isConnectivityErrorMessage("Network not found")).toBe(false)
	})

	test("bare `timeout`/`refused` forms stay matched (narrowing them defeats fail-fast)", () => {
		expect(isConnectivityErrorMessage("RPC timeout")).toBe(true)
		expect(isConnectivityErrorMessage("connection refused by peer")).toBe(true)
		expect(isConnectivityErrorMessage("refused")).toBe(true)
	})
})

describe("truncateErrorMessage / skippedNetworkRecord", () => {
	test("bounds hostile-length messages", () => {
		const long = "x".repeat(5_000)
		expect(truncateErrorMessage(long).length).toBe(ACCOUNT_STATE_CAPS.maxErrorMessageLength)
		expect(truncateErrorMessage("short")).toBe("short")
	})

	test("skip records carry the full account-state result shape", () => {
		expect(skippedNetworkRecord("n1", ACCOUNT_STATE_SKIP_UNREACHABLE)).toEqual({
			networkId: "n1",
			senders: [],
			contracts: [],
			restoreError: ACCOUNT_STATE_SKIP_UNREACHABLE,
		})
	})
})
