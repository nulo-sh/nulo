import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { describe, expect, test } from "vitest"
import { RELAY_LABEL, RELAY_RPC_URLS, seedForKind } from "./network/seeds"
import type { ChainKind, Network } from "./network/spec"
import {
	type ConversionRecord,
	type RelayOffers,
	runUnlockConversions,
	UNLOCK_CONVERSIONS,
	type UnlockConversion,
} from "./unlock-conversions"

/** Offers held in memory, as the network service's record holds them; `takes` lists each take. */
function offers(taken: readonly ChainKind[] = [], readable = true): RelayOffers & { takes: ChainKind[] } {
	const held = new Set(taken)
	const takes: ChainKind[] = []
	return {
		takes,
		pending: (kind) => readable && !held.has(kind),
		take: async (kind) => {
			takes.push(kind)
			held.add(kind)
		},
	}
}

const network = (over: Partial<Network> & { id: string }): Network => ({
	profileId: "p1",
	chainId: 1,
	l1ChainId: 1,
	name: "Mine",
	primaryEndpointId: "e1",
	endpoints: [{ id: "e1", rpcUrl: "https://node.example", label: "Mine" }],
	kind: "custom",
	...over,
})

// The recording a v0.31.0 build stored; its Testnet row holds the retired default as seeded.
const recorded: { entries: Record<string, string> } = JSON.parse(
	readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../tests/e2e/fixtures/update/v0.31.0.storage.json"), "utf8"),
)
const recordedTestnet = Object.entries(recorded.entries)
	.filter(([key]) => key.startsWith("nulo:core:networks@"))
	.map(([, text]) => JSON.parse(text) as Network)
	.find((row) => row.kind === "testnet") as Network
const seedUrl = (kind: "testnet" | "mainnet") => seedForKind(kind)?.rpcUrl ?? ""
const alpha = seedForKind("mainnet")?.name ?? ""
const relay = (id: string, kind: "testnet" | "mainnet") => ({ id: `${id}-relay`, rpcUrl: RELAY_RPC_URLS[kind], label: RELAY_LABEL })
const seeded = (id: string, kind: "testnet" | "mainnet", over: Partial<Network> = {}) =>
	network({
		id,
		kind,
		name: kind,
		primaryEndpointId: "s1",
		endpoints: [{ id: "s1", rpcUrl: seedUrl(kind), label: "dRPC" }],
		...over,
	})

type Case = {
	label: string
	row: Network
	rows?: Network[]
	expected: Network | undefined
	/** Offers taken before the run, and the ones the run takes. */
	taken?: ChainKind[]
	takes?: ChainKind[]
}

/** The contract cases per entry; each transform's edge cases stay in its own test file. */
const TABLES: Record<string, Case[]> = {
	"retired-default-endpoints": [
		{
			label: "v0.31.0's Testnet default",
			row: recordedTestnet,
			expected: {
				...recordedTestnet,
				endpoints: recordedTestnet.endpoints.map((endpoint, i) =>
					i === 0 ? { ...endpoint, rpcUrl: seedUrl("testnet") } : endpoint,
				),
			},
		},
		{ label: "a custom node", row: network({ id: "c1" }), expected: undefined },
	],
	"retired-default-names": [
		{
			label: 'a mainnet row named "Alpha V6"',
			row: network({ id: "m1", kind: "mainnet", name: "Alpha V6" }),
			expected: network({ id: "m1", kind: "mainnet", name: alpha }),
		},
		{ label: "a name the person chose", row: network({ id: "m1", kind: "mainnet", name: "My Alpha" }), expected: undefined },
	],
	"relay-endpoint": [
		{
			label: "a seeded Testnet primary takes the relay after the row's other endpoints",
			row: seeded("t1", "testnet", {
				endpoints: [
					{ id: "s1", rpcUrl: seedUrl("testnet"), label: "dRPC" },
					{ id: "u1", rpcUrl: "https://node.example", label: "Mine" },
				],
			}),
			expected: seeded("t1", "testnet", {
				endpoints: [
					{ id: "s1", rpcUrl: seedUrl("testnet"), label: "dRPC" },
					{ id: "u1", rpcUrl: "https://node.example", label: "Mine" },
					relay("t1", "testnet"),
				],
			}),
			takes: ["testnet"],
		},
		{
			label: "a seeded Alpha primary takes its own relay",
			row: seeded("m1", "mainnet"),
			expected: seeded("m1", "mainnet", { endpoints: [...seeded("m1", "mainnet").endpoints, relay("m1", "mainnet")] }),
			takes: ["mainnet"],
		},
		{
			label: "a primary the person replaced with their own node",
			row: seeded("t1", "testnet", {
				primaryEndpointId: "u1",
				endpoints: [...seeded("t1", "testnet").endpoints, { id: "u1", rpcUrl: "https://node.example" }],
			}),
			expected: undefined,
			takes: ["testnet"],
		},
		{ label: "an offer already taken, the relay since removed", row: seeded("t1", "testnet"), expected: undefined, taken: ["testnet"] },
		{
			label: "a row that already holds the relay",
			row: seeded("t1", "testnet", { endpoints: [...seeded("t1", "testnet").endpoints, { ...relay("x", "testnet"), id: "r9" }] }),
			expected: undefined,
			takes: ["testnet"],
		},
		{ label: "a custom network", row: network({ id: "c1" }), expected: undefined },
	],
}

const conversion = (name: string) => UNLOCK_CONVERSIONS.find((entry) => entry.name === name) as UnlockConversion<"networks">

describe("UNLOCK_CONVERSIONS", () => {
	test("every entry has a table, in the list's order", () => {
		expect(Object.keys(TABLES)).toEqual(UNLOCK_CONVERSIONS.map((entry) => entry.name))
	})

	describe.each(Object.entries(TABLES))("%s", (name, cases) => {
		// Booleans, so a failure prints no recorded endpoint URL.
		test.each(cases)("$label", async ({ row, rows = [row], expected, taken, takes = [] }) => {
			const before = structuredClone(row)
			const context = { relayOffers: offers(taken) }
			const next = await conversion(name).convert(row, rows, context)
			expect(isDeepStrictEqual(next, expected)).toBe(true)
			expect(isDeepStrictEqual(row, before)).toBe(true)
			expect(context.relayOffers.takes).toEqual(takes)
			if (next === undefined) return
			expect(next.id === row.id && next.profileId === row.profileId).toBe(true)
			const again = await conversion(name).convert(
				next,
				rows.map((r) => (r.id === row.id ? next : r)),
				context,
			)
			expect(again === undefined).toBe(true)
		})
	})
})

test("the list run again over the rows it committed commits nothing", async () => {
	const held = offers()
	const rows = [recordedTestnet, network({ id: "m1", kind: "mainnet", name: "Alpha V6" }), network({ id: "c1" })]
	const pass = async (input: Network[]) => {
		const after = new Map<string, Network>()
		await runUnlockConversions("networks", input, {
			context: { relayOffers: held },
			commit: async (_, next) => void after.set(next.id, next),
			log: () => {},
		})
		return after
	}
	const first = await pass(rows)
	// A count, so a failure prints no recorded endpoint URL. v0.31.0's Testnet, moved onto its seed's
	// endpoint, takes the relay in the same pass.
	expect(first.size).toBe(2)
	expect(first.get(recordedTestnet.id)?.endpoints.at(-1)?.rpcUrl === RELAY_RPC_URLS.testnet).toBe(true)
	expect(held.takes).toEqual(["testnet", "mainnet"])
	expect((await pass(rows.map((row) => first.get(row.id) ?? row))).size).toBe(0)
})

describe("runUnlockConversions", () => {
	type Logged = { level: string; message: string; record: ConversionRecord }
	const entry = (name: string, convert: UnlockConversion<"networks">["convert"]): UnlockConversion<"networks"> => ({
		name,
		root: "networks",
		convert,
	})
	const suffix = (name: string, tag: string) =>
		entry(name, (row) => (row.name.endsWith(tag) ? undefined : { ...row, name: `${row.name}${tag}` }))
	const run = async (rows: Network[], conversions: UnlockConversion<"networks">[], skip?: (row: Network) => boolean) => {
		const committed: Array<[string, string]> = []
		const logged: Logged[] = []
		await runUnlockConversions("networks", rows, {
			context: { relayOffers: offers() },
			conversions,
			skip,
			commit: async (before, after) => void committed.push([before.name, after.name]),
			log: (level, message, record) => logged.push({ level, message, record }),
		})
		return { committed, logged }
	}

	test("each row takes the entries in list order, a skipped row none, and a second run commits nothing", async () => {
		const rows = [network({ id: "a", name: "x" }), network({ id: "b", name: "y" })]
		const list = [
			entry("first", (row) => (row.name.includes("1") ? undefined : { ...row, name: `${row.name}1` })),
			entry("second", (row) => (row.name.endsWith("1") ? { ...row, name: `${row.name}2` } : undefined)),
		]
		const { committed, logged } = await run(rows, list, (row) => row.id === "b")
		expect(committed).toEqual([["x", "x12"]])
		expect(logged).toEqual([
			{
				level: "debug",
				message: "unlock conversion ran",
				record: { conversion: "first", root: "networks", converted: 1, failed: 0 },
			},
			{
				level: "debug",
				message: "unlock conversion ran",
				record: { conversion: "second", root: "networks", converted: 1, failed: 0 },
			},
		])
		expect((await run([network({ id: "a", name: "x12" })], list)).committed).toEqual([])
	})

	test("a throw ends that row's list with the prefix committed, the next row converts, and the line warns", async () => {
		const calls: string[] = []
		const list = [
			suffix("a", "A"),
			entry("b", (row) => {
				if (row.id === "bad") throw new Error("boom")
				return { ...row, name: `${row.name}B` }
			}),
			entry("c", (row) => {
				calls.push(row.id)
				return { ...row, name: `${row.name}C` }
			}),
		]
		const { committed, logged } = await run([network({ id: "bad", name: "x" }), network({ id: "ok", name: "y" })], list)
		expect(committed).toEqual([
			["x", "xA"],
			["y", "yABC"],
		])
		expect(calls).toEqual(["ok"])
		expect(logged.map(({ level, record }) => [level, record.conversion, record.converted, record.failed])).toEqual([
			["debug", "a", 2, 0],
			["warn", "b", 1, 1],
			["debug", "c", 1, 0],
		])
		expect(logged[1]?.message).toBe("an unlock conversion threw; the next worker retries")
	})

	test("a row is committed before the next converts, and a rejected commit still logs its lines", async () => {
		const calls: string[] = []
		const tag = entry("tag", (row) => {
			calls.push(`convert ${row.id}`)
			return { ...row, name: `${row.name}!` }
		})
		const logged: Logged[] = []
		const failure = new Error("write failed")
		const done = runUnlockConversions("networks", [network({ id: "a" }), network({ id: "b" }), network({ id: "c" })], {
			context: { relayOffers: offers() },
			conversions: [tag],
			commit: async (row) => {
				calls.push(`commit ${row.id}`)
				if (row.id === "b") throw failure
			},
			log: (level, message, record) => logged.push({ level, message, record }),
		})
		await expect(done).rejects.toBe(failure)
		expect(calls).toEqual(["convert a", "commit a", "convert b", "commit b"])
		expect(logged).toEqual([
			{ level: "debug", message: "unlock conversion ran", record: { conversion: "tag", root: "networks", converted: 2, failed: 0 } },
		])
	})
})
