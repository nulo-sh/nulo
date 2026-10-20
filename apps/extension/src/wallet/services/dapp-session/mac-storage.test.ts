import { describe, expect, test } from "vitest"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { TestRowKeys } from "@/wallet/storage/sealed-entity-storage.testing"
import { sealedEntityStorage } from "@/wallet/storage/stores"
import { DappSessionMacStorage } from "./mac-storage"
import type { DappSession } from "./spec"

const logger = { log: () => {} } as never
const ROOT = "nulo:core:dappSessions"

function row(id: string, profileId: string): DappSession {
	return {
		id,
		profileId,
		chainId: "1",
		dappMetadata: { url: `https://${id}.xyz` },
		permissions: [],
		accounts: [],
		confirmationLevel: 0 as unknown as DappSession["confirmationLevel"],
		expiry: Date.now() + 1_000_000,
	}
}

async function makeStore() {
	const api = new FakeBrowserApi()
	api.reset()
	// Mirror production: the sealed store validates via DappSessionSchema.
	const rowKeys = await new TestRowKeys().unlock("active", "gone")
	const inner = sealedEntityStorage("dappSessions", api.storage.local, rowKeys.source)
	const kActive = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])
	const kGone = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])
	const locked = new Set<string>()
	const keyFor = async (pid: string): Promise<CryptoKey> => {
		if (locked.has(pid)) throw new Error("Profile locked")
		return pid === "active" ? kActive : kGone
	}
	return { api, inner, store: new DappSessionMacStorage(inner, keyFor, logger), locked, rowKeys }
}

describe("DappSessionMacStorage.rowsForProfile (profile-deletion cascade)", () => {
	test("returns an INACTIVE profile's rows the MAC view HIDES — with their true storageId", async () => {
		const { store, locked } = await makeStore()
		await store.set("s-active", row("s-active", "active"))
		await store.set("s-gone", row("s-gone", "gone"))

		locked.add("gone") // now inactive: MAC key underivable
		expect((await store.getValues()).map((r) => r.id)).toEqual(["s-active"]) // s-gone HIDDEN by the MAC view

		const { rows } = await store.rowsForProfile("gone")
		expect(rows.map((r) => r.storageId)).toEqual(["s-gone"])
		await store.delete(rows[0]?.storageId ?? "")
		expect(await store.rowsForProfile("gone")).toEqual({ rows: [], unopened: [] }) // physically purged
	})

	test("names a profile's sealed rows it cannot open, so a delete by profile still removes them", async () => {
		const { store, rowKeys } = await makeStore()
		await store.set("s-gone", row("s-gone", "gone"))
		rowKeys.drop("gone") // a fresh worker that never opened the profile

		expect(await store.getValues()).toEqual([])
		expect(await store.rowsForProfile("gone")).toEqual({ rows: [], unopened: ["s-gone"] })
	})

	test("(gap 1) finds a SCHEMA-INVALID row that the codec keeps-but-hides", async () => {
		const { api, store } = await makeStore()
		// A row with profileId=P but a missing required field: the codec KEEPS it
		// (dev's policy) but HIDES it from getValues — a profile purge must still see it.
		await api.storage.local.set({ [`${ROOT}@bad`]: JSON.stringify({ id: "bad", profileId: "gone" /* no chainId etc. */ }) })
		expect((await store.getValues()).some((r) => r.id === "bad")).toBe(false) // hidden by codec
		expect((await store.rowsForProfile("gone")).rows.map((r) => r.storageId)).toEqual(["bad"]) // still found for purge
	})

	test("(gap 2) deletes by the STORAGE KEY, not the row's self-reported id (alias can't survive)", async () => {
		const { api, store } = await makeStore()
		await store.set("s1", row("s1", "gone"))
		// Copy the valid signed row to a DIFFERENT key; its embedded id stays "s1".
		const raw = (await api.storage.local.get(`${ROOT}@s1`))[`${ROOT}@s1`]
		await api.storage.local.set({ [`${ROOT}@alias`]: raw })

		const { rows, unopened } = await store.rowsForProfile("gone")
		// Both keys surface with their TRUE storageId (not the shared embedded "s1"); the copy's seal
		// binds the key it was written under, so it opens nowhere else.
		expect(rows.map((r) => r.storageId)).toEqual(["s1"])
		expect(unopened).toEqual(["alias"])
		for (const id of [...rows.map((r) => r.storageId), ...unopened]) await store.delete(id)
		expect(await store.rowsForProfile("gone")).toEqual({ rows: [], unopened: [] }) // alias removed too
	})
})
