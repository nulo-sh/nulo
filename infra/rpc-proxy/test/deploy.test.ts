import { describe, expect, test } from "bun:test"
import { mkdirSync, readFileSync, rmSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { WRANGLER } from "./fakes"

const WORKSPACE = resolve(import.meta.dir, "..")
const raw = readFileSync(join(WORKSPACE, "wrangler.jsonc"), "utf8")

describe("wrangler.jsonc", () => {
	test("declares no route, no workers.dev, no preview URL and no Workers Logs", () => {
		expect(WRANGLER.name).toBe("nulo-rpc-proxy")
		expect(WRANGLER.routes).toBeUndefined()
		expect(WRANGLER.route).toBeUndefined()
		expect(WRANGLER.workers_dev).toBe(false)
		expect(WRANGLER.preview_urls).toBe(false)
		expect(WRANGLER.observability).toEqual({ enabled: false })
	})

	test("carries only the switch, off, as a var, and no provider URL", () => {
		expect(WRANGLER.vars).toEqual({ PROXY_OFF: "0" })
		expect(raw).not.toMatch(/drpc/i)
	})

	// Namespace ids are account-wide: sharing nulo-subscribe's would pool the two Workers' counts.
	test("limits each IP to 100 requests per 10 s on a namespace of its own", () => {
		expect(WRANGLER.ratelimits).toEqual([{ name: "IP_LIMITER", namespace_id: expect.any(String), simple: { limit: 100, period: 10 } }])
		const subscribe = JSON.parse(readFileSync(resolve(WORKSPACE, "../subscribe/wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, ""))
		const taken = subscribe.ratelimits.map((r: { namespace_id: string }) => r.namespace_id)
		expect(taken).toEqual(["1001", "1002"])
		expect(taken).not.toContain(WRANGLER.ratelimits[0].namespace_id)
	})
})

// The keys are readable by any code in the bundle, so the bundle holds this workspace's source and
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
