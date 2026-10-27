import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import worker, { type Env } from "./worker"

const URL_BASE = "https://nulo.sh"

function binding(answer: (request: Request) => Promise<Response> = async () => Response.json({ ok: true })) {
	const seen: Request[] = []
	const SUBSCRIBE = {
		fetch: async (request: Request) => {
			seen.push(request)
			return answer(request)
		},
	}
	return { env: { SUBSCRIBE } satisfies Env, seen }
}

const post = (path = "/api/subscribe", headers: Record<string, string> = {}, body = "email=someone%40example.com&website=") =>
	new Request(`${URL_BASE}${path}`, { method: "POST", headers, body })

// Literal, not the module's own map, so dropping a header from it fails here.
const OWN_HEADERS = {
	"cache-control": "no-store",
	"x-content-type-options": "nosniff",
	"referrer-policy": "no-referrer",
	"content-security-policy": "default-src 'none'",
}

function expectOwnHeaders(response: Response) {
	for (const [name, value] of Object.entries(OWN_HEADERS)) expect(response.headers.get(name)).toBe(value)
}

describe("the landing Worker", () => {
	it("hands the subscribe Worker the visitor's request as received, so its Origin check sees the real Origin", async () => {
		const { env, seen } = binding()
		const headers = {
			origin: "https://nulo.sh",
			"content-type": "application/x-www-form-urlencoded",
			accept: "application/json",
			"cf-connecting-ip": "203.0.113.7",
		}
		const request = post("/api/subscribe?from=hero", headers)
		const response = await worker.fetch(request, env)

		expect(seen).toHaveLength(1)
		const forwarded = seen[0] as Request
		expect(forwarded).toBe(request)
		expect(forwarded.method).toBe("POST")
		expect(forwarded.url).toBe(`${URL_BASE}/api/subscribe?from=hero`)
		for (const [name, value] of Object.entries(headers)) expect(forwarded.headers.get(name)).toBe(value)
		expect(await forwarded.text()).toBe("email=someone%40example.com&website=")
		expect(await response.json()).toEqual({ ok: true })
	})

	it("passes a foreign or missing Origin through untouched, leaving the refusal to the subscribe Worker", async () => {
		const { env, seen } = binding(async () => new Response(null, { status: 403 }))
		expect((await worker.fetch(post("/api/subscribe", { origin: "https://preview.example" }), env)).status).toBe(403)
		expect((await worker.fetch(post(), env)).status).toBe(403)
		expect(seen.map((r) => r.headers.get("origin"))).toEqual(["https://preview.example", null])
	})

	it("returns the subscribe Worker's answer unchanged, a no-script redirect included", async () => {
		const { env } = binding(async () => new Response(null, { status: 303, headers: { location: "/subscribed" } }))
		const response = await worker.fetch(post(), env)
		expect(response.status).toBe(303)
		expect(response.headers.get("location")).toBe("/subscribed")
	})

	it.each(["GET", "HEAD", "PUT", "DELETE", "OPTIONS"])(
		"refuses %s on /api/subscribe with its own 405 and never reaches the binding",
		async (method) => {
			const { env, seen } = binding()
			const response = await worker.fetch(new Request(`${URL_BASE}/api/subscribe`, { method }), env)
			expect(response.status).toBe(405)
			expect(response.headers.get("allow")).toBe("POST")
			expectOwnHeaders(response)
			expect(seen).toHaveLength(0)
		},
	)

	it.each([
		"/api/subscribe/",
		"/api/Subscribe",
		"/api/subscribe/extra",
		"/api/unsubscribe",
		"/api/",
		"/api/%73ubscribe",
		"/",
		"/forms/uninstall",
	])("answers POST %s with its own 404 and never reaches the binding", async (path) => {
		const { env, seen } = binding()
		const response = await worker.fetch(post(path), env)
		expect(response.status).toBe(404)
		expectOwnHeaders(response)
		expect(seen).toHaveLength(0)
	})

	it("answers 503 when the binding is absent, as under a dev server without the subscribe Worker", async () => {
		const response = await worker.fetch(post(), {})
		expect(response.status).toBe(503)
		expectOwnHeaders(response)
	})

	it("answers 503 when the binding throws, rather than an unhandled error page", async () => {
		const { env } = binding(async () => {
			throw new Error("upstream gone")
		})
		const response = await worker.fetch(post(), env)
		expect(response.status).toBe(503)
		expectOwnHeaders(response)
		expect(await response.text()).toBe("")
	})
})

describe("wrangler.jsonc", () => {
	// Whole-line comments only, so dropping them leaves JSON.
	const config = JSON.parse(
		readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")
			.split("\n")
			.filter((line) => !/^\s*\/\//.test(line))
			.join("\n"),
	)

	it("runs the script for /api/* only, so every page stays a static asset with the index.html fallback", () => {
		expect(config.main).toBe("src/worker.ts")
		expect(config.assets).toEqual({
			directory: "./dist",
			not_found_handling: "single-page-application",
			run_worker_first: ["/api/*"],
		})
	})

	it("binds the subscribe Worker and nothing else: no secret, no var, no other binding", () => {
		expect(config.services).toEqual([{ binding: "SUBSCRIBE", service: "nulo-subscribe" }])
		const bindingKeys = [
			"vars",
			"kv_namespaces",
			"d1_databases",
			"r2_buckets",
			"durable_objects",
			"queues",
			"ratelimits",
			"secrets_store_secrets",
			"ai",
			"browser",
			"hyperdrive",
			"analytics_engine_datasets",
			"send_email",
			"workflows",
			"secrets",
		]
		for (const key of bindingKeys) expect(config, key).not.toHaveProperty(key)
		expect(config.assets).not.toHaveProperty("binding")
	})
})
