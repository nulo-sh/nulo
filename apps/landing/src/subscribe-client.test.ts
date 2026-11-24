import { describe, expect, it } from "vitest"
import { postSubscribe } from "./subscribe-client"

type Call = { input: string; init: RequestInit }

function fakeFetch(answer: Response) {
	const calls: Call[] = []
	const fetchImpl = async (input: string, init: RequestInit) => {
		calls.push({ input, init })
		return answer
	}
	return { calls, fetchImpl }
}

describe("postSubscribe", () => {
	it("posts the caller's body as given, with the caller's headers beside Accept and a timeout", async () => {
		const json = fakeFetch(Response.json({ ok: true }))
		const body = JSON.stringify({ token: "a.b" })
		expect(await postSubscribe("/api/confirm", { headers: { "Content-Type": "application/json" }, body }, json.fetchImpl)).toBe("ok")
		const [jsonCall] = json.calls as [Call]
		const headers = new Headers(jsonCall.init.headers)
		expect([jsonCall.input, jsonCall.init.method, headers.get("accept"), headers.get("content-type")]).toEqual([
			"/api/confirm",
			"POST",
			"application/json",
			"application/json",
		])
		expect(jsonCall.init.body).toBe(body)
		expect(jsonCall.init.signal).toBeInstanceOf(AbortSignal)

		const form = fakeFetch(Response.json({ ok: true }))
		const params = new URLSearchParams({ email: "someone@example.com" })
		await postSubscribe("/api/subscribe", { body: params }, form.fetchImpl)
		const [formCall] = form.calls as [Call]
		expect(formCall.init.body).toBe(params)
		expect(new Headers(formCall.init.headers).get("content-type")).toBeNull()
	})

	it("answers retry to a 2xx other than 200, even one that says ok", async () => {
		expect(await postSubscribe("/api/subscribe", { body: "" }, fakeFetch(Response.json({ ok: true }, { status: 201 })).fetchImpl)).toBe(
			"retry",
		)
	})
})
