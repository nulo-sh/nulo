/**
 * `UiPreferenceService` over a real sealed store and real row keys: the unlock's conversion of the
 * pre-seal maps, and every class of refusal (another profile, a lock, a session that moved during
 * a read or before a write's commit, a deletion begun).
 */
import { InvalidWalletArgumentsError } from "@nulo/extension-messaging/errors"
import type { BrowserApi } from "@nulo/wallet-core/ports"
import { type MinimalStorageArea, MemoryStorageArea } from "@nulo/wallet-core/storage"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { feePicksKey, pinnedTokensKey, sendFeePicksKey } from "@/utils/profile-ui-keys"
import { isSealedText } from "@/wallet/storage/sealed-entity-storage"
import { readsKey } from "@/wallet/storage/sealed-entity-storage.testing"
import { startUiPreferences } from "./service.harness"

const A = `0x${"a1".repeat(32)}`
const B = `0x${"b2".repeat(32)}`
const ACCOUNT = `0x${"cd".repeat(32)}`
const APP = { [ACCOUNT]: { type: "fpc", title: "Sponsored", fpc: { id: "fpc-1", isProtocol: true } } }
const SEND = { [ACCOUNT]: { private: { type: "fpc", fpc: { id: "fpc-1", name: "Sponsor" } }, public: { type: "fj" } } }

/** `area` behind a `BrowserApi`; `arm` runs a hook once, after the next read naming `key`. */
function hooked(area: MinimalStorageArea): { api: BrowserApi; arm(key: string, hook: () => void): void } {
	let armed: { key: string; hook: () => void } | undefined
	const local = {
		get: async (keys?: string | string[]) => {
			const got = await area.get(keys)
			const fire = armed && readsKey(keys, armed.key) ? armed.hook : undefined
			if (fire) {
				armed = undefined
				fire()
			}
			return got
		},
		set: (items: Record<string, unknown>) => area.set(items),
		remove: (keys: string | string[]) => area.remove(keys),
	}
	return { api: { storage: { local } } as unknown as BrowserApi, arm: (key, hook) => (armed = { key, hook }) }
}

/** Waits for the unlock's conversion to seal every key named. */
const sealed = (area: MemoryStorageArea, ...keys: string[]) =>
	vi.waitFor(() => {
		for (const key of keys) expect(isSealedText(area.data.get(key))).toBe(true)
	})

beforeEach(() => {
	vi.spyOn(console, "debug").mockImplementation(() => {})
})

afterEach(() => vi.restoreAllMocks())

describe("the unlock's conversion", () => {
	test("seals each pre-seal map in place at the profile's unlock, and every read returns what it read before", async () => {
		const area = new MemoryStorageArea().seed({
			[pinnedTokensKey("p")]: { "7": [A.toUpperCase(), "junk"] },
			[feePicksKey("p")]: APP,
			[sendFeePicksKey("p")]: SEND,
			[pinnedTokensKey("q")]: { "7": [B] },
		})
		const { service, session } = await startUiPreferences({ storage: { local: area } } as unknown as BrowserApi)
		await session.keys.unlock("p")
		session.lock()
		const before = { pins: { "7": [A] }, picks: { app: APP, send: SEND } }

		await session.unlock("p")
		expect(await service.getPinnedTokens("p")).toEqual(before.pins)
		await sealed(area, pinnedTokensKey("p"), feePicksKey("p"), sendFeePicksKey("p"))

		expect(await service.getPinnedTokens("p")).toEqual(before.pins)
		expect(await service.getFeePicks("p")).toEqual(before.picks)
		expect(JSON.stringify([...area.data])).not.toContain(ACCOUNT.slice(2))
		expect(area.data.get(pinnedTokensKey("q"))).toEqual({ "7": [B] })
	})
})

describe("reads and writes", () => {
	test("a write seals the profile's row, and the next read returns it sanitized", async () => {
		const { service, session, area } = await startUiPreferences()
		await session.unlock("p")

		expect(await service.setPinnedTokens("p", { "7": [B.toUpperCase(), A, "0xzz"], "-1": [A] })).toBe(true)
		expect(await service.saveFeePick("p", { kind: "app", address: ACCOUNT, pick: APP[ACCOUNT] as never })).toBe(true)
		expect(await service.saveFeePick("p", { kind: "send", address: ACCOUNT, side: "public", pick: { type: "fj" } })).toBe(true)

		expect(await service.getPinnedTokens("p")).toEqual({ "7": [B, A] })
		expect(await service.getFeePicks("p")).toEqual({ app: APP, send: { [ACCOUNT]: { public: { type: "fj" } } } })
		const stored = await area.get()
		for (const key of [pinnedTokensKey("p"), feePicksKey("p"), sendFeePicksKey("p")]) expect(isSealedText(stored[key])).toBe(true)
	})

	test("forgetting an FPC drops its picks from both maps in one write", async () => {
		const area = new MemoryStorageArea().seed({ [feePicksKey("p")]: APP, [sendFeePicksKey("p")]: SEND })
		const { service, session } = await startUiPreferences({ storage: { local: area } } as unknown as BrowserApi)
		await session.unlock("p")
		await sealed(area, feePicksKey("p"), sendFeePicksKey("p"))
		const set = vi.spyOn(area, "set")

		expect(await service.saveFeePick("p", { kind: "forgetFpc", fpcId: "fpc-1" })).toBe(true)

		expect(await service.getFeePicks("p")).toEqual({ app: {}, send: { [ACCOUNT]: { public: { type: "fj" } } } })
		expect(set.mock.calls.filter(([items]) => feePicksKey("p") in items || sendFeePicksKey("p") in items)).toHaveLength(1)
	})

	test("an update that is not one is refused as invalid arguments", async () => {
		const { service, session } = await startUiPreferences()
		await session.unlock("p")

		await expect(service.saveFeePick("p", { kind: "app", address: ACCOUNT, pick: { type: "gold" } } as never)).rejects.toBeInstanceOf(
			InvalidWalletArgumentsError,
		)
	})
})

describe("refusals", () => {
	const write = (service: Awaited<ReturnType<typeof startUiPreferences>>["service"]) =>
		Promise.all([service.setPinnedTokens("p", { "7": [A] }), service.saveFeePick("p", { kind: "forgetFpc", fpcId: "f" })])

	test("another profile's, a locked wallet's and a reserved profile's reads are empty and their writes write nothing", async () => {
		const { service, session, area } = await startUiPreferences()
		await session.unlock("p")
		await service.setPinnedTokens("p", { "7": [A] })
		const stored = await area.get()

		await session.unlock("q")
		expect(await service.getPinnedTokens("p")).toEqual({})
		expect(await write(service)).toEqual([false, false])
		session.lock()
		expect(await service.getFeePicks("p")).toEqual({ app: {}, send: {} })
		expect(await write(service)).toEqual([false, false])
		await session.unlock("p")
		session.deletion.beginDeletion("p")
		expect(await service.getPinnedTokens("p")).toEqual({})
		expect(await write(service)).toEqual([false, false])

		expect(await area.get()).toEqual(stored)
	})

	test("a read whose session moved while it read is empty", async () => {
		const memory = new MemoryStorageArea().seed({ [pinnedTokensKey("p")]: { "7": [A] } })
		const { api, arm } = hooked(memory)
		const harness = await startUiPreferences(api)
		await harness.session.unlock("p")
		await sealed(memory, pinnedTokensKey("p"))
		arm(pinnedTokensKey("p"), () => harness.session.lock())

		expect(await harness.service.getPinnedTokens("p")).toEqual({})
		expect(await harness.service.getPinnedTokens("p")).toEqual({})
		await harness.session.unlock("p")
		expect(await harness.service.getPinnedTokens("p")).toEqual({ "7": [A] })
	})

	test.each([
		["a switch", (h: Awaited<ReturnType<typeof startUiPreferences>>) => h.session.open("q")],
		["a lock", (h: Awaited<ReturnType<typeof startUiPreferences>>) => h.session.lock()],
		["a deletion", (h: Awaited<ReturnType<typeof startUiPreferences>>) => void h.session.deletion.beginDeletion("p")],
	])("%s between a write's reads and its commit writes nothing", async (_name, interrupt) => {
		const memory = new MemoryStorageArea().seed({ [feePicksKey("p")]: APP })
		const { api, arm } = hooked(memory)
		const harness = await startUiPreferences(api)
		await harness.session.keys.unlock("q")
		await harness.session.unlock("p")
		await sealed(memory, feePicksKey("p"))
		const before = [...memory.data]
		arm(feePicksKey("p"), () => interrupt(harness))

		expect(await harness.service.saveFeePick("p", { kind: "forgetFpc", fpcId: "fpc-1" })).toBe(false)
		expect([...memory.data]).toEqual(before)
	})
})
