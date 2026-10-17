/**
 * Pins the build-env guard in `_build-extension.yml`, which every release, nightly and PR build of
 * the extension runs: only the production build options may be set when the build starts.
 * Wired into CI via the root `test:ci-gating` script.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { runStep, type WorkflowStep } from "./gh-step-harness"

const ROOT = join(import.meta.dir, "..", "..")
// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
const WORKFLOW: any = Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows/_build-extension.yml"), "utf8"))
const GUARD = WORKFLOW.jobs.build.steps.find(
	(step: { name?: string }) => step.name === "Assert no test-only or secret VITE_* flags in the build env",
)
const STEP: WorkflowStep = { run: GUARD.run, env: GUARD.env ?? {} }
/** The guard never calls `gh`; a call fails the run. */
const NO_GH = "#!/usr/bin/env bash\nexit 1\n"

const exitCodeWith = (env: Record<string, string>) => runStep(STEP, { shim: NO_GH, bound: {}, overrides: env }).code

describe("the build-env guard", () => {
	test("passes with nothing set and with the production build options", () => {
		expect(exitCodeWith({})).toBe(0)
		expect(exitCodeWith({ VITE_FEE_JUICE_BRIDGE_URL: "https://example.org", VITE_NULO_ALLOW_IFRAME_DAPPS: "1" })).toBe(0)
	})

	test("refuses a flag set to the empty string, which Vite still bakes in", () => {
		expect(exitCodeWith({ VITE_LOCAL_NETWORK_RPC_URL: "" })).toBe(1)
	})

	test.each([
		["an e2e override no workflow sets yet", "VITE_NULO_E2E_NEXT_FIXTURE"],
		["the e2e fee multiplier", "VITE_NULO_FEE_MULTIPLIER"],
		["the price provider key", "VITE_COINGECKO_API_KEY"],
		["an unknown flag", "VITE_X"],
	])("refuses %s", (_, name) => {
		expect(exitCodeWith({ [name]: "1" })).toBe(1)
	})
})
