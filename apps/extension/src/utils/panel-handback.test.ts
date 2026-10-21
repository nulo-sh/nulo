import { flushPromises } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { reactive } from "vue"
import { postAuthRoute } from "./own-window"
import { decodeHandback, HANDBACK_KEY, type LandingState, landingRoute, readHandback, resetLanding, settleLanding } from "./panel-handback"
import type { Snack } from "./snack"

const surface = vi.hoisted(() => ({ inPanel: true }))
vi.mock("@/utils/browser-surface", () => ({ closesOnFocusLoss: () => surface.inPanel }))

const CONTACTS = "/popup/settings/contacts"
const SNACK = { kind: "success", label: "Import completed successfully", profileId: "a1b2c3d4" } as const

let session: Map<string, unknown>
let sessionGet: ReturnType<typeof vi.fn>
let sessionRemove: ReturnType<typeof vi.fn>

beforeEach(() => {
	surface.inPanel = true
	session = new Map()
	sessionGet = vi.fn(async (key: string) => (session.has(key) ? { [key]: session.get(key) } : {}))
	sessionRemove = vi.fn(async (key: string) => {
		session.delete(key)
	})
	vi.stubGlobal("chrome", { storage: { session: { get: sessionGet, remove: sessionRemove } } })
})

afterEach(() => {
	resetLanding()
	vi.unstubAllGlobals()
})

/** A panel that read `record` at boot, on Home with no session yet. */
async function bootWith(record: unknown) {
	session.set(HANDBACK_KEY, record)
	const route = await readHandback()
	const state = reactive<LandingState>({ path: "/", loggedIn: false, profileId: undefined })
	const shown: Snack[] = []
	settleLanding(
		() => ({ ...state }),
		(snack) => shown.push(snack),
	)
	return { route, state, shown }
}

/** The panel arrives on its landing with `profileId`'s session open. */
async function arrive(state: LandingState, profileId: string = SNACK.profileId, path: string = CONTACTS) {
	Object.assign(state, { path, loggedIn: true, profileId })
	await flushPromises()
}

describe("reading the hand-back", () => {
	test("only Firefox's toolbar panel reads it, once, and lands on its route", async () => {
		session.set(HANDBACK_KEY, { route: CONTACTS })
		surface.inPanel = false
		expect(await readHandback()).toBeUndefined()
		expect(sessionGet).not.toHaveBeenCalled()

		surface.inPanel = true
		expect(await readHandback()).toBe(CONTACTS)
		expect(sessionGet).toHaveBeenCalledTimes(1)
		expect(landingRoute()).toBe(CONTACTS)
		expect(session.has(HANDBACK_KEY)).toBe(true)
	})

	test("no record, or a read that rejects, opens the panel as usual", async () => {
		expect(await readHandback()).toBeUndefined()
		sessionGet.mockRejectedValueOnce(new Error("storage unavailable"))
		session.set(HANDBACK_KEY, { route: CONTACTS })
		await expect(readHandback()).resolves.toBeUndefined()
		expect(landingRoute()).toBeUndefined()
	})

	test("a route outside the closed set drops the record, read once", async () => {
		for (const route of ["/popup/settings/security/export/full", "https://dapp.example/", undefined]) {
			session.set(HANDBACK_KEY, { route })
			expect(await readHandback(), String(route)).toBeUndefined()
			expect(session.has(HANDBACK_KEY)).toBe(false)
		}
		expect(decodeHandback(["/popup/general"])).toBeUndefined()
		expect(decodeHandback(null)).toBeUndefined()
	})

	test("a malformed snack is dropped and its route kept", () => {
		const malformed = [
			{ ...SNACK, kind: "info" },
			{ ...SNACK, label: "" },
			{ ...SNACK, label: "x".repeat(201) },
			{ ...SNACK, label: 5 },
			{ kind: SNACK.kind, label: SNACK.label },
			{ ...SNACK, profileId: "" },
			{ ...SNACK, profileId: "p".repeat(129) },
		]
		for (const snack of malformed)
			expect(decodeHandback({ route: CONTACTS, snack }), JSON.stringify(snack)).toEqual({ route: CONTACTS })
		expect(decodeHandback({ route: CONTACTS, snack: { ...SNACK, label: "x".repeat(200) } })?.snack?.label).toHaveLength(200)
	})
})

describe("settling the landing", () => {
	test("waits for an open session on the landing route, then removes the record and shows the snack once", async () => {
		const { route, state, shown } = await bootWith({ route: CONTACTS, snack: SNACK })
		expect(route).toBe(CONTACTS)
		Object.assign(state, { path: "/popup/auth" })
		await flushPromises()
		Object.assign(state, { path: CONTACTS })
		await flushPromises()
		Object.assign(state, { path: "/popup/general", loggedIn: true, profileId: SNACK.profileId })
		await flushPromises()
		expect(session.has(HANDBACK_KEY)).toBe(true)
		expect(postAuthRoute()).toBe(CONTACTS)

		await arrive(state)
		await arrive(state, SNACK.profileId, "/popup/general")
		await arrive(state)
		expect(shown).toEqual([{ kind: "success", label: SNACK.label }])
		expect(session.has(HANDBACK_KEY)).toBe(false)
		expect(landingRoute()).toBeUndefined()
		expect(postAuthRoute()).toBe("/popup/general")
	})

	test("another profile's session removes the record and never shows its snack; the same profile does", async () => {
		const other = await bootWith({ route: CONTACTS, snack: SNACK })
		await arrive(other.state, "e5f6a7b8")
		expect(other.shown).toEqual([])
		expect(session.has(HANDBACK_KEY)).toBe(false)

		resetLanding()
		const same = await bootWith({ route: CONTACTS, snack: { ...SNACK, kind: "error", label: "Contact import canceled" } })
		await arrive(same.state)
		expect(same.shown).toEqual([{ kind: "error", label: "Contact import canceled" }])
	})

	test("a session that closes while the record is removed shows nothing", async () => {
		const { state, shown } = await bootWith({ route: CONTACTS, snack: SNACK })
		sessionGet.mockImplementationOnce(async (key: string) => {
			state.loggedIn = false
			return { [key]: session.get(key) }
		})
		await arrive(state)
		expect(shown).toEqual([])
		expect(session.has(HANDBACK_KEY)).toBe(false)
	})

	test("a hand-back written since the read is kept for the next panel", async () => {
		const { state, shown } = await bootWith({ route: CONTACTS, snack: SNACK })
		const next = { route: "/popup/settings/accounts", snack: { ...SNACK, label: "Account imported" } }
		session.set(HANDBACK_KEY, next)
		await arrive(state)
		expect(session.get(HANDBACK_KEY)).toEqual(next)
		expect(shown).toHaveLength(1)
	})

	test("a record whose snack was dropped is still consumed, with nothing shown", async () => {
		const { route, state, shown } = await bootWith({ route: CONTACTS, snack: { ...SNACK, label: "" } })
		expect(route).toBe(CONTACTS)
		await arrive(state)
		expect(session.has(HANDBACK_KEY)).toBe(false)
		expect(shown).toEqual([])
	})

	test("a removal that rejects still settles the landing and shows the snack", async () => {
		const { state, shown } = await bootWith({ route: CONTACTS, snack: SNACK })
		sessionRemove.mockRejectedValueOnce(new Error("storage unavailable"))
		await arrive(state)
		expect(shown).toHaveLength(1)
		expect(landingRoute()).toBeUndefined()
	})

	test("a panel that read no record settles nothing", async () => {
		const shown: Snack[] = []
		settleLanding(
			() => ({ path: CONTACTS, loggedIn: true, profileId: SNACK.profileId }),
			(snack) => shown.push(snack),
		)
		await flushPromises()
		expect(shown).toEqual([])
		expect(sessionRemove).not.toHaveBeenCalled()
	})
})
