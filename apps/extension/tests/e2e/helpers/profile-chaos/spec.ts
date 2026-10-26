/**
 * The body both profile chaos specs share: the seeds the environment selects, one test per seed on
 * its own launch, and what fails a seed. Read at load, so a bad count or seed fails the file before
 * any browser starts.
 */
import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { describe, expect } from "vitest"
import { chaosSeed } from "../../fixtures/chaos-seed"
import { test } from "../../fixtures/extension"
import { evidenceGaps } from "./checkers"
import { type Caps, describePlan, type ListedStep, plan, planFromList } from "./model"
import { recordTarget, runPlan, type Verdict } from "./run"
import { startRun } from "./start"
import type { NetworkRun } from "./state"

/** Measured per seed on a loaded host, with room for a slow one; a seed past it is a stall. */
const SEED_TIMEOUT_MS = 1_800_000

function runCount(raw: string | undefined): number {
	if (raw === undefined || raw === "") return 1
	const n = Number(raw)
	if (!/^\d+$/.test(raw) || n < 1) throw new Error(`NULO_E2E_CHAOS_RUNS=${JSON.stringify(raw)} selects no run`)
	return n
}

function listed(raw: string | undefined): ListedStep[] | undefined {
	if (!raw) return undefined
	const text = raw.trimStart().startsWith("[") ? raw : readFileSync(raw, "utf8")
	return JSON.parse(text) as ListedStep[]
}

/** The first step with a violation not filed yet, as its index, action and properties. */
function firstRed(verdict: Verdict): string {
	const red = verdict.steps.find((s) => s.violations.some((v) => v.known === undefined))
	return red ? `step ${red.index} ${red.action}: ${red.violations.map((v) => `${v.oracle} ${v.message}`).join(" | ")}` : ""
}

const filedMet = (verdict: Verdict): number[] => [
	...new Set(verdict.steps.flatMap((s) => s.violations.flatMap((v) => (v.known === undefined ? [] : [v.known])))),
]

/** One test per selected seed, each on a fresh launch, skipped unless `armed`; `browser` names
 *  the records. */
export function describeProfileChaos(title: string, opts: { armed: boolean; browser: string; caps: Caps; network?: NetworkRun }): void {
	const { armed, browser, caps, network } = opts
	const first = armed ? chaosSeed(process.env.NULO_E2E_CHAOS_SEED) : 0
	const runs = armed ? runCount(process.env.NULO_E2E_CHAOS_RUNS) : 0
	const list = armed ? listed(process.env.NULO_E2E_CHAOS_ACTIONS) : undefined
	const seeds = list ? [first] : Array.from({ length: runs }, (_, i) => first + i)
	describe.skipIf(!armed)(title, () => {
		for (const seed of seeds) {
			test(`seed ${seed}`, { retry: 0, timeout: SEED_TIMEOUT_MS }, async ({ freshExtensionPerTest }) => {
				const p = list ? planFromList(list, "empty", caps, seed) : plan(seed, "empty", caps)
				console.log(`[profile-chaos] seed ${seed} on ${JSON.stringify(caps)}\n${describePlan(p).join("\n")}`)
				// A run the session launcher started keeps its records in that session's directory.
				const records = process.env.NULO_E2E_CHAOS_SESSION ?? join(process.cwd(), ".e2e-state")
				const record = recordTarget(records, browser, seed)
				const files = `${record.path}.files`
				const run = await startRun(freshExtensionPerTest, caps, files, network)
				let missed: string[] = []
				try {
					const verdict = await runPlan(run, p, record)
					console.log(
						`[profile-chaos] seed ${seed}: ${verdict.kind} in ${verdict.elapsedMs} ms; ${verdict.coverageLine}; record ${verdict.recordPath}`,
					)
					expect(firstRed(verdict)).toBe("")
					expect(evidenceGaps(verdict.steps, p.steps.length), "steps without complete evidence").toEqual([])
					expect(filedMet(verdict), "filed findings this seed met").toEqual([])
				} finally {
					missed = await run.stop()
					if (missed.length) console.log(`[profile-chaos] seed ${seed}: the local node's stand-in missed ${missed.join("; ")}`)
					if (existsSync(files)) rmSync(files, { recursive: true, force: true })
				}
				expect(missed, "requests the local node's stand-in missed").toEqual([])
			})
		}
	})
}
