import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { decodeHandback, endLanding, HANDBACK_KEY, landingRoute, readHandback } from "./panel-handback"

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
	endLanding()
	vi.unstubAllGlobals()
})

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
			{ ...SNACK, label: "x".repeat(2049) },
			{ ...SNACK, label: 5 },
			{ kind: SNACK.kind, label: SNACK.label },
			{ ...SNACK, profileId: "" },
			{ ...SNACK, profileId: "p".repeat(129) },
		]
		for (const snack of malformed)
			expect(decodeHandback({ route: CONTACTS, snack }), JSON.stringify(snack)).toEqual({ route: CONTACTS })
		expect(decodeHandback({ route: CONTACTS, snack: { ...SNACK, label: "x".repeat(2048) } })?.snack?.label).toHaveLength(2048)
	})
})
