/**
 * `UiPreferenceService` over a real sealed store and real row keys: the unlock's conversion of the
 * pre-seal maps, the move of the pre-seal selection, the deletion's purge of the device's
 * selection, and every class of refusal (another profile, a lock, a session that moved during a
 * read or before a write's commit, a deletion begun).
 */
import { InvalidWalletArgumentsError } from "@nulo/extension-messaging/errors"
import type { BrowserApi } from "@nulo/wallet-core/ports"
import { type MinimalStorageArea, MemoryStorageArea } from "@nulo/wallet-core/storage"
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { feePicksKey, pinnedTokensKey, sendFeePicksKey } from "@/utils/profile-ui-keys"
import { isSealedText, parseEnvelope, SealedEntityStorage } from "@/wallet/storage/sealed-entity-storage"
import { readsKey, trackSubtleCrypto } from "@/wallet/storage/sealed-entity-storage.testing"
import { purgeSealedRowsOf } from "@/wallet/storage/sealed-roots"
import { startUiPreferences } from "./service.harness"

type Harness = Awaited<ReturnType<typeof startUiPreferences>>

const A = `0x${"a1".repeat(32)}`
const B = `0x${"b2".repeat(32)}`
const ACCOUNT = `0x${"cd".repeat(32)}`
const APP = { [ACCOUNT]: { type: "fpc", title: "Sponsored", fpc: { id: "fpc-1", isProtocol: true } } }
const SEND = { [ACCOUNT]: { private: { type: "fpc", fpc: { id: "fpc-1", name: "Sponsor" } }, public: { type: "fj" } } }
const DEVICE = "nulo:ui:selectedAccount@device"
const BARE = "nulo:ui:activeAccount"

const subtle = trackSubtleCrypto()
afterAll(() => subtle.restore())

const over = (local: unknown) => ({ storage: { local } }) as unknown as BrowserApi
const ownerOf = (raw: unknown) => parseEnvelope(JSON.parse(raw as string))?.profileId

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

describe("concurrent writers", () => {
	const FJ = { type: "fj", title: "Public Fee Juice", subtitle: "public" } as const
	const appPick = (address: string) => ({ kind: "app", address, pick: FJ }) as const

	test("two windows saving picks for different accounts at once keep both", async () => {
		const { service, session } = await startUiPreferences()
		await session.unlock("p")

		await Promise.all([service.saveFeePick("p", appPick("0xa")), service.saveFeePick("p", appPick("0xb"))])

		expect((await service.getFeePicks("p")).app).toEqual({ "0xa": FJ, "0xb": FJ })
	})

	test("a pick is the profile's own: another profile holding the same address keeps its own", async () => {
		const { service, session } = await startUiPreferences()
		await session.unlock("p")
		await service.saveFeePick("p", appPick("0xsame"))
		await session.unlock("q")
		await service.saveFeePick("q", { kind: "send", address: "0xsame", side: "public", pick: { type: "private_fpc" } })

		expect(await service.getFeePicks("q")).toEqual({ app: {}, send: { "0xsame": { public: { type: "private_fpc" } } } })
		session.open("p")
		expect(await service.getFeePicks("p")).toEqual({ app: { "0xsame": FJ }, send: {} })
	})

	test("a writer the lock's watchdog displaced writes nothing; the one after it lands", async () => {
		const memory = new MemoryStorageArea()
		let releaseRead = () => {}
		const stalled = new Promise<void>((resolve) => (releaseRead = resolve))
		let stall = true
		const local = {
			get: async (keys?: string | string[]) => {
				if (stall && readsKey(keys, feePicksKey("p"))) {
					stall = false
					await stalled
				}
				return memory.get(keys)
			},
			set: (items: Record<string, unknown>) => memory.set(items),
			remove: (keys: string | string[]) => memory.remove(keys),
		}
		const { service, session } = await startUiPreferences({ storage: { local } } as unknown as BrowserApi)
		await session.unlock("p")

		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
		try {
			const displaced = service.saveFeePick("p", appPick("0xa"))
			await vi.advanceTimersByTimeAsync(5 * 60_000)
			vi.useRealTimers()
			expect(await service.saveFeePick("p", appPick("0xb"))).toBe(true)
			releaseRead()
			expect(await displaced).toBe(false)
		} finally {
			vi.useRealTimers()
		}
		expect((await service.getFeePicks("p")).app).toEqual({ "0xb": FJ })
	})
})

describe("the selected account", () => {
	test("the device's one selection answers only the profile that made it, with both profiles' keys held", async () => {
		const { service, session, area } = await startUiPreferences()
		await session.keys.unlock("q")
		await session.unlock("p")
		expect(await service.setSelectedAccount("p", A)).toBe(true)
		const stored = (await area.get(DEVICE))[DEVICE]
		expect(isSealedText(stored)).toBe(true)
		expect(ownerOf(stored)).toBe("p")
		expect(String(stored)).not.toContain(A.slice(2))
		expect(await service.getSelectedAccount("p")).toBe(A)

		session.open("q")
		expect(await service.getSelectedAccount("q")).toBeUndefined()
		expect(await service.setSelectedAccount("q", B)).toBe(true)
		expect(await service.getSelectedAccount("q")).toBe(B)
		session.open("p")
		expect(await service.getSelectedAccount("p")).toBeUndefined()
	})

	test("the pre-seal selection moves into the profile holding that account, on any chain, and is left for any other", async () => {
		const area = new MemoryStorageArea().seed({ [BARE]: A })
		const { service, session, accounts } = await startUiPreferences(over(area))
		accounts.held.set("p", [B, A]).set("q", [B])
		await session.unlock("q")
		expect(await service.getSelectedAccount("q")).toBeUndefined()
		expect(area.data.get(BARE)).toBe(A)

		await session.unlock("p")
		expect(await service.getSelectedAccount("p")).toBe(A)
		expect(area.data.has(BARE)).toBe(false)
		expect(ownerOf(area.data.get(DEVICE))).toBe("p")
		session.open("q")
		expect(await service.getSelectedAccount("q")).toBeUndefined()
	})

	test("a pre-seal selection beside a stored one is removed unread, so a stop between a move's seal and its removal converges", async () => {
		const memory = new MemoryStorageArea().seed({ [BARE]: A })
		let stop = true
		const local = {
			get: (keys?: string | string[]) => memory.get(keys),
			set: (items: Record<string, unknown>) => memory.set(items),
			remove: async (keys: string | string[]) => {
				if (stop) {
					stop = false
					throw new Error("worker stopped")
				}
				await memory.remove(keys)
			},
		}
		const { service, session, accounts } = await startUiPreferences(over(local))
		accounts.held.set("p", [A]).set("q", [A])
		await session.unlock("p")
		await expect(service.getSelectedAccount("p")).rejects.toThrow("worker stopped")
		expect(memory.data.get(BARE)).toBe(A)

		await session.unlock("q")
		expect(await service.getSelectedAccount("q")).toBeUndefined()
		expect(memory.data.has(BARE)).toBe(false)
		session.open("p")
		expect(await service.getSelectedAccount("p")).toBe(A)
	})

	test("an address that is not a string of at most 128 characters is refused as invalid arguments", async () => {
		const { service, session } = await startUiPreferences()
		await session.unlock("p")

		for (const address of [`0x${"a".repeat(127)}`, 7])
			await expect(service.setSelectedAccount("p", address as never)).rejects.toBeInstanceOf(InvalidWalletArgumentsError)
		expect(await service.setSelectedAccount("p", `0x${"a".repeat(126)}`)).toBe(true)
	})

	test("a deletion's purge removes the selection its profile made with no keys held, and keeps another's and one naming nobody", async () => {
		const { service, session, area } = await startUiPreferences()
		await session.unlock("p")
		await service.setSelectedAccount("p", A)
		session.lock()
		session.keys.drop("p")

		await service.purgeForProfile("q")
		expect(ownerOf((await area.get(DEVICE))[DEVICE])).toBe("p")
		await service.purgeForProfile("p")
		expect(await area.get(DEVICE)).toEqual({})
		await area.set({ [DEVICE]: "{not json" })
		await service.purgeForProfile("p")
		expect((await area.get(DEVICE))[DEVICE]).toBe("{not json")
	})

	test("a selection another profile makes while the purge holds the row survives it and the keyless sweep", async () => {
		const memory = new MemoryStorageArea()
		let stall: (() => Promise<void>) | undefined
		const local = {
			get: async (keys?: string | string[]) => {
				const got = await memory.get(keys)
				const hook = stall && readsKey(keys, DEVICE) ? stall : undefined
				stall = hook ? undefined : stall
				await hook?.()
				return got
			},
			set: (items: Record<string, unknown>) => memory.set(items),
			remove: (keys: string | string[]) => memory.remove(keys),
		}
		const { service, session } = await startUiPreferences(over(local))
		await session.keys.unlock("q")
		await session.unlock("p")
		await service.setSelectedAccount("p", A)
		session.open("q")
		session.deletion.beginDeletion("p")
		let other: Promise<boolean> | undefined
		stall = async () => {
			other = service.setSelectedAccount("q", B)
			await subtle.settled()
		}

		await service.purgeForProfile("p")
		expect(await other).toBe(true)
		session.keys.drop("p")
		await purgeSealedRowsOf(memory, "p")
		expect(ownerOf(memory.data.get(DEVICE))).toBe("q")
		expect(await service.getSelectedAccount("q")).toBe(B)
	})
})

describe("refusals", () => {
	const write = (service: Harness["service"]) =>
		Promise.all([
			service.setPinnedTokens("p", { "7": [A] }),
			service.saveFeePick("p", { kind: "forgetFpc", fpcId: "f" }),
			service.setSelectedAccount("p", B),
		])
	const reads = (service: Harness["service"]) => Promise.all([service.getPinnedTokens("p"), service.getSelectedAccount("p")])

	test("another profile's, a locked wallet's and a reserved profile's reads are empty and their writes write nothing", async () => {
		const { service, session, area } = await startUiPreferences()
		await session.unlock("p")
		await service.setPinnedTokens("p", { "7": [A] })
		await service.setSelectedAccount("p", A)
		const stored = await area.get()

		await session.unlock("q")
		expect(await reads(service)).toEqual([{}, undefined])
		expect(await write(service)).toEqual([false, false, false])
		session.lock()
		expect(await service.getFeePicks("p")).toEqual({ app: {}, send: {} })
		expect(await reads(service)).toEqual([{}, undefined])
		expect(await write(service)).toEqual([false, false, false])
		await session.unlock("p")
		session.deletion.beginDeletion("p")
		expect(await reads(service)).toEqual([{}, undefined])
		expect(await write(service)).toEqual([false, false, false])

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

		await harness.service.setSelectedAccount("p", A)
		arm(DEVICE, () => harness.session.lock())
		expect(await harness.service.getSelectedAccount("p")).toBeUndefined()
		await harness.session.unlock("p")
		expect(await harness.service.getSelectedAccount("p")).toBe(A)
	})

	const interrupts = [
		["a switch", (h: Harness) => h.session.open("q")],
		["a lock", (h: Harness) => h.session.lock()],
		["a deletion", (h: Harness) => void h.session.deletion.beginDeletion("p")],
	] as const

	test.each(interrupts)("%s between a write's reads and its commit writes nothing", async (_name, interrupt) => {
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

	test.each(interrupts)("%s between a selection's seal and its commit writes nothing, a move's included", async (_name, interrupt) => {
		for (const call of [(h: Harness) => h.service.getSelectedAccount("p"), (h: Harness) => h.service.setSelectedAccount("p", B)]) {
			const memory = new MemoryStorageArea().seed({ [BARE]: A })
			const harness = await startUiPreferences(over(memory))
			harness.accounts.held.set("p", [A])
			await harness.session.keys.unlock("q")
			await harness.session.unlock("p")
			const prepare = SealedEntityStorage.prototype.prepare
			const spy = vi.spyOn(SealedEntityStorage.prototype, "prepare").mockImplementationOnce(async function (
				this: SealedEntityStorage<unknown>,
				id,
				row,
			) {
				const write = await prepare.call(this, id, row)
				interrupt(harness)
				return write
			})

			expect([undefined, false]).toContain(await call(harness))
			expect([...memory.data]).toEqual([[BARE, A]])
			spy.mockRestore()
		}
	})
})
