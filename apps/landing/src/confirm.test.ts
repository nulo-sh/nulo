import { describe, expect, it } from "vitest"
import { CONFIRM_COPY, type ConfirmView, RETRY_MESSAGE, startConfirm, submitConfirm, tokenFrom } from "./confirm"

const TOKEN = "eyJlIjoicEBleGFtcGxlLmNvbSIsInQiOjF9.abc_DEF-123"

function view() {
	const attributes = new Map<string, string>()
	let focused = 0
	const v = {
		heading: { textContent: "Confirm your email." as string | null, focus: () => void focused++ },
		lead: { textContent: "" as string | null, hidden: true },
		button: {
			hidden: true,
			getAttribute: (name: string) => attributes.get(name) ?? null,
			setAttribute: (name: string, value: string) => void attributes.set(name, value),
			removeAttribute: (name: string) => void attributes.delete(name),
		},
		back: { hidden: true },
		status: { textContent: "" as string | null, dataset: {} as DOMStringMap },
	} satisfies ConfirmView
	return { v, focused: () => focused, busy: () => attributes.get("aria-disabled") === "true" }
}

type Call = { input: string; init: RequestInit; busy: boolean }

function fakeFetch(answer: () => Promise<Response>, busy: () => boolean) {
	const calls: Call[] = []
	const fetchImpl = async (input: string, init: RequestInit) => {
		calls.push({ input, init, busy: busy() })
		return answer()
	}
	return { calls, fetchImpl }
}

const shown = (v: ConfirmView) => ({
	heading: v.heading.textContent,
	lead: v.lead.textContent,
	button: !v.button.hidden,
	back: !v.back.hidden,
})

describe("tokenFrom", () => {
	it("takes a well-formed token from the hash and nothing else", () => {
		expect(tokenFrom(`#${TOKEN}`)).toBe(TOKEN)
		for (const hash of ["", "#", "#nodot", `#${TOKEN}.x`, `#${TOKEN}<`, "#a.b c", `#${TOKEN}${"A".repeat(1024)}`]) {
			expect(tokenFrom(hash)).toBeNull()
		}
	})
})

describe("startConfirm", () => {
	it("shows Confirm for a well-formed token and posts nothing until the press, then exactly once", async () => {
		const { v, busy } = view()
		const { calls, fetchImpl } = fakeFetch(async () => Response.json({ ok: true }), busy)
		const press = startConfirm(v, `#${TOKEN}`, fetchImpl)
		expect(shown(v)).toEqual({ ...CONFIRM_COPY.ready, button: true, back: false })
		expect(calls).toHaveLength(0)
		await press?.()
		expect(calls).toHaveLength(1)
		const [call] = calls as [Call]
		expect(call.input).toBe("/api/confirm")
		expect(call.init.method).toBe("POST")
		expect(new Headers(call.init.headers).get("accept")).toBe("application/json")
		expect(JSON.parse(String(call.init.body))).toEqual({ token: TOKEN })
		expect(call.init.signal).toBeInstanceOf(AbortSignal)
	})

	it.each(["", "#", "#not-a-token", `#${TOKEN}${"A".repeat(1024)}`])(
		"shows the invalid state for %j and offers nothing to press",
		(hash) => {
			const { v, busy } = view()
			const { calls, fetchImpl } = fakeFetch(async () => Response.json({ ok: true }), busy)
			expect(startConfirm(v, hash, fetchImpl)).toBeNull()
			expect(shown(v)).toEqual({ ...CONFIRM_COPY.invalid, button: false, back: true })
			expect(calls).toHaveLength(0)
		},
	)
})

describe("submitConfirm", () => {
	it("confirms on 200 { ok: true }: the button goes, the way back shows, focus moves to the heading", async () => {
		const { v, busy, focused } = view()
		startConfirm(v, `#${TOKEN}`, async () => Response.json({}))
		const { calls, fetchImpl } = fakeFetch(async () => Response.json({ ok: true }), busy)
		await submitConfirm(v, TOKEN, fetchImpl)
		expect(calls[0]?.busy).toBe(true)
		expect(shown(v)).toEqual({ ...CONFIRM_COPY.confirmed, button: false, back: true })
		expect(focused()).toBe(1)
		expect(v.status.textContent).toBe("")
	})

	it("reads a 400 as a link that does not work, whatever made the Worker refuse it", async () => {
		const { v, busy, focused } = view()
		const { fetchImpl } = fakeFetch(async () => Response.json({ ok: false }, { status: 400 }), busy)
		await submitConfirm(v, TOKEN, fetchImpl)
		expect(shown(v)).toEqual({ ...CONFIRM_COPY.invalid, button: false, back: true })
		expect(focused()).toBe(1)
	})

	const retries: [string, () => Promise<Response>][] = [
		["a network failure", async () => Promise.reject(new TypeError("offline"))],
		["a 503", async () => Response.json({ ok: false }, { status: 503 })],
		["a 429", async () => Response.json({ ok: false }, { status: 429 })],
		["a 200 page served in the Worker's place", async () => new Response("<!doctype html>", { status: 200 })],
		["a 200 without ok: true", async () => Response.json({ ok: "yes" })],
	]

	it.each(retries)("keeps the button for a retry after %s, says so, and releases the lock", async (_, answer) => {
		const { v, busy, focused } = view()
		startConfirm(v, `#${TOKEN}`, async () => Response.json({}))
		const { fetchImpl } = fakeFetch(answer, busy)
		await submitConfirm(v, TOKEN, fetchImpl)
		expect(shown(v)).toEqual({ ...CONFIRM_COPY.ready, button: true, back: false })
		expect([v.status.textContent, v.status.dataset.state]).toEqual([RETRY_MESSAGE, "error"])
		expect(busy()).toBe(false)
		expect(focused()).toBe(0)
	})

	it("ignores a second press while the first is in flight", async () => {
		const { v, busy } = view()
		let release: (r: Response) => void = () => {}
		const { calls, fetchImpl } = fakeFetch(() => new Promise<Response>((resolve) => (release = resolve)), busy)
		const first = submitConfirm(v, TOKEN, fetchImpl)
		await submitConfirm(v, TOKEN, fetchImpl)
		expect(calls).toHaveLength(1)
		release(Response.json({ ok: true }))
		await first
		expect(v.heading.textContent).toBe(CONFIRM_COPY.confirmed.heading)
	})
})
