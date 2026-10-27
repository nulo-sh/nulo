import { describe, expect, test } from "bun:test"
import { writeBroadcast } from "./broadcast-topic"

const env = { RESEND_API_KEY: "re_test_key", RESEND_TOPIC_ID: "11111111-2222-3333-4444-555555555555" }
const id = "6cbb8fa7-2614-44f1-a1de-ec2531429389"
const draft = { name: "Launch email", html: "<p>body</p>", text: "body" }

function resend(patchStatus = 200, stored = draft) {
	const calls: { input: string; init: RequestInit }[] = []
	const fetchImpl = async (input: string, init: RequestInit) => {
		calls.push({ input, init })
		if (init.method === "PATCH") return new Response(patchStatus === 200 ? JSON.stringify({ id }) : "nope", { status: patchStatus })
		return Response.json({
			id,
			status: "draft",
			name: stored.name,
			topic_id: env.RESEND_TOPIC_ID,
			html: stored.html,
			text: stored.text,
		})
	}
	return { calls, fetchImpl }
}

describe("writeBroadcast", () => {
	test("patches name, both bodies and topic_id in one request with the bearer key, then reads back and compares the bodies", async () => {
		const { calls, fetchImpl } = resend()
		const result = await writeBroadcast(fetchImpl, env, id, draft)
		expect(calls.map((c) => [c.init.method, c.input])).toEqual([
			["PATCH", `https://api.resend.com/broadcasts/${id}`],
			["GET", `https://api.resend.com/broadcasts/${id}`],
		])
		const [patch] = calls as [{ input: string; init: RequestInit }]
		expect(new Headers(patch.init.headers).get("authorization")).toBe("Bearer re_test_key")
		expect(JSON.parse(String(patch.init.body))).toEqual({ ...draft, topic_id: env.RESEND_TOPIC_ID })
		expect(result).toEqual({
			id,
			status: "draft",
			name: draft.name,
			topic_id: env.RESEND_TOPIC_ID,
			html_matches: true,
			text_matches: true,
		})
	})

	test("a read-back whose bodies differ from the files says so", async () => {
		const { fetchImpl } = resend(200, { ...draft, text: "regenerated" })
		const result = await writeBroadcast(fetchImpl, env, id, draft)
		expect(result).toMatchObject({ html_matches: true, text_matches: false })
	})

	test("a refused patch fails with the status and reads nothing back", async () => {
		const { calls, fetchImpl } = resend(422)
		await expect(writeBroadcast(fetchImpl, env, id, draft)).rejects.toThrow("PATCH answered 422: nope")
		expect(calls).toHaveLength(1)
	})

	test("refuses a missing key or topic, a malformed id and an empty body before any request", async () => {
		const { calls, fetchImpl } = resend()
		await expect(writeBroadcast(fetchImpl, { RESEND_TOPIC_ID: env.RESEND_TOPIC_ID }, id, draft)).rejects.toThrow("must be set")
		await expect(writeBroadcast(fetchImpl, env, "not-an-id", draft)).rejects.toThrow("broadcast id")
		await expect(writeBroadcast(fetchImpl, env, id, { ...draft, text: "" })).rejects.toThrow("all required")
		expect(calls).toHaveLength(0)
	})
})
