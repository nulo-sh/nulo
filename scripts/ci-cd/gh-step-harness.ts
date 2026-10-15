/**
 * Runs a workflow step's inline script the way the runner does (`bash -e -o pipefail`), with `gh`
 * replaced by a shim placed in a fresh directory that `setup` fills with its answers. The shim must
 * log each call, one per line, to `calls` beside it.
 */
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export interface WorkflowStep {
	run: string
	env: Record<string, string>
}

export interface StepRun {
	code: number
	stdout: string
	/** The shim's log, one call per line, in order. */
	calls: string[]
}

export interface StepRunOptions {
	shim: string
	/** A test value for every `${{ }}` expression the step's env holds; an unbound one throws. */
	bound: Record<string, string>
	/** Env values that replace the step's own after binding (a retry pause of 0, say). */
	overrides?: Record<string, string>
	setup?: (dir: string) => void
}

export function runStep(step: WorkflowStep, { shim, bound, overrides, setup }: StepRunOptions): StepRun {
	const dir = mkdtempSync(join(tmpdir(), "gh-step-"))
	try {
		writeFileSync(join(dir, "gh"), shim)
		chmodSync(join(dir, "gh"), 0o755)
		writeFileSync(join(dir, "calls"), "")
		setup?.(dir)
		const env: Record<string, string> = { PATH: `${dir}:${process.env.PATH}` }
		for (const [key, value] of Object.entries(step.env)) {
			if (value.includes("${{") && !(value in bound)) throw new Error(`no test value for ${key}: ${value}`)
			env[key] = bound[value] ?? value
		}
		Object.assign(env, overrides)
		const run = Bun.spawnSync(["bash", "--noprofile", "--norc", "-e", "-o", "pipefail", "-c", step.run], { env })
		const calls = readFileSync(join(dir, "calls"), "utf8").split("\n").filter(Boolean)
		return { code: run.exitCode, stdout: run.stdout.toString(), calls }
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
}
