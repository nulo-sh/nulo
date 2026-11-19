import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { BODY_CAP_BYTES, HONEYPOT_FIELD } from "../src/body"
import { CONFIRM_URL } from "../src/confirmation"
import { RESEND_API, retryWaitMs, type Upstream } from "../src/resend"
import { SUCCESS_PATH } from "../src/respond"
import { readToken, sendKey, signToken, TOKEN_TTL_MS } from "../src/token"
import { CONFIRM_PATH, createHandler, type Env, SUBSCRIBE_PATH } from "../src/worker"
import {
	ADDRESS,
	confirmWith,
	fakeUpstream,
	form,
	IP,
	json,
	KEY_MARKER,
	makeEnv,
	NORMALIZED,
	post,
	type Recorded,
	reply,
	resendStore,
	TEST_KEY,
	TEST_SECRET,
	TOKEN_MARKER,
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
// part, the visitor's IP, the key, the confirmation secret, a token, a send key or anything Resend said.
afterEach(() => {
	for (const undo of restore) undo()
	const text = Bun.inspect(logged, { depth: 20 }).toLowerCase()
	for (const marker of [NORMALIZED, "probe.person", IP, TEST_KEY, TEST_SECRET, TOKEN_MARKER, KEY_MARKER, UPSTREAM_TEXT]) {
		expect(text).not.toContain(marker.toLowerCase())
	}
})

// Owned by the test, not read from the source: nothing inherits nulo-landing's `_headers`.
const EXPECTED_HEADERS = {
	"cache-control": "no-store",
	"content-security-policy": "default-src 'none'; frame-ancestors 'none'",
	"cross-origin-resource-policy": "same-origin",
	"permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()",
	"referrer-policy": "no-referrer",
	"strict-transport-security": "max-age=63072000; includeSubDomains; preload",
	"x-content-type-options": "nosniff",
	"x-frame-options": "DENY",
}

/** The fake upstream's clock at rest. */
const START = Date.parse("2026-10-27T12:00:00.000Z")

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

const found = (state: Record<string, unknown> = {}) => Response.json({ object: "contact", email: NORMALIZED, ...state })
const sends = (requests: Recorded[]) => requests.filter((r) => r.url === `${RESEND_API}/emails`)
const linkToken = (text: string) => (/https:\/\/nulo\.sh\/confirm#(\S+)/.exec(text) as RegExpExecArray)[1] as string

// A request each path refuses on its own merits, without calling Resend, so what a test observes is
// the admission in front of it.
describe.each([
	{ path: SUBSCRIBE_PATH, harmless: (headers?: Record<string, string>) => json({ email: "not an address" }, headers) },
	{ path: CONFIRM_PATH, harmless: (headers?: Record<string, string>) => confirmWith("not-a-token", headers) },
])("admission on $path", ({ path, harmless }) => {
	const url = `https://nulo.sh${path}`

	test("the kill switch answers 503 before the method, the Origin, the limiters or Resend are consulted", async () => {
		const env = makeEnv({ SUBSCRIBE_OFF: "1" })
		const upstream = noUpstream()
		await expectRefusal(await run(new Request(url), env, upstream.up), 503)
		await expectRefusal(await run(harmless(), env, upstream.up), 503)
		expect(env.IP_LIMITER.keys).toEqual([])
		expect(upstream.requests).toEqual([])
		// Control: with the switch off, the same GET reaches the method check.
		expect((await run(new Request(url), makeEnv(), upstream.up)).status).toBe(405)
	})

	test("every method but POST is a 405 naming POST", async () => {
		for (const method of ["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]) {
			const response = await run(new Request(url, { method }), makeEnv(), noUpstream().up)
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
			const request = harmless()
			if (origin === null) request.headers.delete("origin")
			else request.headers.set("origin", origin)
			await expectRefusal(await run(request, env, noUpstream().up), 403)
		}
		expect(env.IP_LIMITER.keys).toEqual([])
		expect(env.GLOBAL_LIMITER.keys).toEqual([])
	})

	test("a request without CF-Connecting-IP is a 400, never a shared limiter bucket", async () => {
		const env = makeEnv()
		const request = harmless()
		request.headers.delete("cf-connecting-ip")
		await expectRefusal(await run(request, env, noUpstream().up), 400)
		expect(env.IP_LIMITER.keys).toEqual([])
	})

	test("the sixth request from one IP in a window is a 429, and another IP is still admitted", async () => {
		const env = makeEnv()
		for (let i = 0; i < 5; i++) await expectRefusal(await run(harmless(), env, noUpstream().up), 400)
		await expectRefusal(await run(harmless(), env, noUpstream().up), 429)
		await expectRefusal(await run(harmless({ "cf-connecting-ip": "198.51.100.9" }), env, noUpstream().up), 400)
		expect(new Set(env.IP_LIMITER.keys)).toEqual(new Set([IP, "198.51.100.9"]))
	})

	test("the global ceiling refuses with a 429 once spent, whatever the IP", async () => {
		const env = makeEnv()
		const { limit } = WRANGLER.ratelimits.find((r: { name: string }) => r.name === "GLOBAL_LIMITER").simple
		for (let i = 0; i < limit; i++) {
			await expectRefusal(await run(harmless({ "cf-connecting-ip": `10.0.0.${i}` }), env, noUpstream().up), 400)
		}
		await expectRefusal(await run(harmless({ "cf-connecting-ip": `10.0.0.${limit}` }), env, noUpstream().up), 429)
		expect(new Set(env.GLOBAL_LIMITER.keys).size).toBe(1)
	})

	test("a body past 2 KB is a 413 even when Content-Length lies, and the stream is not pulled past the cap", async () => {
		// Large rather than endless, so a reader that ignores the cap fails on the status, not a hang.
		let pulls = 0
		const endless = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (++pulls > 256) controller.close()
				else controller.enqueue(new Uint8Array(1024).fill(0x61))
			},
		})
		const request = new Request(url, {
			method: "POST",
			body: endless,
			headers: { origin: "https://nulo.sh", "cf-connecting-ip": IP, "content-type": "application/json", "content-length": "10" },
			duplex: "half",
		} as RequestInit)
		const upstream = noUpstream()
		await expectRefusal(await run(request, makeEnv(), upstream.up), 413)
		expect(pulls).toBeLessThanOrEqual(BODY_CAP_BYTES / 1024 + 2)
		expect(upstream.requests).toEqual([])
	})

	test("a malformed body is a 400 that reaches no one", async () => {
		const malformed = (body: RequestInit["body"], contentType: string) => post(body, { contentType, path })
		const cases: Request[] = [
			malformed("{not json", "application/json"),
			malformed(`["${NORMALIZED}"]`, "application/json"),
			malformed(`"${NORMALIZED}"`, "application/json"),
			malformed(JSON.stringify({ email: 5 }), "application/json"),
			malformed(JSON.stringify({ token: 5 }), "application/json"),
			malformed(JSON.stringify({ email: NORMALIZED, [HONEYPOT_FIELD]: 1 }), "application/json"),
			malformed(`email=${NORMALIZED}`, "text/plain"),
			malformed(`email=${NORMALIZED}`, "multipart/form-data; boundary=x"),
			malformed(new Uint8Array([0x65, 0x6d, 0x61, 0x69, 0x6c, 0x3d, 0xff, 0xfe]), "application/x-www-form-urlencoded"),
			malformed("name=someone", "application/x-www-form-urlencoded"),
		]
		const upstream = noUpstream()
		for (const request of cases) await expectRefusal(await run(request, makeEnv(), upstream.up), 400)
		expect(upstream.requests).toEqual([])
	})
})

test("any other path is a 404 before the limiters", async () => {
	const env = makeEnv()
	for (const path of ["/", "/api/unsubscribe", "/api/confirm/", "/api/Subscribe", "/api/subscribe/x"]) {
		await expectRefusal(await run(json({ email: ADDRESS }, {}, path), env, noUpstream().up), 404)
	}
	expect(env.IP_LIMITER.keys).toEqual([])
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

	test("normalization trims and lowercases the domain only; every accepted character reaches Resend verbatim", async () => {
		const store = resendStore(409)
		const upstream = fakeUpstream(store.answer)
		expect((await run(json({ email: ADDRESS }), makeEnv(), upstream.up)).status).toBe(200)
		expect(new URL(upstream.requests[0]?.url as string).pathname).toBe(`/contacts/${NORMALIZED}`)
		const unusual = "o'brien!$&*+=_~-x.y@sub-domain.example.org"
		expect((await run(json({ email: unusual }, { "cf-connecting-ip": "198.51.100.2" }), makeEnv(), upstream.up)).status).toBe(200)
		expect(new URL(upstream.requests[2]?.url as string).pathname).toBe(`/contacts/${unusual}`)
		expect(store.emails.map((e) => JSON.parse(e.body).to)).toEqual([NORMALIZED, unusual])
	})
})

describe("signup", () => {
	test("a new address is looked up, then sent one confirmation email under its key; no contact is written", async () => {
		const store = resendStore(409)
		const upstream = fakeUpstream(store.answer)
		const response = await run(json({ email: ADDRESS }), makeEnv(), upstream.up)
		expect([response.status, await response.text()]).toEqual([200, '{"ok":true}'])
		const [lookup, send] = upstream.requests
		expect(upstream.requests).toHaveLength(2)
		for (const request of [lookup, send]) {
			expect(request?.headers.get("authorization")).toBe(`Bearer ${TEST_KEY}`)
			expect(request?.headers.get("user-agent")).toBe("nulo-subscribe")
		}
		expect([lookup?.method, lookup?.url]).toEqual(["GET", `${RESEND_API}/contacts/${NORMALIZED}`])
		expect([send?.method, send?.url, send?.headers.get("content-type")]).toEqual(["POST", `${RESEND_API}/emails`, "application/json"])
		expect(send?.headers.get("idempotency-key")).toBe(await sendKey(TEST_SECRET, NORMALIZED))
		const email = JSON.parse(send?.body as string)
		expect(email).toMatchObject({ from: "Nulo <hello@news.nulo.sh>", reply_to: "hello@nulo.sh", to: NORMALIZED })
		const token = linkToken(email.text)
		expect(email.html).toContain(`href="${CONFIRM_URL}#${token}"`)
		expect(await readToken(TEST_SECRET, token, START)).toBe(NORMALIZED)
		expect(JSON.parse(Buffer.from(token.split(".")[0] as string, "base64url").toString()).t).toBe(START)
		expect(store.contacts.size).toBe(0)
	})

	const states: [string, Record<string, unknown>][] = [
		["subscribed", { unsubscribed: false }],
		["unsubscribed", { unsubscribed: true }],
		["opted out of the topic", { unsubscribed: false, topics: [{ subscription: "opt_out" }] }],
		["with foreign properties", { unsubscribed: false, properties: { source: { value: "import", type: "string" } } }],
	]

	test.each(states)("a known address %s gets no email, no write and the answer a new address gets", async (_, state) => {
		const fresh = await snapshot(await run(json({ email: ADDRESS }), makeEnv(), fakeUpstream(resendStore(409).answer).up))
		const upstream = fakeUpstream(() => found(state))
		const known = await snapshot(await run(json({ email: ADDRESS }), makeEnv(), upstream.up))
		expect(upstream.requests.map((r) => r.method)).toEqual(["GET", "GET"])
		expect(known).toEqual(fresh)
	})

	test("a repeat inside 24 h sends the same key with a new body: Resend refuses it, one email, identical answers", async () => {
		const store = resendStore(409)
		const upstream = fakeUpstream(store.answer)
		const env = makeEnv()
		const first = await snapshot(await run(json({ email: ADDRESS }), env, upstream.up))
		upstream.advance(60_000)
		const second = await snapshot(await run(json({ email: ADDRESS }, { "cf-connecting-ip": "198.51.100.3" }), env, upstream.up))
		expect(second).toEqual(first)
		const [a, b] = sends(upstream.requests)
		expect(b?.headers.get("idempotency-key")).toBe(a?.headers.get("idempotency-key") as string)
		expect(b?.body).not.toBe(a?.body as string)
		expect(store.emails).toHaveLength(1)
		// Once Resend lets the key go, the address can be sent another email.
		upstream.advance(TOKEN_TTL_MS)
		expect((await run(json({ email: ADDRESS }, { "cf-connecting-ip": "198.51.100.4" }), env, upstream.up)).status).toBe(200)
		expect(store.emails).toHaveLength(2)
	})

	test("each key-conflict 409 counts as sent; another 409, a 409 without a body and a 422 are a 502", async () => {
		for (const name of ["invalid_idempotent_request", "concurrent_idempotent_requests"]) {
			const script = [reply(404), reply(409, {}, name)]
			const upstream = fakeUpstream(() => script.shift() ?? reply(500))
			expect((await run(json({ email: ADDRESS }), makeEnv(), upstream.up)).status).toBe(200)
		}
		for (const refusal of [reply(409, {}, "resource_locked"), new Response(null, { status: 409 }), reply(422)]) {
			const script = [reply(404), refusal]
			const upstream = fakeUpstream(() => script.shift() ?? reply(500))
			await expectRefusal(await run(json({ email: ADDRESS }), makeEnv(), upstream.up), 502)
			expect(upstream.requests.map((r) => r.method)).toEqual(["GET", "POST"])
		}
	})

	test("a known address makes as many round trips as a new one, so a saturated Resend answers both with the same 503", async () => {
		let lookups = 0
		const known = fakeUpstream(() => (++lookups === 1 ? found() : reply(429)))
		const fresh = fakeUpstream((r) => (r.method === "GET" ? reply(404) : reply(429)))
		for (const { up } of [known, fresh]) await expectRefusal(await run(json({ email: ADDRESS }), makeEnv(), up), 503)
		expect(known.requests.map((r) => r.method)).toEqual(["GET", "GET", "GET"])
		expect(fresh.requests.map((r) => r.method)).toEqual(["GET", "POST", "POST"])
		expect(known.sleeps).toEqual(fresh.sleeps)
	})

	// A known limit, kept visible: a refusal of sends alone (the daily send quota spent) fails a new
	// address while a listed one, which needs no send, still succeeds.
	test("a refusal of sends alone answers a new address 503 while a listed one still gets the success answer", async () => {
		const fresh = fakeUpstream((r) => (r.method === "GET" ? reply(404) : reply(429)))
		await expectRefusal(await run(json({ email: ADDRESS }), makeEnv(), fresh.up), 503)
		const known = fakeUpstream(() => found())
		expect((await run(json({ email: ADDRESS }), makeEnv(), known.up)).status).toBe(200)
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
})

describe("confirmation", () => {
	const token = () => signToken(TEST_SECRET, NORMALIZED, START)

	test("a valid token creates the contact once, with the segment, the topic and the confirmation's version and time", async () => {
		const store = resendStore(409)
		const upstream = fakeUpstream(store.answer)
		upstream.advance(60 * 60 * 1000)
		const response = await run(confirmWith(await token()), makeEnv(), upstream.up)
		expect([response.status, response.headers.get("content-type"), await response.text()]).toEqual([
			200,
			"application/json",
			'{"ok":true}',
		])
		const [lookup, create] = upstream.requests
		expect(upstream.requests).toHaveLength(2)
		expect([lookup?.method, lookup?.url]).toEqual(["GET", `${RESEND_API}/contacts/${NORMALIZED}`])
		expect([create?.method, create?.url]).toEqual(["POST", `${RESEND_API}/contacts`])
		expect(JSON.parse(create?.body as string)).toEqual({
			email: NORMALIZED,
			unsubscribed: false,
			segments: [{ id: WRANGLER.vars.RESEND_SEGMENT_ID }],
			topics: [{ id: WRANGLER.vars.RESEND_TOPIC_ID, subscription: "opt_in" }],
			properties: { source: "landing", consent_version: WRANGLER.vars.CONSENT_VERSION, consented_at: "2026-10-27T13:00:00.000Z" },
		})
	})

	test("a token used twice creates one contact and answers 200 both times", async () => {
		const store = resendStore(409)
		const upstream = fakeUpstream(store.answer)
		for (const ip of [IP, "198.51.100.5"]) {
			expect((await run(confirmWith(await token(), { "cf-connecting-ip": ip }), makeEnv(), upstream.up)).status).toBe(200)
		}
		expect(store.attempts()).toBe(1)
		expect(upstream.requests.map((r) => r.method)).toEqual(["GET", "POST", "GET", "GET"])
	})

	test.each([409, 422, "upsert"] as const)(
		"two concurrent confirmations of one address both succeed and leave one contact (duplicate create: %p)",
		async (duplicate) => {
			const store = resendStore(duplicate)
			let release: () => void = () => {}
			const bothLookedUp = new Promise<void>((resolve) => (release = resolve))
			let lookups = 0
			const upstream = fakeUpstream(async (request, init, now) => {
				if (request.method === "GET" && ++lookups === 2) release()
				if (request.method === "GET" && lookups <= 2) await bothLookedUp
				return store.answer(request, init, now)
			})
			const env = makeEnv()
			const answers = await Promise.all([
				run(confirmWith(await token()), env, upstream.up),
				run(confirmWith(await token()), env, upstream.up),
			])
			expect(answers.map((a) => a.status)).toEqual([200, 200])
			expect(store.contacts.size).toBe(1)
			expect(store.attempts()).toBe(2)
		},
	)

	test("a listed address, unsubscribed, is not written by a valid token", async () => {
		const upstream = fakeUpstream(() => found({ unsubscribed: true }))
		expect((await run(confirmWith(await token()), makeEnv(), upstream.up)).status).toBe(200)
		expect(upstream.requests.map((r) => r.method)).toEqual(["GET", "GET"])
	})

	test("every token that does not verify gets the same 400 and reaches no one", async () => {
		const valid = await token()
		const [payload, mac] = valid.split(".") as [string, string]
		const other = (await signToken(TEST_SECRET, "someone@example.com", START)).split(".")[0] as string
		const at = (clock: number) => {
			const upstream = noUpstream()
			upstream.advance(clock - START)
			return upstream
		}
		const cases: [string, Request, ReturnType<typeof noUpstream>][] = [
			["expired", confirmWith(valid), at(START + TOKEN_TTL_MS + 1)],
			["forged", confirmWith(await signToken("another-secret-of-thirty-two-chars!!", NORMALIZED, START)), at(START)],
			["another payload under this MAC", confirmWith(`${other}.${mac}`), at(START)],
			["a changed MAC", confirmWith(`${payload}.${mac.startsWith("A") ? "B" : "A"}${mac.slice(1)}`), at(START)],
			["malformed", confirmWith("not-a-token"), at(START)],
			["three parts", confirmWith(`${valid}.x`), at(START)],
			["empty", confirmWith(""), at(START)],
			["missing", confirmWith(undefined), at(START)],
			["over-long", confirmWith(`${valid}${"A".repeat(1024)}`), at(START)],
		]
		const answers = []
		for (const [, request, upstream] of cases) {
			answers.push(await snapshot(await run(request, makeEnv(), upstream.up)))
			expect(upstream.requests).toEqual([])
		}
		for (const answer of answers) expect(answer).toEqual({ ...(answers[0] as (typeof answers)[0]), body: REFUSED })
		expect(answers[0]?.status).toBe(400)
		// Control: the same valid token one millisecond inside its life still confirms.
		const live = fakeUpstream(resendStore(409).answer)
		live.advance(TOKEN_TTL_MS)
		expect((await run(confirmWith(valid), makeEnv(), live.up)).status).toBe(200)
	})
})

describe("Resend", () => {
	test("no request ever follows a redirect, so the key cannot be forwarded to another host", async () => {
		const upstream = fakeUpstream(
			() => new Response(null, { status: 307, headers: { location: "https://elsewhere.example/contacts" } }),
		)
		await expectRefusal(await run(json({ email: ADDRESS }), makeEnv(), upstream.up), 502)
		const store = fakeUpstream(resendStore(409).answer)
		await run(json({ email: ADDRESS }), makeEnv(), store.up)
		await run(confirmWith(await signToken(TEST_SECRET, NORMALIZED, START)), makeEnv(), store.up)
		for (const request of [...upstream.requests, ...store.requests]) expect(request.redirect).toBe("manual")
		expect(upstream.requests.map((r) => r.url)).toEqual([`${RESEND_API}/contacts/${NORMALIZED}`])
	})

	test("a 429 or 5xx is retried once after its retry-after, capped at 2 s, with the same key and body", async () => {
		const script = [reply(429, { "retry-after": "1" }), reply(404), reply(503, { "retry-after": "30" }), Response.json({ id: "x" })]
		const upstream = fakeUpstream(() => script.shift() ?? reply(500))
		expect((await run(json({ email: ADDRESS }), makeEnv(), upstream.up)).status).toBe(200)
		expect(upstream.requests.map((r) => r.method)).toEqual(["GET", "GET", "POST", "POST"])
		expect(upstream.sleeps).toEqual([1000, 2000])
		const [first, retry] = sends(upstream.requests)
		expect([retry?.headers.get("idempotency-key"), retry?.body]).toEqual([first?.headers.get("idempotency-key"), first?.body])
		expect(retryWaitMs("Tue, 27 Oct 2026 12:00:01 GMT", Date.parse("2026-10-27T12:00:00Z"))).toBe(1000)
		expect(retryWaitMs(null, 0)).toBe(1000)
	})

	test("a second 429 or 5xx is a 503, and a write is never sent a third time", async () => {
		const lookupFails = fakeUpstream(() => reply(500))
		await expectRefusal(await run(json({ email: ADDRESS }), makeEnv(), lookupFails.up), 503)
		expect(lookupFails.requests).toHaveLength(2)
		const sendFails = fakeUpstream((request) => (request.method === "GET" ? reply(404) : reply(429)))
		await expectRefusal(await run(json({ email: ADDRESS }), makeEnv(), sendFails.up), 503)
		expect(sendFails.requests.map((r) => r.method)).toEqual(["GET", "POST", "POST"])
		const createFails = fakeUpstream((request) => (request.method === "GET" ? reply(404) : reply(503)))
		await expectRefusal(await run(confirmWith(await signToken(TEST_SECRET, NORMALIZED, START)), makeEnv(), createFails.up), 503)
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

	test("any other Resend answer is a 502 that carries none of Resend's text, on every path", async () => {
		const redirect = () => new Response(null, { status: 307, headers: { location: "https://elsewhere.example/" } })
		const confirmation = () => signToken(TEST_SECRET, NORMALIZED, START)
		const scripts: [string, () => Promise<Request> | Request, Response[], string[]][] = [
			["the lookup refused (bad key)", () => json({ email: ADDRESS }), [reply(401)], ["GET"]],
			["the lookup forbidden", () => json({ email: ADDRESS }), [reply(403)], ["GET"]],
			["the mirror read refused", () => json({ email: ADDRESS }), [found(), reply(403)], ["GET", "GET"]],
			["the mirror read finding nothing", () => json({ email: ADDRESS }), [found(), reply(404)], ["GET", "GET"]],
			["the send redirected", () => json({ email: ADDRESS }), [reply(404), redirect()], ["GET", "POST"]],
			[
				"the create refused and the address still unknown",
				async () => confirmWith(await confirmation()),
				[reply(404), reply(422), reply(404)],
				["GET", "POST", "GET"],
			],
			[
				"the create redirected, even with the address existing by now",
				async () => confirmWith(await confirmation()),
				[reply(404), redirect(), found()],
				["GET", "POST"],
			],
		]
		for (const [, request, script, methods] of scripts) {
			const upstream = fakeUpstream(() => script.shift() ?? reply(500))
			await expectRefusal(await run(await request(), makeEnv(), upstream.up), 502)
			expect(upstream.requests.map((r) => r.method)).toEqual(methods)
		}
		expect(logged.length).toBe(scripts.length)
		expect(Bun.inspect(logged)).toContain("status")
	})

	test("a missing key, id or confirmation secret, or a short secret, is a 503 on both paths before Resend is called", async () => {
		const upstream = noUpstream()
		const requests = async () => [json({ email: ADDRESS }), confirmWith(await signToken(TEST_SECRET, NORMALIZED, START))]
		for (const overrides of [
			{ RESEND_API_KEY: undefined },
			{ RESEND_API_KEY: "" },
			{ RESEND_SEGMENT_ID: undefined },
			{ CONSENT_VERSION: "" },
			{ CONFIRM_SECRET: undefined },
			{ CONFIRM_SECRET: "s".repeat(31) },
		]) {
			for (const request of await requests()) await expectRefusal(await run(request, makeEnv(overrides), upstream.up), 503)
		}
		expect(upstream.requests).toEqual([])
		// Control: a secret of exactly the floor is accepted.
		const store = fakeUpstream(resendStore(409).answer)
		expect((await run(json({ email: ADDRESS }), makeEnv({ CONFIRM_SECRET: "s".repeat(32) }), store.up)).status).toBe(200)
	})
})

describe("answers", () => {
	test("a plain form post is sent on to /subscribed; a fetch caller gets JSON; a confirmation always gets JSON", async () => {
		const { up } = fakeUpstream(resendStore(409).answer)
		const plain = await run(form({ email: ADDRESS }), makeEnv(), up)
		expect([plain.status, plain.headers.get("location"), await plain.text()]).toEqual([303, SUCCESS_PATH, ""])
		const cors = await run(form({ email: ADDRESS }, { "sec-fetch-mode": "cors" }), makeEnv(), up)
		expect([cors.status, cors.headers.get("content-type"), await cors.text()]).toEqual([200, "application/json", '{"ok":true}'])
		const token = await signToken(TEST_SECRET, NORMALIZED, START)
		const confirmForm = await run(post(new URLSearchParams({ token }).toString(), { path: CONFIRM_PATH }), makeEnv(), up)
		expect([confirmForm.status, await confirmForm.text()]).toEqual([200, '{"ok":true}'])
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
