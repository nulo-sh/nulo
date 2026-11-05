/**
 * Behavioral pin for the e2e lanes' shared gate, `e2e-decide.sh`.
 *
 * Its sibling `behavior-gating.test.ts` pins which PATHS each filter covers and that every lane
 * wires this script. This pins what the gate then DOES with that answer, which is where a defect
 * hides: a paths clause additionally conditioned on `github.base_ref == "dev"` would stop every arc
 * ABOVE a stack's bottom — whose base is the arc below it, not `dev` — from reaching the suite by
 * paths, skip it, and have the aggregator report success-on-skip.
 *
 * So this executes the script against a table of inputs rather than asserting on its text: a rule
 * that re-appears in a different spelling still fails here.
 *
 * Wired into CI via the root `test:ci-gating` script in `_unit-tests.yml`.
 */
import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..", "..")

/** Run the gate with the given env: its exit code, and what it wrote to `$GITHUB_OUTPUT`. */
function runGate(over: Record<string, string>): { code: number | null; output: string } {
	const dir = mkdtempSync(join(tmpdir(), "decide-gate-"))
	try {
		const out = join(dir, "output")
		const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", EVENT: "pull_request", BASE: "dev", LABEL_HIT: "false", SURFACE: "false" }
		const r = spawnSync("bash", ["scripts/ci-cd/e2e-decide.sh"], {
			cwd: ROOT,
			env: { ...env, ...over, GITHUB_OUTPUT: out },
			encoding: "utf8",
		})
		return { code: r.status, output: r.status === 0 ? readFileSync(out, "utf8").trim() : "" }
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
}

function decided(over: Record<string, string>): string {
	const { code, output } = runGate(over)
	expect(code).toBe(0)
	return output
}

describe("the e2e Decide gate", () => {
	test("a relevant diff runs the suite on a STACKED base, not just dev", () => {
		// The regression this file exists for. `github.base_ref` on a stacked PR is the arc below it.
		expect(decided({ BASE: "log-safety/03-call-sites", SURFACE: "true" })).toBe("run=true")
	})

	test("a relevant diff runs the suite on dev", () => {
		expect(decided({ SURFACE: "true" })).toBe("run=true")
	})

	test("an irrelevant diff still skips — the filter is what decides", () => {
		expect(decided({ BASE: "some/feature-branch" })).toBe("run=false")
		expect(decided({ BASE: "dev" })).toBe("run=false")
	})

	test("a pull request into main takes the filter like any other: a promote that leaves the surface alone skips", () => {
		expect(decided({ BASE: "main" })).toBe("run=false")
		expect(decided({ BASE: "main", SURFACE: "true" })).toBe("run=true")
	})

	test("the label force-runs regardless of base or filter", () => {
		expect(decided({ BASE: "some/feature-branch", LABEL_HIT: "true" })).toBe("run=true")
	})

	test("workflow_dispatch force-runs", () => {
		expect(decided({ EVENT: "workflow_dispatch", BASE: "" })).toBe("run=true")
	})

	// The live read always writes true or false; anything else is a wiring fault, and reading it as
	// false would skip a suite the labels ask for.
	test.each(["", "yes", "True"])("refuses a label-hit of %j", (value) => {
		expect(runGate({ LABEL_HIT: value }).code).not.toBe(0)
	})

	// A filter output that never arrived would otherwise read as an untouched surface and skip.
	test.each(["", "yes"])("refuses a paths-filter verdict of %j", (value) => {
		expect(runGate({ SURFACE: value }).code).not.toBe(0)
	})

	test("refuses a pull request with no base", () => {
		expect(runGate({ BASE: "" }).code).not.toBe(0)
	})
})
