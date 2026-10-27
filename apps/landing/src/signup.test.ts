import { describe, expect, it } from "vitest"
import { SIGNUP_MESSAGES, type SignupView, submitSignup } from "./signup"

type Call = { input: string; init: RequestInit; disabledInFlight: boolean }

function view() {
	const attributes = new Map<string, string>()
	const v = {
		button: { disabled: false },
		field: {
			setAttribute: (name: string, value: string) => attributes.set(name, value),
			removeAttribute: (name: string) => attributes.delete(name),
		},
		status: { textContent: "" as string | null, dataset: {} as DOMStringMap },
		body: () => new URLSearchParams({ email: "someone@example.com", website: "" }),
	} satisfies SignupView
	return { v, attributes }
}

function fakeFetch(answer: () => Promise<Response>, v: SignupView) {
	const calls: Call[] = []
	const fetchImpl = async (input: string, init: RequestInit) => {
		calls.push({ input, init, disabledInFlight: v.button.disabled })
		return answer()
	}
	return { calls, fetchImpl }
}

describe("submitSignup", () => {
	it("posts the form as urlencoded with Accept: application/json, disables the button in flight and announces success", async () => {
		const { v } = view()
		const { calls, fetchImpl } = fakeFetch(async () => Response.json({ ok: true }), v)
		await submitSignup(v, "/api/subscribe", fetchImpl)

		expect(calls).toHaveLength(1)
		const [call] = calls as [Call]
		expect(call.input).toBe("/api/subscribe")
		expect(call.init.method).toBe("POST")
		expect(new Headers(call.init.headers).get("accept")).toBe("application/json")
		expect(String(call.init.body)).toBe("email=someone%40example.com&website=")
		expect(call.disabledInFlight).toBe(true)
		expect(v.button.disabled).toBe(false)
		expect(v.status.textContent).toBe(SIGNUP_MESSAGES.subscribed)
		expect(v.status.dataset.state).toBe("ok")
	})

	it("shows the address error on a 400 and marks the field invalid until the next try", async () => {
		const { v, attributes } = view()
		await submitSignup(v, "/api/subscribe", fakeFetch(async () => new Response(null, { status: 400 }), v).fetchImpl)
		expect(v.status.textContent).toBe(SIGNUP_MESSAGES.invalid)
		expect(v.status.dataset.state).toBe("error")
		expect(attributes.get("aria-invalid")).toBe("true")

		await submitSignup(v, "/api/subscribe", fakeFetch(async () => Response.json({ ok: true }), v).fetchImpl)
		expect(attributes.has("aria-invalid")).toBe(false)
		expect(v.status.textContent).toBe(SIGNUP_MESSAGES.subscribed)
	})

	it.each([
		["a 503 from a switched-off or unreachable list", async () => new Response(null, { status: 503 })],
		["a 429 rate limit", async () => new Response(null, { status: 429 })],
		["a 403 origin refusal", async () => new Response(null, { status: 403 })],
		["a network failure", async () => Promise.reject(new TypeError("Failed to fetch"))],
		// The SPA fallback answering in the Worker's place must never read as subscribed.
		["a 200 HTML page", async () => new Response("<!doctype html>", { status: 200, headers: { "content-type": "text/html" } })],
		["a 200 without ok: true", async () => Response.json({ ok: false })],
	])("shows the retry error on %s and releases the button", async (_name, answer) => {
		const { v, attributes } = view()
		await submitSignup(v, "/api/subscribe", fakeFetch(answer, v).fetchImpl)
		expect(v.status.textContent).toBe(SIGNUP_MESSAGES.retry)
		expect(v.status.dataset.state).toBe("error")
		expect(attributes.has("aria-invalid")).toBe(false)
		expect(v.button.disabled).toBe(false)
	})

	it("sends one request for a double submit while the first is in flight", async () => {
		const { v } = view()
		let resolve: (r: Response) => void = () => {}
		const { calls, fetchImpl } = fakeFetch(() => new Promise<Response>((r) => (resolve = r)), v)
		const first = submitSignup(v, "/api/subscribe", fetchImpl)
		await submitSignup(v, "/api/subscribe", fetchImpl)
		expect(calls).toHaveLength(1)
		resolve(Response.json({ ok: true }))
		await first
		expect(v.button.disabled).toBe(false)
	})

	it("empties the live region when a try starts, so a repeated message is announced again", async () => {
		const { v } = view()
		v.status.textContent = SIGNUP_MESSAGES.retry
		let during: string | null = "unset"
		await submitSignup(v, "/api/subscribe", async () => {
			during = v.status.textContent
			return new Response(null, { status: 503 })
		})
		expect(during).toBe("")
		expect(v.status.textContent).toBe(SIGNUP_MESSAGES.retry)
	})
})
