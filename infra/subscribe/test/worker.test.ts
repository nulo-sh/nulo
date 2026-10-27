import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { BODY_CAP_BYTES, HONEYPOT_FIELD } from "../src/body"
import { RESEND_API, retryWaitMs, type Upstream } from "../src/resend"
import { SUCCESS_PATH } from "../src/respond"
import { createHandler, type Env } from "../src/worker"
import {
	ADDRESS,
	fakeUpstream,
	form,
	IP,
	json,
	makeEnv,
	NORMALIZED,
	post,
	type Recorded,
	reply,
	resendStore,
	TEST_KEY,
	UPSTREAM_TEXT,
	WRANGLER,
} from "./fakes"

const logged: unknown[][] = []
let restore: (() => void)[] = []

beforeEach(() => {
	logged.length = 0
	restore = (["log", "info", "warn", "error", "debug", "trace"] as const).map((method) => {
		const spy = spyOn(console, method).mockImplementation((...args: unknown[]) => {
			logged.push(args)
		})
		return () => spy.mockRestore()
	})
})

// Every test, so every branch, runs under the spy: no log line may carry the address, its local
// part, the visitor's IP, the key or anything Resend said.
afterEach(() => {
	for (const undo of restore) undo()
	const text = Bun.inspect(logged, { depth: 20 }).toLowerCase()
	for (const marker of [NORMALIZED, "probe.person", IP, TEST_KEY, UPSTREAM_TEXT]) expect(text).not.toContain(marker.toLowerCase())
})

// Owned by the test, not read from the source: nothing inherits nulo-landing's `_headers`.
const EXPECTED_HEADERS = {
	"cache-control": "no-store",
	"content-security-policy": "default-src 'none'; frame-ancestors 'none'",
	"cross-origin-resource-policy": "same-origin",
	"referrer-policy": "no-referrer",
	"strict-transport-security": "max-age=63072000; includeSubDomains; preload",
	"x-content-type-options": "nosniff",
	"x-frame-options": "DENY",
}

/** Runs the handler and holds every response, whatever its branch, to the Worker's own headers. */
async function run(request: Request, env: Env, up: Upstream): Promise<Response> {
	const response = await createHandler(up)(request, env)
	for (const [name, value] of Object.entries(EXPECTED_HEADERS)) expect(response.headers.get(name)).toBe(value)
	return response
}

const noUpstream = () => fakeUpstream(() => reply(500))
const REFUSED = '{"ok":false}'

async function expectRefusal(response: Response, status: number) {
	expect(response.status).toBe(status)
	expect(await response.text()).toBe(REFUSED)
}

async function snapshot(response: Response) {
	return { status: response.status, headers: [...response.headers.entries()], body: await response.text() }
}

describe("refusals before the body is read", () => {
	test("the kill switch answers 503 before the method, the Origin, the limiters or Resend are consulted", async () => {
		const env = makeEnv({ SUBSCRIBE_OFF: "1" })
		const upstream = noUpstream()
		await expectRefusal(await run(new Request("https://nulo.sh/api/subscribe"), env, upstream.up), 503)
		await expectRefusal(await run(form({ email: ADDRESS }), env, upstream.up), 503)
		expect(env.IP_LIMITER.keys).toEqual([])
		expect(upstream.requests).toEqual([])
		// Control: with the switch off, the same GET reaches the method check.
		expect((await run(new Request("https://nulo.sh/api/subscribe"), makeEnv(), upstream.up)).status).toBe(405)
	})

	test("every method but POST is a 405 naming POST", async () => {
		for (const method of ["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]) {
			const response = await run(new Request("https://nulo.sh/api/subscribe", { method }), makeEnv(), noUpstream().up)
			expect(response.status).toBe(405)
			expect(response.headers.get("allow")).toBe("POST")
		}
	})

	test("an Origin other than exactly https://nulo.sh is a 403 that spends no visitor's rate-limit budget", async () => {
		const env = makeEnv()
		const origins = [
			null,
			"null",
			"https://3f2a9c1b-nulo-landing.example.workers.dev",
			"http://nulo.sh",
			"https://www.nulo.sh",
			"https://nulo.sh.evil.example",
			"https://nulo.sh:443",
			"https://evil.example",
		]
		for (const origin of origins) {
			const request = form({ email: ADDRESS })
			if (origin === null) request.headers.delete("origin")
			else request.headers.set("origin", origin)
			await expectRefusal(await run(request, env, noUpstream().up), 403)
		}
		expect(env.IP_LIMITER.keys).toEqual([])
		expect(env.GLOBAL_LIMITER.keys).toEqual([])
	})

	test("a request without CF-Connecting-IP is a 400, never a shared limiter bucket", async () => {
		const env = makeEnv()
		const request = form({ email: ADDRESS })
		request.headers.delete("cf-connecting-ip")
		await expectRefusal(await run(request, env, noUpstream().up), 400)
		expect(env.IP_LIMITER.keys).toEqual([])
	})

	test("the sixth submission from one IP in a window is a 429, and another IP is still admitted", async () => {
		const env = makeEnv()
		const store = resendStore(409)
		const { up } = fakeUpstream(store.answer)
		for (let i = 0; i < 5; i++) expect((await run(json({ email: `p${i}@example.com` }), env, up)).status).toBe(200)
		await expectRefusal(await run(json({ email: "p5@example.com" }), env, up), 429)
		expect(store.attempts()).toBe(5)
		const other = json({ email: "p6@example.com" }, { "cf-connecting-ip": "198.51.100.9" })
		expect((await run(other, env, up)).status).toBe(200)
		expect(new Set(env.IP_LIMITER.keys)).toEqual(new Set([IP, "198.51.100.9"]))
	})

	test("the global ceiling refuses with a 429 once spent, whatever the IP", async () => {
		const env = makeEnv()
		const { limit } = WRANGLER.ratelimits.find((r: { name: string }) => r.name === "GLOBAL_LIMITER").simple
		const decoy = (i: number) => form({ email: "x@example.com", [HONEYPOT_FIELD]: "bot" }, { "cf-connecting-ip": `10.0.0.${i}` })
		for (let i = 0; i < limit; i++) expect((await run(decoy(i), env, noUpstream().up)).status).toBe(303)
		await expectRefusal(await run(decoy(limit), env, noUpstream().up), 429)
		expect(new Set(env.GLOBAL_LIMITER.keys).size).toBe(1)
	})
})

describe("the body", () => {
	test("a body past 2 KB is a 413 even when Content-Length lies, and the stream is not pulled past the cap", async () => {
		// Large rather than endless, so a reader that ignores the cap fails on the status, not a hang.
		let pulls = 0
		const endless = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (++pulls > 256) controller.close()
				else controller.enqueue(new Uint8Array(1024).fill(0x61))
			},
		})
		const request = new Request("https://nulo.sh/api/subscribe", {
			method: "POST",
			body: endless,
			headers: {
				origin: "https://nulo.sh",
				"cf-connecting-ip": IP,
				"content-type": "application/x-www-form-urlencoded",
				"content-length": "10",
			},
			duplex: "half",
		} as RequestInit)
		const upstream = noUpstream()
		await expectRefusal(await run(request, makeEnv(), upstream.up), 413)
		expect(pulls).toBeLessThanOrEqual(BODY_CAP_BYTES / 1024 + 2)
		expect(upstream.requests).toEqual([])
	})

	test("a body of exactly the cap is read; one byte more is a 413", async () => {
		const exact = (extra: number) => {
			const base = new URLSearchParams({ email: "fits@example.com", pad: "" }).toString()
			return post(base + "x".repeat(BODY_CAP_BYTES - base.length + extra))
		}
		const { up } = fakeUpstream(resendStore(409).answer)
		expect((await run(exact(0), makeEnv(), up)).status).toBe(303)
		await expectRefusal(await run(exact(1), makeEnv(), up), 413)
	})

	test("a malformed body is a 400 that reaches no one", async () => {
		const cases: Request[] = [
			post("{not json", { contentType: "application/json" }),
			post(`["${NORMALIZED}"]`, { contentType: "application/json" }),
			post(`"${NORMALIZED}"`, { contentType: "application/json" }),
			post(JSON.stringify({ email: 5 }), { contentType: "application/json" }),
			post(JSON.stringify({ email: NORMALIZED, [HONEYPOT_FIELD]: 1 }), { contentType: "application/json" }),
			post(`email=${NORMALIZED}`, { contentType: "text/plain" }),
			post(`email=${NORMALIZED}`, { contentType: "multipart/form-data; boundary=x" }),
			post(new Uint8Array([0x65, 0x6d, 0x61, 0x69, 0x6c, 0x3d, 0xff, 0xfe])),
			post("name=someone"),
		]
		const upstream = noUpstream()
		for (const request of cases) await expectRefusal(await run(request, makeEnv(), upstream.up), 400)
		expect(upstream.requests).toEqual([])
	})
})

describe("the address", () => {
	const refused: [string, string][] = [
		["no @", "person.example.com"],
		["two @", "a@b@example.com"],
		["an empty local part", "@example.com"],
		["no dot in the domain", "person@localhost"],
		["an inner space", "per son@example.com"],
		["a control character", "per\u0007son@example.com"],
		["over 254 characters", `${"a".repeat(64)}@${`${"b".repeat(60)}.`.repeat(4)}com`],
		["a local part over 64 characters", `${"a".repeat(65)}@example.com`],
		["a URL path character", "a/b@example.com"],
		["a query character", "a?b@example.com"],
		["a fragment character", "a#b@example.com"],
		["a percent escape", "a%40b@example.com"],
		["a dot at the edge of the local part", ".person@example.com"],
		["two dots in a row", "per..son@example.com"],
		["a domain label with a hyphen at its edge", "person@-example.com"],
		["a non-ASCII domain", "person@exämple.com"],
		["a numeric top-level label", "person@10.0.0.1"],
	]

	test.each(refused)("an address with %s is a 400 before Resend", async (_, address) => {
		const upstream = noUpstream()
		await expectRefusal(await run(json({ email: address }), makeEnv(), upstream.up), 400)
		expect(upstream.requests).toEqual([])
	})

	test("normalization trims and lowercases the domain only; every accepted character reaches Resend's path verbatim", async () => {
		const store = resendStore(409)
		const upstream = fakeUpstream(store.answer)
		expect((await run(json({ email: ADDRESS }), makeEnv(), upstream.up)).status).toBe(200)
		expect(new URL(upstream.requests[0].url).pathname).toBe(`/contacts/${NORMALIZED}`)
		const unusual = "o'brien!$&*+=_~-x.y@sub-domain.example.org"
		expect((await run(json({ email: unusual }, { "cf-connecting-ip": "198.51.100.2" }), makeEnv(), upstream.up)).status).toBe(200)
		expect(new URL(upstream.requests[2].url).pathname).toBe(`/contacts/${unusual}`)
		expect([...store.contacts.keys()]).toEqual([NORMALIZED, unusual])
	})
})

describe("Resend", () => {
	test("a new address is looked up, then created once with the segment, the opted-in topic and the three properties", async () => {
		const store = resendStore(409)
		const upstream = fakeUpstream(store.answer)
		const response = await run(json({ email: ADDRESS }), makeEnv(), upstream.up)
		expect(response.status).toBe(200)
		expect(await response.text()).toBe('{"ok":true}')
		const [lookup, create] = upstream.requests
		expect(upstream.requests).toHaveLength(2)
		for (const request of [lookup, create]) {
			expect(request.headers.get("authorization")).toBe(`Bearer ${TEST_KEY}`)
			expect(request.headers.get("user-agent")).toBe("nulo-subscribe")
		}
		expect([lookup.method, lookup.url]).toEqual(["GET", `${RESEND_API}/contacts/${NORMALIZED}`])
		expect([create.method, create.url, create.headers.get("content-type")]).toEqual([
			"POST",
			`${RESEND_API}/contacts`,
			"application/json",
		])
		expect(JSON.parse(create.body)).toEqual({
			email: NORMALIZED,
			unsubscribed: false,
			segments: [{ id: WRANGLER.vars.RESEND_SEGMENT_ID }],
			topics: [{ id: WRANGLER.vars.RESEND_TOPIC_ID, subscription: "opt_in" }],
			properties: { source: "landing", consent_version: WRANGLER.vars.CONSENT_VERSION, consented_at: "2026-10-27T12:00:00.000Z" },
		})
	})

	const states: [string, Record<string, unknown>][] = [
		["subscribed", { unsubscribed: false }],
		["unsubscribed", { unsubscribed: true }],
		["opted out of the topic", { unsubscribed: false, topics: [{ subscription: "opt_out" }] }],
		["with foreign properties", { unsubscribed: false, properties: { source: { value: "import", type: "string" } } }],
	]

	test.each(states)("a known address %s gets no write and the answer a new address gets", async (_, state) => {
		const fresh = await snapshot(await run(json({ email: ADDRESS }), makeEnv(), fakeUpstream(resendStore(409).answer).up))
		const upstream = fakeUpstream(() => Response.json({ object: "contact", email: NORMALIZED, ...state }))
		const known = await snapshot(await run(json({ email: ADDRESS }), makeEnv(), upstream.up))
		expect(upstream.requests.map((r) => r.method)).toEqual(["GET"])
		expect(known).toEqual(fresh)
	})

	test("a known address waits out its lookup's length, so it answers no faster than a new one", async () => {
		let upstream: ReturnType<typeof fakeUpstream>
		upstream = fakeUpstream(() => {
			upstream.advance(140)
			return Response.json({ object: "contact" })
		})
		await run(json({ email: ADDRESS }), makeEnv(), upstream.up)
		expect(upstream.sleeps).toEqual([140])
		const fresh = fakeUpstream(resendStore(409).answer)
		await run(json({ email: ADDRESS }), makeEnv(), fresh.up)
		expect(fresh.sleeps).toEqual([])
	})

	test("a filled honeypot answers exactly like a new address and calls Resend not at all", async () => {
		const fresh = await snapshot(await run(json({ email: ADDRESS }), makeEnv(), fakeUpstream(resendStore(409).answer).up))
		const upstream = noUpstream()
		for (const email of [ADDRESS, "not an address"]) {
			const decoy = await snapshot(await run(json({ email, [HONEYPOT_FIELD]: "https://spam.example" }), makeEnv(), upstream.up))
			expect(decoy).toEqual(fresh)
		}
		expect((await run(form({ email: ADDRESS, [HONEYPOT_FIELD]: "x" }), makeEnv(), upstream.up)).status).toBe(303)
		expect(upstream.requests).toEqual([])
	})

	test.each([409, 422])(
		"two concurrent first submissions of one address both succeed and leave one contact (duplicate create answered %i)",
		async (duplicate) => {
			const store = resendStore(duplicate)
			let release: () => void = () => {}
			const bothLookedUp = new Promise<void>((resolve) => (release = resolve))
			let lookups = 0
			const upstream = fakeUpstream(async (request) => {
				if (request.method === "GET" && ++lookups === 2) release()
				if (request.method === "GET" && lookups <= 2) await bothLookedUp
				return store.answer(request)
			})
			const env = makeEnv()
			const answers = await Promise.all([
				run(json({ email: ADDRESS }), env, upstream.up),
				run(json({ email: ADDRESS }), env, upstream.up),
			])
			expect(answers.map((a) => a.status)).toEqual([200, 200])
			expect(store.contacts.size).toBe(1)
			expect(store.attempts()).toBe(2)
		},
	)

	test("a 429 or 5xx is retried once after its retry-after, capped at 2 s", async () => {
		const script = [
			reply(429, { "retry-after": "1" }),
			reply(404),
			reply(503, { "retry-after": "30" }),
			new Response(null, { status: 201 }),
		]
		const upstream = fakeUpstream(() => script.shift() ?? reply(500))
		expect((await run(json({ email: ADDRESS }), makeEnv(), upstream.up)).status).toBe(200)
		expect(upstream.requests.map((r) => r.method)).toEqual(["GET", "GET", "POST", "POST"])
		expect(upstream.sleeps).toEqual([1000, 2000])
		expect(retryWaitMs("Tue, 27 Oct 2026 12:00:01 GMT", Date.parse("2026-10-27T12:00:00Z"))).toBe(1000)
		expect(retryWaitMs(null, 0)).toBe(1000)
	})

	test("a second 429 or 5xx is a 503, and the create is never sent a third time", async () => {
		const lookupFails = fakeUpstream(() => reply(500))
		await expectRefusal(await run(json({ email: ADDRESS }), makeEnv(), lookupFails.up), 503)
		expect(lookupFails.requests).toHaveLength(2)
		const createFails = fakeUpstream((request) => (request.method === "GET" ? reply(404) : reply(429)))
		await expectRefusal(await run(json({ email: ADDRESS }), makeEnv(), createFails.up), 503)
		expect(createFails.requests.map((r) => r.method)).toEqual(["GET", "POST", "POST"])
	})

	test("an upstream that does not answer within the timeout is a 503, not a hung request", async () => {
		const upstream = fakeUpstream(
			(_, init) =>
				new Promise<Response>((_, reject) => {
					init.signal?.addEventListener("abort", () => reject(init.signal?.reason))
				}),
			20,
		)
		await expectRefusal(await run(json({ email: ADDRESS }), makeEnv(), upstream.up), 503)
		expect(upstream.requests).toHaveLength(1)
	})

	test("any other Resend error is a 502 that carries none of Resend's text", async () => {
		const answers: [string, (request: Recorded) => Response][] = [
			["the lookup refused (bad key)", () => reply(401)],
			["the lookup forbidden", () => reply(403)],
			["the create refused and the address still unknown", (r) => (r.method === "GET" ? reply(404) : reply(422))],
		]
		for (const [, answer] of answers) {
			const response = await run(json({ email: ADDRESS }), makeEnv(), fakeUpstream(answer).up)
			await expectRefusal(response, 502)
		}
		expect(logged.length).toBe(answers.length)
		expect(Bun.inspect(logged)).toContain("status")
	})

	test("a missing key or id is a 503 before Resend is called", async () => {
		const upstream = noUpstream()
		for (const overrides of [
			{ RESEND_API_KEY: undefined },
			{ RESEND_API_KEY: "" },
			{ RESEND_SEGMENT_ID: undefined },
			{ CONSENT_VERSION: "" },
		]) {
			await expectRefusal(await run(json({ email: ADDRESS }), makeEnv(overrides), upstream.up), 503)
		}
		expect(upstream.requests).toEqual([])
	})
})

describe("answers", () => {
	test("a plain form post is sent on to the confirmation page; a fetch caller gets JSON", async () => {
		const { up } = fakeUpstream(resendStore(409).answer)
		const plain = await run(form({ email: ADDRESS }), makeEnv(), up)
		expect([plain.status, plain.headers.get("location"), await plain.text()]).toEqual([303, SUCCESS_PATH, ""])
		const cors = await run(form({ email: ADDRESS }, { "sec-fetch-mode": "cors" }), makeEnv(), up)
		expect([cors.status, cors.headers.get("content-type"), await cors.text()]).toEqual([200, "application/json", '{"ok":true}'])
	})

	test("an unexpected failure is a 503 whose log line names the error, never its message", async () => {
		const env = makeEnv()
		env.IP_LIMITER.limit = async () => {
			throw new TypeError(`limiter broke on ${NORMALIZED} from ${IP}`)
		}
		await expectRefusal(await run(form({ email: ADDRESS }), env, noUpstream().up), 503)
		expect(Bun.inspect(logged)).toContain("TypeError")
	})
})
