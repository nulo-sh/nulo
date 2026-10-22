import { flushPromises } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { reactive } from "vue"
import { postAuthRoute } from "@/utils/own-window"
import { endLanding, HANDBACK_KEY, landingRoute, readHandback } from "@/utils/panel-handback"
import type { Snack } from "@/utils/snack"
import { type LandingState, settleLanding } from "./panelLanding"

const surface = vi.hoisted(() => ({ inPanel: true }))
vi.mock("@/utils/browser-surface", () => ({ closesOnFocusLoss: () => surface.inPanel }))

const CONTACTS = "/popup/settings/contacts"
const SNACK = { kind: "success", label: "Import completed successfully", profileId: "a1b2c3d4" } as const

let session: Map<string, unknown>
let sessionGet: ReturnType<typeof vi.fn>
let sessionRemove: ReturnType<typeof vi.fn>

beforeEach(() => {
	session = new Map()
	sessionGet = vi.fn(async (key: string) => (session.has(key) ? { [key]: session.get(key) } : {}))
	sessionRemove = vi.fn(async (key: string) => {
		session.delete(key)
	})
	vi.stubGlobal("chrome", { storage: { session: { get: sessionGet, remove: sessionRemove } } })
})

afterEach(() => {
	endLanding()
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

		endLanding()
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
