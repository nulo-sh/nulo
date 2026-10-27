import { describe, expect, test } from "bun:test"
import { checkTest, restoreTest, sendTest } from "./unsubscribe-test"

const env = { RESEND_API_KEY: "re_test_key", RESEND_TOPIC_ID: "11111111-2222-3333-4444-555555555555" }
const draftId = "6cbb8fa7-2614-44f1-a1de-ec2531429389"
const launch = "6f48382e-5d4c-4b81-8631-231b0b18e206"
const testSeg = "78261eea-8f8b-4381-83c6-79fa7120f1cf"
const owner = {
	id: "c0ffee00-0000-4000-8000-000000000001",
	email: "owner@example.com",
	created_at: "2026-10-27 15:59:39+00",
	unsubscribed: false,
}
const later = {
	id: "c0ffee00-0000-4000-8000-000000000002",
	email: "later@example.com",
	created_at: "2026-10-27 16:40:00+00",
	unsubscribed: false,
}

type Call = { method: string; path: string; body?: unknown }

const B = "b0000000-0000-4000-8000-000000000009"

function resend(opts: { topicOnCreate?: boolean; testExists?: boolean; unsubscribed?: boolean } = {}) {
	const calls: Call[] = []
	let flag = opts.unsubscribed ?? false
	let topicState = opts.unsubscribed ? "opt_out" : "opt_in"
	// biome-ignore lint/suspicious/noExplicitAny: a fake wire body
	const routes: Record<string, (body: any) => unknown> = {
		[`GET /contacts?segment_id=${launch}&limit=100`]: () => ({ data: [later, owner] }),
		[`GET /contacts?segment_id=${testSeg}&limit=100`]: () => ({ data: [{ ...owner, unsubscribed: flag }] }),
		"GET /segments": () => ({ data: opts.testExists ? [{ id: testSeg, name: "Launch test" }] : [] }),
		"POST /segments": (body) => ({ id: testSeg, name: body.name }),
		[`POST /contacts/${owner.id}/segments/${testSeg}`]: () => ({ id: testSeg }),
		[`GET /broadcasts/${draftId}`]: () => ({
			id: draftId,
			name: "Launch email",
			from: "Nulo <hello@news.nulo.sh>",
			subject: "Nulo is live",
			reply_to: ["hello@nulo.sh"],
			html: "<p>x</p>",
			text: "x",
		}),
		"POST /broadcasts": () => ({ id: B }),
		[`GET /broadcasts/${B}`]: () => ({
			id: B,
			topic_id: opts.topicOnCreate === false ? null : env.RESEND_TOPIC_ID,
			segment_id: testSeg,
		}),
		[`POST /broadcasts/${B}/send`]: () => ({ id: B }),
		[`GET /contacts/${owner.id}/topics`]: () => ({
			data: [{ id: env.RESEND_TOPIC_ID, name: "Launch and product updates", subscription: topicState }],
		}),
		[`PATCH /contacts/${owner.id}`]: (body) => {
			flag = body.unsubscribed
			return { id: owner.id }
		},
		[`PATCH /contacts/${owner.id}/topics`]: (body) => {
			topicState = body[0].subscription
			return { id: env.RESEND_TOPIC_ID }
		},
	}
	const fetchImpl = async (input: string, init: RequestInit) => {
		const path = input.replace("https://api.resend.com", "")
		const method = init.method ?? "GET"
		const body = init.body ? JSON.parse(String(init.body)) : undefined
		calls.push({ method, path, body })
		const route = routes[`${method} ${path}`]
		return route ? Response.json(route(body)) : new Response("unexpected", { status: 500 })
	}
	return { calls, fetchImpl }
}

describe("sendTest", () => {
	test("takes the earliest contact, makes the test segment, copies the draft's envelope and bodies with the topic, verifies, then sends", async () => {
		const { calls, fetchImpl } = resend()
		const result = await sendTest(fetchImpl, env, draftId, launch)
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			`GET /contacts?segment_id=${launch}&limit=100`,
			"GET /segments",
			"POST /segments",
			`POST /contacts/${owner.id}/segments/${testSeg}`,
			`GET /broadcasts/${draftId}`,
			"POST /broadcasts",
			`GET /broadcasts/${B}`,
			`POST /broadcasts/${B}/send`,
		])
		const create = calls.find((c) => c.method === "POST" && c.path === "/broadcasts")?.body as Record<string, unknown>
		expect(create).toEqual({
			name: "Unsubscribe test: Launch email",
			segment_id: testSeg,
			topic_id: env.RESEND_TOPIC_ID,
			from: "Nulo <hello@news.nulo.sh>",
			subject: "Nulo is live",
			reply_to: ["hello@nulo.sh"],
			html: "<p>x</p>",
			text: "x",
		})
		expect(result).toMatchObject({
			contact: "o***@example.com",
			test_segment: testSeg,
			broadcast: "b0000000-0000-4000-8000-000000000009",
		})
		expect(JSON.stringify(result)).not.toContain("owner@")
	})

	test("reuses an existing test segment and refuses to send a broadcast that reads back without the topic", async () => {
		const { calls, fetchImpl } = resend({ testExists: true, topicOnCreate: false })
		await expect(sendTest(fetchImpl, env, draftId, launch)).rejects.toThrow("not sent")
		expect(calls.some((c) => c.method === "POST" && c.path === "/segments")).toBe(false)
		expect(calls.some((c) => c.path.endsWith("/send"))).toBe(false)
	})
})

describe("checkTest and restoreTest", () => {
	test("check reports the masked contact, its global flag and topic subscriptions", async () => {
		const { fetchImpl } = resend({ unsubscribed: true })
		expect(await checkTest(fetchImpl, env, testSeg)).toEqual({
			contact: "o***@example.com",
			unsubscribed: true,
			topics: [{ name: "Launch and product updates", subscription: "opt_out" }],
		})
	})

	test("restore clears the global flag, opts the topic back in and reads the state back", async () => {
		const { calls, fetchImpl } = resend({ unsubscribed: true })
		const after = await restoreTest(fetchImpl, env, testSeg)
		expect(calls.filter((c) => c.method === "PATCH").map((c) => [c.path, c.body])).toEqual([
			[`/contacts/${owner.id}`, { unsubscribed: false }],
			[`/contacts/${owner.id}/topics`, [{ id: env.RESEND_TOPIC_ID, subscription: "opt_in" }]],
		])
		expect(after).toMatchObject({ unsubscribed: false, topics: [{ subscription: "opt_in" }] })
	})
})
