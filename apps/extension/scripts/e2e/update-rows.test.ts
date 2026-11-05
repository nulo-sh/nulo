import { describe, expect, test } from "vitest"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { FPC_STORAGE_ROOT, FpcType } from "@/wallet/services/fpc/spec"
import type { FeePicks } from "@/wallet/services/ui-preference/spec"
import { committedBaseline, signGoldens, wire } from "@/wallet/storage/stored-shapes/baseline"
import { allowedPicks } from "../../tests/e2e/fixtures/update/release-reads"
import { REFUSALS, unofferedSponsorIds, updateProblems } from "../../tests/e2e/fixtures/update/verify"
import { SPONSOR_FPC_ADDRESS } from "../../tests/e2e/helpers/protocol-fpc-pins"

/** Every committed golden of `variant`, as `chrome.storage.local` holds it, split into the boot's
 *  refusals and the rest. */
async function storedGoldens(variant: "full" | "minimal"): Promise<{ held: Record<string, unknown>; refusals: Record<string, unknown> }> {
	const signed = (await signGoldens(committedBaseline().goldens)).filter((golden) => golden.id.endsWith(`.${variant}`))
	const stored = (refusal: boolean) =>
		Object.fromEntries(signed.filter((golden) => REFUSALS.has(golden.shape) === refusal).map((golden) => [golden.key, wire(golden)]))
	return { held: stored(false), refusals: stored(true) }
}

describe("updateProblems", () => {
	test.each(["full", "minimal"] as const)("finds nothing in the %s goldens, read as stored, or in a fixture key", async (variant) => {
		const stored = { ...(await storedGoldens(variant)).held, "nulo:e2e:proof-gate": "held" }
		expect(await updateProblems(stored, stored)).toEqual([])
	})

	test("names a lost key, a refusal the boot wrote, an unclaimed key and a row its read refuses", async () => {
		const { held: before, refusals } = await storedGoldens("minimal")
		const outbox = Object.keys(before).find((key) => key.startsWith("nulo:core:incoming-balance-outbox@")) as string
		const blocked = "nulo:core:account-integrity-blocked@b04e6d18"
		const after: Record<string, unknown> = {
			...before,
			[blocked]: refusals[blocked],
			"nulo:core:accounts@x": "{not json",
			"nulo:core:contacts@x": JSON.stringify({ profileId: "b04e6d18", sealed: 1 }),
			"nulo:unknown": 1,
		}
		delete after["nulo:core:profiles@b04e6d18"]
		delete after[outbox]
		const others = [
			"nulo:core:account-integrity-blocked@b04e6d18: the boot refused what it found",
			"nulo:core:accounts@x: the accounts read returns nothing",
			"nulo:core:contacts@x: the contacts read returns nothing",
			"nulo:unknown: no registered shape claims it",
		]
		const lost = (keys: string[]) => keys.sort().map((key) => `${key}: lost in the update`)
		// The outbox root is keyed, so its rows are counted rather than matched by key.
		expect(await updateProblems(before, after)).toEqual([
			...lost(["nulo:core:profiles@b04e6d18"]),
			"incomingBalanceOutbox: 1 row(s) lost in the update",
			...others,
		])
		// A drained outbox row is excused only where the caller asserts the balances it refreshes.
		expect(await updateProblems(before, after, { balancesAsserted: true })).toEqual([
			...lost(["nulo:core:profiles@b04e6d18"]),
			...others,
		])
	})

	test("excuses a listed sponsor's fee payer row and no other lost key", async () => {
		const { held: before } = await storedGoldens("minimal")
		const fpc = Object.keys(before).find((key) => key.startsWith(`${FPC_STORAGE_ROOT}@`)) as string
		const profile = "nulo:core:profiles@b04e6d18"
		const after = { ...before }
		delete after[fpc]
		delete after[profile]
		const lost = (keys: string[]) => keys.map((key) => `${key}: lost in the update`)
		expect(await updateProblems(before, after)).toEqual(lost([fpc, profile].sort()))
		expect(await updateProblems(before, after, { unofferedSponsors: [fpc.slice(FPC_STORAGE_ROOT.length + 1)] })).toEqual(
			lost([profile]),
		)
		// The id names a fee payer row only: another root's row under it is still lost.
		expect(await updateProblems(before, after, { unofferedSponsors: ["b04e6d18"] })).toEqual(lost([fpc, profile].sort()))
	})
})

/** A custom network's chain id, derived from its node and on no list. */
const CUSTOM_CHAIN = 1685367866

describe("unofferedSponsorIds", () => {
	test("lists the canonical sponsor on a chain that offers none, matched as the wallet matches it", () => {
		const row = (id: string, chainId: number, address = SPONSOR_FPC_ADDRESS, type = FpcType.DefaultSponsoredFpc) => ({
			id,
			chainId,
			type,
			address,
		})
		const hex = SPONSOR_FPC_ADDRESS.slice(2)
		expect(
			unofferedSponsorIds([
				row("custom", CUSTOM_CHAIN),
				row("mainnet", CHAIN_IDS.MAINNET, `0x${hex.toUpperCase()}`),
				row("testnet", CHAIN_IDS.TESTNET),
				row("local", CHAIN_IDS.SANDBOX),
				row("prefix", CUSTOM_CHAIN, `0X${hex}`),
				row("hand-added", CUSTOM_CHAIN, `0x${"1".repeat(64)}`),
				row("private", CUSTOM_CHAIN, SPONSOR_FPC_ADDRESS, FpcType.PrivateFpc),
			]),
		).toEqual(["custom", "mainnet"])
	})
})

describe("allowedPicks", () => {
	const SPONSOR = "sponsor"
	const picks: FeePicks = {
		app: { "0xa1": { type: "fpc", fpc: { id: SPONSOR, isProtocol: true } }, "0xa2": { type: "fpc", fpc: { id: "other" } } },
		send: { "0xa1": { private: { type: "fpc", fpc: { id: SPONSOR } }, public: { type: "fj" } } },
	}
	const forgotten: FeePicks = { app: { "0xa2": { type: "fpc", fpc: { id: "other" } } }, send: { "0xa1": { public: { type: "fj" } } } }

	test("allows a listed sponsor's picks forgotten only once its row is gone, and nothing else", () => {
		expect(allowedPicks(picks, [], {})).toEqual([picks])
		expect(allowedPicks(picks, [SPONSOR], { [`${FPC_STORAGE_ROOT}@${SPONSOR}`]: "row" })).toEqual([picks])
		expect(allowedPicks(picks, [SPONSOR], {})).toEqual([picks, forgotten])
		expect(allowedPicks(picks, [SPONSOR], {})).not.toContainEqual({ ...forgotten, app: {} })
	})
})
