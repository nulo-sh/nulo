/**
 * The npm publish workflow's security shape. Each assertion is a control the trusted-publisher setup
 * relies on: loosening one should fail here, not surface as a compromised package.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FIRST_VERSION, VERSION_RE } from "../publish/check-digests"
import { PACKAGES } from "../publish/packages"

const ROOT = join(import.meta.dir, "../..")
const FILE = ".github/workflows/publish-packages.yml"
const text = readFileSync(join(ROOT, FILE), "utf8")
// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
const wf = Bun.YAML.parse(text) as any
// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
const steps = (job: string): any[] => wf.jobs[job].steps
const runs = (job: string) =>
	steps(job)
		.map((s) => s.run ?? "")
		.join("\n")
const JOBS = ["pack", "publish", "test", "verify"]

describe(FILE, () => {
	test("runs only when dispatched, with a read-only default token", () => {
		expect(Object.keys(wf.on)).toEqual(["workflow_dispatch"])
		expect(wf.permissions).toEqual({ contents: "read" })
	})

	test("only the publish job can mint an OIDC token, and only behind the npm-publish environment after test and pack", () => {
		expect(Object.keys(wf.jobs).sort()).toEqual(JOBS)
		for (const job of ["pack", "test", "verify"]) expect(wf.jobs[job].permissions).toBeUndefined()
		expect(wf.jobs.publish.permissions).toEqual({ contents: "read", "id-token": "write" })
		expect(wf.jobs.publish.environment).toBe("npm-publish")
		expect([...wf.jobs.publish.needs].sort()).toEqual(["pack", "test"])
		expect([...wf.jobs.verify.needs].sort()).toEqual(["pack", "publish"])
		for (const job of ["publish", "verify"]) expect(wf.jobs[job].if).toContain("!inputs.dry_run")
	})

	test("no secret is read and no token is written anywhere", () => {
		expect(text).not.toMatch(/secrets\./)
		expect(text).not.toMatch(/NODE_AUTH_TOKEN|NPM_TOKEN|_authToken/)
		for (const job of JOBS) {
			for (const step of steps(job).filter((s) => s.uses?.startsWith("actions/setup-node@"))) {
				expect(step.with).not.toHaveProperty("registry-url")
			}
		}
	})

	test("every action is pinned to a commit, no checkout keeps its credentials, no setup-node caches", () => {
		const actions = JOBS.flatMap(steps).filter((s) => s.uses !== undefined && !s.uses.startsWith("./"))
		for (const step of actions) expect(step.uses).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/)
		for (const step of actions.filter((s) => s.uses.startsWith("actions/checkout@"))) {
			expect(step.with["persist-credentials"]).toBe(false)
		}
		for (const step of actions.filter((s) => s.uses.startsWith("actions/setup-node@"))) {
			expect(step.with["package-manager-cache"]).toBe(false)
		}
	})

	test("pack makes the bytes from no shared cache and runs no test code or lifecycle script", () => {
		const uses = steps("pack").map((s) => s.uses ?? "")
		expect(uses.filter((u) => u.startsWith("./") || u.startsWith("actions/cache"))).toEqual([])
		expect(steps("pack").find((s) => s.uses?.startsWith("oven-sh/setup-bun@"))?.with["no-cache"]).toBe(true)
		const install = steps("pack").find((s) => /\bbun install\b/.test(s.run ?? ""))
		expect(install.run.trim()).toBe("bun install --frozen-lockfile --ignore-scripts")
		expect(install.env.BUN_INSTALL_CACHE_DIR).toMatch(/^\$\{\{ runner\.temp \}\}\//)
		expect(runs("pack")).not.toMatch(/\btest\b|test:/)
		expect(runs("test")).toContain("bun run test:release")
	})

	test("pack packs every staged package, and publish accepts exactly the PACKAGES names", () => {
		expect(runs("pack")).toContain("bun scripts/publish/stage.ts --all")
		expect(runs("pack")).toContain("for dir in dist-publish/*/; do")
		const expected = steps("publish").find((s) => s.env?.EXPECTED)?.env.EXPECTED
		expect(expected).toBe(
			PACKAGES.map((p) => p.name)
				.sort()
				.join(" "),
		)
	})

	test("publish and verify each check out one file and run no JavaScript from the repository", () => {
		const sparse = (job: string) =>
			steps(job)
				.find((s) => s.uses?.startsWith("actions/checkout@"))
				?.with["sparse-checkout"].trim()
		expect(sparse("publish")).toBe("/scripts/publish/approved-digests.json")
		expect(sparse("verify")).toBe("/scripts/publish/verify-provenance.sh")
		for (const job of ["publish", "verify"]) {
			expect(steps(job).filter((s) => s.uses?.startsWith("./"))).toEqual([])
			expect(runs(job)).not.toMatch(/\bbun\b|\bnode\s|npx/)
		}
	})

	// `test` runs beside `pack` with the same artifact runtime token, and can replace a named artifact.
	test("publish and verify take pack's artifact by ID and check every tarball against pack's digests", () => {
		expect(wf.jobs.pack.outputs["artifact-id"]).toBe("${{ steps.upload.outputs.artifact-id }}")
		expect(wf.jobs.pack.outputs.digests).toBe("${{ steps.digests.outputs.json }}")
		for (const job of ["publish", "verify"]) {
			const download = steps(job).find((s) => s.uses?.startsWith("actions/download-artifact@"))
			expect(download.with).toEqual({ "artifact-ids": "${{ needs.pack.outputs.artifact-id }}", path: "${{ runner.temp }}/tgz" })
			const check = steps(job).find((s) => s.env?.DIGESTS)
			expect(check.env.DIGESTS).toBe("${{ needs.pack.outputs.digests }}")
			expect(check.run).toContain("sha256sum -c --strict -")
			expect(steps(job).indexOf(check)).toBe(steps(job).indexOf(download) + 1)
		}
	})

	test("every job uses the same exact Node, which fixes the npm and zlib that produce the approved bytes", () => {
		const nodes = JOBS.map((job) => steps(job).find((s) => s.uses?.startsWith("actions/setup-node@"))?.with["node-version"])
		expect(nodes[0]).toMatch(/^\d+\.\d+\.\d+$/)
		expect(new Set(nodes).size).toBe(1)
	})

	test("the version check accepts exactly what scripts/publish accepts", () => {
		const shell = /\[\[ "\$VERSION" =~ (\S+) \]\]/.exec(runs("pack"))?.[1] ?? ""
		const workflowRe = new RegExp(shell)
		for (const spelling of ["0.1.0", "1.20.3", "00.1.0", "0.01.0", "0.1.00", "v0.1.0", "0.1.0-rc.1", "0.1", "0.1.0.0"]) {
			expect({ spelling, workflow: workflowRe.test(spelling) }).toEqual({ spelling, workflow: VERSION_RE.test(spelling) })
		}
	})

	test("the first version stays bound to approved bytes, and no other version can become the first", () => {
		expect(runs("pack")).toContain("bun scripts/publish/check-digests.ts")
		expect(runs("publish")).toContain(`"$VERSION" = "${FIRST_VERSION}"`)
		expect(runs("publish")).toContain(`if [ "$VERSION" != "${FIRST_VERSION}" ]; then`)
		expect(runs("publish")).toContain(`npm view "$name@${FIRST_VERSION}" version`)
		expect(runs("publish")).toMatch(/npm publish "\$tgz" --provenance --access public --ignore-scripts/)
	})

	test("verify waits, bounded, until the registry serves every version, before anything reads it", () => {
		const verify = steps("verify")
		const wait = verify.findIndex((s) => s.env?.WAIT_SECONDS !== undefined)
		expect(wait).toBe(verify.findIndex((s) => s.env?.DIGESTS !== undefined) + 1)
		expect(verify.findIndex((s) => s.run?.includes("verify-provenance.sh"))).toBe(wait + 1)
		expect(verify.findIndex((s) => /^npm audit signatures$/m.test(s.run ?? ""))).toBeGreaterThan(wait)
		const { env } = verify[wait]
		expect(env).toEqual({ REGISTRY: "https://registry.npmjs.org", WAIT_SECONDS: 900, POLL_SECONDS: 20 })
		// Room for a last poll round and the steps after it, so the wait's own error is what reports a timeout.
		expect(wf.jobs.verify["timeout-minutes"] * 60).toBeGreaterThanOrEqual(env.WAIT_SECONDS + 600)
	})

	test("verify checks the signer's certificate identity, not the statement's own claims", () => {
		expect(runs("verify")).toContain('"$GITHUB_WORKSPACE/scripts/publish/verify-provenance.sh" "$tgz"')
		expect(runs("verify")).toContain("npm audit signatures")
		const script = readFileSync(join(ROOT, "scripts/publish/verify-provenance.sh"), "utf8")
		expect(script).toContain("repo=${2:-nulo-sh/nulo}")
		expect(script).toContain(`workflow=\${3:-${FILE}}`)
		expect(script).toContain("ref=${4:-refs/heads/(dev|main)}")
		expect(script).toContain('@${ref}\\$"')
		for (const flag of [
			"--digest-alg sha512",
			"--cert-oidc-issuer https://token.actions.githubusercontent.com",
			'--cert-identity-regex "$identity"',
			"--predicate-type https://slsa.dev/provenance/v1",
			"--deny-self-hosted-runners",
		]) {
			expect(script).toContain(flag)
		}
	})
})

// Runs the wait step's own script, under the `bash -e` GitHub uses for a step with no `shell`.
describe("verify's registry wait against a fake registry", () => {
	type Withheld = "document" | "tarball" | "transfer"
	const VERSION = "0.1.0"
	const names = PACKAGES.map((p) => p.name).sort()
	// The glob reads it first, so a loop that keeps only the last tarball's verdict exits early.
	const late = names[0] ?? ""
	const tarballPath = (name: string) => `/${name}/-/${name.split("/")[1]}-${VERSION}.tgz`
	const script: string = steps("verify").find((s) => s.env?.WAIT_SECONDS !== undefined)?.run ?? ""
	let dir = ""
	afterAll(() => rmSync(dir, { recursive: true, force: true }))
	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), "nulo-registry-wait-"))
		mkdirSync(join(dir, "tgz"))
		for (const name of names) {
			const root = join(dir, name)
			mkdirSync(join(root, "package"), { recursive: true })
			writeFileSync(join(root, "package/package.json"), JSON.stringify({ name, version: VERSION }))
			const out = join(dir, "tgz", `${name.slice(1).replaceAll("/", "-")}-${VERSION}.tgz`)
			expect(Bun.spawnSync(["tar", "-czf", out, "-C", root, "package"]).exitCode).toBe(0)
		}
	})

	/**
	 * Withholds `late`'s `withheld` resource for its first `lag` requests: the document does not list
	 * the version, the tarball answers 404, or the tarball's transfer breaks after its 200.
	 */
	async function waitFor(withheld: Withheld, lag: number, waitSeconds: number) {
		let hits = 0
		const holds = (name: string, kind: Withheld) => name === late && kind === withheld && ++hits <= lag
		// A raw socket, because a Response cannot promise more bytes than it sends.
		const answered = new WeakSet<object>()
		const cut = Bun.listen({
			hostname: "127.0.0.1",
			port: 0,
			socket: {
				data(socket) {
					if (answered.has(socket)) return
					answered.add(socket)
					const length = holds(late, "transfer") ? 64 : 3
					socket.end(`HTTP/1.1 200 OK\r\nContent-Length: ${length}\r\nConnection: close\r\n\r\ntgz`)
				},
			},
		})
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch(req) {
				const url = new URL(req.url)
				const tarball = names.find((n) => url.pathname === tarballPath(n))
				if (tarball) return new Response("tgz", { status: holds(tarball, "tarball") ? 404 : 200 })
				// Only npm's own escaping and Accept value: anything else reads another CDN entry than npm does.
				const name = names.find((n) => url.pathname === `/${n.replaceAll("/", "%2f")}`)
				if (!name || req.headers.get("accept") !== "application/json") return new Response("unexpected request", { status: 400 })
				const origin = name === late && withheld === "transfer" ? `http://127.0.0.1:${cut.port}` : url.origin
				const listed = holds(name, "document") ? {} : { [VERSION]: { dist: { tarball: origin + tarballPath(name) } } }
				return Response.json({ name, versions: { "0.0.0-bootstrap.0": {}, ...listed } })
			},
		})
		try {
			const proc = Bun.spawn(["bash", "-e", "-c", script], {
				cwd: join(dir, "tgz"),
				env: {
					...process.env,
					REGISTRY: `http://127.0.0.1:${server.port}`,
					WAIT_SECONDS: String(waitSeconds),
					POLL_SECONDS: "0.05",
				},
				stdout: "pipe",
				stderr: "pipe",
			})
			const [exit, out, err] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()])
			return { exit, out, err, hits }
		} finally {
			server.stop(true)
			cut.stop(true)
		}
	}

	test.each([
		{ withheld: "document", when: "the document does not list the version" },
		{ withheld: "tarball", when: "the tarball answers 404" },
		{ withheld: "transfer", when: "the tarball's transfer breaks after its 200" },
	] as const)(
		"keeps polling while $when, and stops once it is served",
		async ({ withheld }) => {
			const run = await waitFor(withheld, 2, 30)
			expect({ exit: run.exit, hits: run.hits }, run.out + run.err).toEqual({ exit: 0, hits: 3 })
		},
		15_000,
	)

	test("fails closed after the bound, naming what the registry does not serve", async () => {
		const run = await waitFor("tarball", Number.POSITIVE_INFINITY, 2)
		expect(run.exit).toBe(1)
		expect(run.hits).toBeGreaterThan(1)
		expect(run.out).toContain(`::error::${late}@${VERSION}: http://127.0.0.1:`)
		expect(run.out).toContain(`${tarballPath(late)} answers 404 after `)
		expect(run.out).toMatch(/ s; re-run this job once the registry serves it$/m)
	}, 15_000)
})
