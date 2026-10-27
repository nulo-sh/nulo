import { describe, expect, test } from "bun:test"
import { setBroadcastTopic } from "./broadcast-topic"

const env = { RESEND_API_KEY: "re_test_key", RESEND_TOPIC_ID: "11111111-2222-3333-4444-555555555555" }
const id = "6cbb8fa7-2614-44f1-a1de-ec2531429389"

function resend(patchStatus = 200) {
	const calls: { input: string; init: RequestInit }[] = []
	const fetchImpl = async (input: string, init: RequestInit) => {
		calls.push({ input, init })
		if (init.method === "PATCH") return new Response(patchStatus === 200 ? JSON.stringify({ id }) : "nope", { status: patchStatus })
		return Response.json({ id, status: "draft", topic_id: env.RESEND_TOPIC_ID, html: "<p>body</p>", text: "body" })
	}
	return { calls, fetchImpl }
}

describe("setBroadcastTopic", () => {
	test("patches topic_id with the bearer key, then returns the broadcast without its bodies", async () => {
		const { calls, fetchImpl } = resend()
		const result = await setBroadcastTopic(fetchImpl, env, id)
		expect(calls.map((c) => [c.init.method, c.input])).toEqual([
			["PATCH", `https://api.resend.com/broadcasts/${id}`],
			["GET", `https://api.resend.com/broadcasts/${id}`],
		])
		const [patch] = calls as [{ input: string; init: RequestInit }]
		expect(new Headers(patch.init.headers).get("authorization")).toBe("Bearer re_test_key")
		expect(JSON.parse(String(patch.init.body))).toEqual({ topic_id: env.RESEND_TOPIC_ID })
		expect(result).toEqual({ id, status: "draft", topic_id: env.RESEND_TOPIC_ID })
	})

	test("a refused patch fails with the status and reads nothing back", async () => {
		const { calls, fetchImpl } = resend(422)
		await expect(setBroadcastTopic(fetchImpl, env, id)).rejects.toThrow("PATCH answered 422: nope")
		expect(calls).toHaveLength(1)
	})

	test("refuses a missing key or topic and a malformed id before any request", async () => {
		const { calls, fetchImpl } = resend()
		await expect(setBroadcastTopic(fetchImpl, { RESEND_TOPIC_ID: env.RESEND_TOPIC_ID }, id)).rejects.toThrow("must be set")
		await expect(setBroadcastTopic(fetchImpl, env, "not-an-id")).rejects.toThrow("broadcast id")
		expect(calls).toHaveLength(0)
	})
})
