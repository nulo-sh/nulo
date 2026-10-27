import { describe, expect, test } from "bun:test"
import { mkdirSync, readFileSync, rmSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { WRANGLER } from "./fakes"

const WORKSPACE = resolve(import.meta.dir, "..")

describe("wrangler.jsonc", () => {
	test("keeps the Worker off every public origin: no route, no workers.dev, no preview URL, no Workers Logs", () => {
		expect(WRANGLER.name).toBe("nulo-subscribe")
		expect(WRANGLER.routes).toBeUndefined()
		expect(WRANGLER.route).toBeUndefined()
		expect(WRANGLER.workers_dev).toBe(false)
		expect(WRANGLER.preview_urls).toBe(false)
		expect(WRANGLER.observability).toEqual({ enabled: false })
	})

	test("carries the list ids, the notice version and the switch off as vars, and no secret", () => {
		expect(Object.keys(WRANGLER.vars).sort()).toEqual(["CONSENT_VERSION", "RESEND_SEGMENT_ID", "RESEND_TOPIC_ID", "SUBSCRIBE_OFF"])
		expect(WRANGLER.vars.SUBSCRIBE_OFF).toBe("0")
		const raw = readFileSync(join(WORKSPACE, "wrangler.jsonc"), "utf8")
		expect(raw).not.toContain("RESEND_API_KEY")
		expect(raw).not.toMatch(/\bre_[A-Za-z0-9_]{8,}/)
	})

	// Every contact records this as the notice version in effect when it joined.
	test("names the website privacy notice's current version", () => {
		const notice = readFileSync(resolve(WORKSPACE, "../../legal/website-privacy.md"), "utf8")
		expect(WRANGLER.vars.CONSENT_VERSION).toBe(/^\*\*Version (\S+) — /m.exec(notice)?.[1])
	})

	test("limits each IP to 5 and everyone together to 60 per minute, on separate namespaces", () => {
		expect(WRANGLER.ratelimits).toEqual([
			{ name: "IP_LIMITER", namespace_id: expect.any(String), simple: { limit: 5, period: 60 } },
			{ name: "GLOBAL_LIMITER", namespace_id: expect.any(String), simple: { limit: 60, period: 60 } },
		])
		expect(WRANGLER.ratelimits[0].namespace_id).not.toBe(WRANGLER.ratelimits[1].namespace_id)
	})
})

// The key is readable by any code in the bundle, so the bundle holds this workspace's source and
// nothing else: a dependency added later fails here, not in review.
test("the deployed bundle is built from this workspace's src alone and imports nothing", () => {
	const manifest = JSON.parse(readFileSync(join(WORKSPACE, "package.json"), "utf8"))
	expect(manifest.dependencies).toBeUndefined()
	const out = join(WORKSPACE, ".wrangler", `bundle-test-${process.pid}`)
	mkdirSync(out, { recursive: true })
	try {
		const wrangler = join(WORKSPACE, "node_modules", ".bin", "wrangler")
		const meta = join(out, "meta.json")
		const build = Bun.spawnSync(
			[process.execPath, "--no-install", wrangler, "deploy", "--dry-run", "--outdir", out, "--metafile", meta],
			{
				cwd: WORKSPACE,
				env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" },
				stdout: "pipe",
				stderr: "pipe",
			},
		)
		expect(build.exitCode, build.stderr.toString()).toBe(0)
		const metafile = JSON.parse(readFileSync(meta, "utf8"))
		const inputs = Object.keys(metafile.inputs).map((input) => relative(WORKSPACE, resolve(WORKSPACE, input)))
		expect(inputs.length).toBeGreaterThan(0)
		for (const input of inputs) expect(input).toMatch(/^src\/[a-z-]+\.ts$/)
		const [bundle] = Object.values(metafile.outputs).filter((o) => (o as { entryPoint?: string }).entryPoint) as {
			imports: unknown[]
		}[]
		expect(bundle.imports).toEqual([])
	} finally {
		rmSync(out, { recursive: true, force: true })
	}
}, 120_000)
