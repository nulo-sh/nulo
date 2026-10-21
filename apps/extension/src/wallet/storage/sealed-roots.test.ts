import { describe, expect, test } from "vitest"
import type { MinimalStorageArea } from "@nulo/wallet-core/storage"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { purgeSealedRowsOf } from "./sealed-roots"
import { TestRowKeys } from "./sealed-entity-storage.testing"
import { sealedEntityStorage } from "./stores"

const contact = (id: string, profileId: string) => ({ id, profileId, name: "n", address: "0x01", abbr: "N" })

async function seeded() {
	const api = new FakeBrowserApi()
	api.reset()
	const area = api.storage.local
	const keys = await new TestRowKeys().unlock("p", "q")
	await sealedEntityStorage("contacts", area, keys.source).set("c-1", contact("c-1", "p"))
	await sealedEntityStorage("contacts", area, keys.source).set("c-2", contact("c-2", "q"))
	await area.set({
		"nulo:core:contacts@c-3": JSON.stringify(contact("c-3", "p")),
		"nulo:core:dappSessions@s-1": JSON.stringify({ id: "s-1", profileId: "p" }),
		"nulo:core:tokens@t-1": JSON.stringify({ id: "t-1", profileId: "p" }),
	})
	return area
}

describe("purgeSealedRowsOf", () => {
	test("removes every sealed root's row of the profile, sealed or not, with no keys, and nothing else", async () => {
		const area = await seeded()

		expect(await purgeSealedRowsOf(area, "p")).toBe(3)
		expect(Object.keys(await area.get()).sort()).toEqual(["nulo:core:contacts@c-2", "nulo:core:tokens@t-1"])
		expect(await purgeSealedRowsOf(area, "p")).toBe(0)
	})

	test("spares a row rewritten after its scan", async () => {
		const area = await seeded()
		const rewritten = JSON.stringify(contact("c-3", "q"))
		let scanned = false
		const racing: MinimalStorageArea = {
			get: async (keys?: string | string[] | null) => {
				if (keys === undefined && !scanned) {
					scanned = true
					const all = await area.get()
					await area.set({ "nulo:core:contacts@c-3": rewritten })
					return all
				}
				return area.get(keys as string)
			},
			set: (items) => area.set(items),
			remove: (keys) => area.remove(keys),
		}

		expect(await purgeSealedRowsOf(racing, "p")).toBe(2)
		expect((await area.get("nulo:core:contacts@c-3"))["nulo:core:contacts@c-3"]).toBe(rewritten)
	})
})
