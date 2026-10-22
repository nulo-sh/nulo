import { describe, expect, test, vi } from "vitest"
import { ScopeViolationError } from "@nulo/extension-messaging/errors"
import { MemoryStorageArea } from "@nulo/wallet-core/storage"
import { isSealedText } from "@/wallet/storage/sealed-entity-storage"
import { rowKeysForEveryProfile } from "@/wallet/storage/sealed-entity-storage.testing"
import { sealedEntityStorage } from "@/wallet/storage/stores"
import {
	APP_REGISTRATIONS_PER_CHAIN,
	DAPP_REGISTRATIONS_PER_CHAIN,
	RegistrationAllowance,
	REGISTRATIONS_USED_UP,
} from "./registration-allowance"

const APP = "https://app.example"
const KEY = "nulo:core:dappRegistrations@p1"

/** One key for every profile, as an unlocked worker holds it. */
const ROW_KEYS = await rowKeysForEveryProfile()

function setup() {
	const area = new MemoryStorageArea()
	const rows = sealedEntityStorage("dappRegistrations", area, ROW_KEYS.rowKeys)
	const allowance = new RegistrationAllowance(rows)
	// biome-ignore lint/suspicious/noExplicitAny: the counts are asserted field by field
	const stored = async (profileId = "p1"): Promise<any> => rows.get(profileId)
	const spend = async (times: number, origin = APP, chainId = 1, profileId = "p1") => {
		for (let i = 0; i < times; i++) await allowance.admit(profileId, chainId, origin)
	}
	const refusal = (origin = APP, chainId = 1, profileId = "p1") =>
		allowance.admit(profileId, chainId, origin).then(
			() => undefined,
			(e: unknown) => e,
		)
	return { area, allowance, stored, spend, refusal }
}

function expectUsedUp(error: unknown) {
	expect(error).toBeInstanceOf(ScopeViolationError)
	expect((error as Error).message).toBe(REGISTRATIONS_USED_UP)
}

describe("RegistrationAllowance", () => {
	test(`an app is admitted ${APP_REGISTRATIONS_PER_CHAIN} times on a chain, then refused with nothing written`, async () => {
		const { spend, refusal, stored } = setup()
		await spend(APP_REGISTRATIONS_PER_CHAIN)
		const before = await stored()
		expectUsedUp(await refusal())
		expect(await stored()).toEqual(before)
		expect(before).toEqual({ "1": { total: APP_REGISTRATIONS_PER_CHAIN, apps: { [APP]: APP_REGISTRATIONS_PER_CHAIN } } })
	})

	test(`apps together are admitted ${DAPP_REGISTRATIONS_PER_CHAIN} times on a chain, then a fresh app is refused`, async () => {
		const { spend, refusal } = setup()
		const apps = DAPP_REGISTRATIONS_PER_CHAIN / APP_REGISTRATIONS_PER_CHAIN
		for (let i = 0; i < apps; i++) await spend(APP_REGISTRATIONS_PER_CHAIN, `https://app${i}.example`)
		expectUsedUp(await refusal("https://fresh.example"))
	})

	test("another chain and another profile keep their own counts", async () => {
		const { spend, refusal } = setup()
		await spend(APP_REGISTRATIONS_PER_CHAIN)
		expect(await refusal(APP, 2)).toBeUndefined()
		expect(await refusal(APP, 1, "p2")).toBeUndefined()
	})

	test("two calls racing for the last registration admit exactly one", async () => {
		const { allowance, spend, stored } = setup()
		await spend(APP_REGISTRATIONS_PER_CHAIN - 1)
		const outcomes = await Promise.allSettled([allowance.admit("p1", 1, APP), allowance.admit("p1", 1, APP)])
		expect(outcomes.map((o) => o.status).sort()).toEqual(["fulfilled", "rejected"])
		expect((await stored())["1"].total).toBe(APP_REGISTRATIONS_PER_CHAIN)
	})

	test("a failed storage read refuses the call and keeps the stored counts", async () => {
		const { area, spend, refusal, stored } = setup()
		await spend(2)
		vi.spyOn(area, "get").mockImplementationOnce(async () => {
			throw new Error("storage unavailable")
		})
		expect(await refusal()).toBeInstanceOf(Error)
		expect(await stored()).toEqual({ "1": { total: 2, apps: { [APP]: 2 } } })
	})

	test("a value that does not parse reads as no registrations; a chain's bad entry drops alone", async () => {
		const { area, spend, stored } = setup()
		await area.set({ [KEY]: "not json" })
		await spend(1)
		expect(await stored()).toEqual({ "1": { total: 1, apps: { [APP]: 1 } } })

		await area.set({ [KEY]: JSON.stringify({ "1": { total: -1, apps: {} }, "2": { total: 3, apps: { [APP]: 3 } } }) })
		await spend(1)
		expect(await stored()).toEqual({ "1": { total: 1, apps: { [APP]: 1 } }, "2": { total: 3, apps: { [APP]: 3 } } })
	})

	test("clearChain removes one chain's counts and purgeProfile one profile's", async () => {
		const { allowance, spend, stored } = setup()
		await spend(2, APP, 1)
		await spend(1, APP, 2)
		await spend(1, APP, 1, "p2")
		await allowance.clearChain("p1", 1)
		expect(await stored()).toEqual({ "2": { total: 1, apps: { [APP]: 1 } } })
		await allowance.clearChain("p1", 2)
		expect(await stored()).toBeUndefined()
		await allowance.purgeProfile("p2")
		expect(await stored("p2")).toBeUndefined()
	})

	test("a profile's plaintext counts seal at its unlock and read the same; a write seals too", async () => {
		const { area, allowance, spend, stored } = setup()
		const counts = { "1": { total: 2, apps: { [APP]: 2 } } }
		await area.set({ [KEY]: JSON.stringify(counts) })
		expect(await allowance.sealLegacy("p1")).toBe(1)
		expect(isSealedText((await area.get(KEY))[KEY])).toBe(true)
		expect(await stored()).toEqual(counts)
		await spend(1, APP, 1, "p2")
		expect(isSealedText((await area.get("nulo:core:dappRegistrations@p2"))["nulo:core:dappRegistrations@p2"])).toBe(true)
	})
})
