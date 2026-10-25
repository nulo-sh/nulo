import { describe, expect, test } from "vitest"
import { KINDS_SEEDED_BEFORE_RECORD, normalizeSeedOffers, sameSeedOffers, seedsToOffer } from "./seed-offers"
import { DEFAULT_SEEDS, type DefaultSeed } from "./seeds"
import type { ChainKind } from "./spec"

const seed = (kind: ChainKind, chainId: number): DefaultSeed => ({
	name: kind,
	rpcUrl: "http://127.0.0.1:9",
	chainId,
	l1ChainId: 1,
	kind,
	isPrimaryActive: kind === "mainnet",
})
const TESTNET = seed("testnet", 100)
const LOCAL = seed("local", 0)
const MAINNET = seed("mainnet", 200)
const SEEDS = [TESTNET, LOCAL, MAINNET]
const absent = { kind: "absent" } as const
const recorded = (...offered: ChainKind[]) => ({ kind: "valid", value: { offered } }) as const
const kinds = (seeds: DefaultSeed[] | undefined) => seeds?.map((s) => s.kind)

describe("seedsToOffer", () => {
	test("an empty profile is offered every seed, whatever its record says", () => {
		expect(kinds(seedsToOffer(SEEDS, recorded("testnet", "local", "mainnet"), [])?.add)).toEqual(["testnet", "local", "mainnet"])
		expect(kinds(seedsToOffer(SEEDS, { kind: "corrupt" }, [])?.add)).toEqual(["testnet", "local", "mainnet"])
	})

	test("a profile with rows and no record was offered the earlier builds' seeds: a deleted one stays out, a new kind comes in", () => {
		const offer = seedsToOffer(SEEDS, absent, [{ kind: "testnet", chainId: 100 }])
		expect(kinds(offer?.add)).toEqual(["mainnet"])
		expect(offer?.offered).toEqual(["local", "testnet"])
	})

	test("a not-offered seed whose kind a row holds on another chain is recorded, not added", () => {
		const offer = seedsToOffer(SEEDS, recorded("local"), [
			{ kind: "local", chainId: 0 },
			{ kind: "testnet", chainId: 999 },
		])
		expect(kinds(offer?.add)).toEqual(["mainnet"])
		expect(offer?.offered).toEqual(["local", "testnet"])
	})

	test("a custom row on a new seed's chain holds it: recorded, never a second row on the chain", () => {
		const offer = seedsToOffer(SEEDS, absent, [
			{ kind: "testnet", chainId: 100 },
			{ kind: "local", chainId: 0 },
			{ kind: "custom", chainId: 200 },
		])
		expect(offer?.add).toEqual([])
		expect(offer?.offered).toEqual(["local", "mainnet", "testnet"])
	})

	test("a recorded seed with no row was deleted and is not added again", () => {
		expect(seedsToOffer(SEEDS, recorded("testnet", "local", "mainnet"), [{ kind: "testnet", chainId: 100 }])?.add).toEqual([])
	})

	test("a corrupt record on a profile with rows adds and records nothing", () => {
		expect(seedsToOffer(SEEDS, { kind: "corrupt" }, [{ kind: "testnet", chainId: 100 }])).toBeNull()
	})

	test("a profile with networks announces a seed added to it and one a row of its kind holds, and keeps the record's", () => {
		const added = seedsToOffer(SEEDS, absent, [{ kind: "testnet", chainId: 100 }])
		expect(added?.announce).toEqual(["mainnet"])
		const held = seedsToOffer(SEEDS, { kind: "valid", value: { offered: ["testnet"], announce: ["mainnet"] } }, [
			{ kind: "testnet", chainId: 100 },
			{ kind: "local", chainId: 999 },
		])
		expect(held?.announce).toEqual(["local", "mainnet"])
	})

	test("a custom row on a seed's chain announces nothing, and neither does an empty profile", () => {
		const custom = seedsToOffer(SEEDS, absent, [
			{ kind: "testnet", chainId: 100 },
			{ kind: "custom", chainId: 200 },
		])
		expect(custom?.announce).toEqual([])
		expect(seedsToOffer(SEEDS, { kind: "valid", value: { offered: [], announce: ["mainnet"] } }, [])?.announce).toEqual([])
	})

	test("a record is stored sorted, deduplicated, and with no announce key while it names nothing", () => {
		expect(normalizeSeedOffers({ offered: ["testnet", "local", "testnet"], announce: [] })).toEqual({ offered: ["local", "testnet"] })
		expect(sameSeedOffers({ offered: ["testnet", "local"] }, { offered: ["local", "testnet"], announce: [] })).toBe(true)
		expect(sameSeedOffers({ offered: ["local"] }, { offered: ["local"], announce: ["mainnet"] })).toBe(false)
	})

	test("pins: the pre-record kinds, and one seed per kind and per chain", () => {
		// Every build before the record seeded exactly these. Adding a default never edits this list:
		// a kind added here would be withheld from every profile made before the record.
		expect(KINDS_SEEDED_BEFORE_RECORD).toEqual(["testnet", "local"])
		expect(new Set(DEFAULT_SEEDS.map((s) => s.kind)).size).toBe(DEFAULT_SEEDS.length)
		expect(new Set(DEFAULT_SEEDS.map((s) => s.chainId)).size).toBe(DEFAULT_SEEDS.length)
	})
})
