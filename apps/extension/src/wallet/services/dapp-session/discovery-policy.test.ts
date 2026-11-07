import { describe, expect, test } from "vitest"
import { MemoryStorageArea } from "@nulo/wallet-core/storage"
import { WalletLockedError } from "@/wallet/services/profile/wallet-locked-error"
import { isSealedText } from "@/wallet/storage/sealed-entity-storage"
import { TestRowKeys } from "@/wallet/storage/sealed-entity-storage.testing"
import { sealedEntityStorage } from "@/wallet/storage/stores"
import { CHECK_REFUSALS_KEPT, DiscoveryPolicy } from "./discovery-policy"

const SITE = "https://app.example"
const OTHER = "https://other.example"
const KEY = "nulo:core:discoveryPolicy@p1"
const live = () => {}

async function setup() {
	const area = new MemoryStorageArea()
	const keys = await new TestRowKeys().unlock("p1")
	const rows = sealedEntityStorage("discoveryPolicy", area, keys.source)
	const policy = new DiscoveryPolicy(rows)
	const stored = async () => (await area.get(KEY))[KEY]
	const opened = () => rows.get("p1")
	return { area, keys, policy, stored, opened }
}

describe("DiscoveryPolicy", () => {
	test("no row is off; a sealed on-row allows every site and is sealed at rest", async () => {
		const { policy, stored } = await setup()
		expect(await policy.allows("p1", SITE)).toBe(false)
		expect(await policy.isOn("p1")).toBe(false)
		await policy.set("p1", true, live)
		expect(await policy.allows("p1", SITE)).toBe(true)
		expect(await policy.isOn("p1")).toBe(true)
		expect(isSealedText(await stored())).toBe(true)
	})

	test("a plaintext on-row, as a storage writer would put it, is off", async () => {
		const { area, policy } = await setup()
		await area.set({ [KEY]: JSON.stringify({ everySite: true, checkRefused: [] }) })
		expect(await policy.allows("p1", SITE)).toBe(false)
		expect(await policy.isOn("p1")).toBe(false)
	})

	test("a sealed row that does not parse is off, and turning on writes over it", async () => {
		const { policy, keys, area } = await setup()
		const rows = sealedEntityStorage("discoveryPolicy", area, keys.source)
		await rows.set("p1", { everySite: true, checkRefused: [], extra: 1 })
		expect(await policy.allows("p1", SITE)).toBe(false)
		await policy.set("p1", true, live)
		expect(await rows.get("p1")).toEqual({ everySite: true, checkRefused: [] })
	})

	test("with no row keys, a sealed on-row reads off and every write refuses", async () => {
		const { policy, keys, stored } = await setup()
		await policy.set("p1", true, live)
		const before = await stored()
		keys.drop("p1")
		expect(await policy.allows("p1", SITE)).toBe(false)
		await expect(policy.set("p1", true, live)).rejects.toBeInstanceOf(WalletLockedError)
		await policy.recordCheckRefusal("p1", SITE, live)
		expect(await stored()).toBe(before)
	})

	test("a refusal while on refuses that site only; while off it writes nothing", async () => {
		const { policy, stored } = await setup()
		await policy.recordCheckRefusal("p1", SITE, live)
		expect(await stored()).toBeUndefined()
		await policy.set("p1", true, live)
		await policy.recordCheckRefusal("p1", SITE, live)
		expect(await policy.allows("p1", SITE)).toBe(false)
		expect(await policy.allows("p1", OTHER)).toBe(true)
		expect(await policy.isOn("p1")).toBe(true)
	})

	test(`the newest ${CHECK_REFUSALS_KEPT} refusals are kept; a repeat moves to the newest`, async () => {
		const { policy, opened } = await setup()
		await policy.set("p1", true, live)
		const sites = Array.from({ length: CHECK_REFUSALS_KEPT }, (_, i) => `https://s${i}.example`)
		for (const site of sites) await policy.recordCheckRefusal("p1", site, live)
		await policy.recordCheckRefusal("p1", sites[0], live)
		await policy.recordCheckRefusal("p1", OTHER, live)
		expect(await opened()).toEqual({ everySite: true, checkRefused: [...sites.slice(2), sites[0], OTHER] })
		expect(await policy.allows("p1", sites[1])).toBe(true)
		expect(await policy.allows("p1", sites[0])).toBe(false)
	})

	test("turning on again keeps the refusals; off then on starts with none", async () => {
		const { policy, opened, stored } = await setup()
		await policy.set("p1", true, live)
		await policy.recordCheckRefusal("p1", SITE, live)
		await policy.set("p1", true, live)
		expect(await policy.allows("p1", SITE)).toBe(false)
		await policy.set("p1", false, live)
		expect(await stored()).toBeUndefined()
		await policy.set("p1", true, live)
		expect(await opened()).toEqual({ everySite: true, checkRefused: [] })
	})

	test("a refusal and an off started together end off", async () => {
		const { policy, stored } = await setup()
		await policy.set("p1", true, live)
		await Promise.all([policy.recordCheckRefusal("p1", SITE, live), policy.set("p1", false, live)])
		expect(await stored()).toBeUndefined()
	})

	test("a write whose fence fails writes nothing", async () => {
		const { policy, stored } = await setup()
		const dead = () => {
			throw new Error("profile p1 deleted")
		}
		await expect(policy.set("p1", true, dead)).rejects.toThrow("deleted")
		expect(await stored()).toBeUndefined()
		await policy.set("p1", true, live)
		const before = await stored()
		await expect(policy.recordCheckRefusal("p1", SITE, dead)).rejects.toThrow("deleted")
		await expect(policy.set("p1", false, dead)).rejects.toThrow("deleted")
		expect(await stored()).toBe(before)
	})

	test("purgeProfile deletes the profile's row only", async () => {
		const { area, keys, policy, stored } = await setup()
		await keys.unlock("p2")
		await policy.set("p1", true, live)
		await policy.set("p2", true, live)
		await policy.purgeProfile("p1")
		expect(await stored()).toBeUndefined()
		expect(await policy.isOn("p2")).toBe(true)
		expect(Object.keys(await area.get())).toEqual(["nulo:core:discoveryPolicy@p2"])
	})
})
