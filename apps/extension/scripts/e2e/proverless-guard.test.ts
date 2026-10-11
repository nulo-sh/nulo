// @vitest-environment node
import { spawn } from "node:child_process"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const extensionDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const NETWORK_CONFIG = "vitest.e2e.network.config.ts"
const MARKED = "tests/e2e/network/import-handshake-note.test.ts"
const MARKED_MATRIX = "tests/e2e/network/import-handshake-note-matrix.test.ts"
const UNMARKED = "tests/e2e/network/tokens.test.ts"
// Each case starts Node and a vitest listing; a cold runner needs the headroom.
const CASE_TIMEOUT_MS = 60_000

type Guard = { code: number | null; stderr: string }

/** Runs the guard alone, outside this vitest run's environment, with `stubs` shadowing tools on PATH. */
function guard(args: string[], options: { proverless?: boolean; stubs?: Record<string, number> } = {}): Promise<Guard> {
	const env = Object.fromEntries(
		Object.entries(process.env).filter(([key]) => !key.startsWith("VITEST") && key !== "NODE_OPTIONS" && key !== "NULO_E2E_PROVERLESS"),
	)
	if (options.proverless) env.NULO_E2E_PROVERLESS = "1"
	const stubDir = options.stubs && mkdtempSync(path.join(tmpdir(), "proverless-guard-"))
	if (stubDir) {
		for (const [tool, exit] of Object.entries(options.stubs ?? {})) {
			writeFileSync(path.join(stubDir, tool), `#!/usr/bin/env bash\nexit ${exit}\n`)
			chmodSync(path.join(stubDir, tool), 0o755)
		}
		env.PATH = `${stubDir}:${env.PATH}`
	}
	const child = spawn("bash", ["scripts/e2e/proverless-guard.sh", NETWORK_CONFIG, ...args], {
		cwd: extensionDir,
		env,
		stdio: ["ignore", "ignore", "pipe"],
	})
	let stderr = ""
	child.stderr.on("data", (chunk) => (stderr += chunk))
	return new Promise((resolve) =>
		child.on("close", (code) => {
			if (stubDir) rmSync(stubDir, { recursive: true, force: true })
			resolve({ code, stderr })
		}),
	)
}

describe.concurrent("proverless guard", { timeout: CASE_TIMEOUT_MS }, () => {
	test("refuses a marked file passed with a vitest flag", async () => {
		const run = await guard([MARKED, "--retry=0"])
		expect(run.code, run.stderr).toBe(2)
		expect(run.stderr).toContain("FATAL: this run includes proverless-gated test file(s)")
		expect(run.stderr).toContain(`[e2e:agent]   ${MARKED}`)
	})

	test("refuses a name filter that selects marked files", async () => {
		const run = await guard(["import-handshake"])
		expect(run.code, run.stderr).toBe(2)
		expect(run.stderr).toContain(`[e2e:agent]   ${MARKED}`)
		expect(run.stderr).toContain(`[e2e:agent]   ${MARKED_MATRIX}`)
	})

	test("passes an unmarked file with flags, never reading an --exclude value as a file", async () => {
		const run = await guard([UNMARKED, "--retry=0", "--exclude", MARKED])
		expect(run.code, run.stderr).toBe(0)
	})

	test("passes a marked file on an armed run", async () => {
		const run = await guard([MARKED, "--retry=0"], { proverless: true })
		expect(run.code, run.stderr).toBe(0)
	})

	test("refuses arguments vitest cannot list", async () => {
		const run = await guard(["--no-such-flag"])
		expect(run.code, run.stderr).toBe(2)
		expect(run.stderr).toContain("FATAL: vitest could not list this run's files")
	})

	test("passes an empty selection", async () => {
		const run = await guard(["no-such-file-anywhere"])
		expect(run.code, run.stderr).toBe(0)
	})

	test.each([[["--watch", UNMARKED]], [["-w", UNMARKED]], [["--watch.enabled=true", "--changed=HEAD"]]])(
		"refuses a watch run: %j",
		async (args) => {
			const run = await guard(args)
			expect(run.code, run.stderr).toBe(2)
			expect(run.stderr).toContain("FATAL: an unarmed run cannot watch")
		},
	)

	test("passes an explicit non-watch run", async () => {
		const run = await guard(["--watch=false", UNMARKED])
		expect(run.code, run.stderr).toBe(0)
	})

	test("refuses arguments vitest cannot parse", async () => {
		const run = await guard(["--watch", "--watch=false", UNMARKED])
		expect(run.code, run.stderr).toBe(2)
		expect(run.stderr).toContain("FATAL: vitest could not read this run's arguments")
	})

	test("refuses when the scan fails", async () => {
		const run = await guard([UNMARKED], { stubs: { grep: 2 } })
		expect(run.code, run.stderr).toBe(2)
		expect(run.stderr).toContain("FATAL: could not scan the selected files")
	})

	test("refuses when the listing cannot be read", async () => {
		const run = await guard([UNMARKED], { stubs: { jq: 5 } })
		expect(run.code, run.stderr).toBe(2)
		expect(run.stderr).toContain("FATAL: vitest could not list this run's files")
	})
})
