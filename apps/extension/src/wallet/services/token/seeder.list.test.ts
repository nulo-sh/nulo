/**
 * `TokenSeeder` against a list that changes under it: a new signed list fences every pass that
 * read the old one, a commit already persisting still lands, and only a preview that passed
 * under the current pins lets the connect window name a token.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { fakeBrowser } from "@webext-core/fake-browser"
import type { DefaultTokenSeed } from "./default-tokens"
import { type SeedPreview, seedPins } from "./seeder"
import { CHAIN_ID, KEY, SEED, disposeSeeders, goodPreview, makeSeeder, readMarker, skipBackoff } from "./seeder.harness"

const REPINNED: DefaultTokenSeed = { ...SEED, expectedSymbol: "cUSDx" }

beforeEach(async () => {
	await fakeBrowser.reset()
})

afterEach(() => {
	disposeSeeders()
	vi.useRealTimers()
})

/** A seeder over a list the test swaps, versioned like production: release + list sequence. */
function listSeeder(overrides: Parameters<typeof makeSeeder>[0] = {}) {
	const list = { seeds: [SEED] as DefaultTokenSeed[], sequence: 1 }
	const made = makeSeeder({
		getSeeds: vi.fn(async () => list.seeds),
		getVersion: () => `1.0.0+${list.sequence}`,
		...overrides,
	})
	const publish = (seeds: DefaultTokenSeed[]) => {
		list.seeds = seeds
		list.sequence += 1
		return made.seeder.listChanged()
	}
	return { ...made, list, publish }
}

/** A preview that parks until the test releases it. */
function heldPreview() {
	const held: { release?: (p: SeedPreview) => void } = {}
	const preview = vi.fn().mockImplementationOnce(
		() =>
			new Promise<SeedPreview>((resolve) => {
				held.release = resolve
			}),
	)
	return { preview, held }
}

describe("TokenSeeder — a new list while a pass is in flight", () => {
	test("a re-pin during a held preview writes nothing from the old pins; the token seeds under the new ones", async () => {
		vi.useFakeTimers({ toFake: ["Date"] })
		const { preview, held } = heldPreview()
		preview.mockImplementation(async () => ({ ...goodPreview(), symbol: "cUSDx" }))
		const { seeder, deps, publish } = listSeeder({ preview })

		const pass = seeder.run()
		await vi.waitFor(() => expect(held.release).toBeDefined())
		const changed = publish([REPINNED])
		held.release?.(goodPreview())
		await Promise.all([pass, changed])
		expect(deps.persist).not.toHaveBeenCalled()
		expect((await readMarker())[KEY].outcome).toBeUndefined()

		skipBackoff()
		void seeder.run()
		await vi.waitFor(() => expect(deps.persist).toHaveBeenCalledTimes(1))
		expect(deps.persist).toHaveBeenCalledWith(expect.objectContaining({ symbol: "cUSDx" }))
		await vi.waitFor(async () => expect((await readMarker())[KEY].verifiedPins).toBe(seedPins(REPINNED)))
	})

	test("a delist during a held preview writes nothing, and no later pass seeds the token", async () => {
		vi.useFakeTimers({ toFake: ["Date"] })
		const { preview, held } = heldPreview()
		const { seeder, deps, publish } = listSeeder({ preview })

		const pass = seeder.run()
		await vi.waitFor(() => expect(held.release).toBeDefined())
		const changed = publish([])
		held.release?.(goodPreview())
		await Promise.all([pass, changed])

		skipBackoff()
		await seeder.run()
		await seeder.run()
		expect(preview).toHaveBeenCalledTimes(1)
		expect(deps.persist).not.toHaveBeenCalled()
		expect((await seeder.getStatus(CHAIN_ID)).entries).toEqual([])
	})

	test("a list change during a held persist: the row lands, and the token has no name under the new pins", async () => {
		const persisting: { release?: () => void } = {}
		const persist = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					persisting.release = resolve
				}),
		)
		const { seeder, list, publish } = listSeeder({ persist })

		const pass = seeder.run()
		await vi.waitFor(() => expect(persisting.release).toBeDefined())
		const changed = publish([REPINNED])
		persisting.release?.()
		await Promise.all([pass, changed])

		expect(persist).toHaveBeenCalledTimes(1)
		expect((await readMarker())[KEY]).toMatchObject({ outcome: "seeded", verifiedPins: seedPins(SEED) })
		expect(await seeder.verifiedSeeds("p1", CHAIN_ID)).toEqual([])
		list.seeds = [SEED]
		expect(await seeder.verifiedSeeds("p1", CHAIN_ID)).toEqual([SEED])
	})
})

describe("TokenSeeder — verified pins and list versions", () => {
	test("a token already in the wallet is marked seeded but never verified, so the list cannot name it", async () => {
		const { seeder } = listSeeder({ isTokenPresent: vi.fn(async () => true) })
		await seeder.run()
		const entry = (await readMarker())[KEY]
		expect(entry.outcome).toBe("seeded")
		expect(entry.verifiedPins).toBeUndefined()
		expect(await seeder.verifiedSeeds("p1", CHAIN_ID)).toEqual([])
	})

	test("a default rejected under one list is retried once a new list arrives", async () => {
		const preview = vi.fn(async (): Promise<SeedPreview> => ({ ...goodPreview(), symbol: "EVIL" }))
		const { seeder, deps, publish } = listSeeder({ preview })
		await seeder.run()
		expect((await readMarker())[KEY].rejectedAtVersion).toBe("1.0.0+1")
		await seeder.run()
		expect(preview).toHaveBeenCalledTimes(1)

		preview.mockImplementation(async () => goodPreview())
		await publish([SEED])
		await vi.waitFor(() => expect(deps.persist).toHaveBeenCalledTimes(1))
		expect(preview).toHaveBeenCalledTimes(2)
	})
})
