import { describe, expect, it } from "vitest"
import { CONFIRM_COPY, type ConfirmView, RETRY_MESSAGE, startConfirm, tokenFrom } from "./confirm"

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
	it("posts the token once as the page opens, locked while in flight, and confirms with no press", async () => {
		const { v, busy, focused } = view()
		const { calls, fetchImpl } = fakeFetch(async () => Response.json({ ok: true }), busy)
		const started = startConfirm(v, `#${TOKEN}`, fetchImpl)
		expect(calls).toHaveLength(1)
		const [call] = calls as [Call]
		expect(call.busy).toBe(true)
		expect(call.input).toBe("/api/confirm")
		expect(call.init.method).toBe("POST")
		expect(new Headers(call.init.headers).get("accept")).toBe("application/json")
		expect(JSON.parse(String(call.init.body))).toEqual({ token: TOKEN })
		expect(call.init.signal).toBeInstanceOf(AbortSignal)
		expect(shown(v)).toEqual({ ...CONFIRM_COPY.ready, button: true, back: false })
		await started?.opened
		expect(calls).toHaveLength(1)
		expect(shown(v)).toEqual({ ...CONFIRM_COPY.confirmed, button: false, back: true })
		expect(focused()).toBe(1)
		expect(v.status.textContent).toBe("")
	})

	it("opened a second time, posts the same token again and shows the confirmed state again", async () => {
		const bodies: unknown[] = []
		for (let open = 0; open < 2; open++) {
			const { v, busy } = view()
			const { calls, fetchImpl } = fakeFetch(async () => Response.json({ ok: true }), busy)
			await startConfirm(v, `#${TOKEN}`, fetchImpl)?.opened
			bodies.push(...calls.map((c) => JSON.parse(String(c.init.body))))
			expect(shown(v)).toEqual({ ...CONFIRM_COPY.confirmed, button: false, back: true })
		}
		expect(bodies).toEqual([{ token: TOKEN }, { token: TOKEN }])
	})

	it.each(["", "#", "#not-a-token", `#${TOKEN}${"A".repeat(1024)}`])(
		"shows the invalid state for %j, posts nothing and offers nothing to press",
		(hash) => {
			const { v, busy } = view()
			const { calls, fetchImpl } = fakeFetch(async () => Response.json({ ok: true }), busy)
			expect(startConfirm(v, hash, fetchImpl)).toBeNull()
			expect(shown(v)).toEqual({ ...CONFIRM_COPY.invalid, button: false, back: true })
			expect(calls).toHaveLength(0)
		},
	)
})

describe("the answer to the post", () => {
	it("reads a 400 as a link that does not work, whatever made the Worker refuse it", async () => {
		const { v, busy, focused } = view()
		const { fetchImpl } = fakeFetch(async () => Response.json({ ok: false }, { status: 400 }), busy)
		await startConfirm(v, `#${TOKEN}`, fetchImpl)?.opened
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
		const { fetchImpl } = fakeFetch(answer, busy)
		await startConfirm(v, `#${TOKEN}`, fetchImpl)?.opened
		expect(shown(v)).toEqual({ ...CONFIRM_COPY.ready, button: true, back: false })
		expect([v.status.textContent, v.status.dataset.state]).toEqual([RETRY_MESSAGE, "error"])
		expect(busy()).toBe(false)
		expect(focused()).toBe(0)
	})
})

describe("the Confirm button", () => {
	it("after an opening post that did not go through, confirms on a press with the same token", async () => {
		const { v, busy, focused } = view()
		const answers = [async () => Promise.reject(new TypeError("offline")), async () => Response.json({ ok: true })]
		const { calls, fetchImpl } = fakeFetch(() => (answers.shift() as () => Promise<Response>)(), busy)
		const started = startConfirm(v, `#${TOKEN}`, fetchImpl)
		await started?.opened
		expect(v.status.textContent).toBe(RETRY_MESSAGE)
		await started?.press()
		expect(calls.map((c) => JSON.parse(String(c.init.body)))).toEqual([{ token: TOKEN }, { token: TOKEN }])
		expect(shown(v)).toEqual({ ...CONFIRM_COPY.confirmed, button: false, back: true })
		expect(v.status.textContent).toBe("")
		expect(focused()).toBe(1)
	})

	it("sends nothing while the opening post is in flight", async () => {
		const { v, busy } = view()
		let release: (r: Response) => void = () => {}
		const { calls, fetchImpl } = fakeFetch(() => new Promise<Response>((resolve) => (release = resolve)), busy)
		const started = startConfirm(v, `#${TOKEN}`, fetchImpl)
		await started?.press()
		expect(calls).toHaveLength(1)
		release(Response.json({ ok: true }))
		await started?.opened
		expect(v.heading.textContent).toBe(CONFIRM_COPY.confirmed.heading)
	})
})
