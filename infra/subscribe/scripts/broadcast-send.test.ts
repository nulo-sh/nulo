import { describe, expect, test } from "bun:test"
import { readBroadcast, sendBroadcast } from "./broadcast-send"

const ID = "6cbb8fa7-2614-44f1-a1de-ec2531429389"
const TOPIC = "bd2fd224-25d7-4707-9742-1e3ffc39f9d7"
const env = { RESEND_API_KEY: "re_test", RESEND_TOPIC_ID: TOPIC }

type Call = { url: string; method: string }

/** A Resend fake: the broadcast's status before the send, every call recorded, the send flipping it to `queued`. */
function fakeResend(status: string, topicId: string | undefined = TOPIC) {
	const calls: Call[] = []
	let current = status
	const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
		calls.push({ url, method: init.method ?? "GET" })
		if (url.endsWith("/send")) {
			current = "queued"
			return Response.json({ id: ID })
		}
		return Response.json({ id: ID, name: "Launch", status: current, topic_id: topicId, html: "<p>b</p>", text: "b" })
	}
	return { calls, fetchImpl }
}

describe("broadcast-send", () => {
	test("check reads the broadcast back without its bodies", async () => {
		const { calls, fetchImpl } = fakeResend("draft")
		const read = await readBroadcast(fetchImpl, env, ID)
		expect(read).toEqual({ id: ID, name: "Launch", status: "draft", topic_id: TOPIC })
		expect(calls).toEqual([{ url: `https://api.resend.com/broadcasts/${ID}`, method: "GET" }])
	})

	test("send posts the draft once, then reads it back", async () => {
		const { calls, fetchImpl } = fakeResend("draft")
		const after = await sendBroadcast(fetchImpl, env, ID)
		expect(after.status).toBe("queued")
		expect(calls.map((c) => `${c.method} ${c.url.slice("https://api.resend.com".length)}`)).toEqual([
			`GET /broadcasts/${ID}`,
			`POST /broadcasts/${ID}/send`,
			`GET /broadcasts/${ID}`,
		])
	})

	test("send refuses a broadcast that is not a draft, before any send call", async () => {
		const { calls, fetchImpl } = fakeResend("sent")
		await expect(sendBroadcast(fetchImpl, env, ID)).rejects.toThrow("not draft")
		expect(calls.filter((c) => c.method === "POST")).toEqual([])
	})

	test("send refuses a draft on another topic, and a malformed id or a missing key never reaches the API", async () => {
		const other = fakeResend("draft", "00000000-0000-4000-8000-000000000000")
		await expect(sendBroadcast(other.fetchImpl, env, ID)).rejects.toThrow("launch topic")
		expect(other.calls.filter((c) => c.method === "POST")).toEqual([])
		const { calls, fetchImpl } = fakeResend("draft")
		await expect(sendBroadcast(fetchImpl, env, "not-an-id")).rejects.toThrow("broadcast id")
		await expect(sendBroadcast(fetchImpl, { RESEND_TOPIC_ID: TOPIC }, ID)).rejects.toThrow("RESEND_API_KEY")
		expect(calls).toEqual([])
	})
})
