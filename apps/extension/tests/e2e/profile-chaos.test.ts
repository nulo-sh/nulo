/**
 * Seeded profile chaos: each seed plans 24 profile actions and a `verifyAll` from the model in
 * `helpers/profile-chaos/model.ts`, drives them through the popup, and checks every oracle after
 * every step. A red seed stops at its first violation not filed yet and names the step, the action
 * and the property; one that met only filed findings runs on and names their issues. A seed with no
 * violation still fails on a step it never ran or any evidence it could not read but a planned
 * restart's log window. Its replay record, under `.e2e-state/profile-chaos/`, replays it.
 *
 * Runs only with `NULO_E2E_CHAOS=1`. `NULO_E2E_CHAOS_SEED` is the first seed (random when unset,
 * and always logged), `NULO_E2E_CHAOS_RUNS` how many consecutive seeds run, one launch each, and
 * `NULO_E2E_CHAOS_ACTIONS` replays a hand-trimmed list instead: a JSON array of `{ action, params }`
 * or a path to one, such as a record's `plan`.
 */
import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { describe, expect } from "vitest"
import { BROWSER, credentialOutlivesPage, residentCredentialSlots, stopsBackgroundUnderOpenPage } from "./fixtures/browser"
import { chaosSeed } from "./fixtures/chaos-seed"
import { test } from "./fixtures/extension"
import { evidenceGaps } from "./helpers/profile-chaos/checkers"
import { type Caps, describePlan, type ListedStep, plan, planFromList } from "./helpers/profile-chaos/model"
import { recordTarget, runPlan, type Verdict } from "./helpers/profile-chaos/run"
import { startRun } from "./helpers/profile-chaos/start"

const armed = process.env.NULO_E2E_CHAOS === "1"
const CAPS: Caps = {
	ceremonyOffAnchor: credentialOutlivesPage,
	restartUnderOpenPage: stopsBackgroundUnderOpenPage,
	network: false,
	restoreGate: false,
	credentialSlots: residentCredentialSlots,
}

/** Read at load, so a bad count or seed fails the file before any browser starts. */
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

const first = armed ? chaosSeed(process.env.NULO_E2E_CHAOS_SEED) : 0
const runs = armed ? runCount(process.env.NULO_E2E_CHAOS_RUNS) : 0
const list = armed ? listed(process.env.NULO_E2E_CHAOS_ACTIONS) : undefined
const seeds = list ? [first] : Array.from({ length: runs }, (_, i) => first + i)
/** Measured per seed on a loaded host, with room for a slow one; a seed past it is a stall. */
const SEED_TIMEOUT_MS = 1_800_000

/** The first step with a violation not filed yet, as its index, action and properties. */
function firstRed(verdict: Verdict): string {
	const red = verdict.steps.find((s) => s.violations.some((v) => v.known === undefined))
	return red ? `step ${red.index} ${red.action}: ${red.violations.map((v) => `${v.oracle} ${v.message}`).join(" | ")}` : ""
}

const filedMet = (verdict: Verdict): number[] => [
	...new Set(verdict.steps.flatMap((s) => s.violations.flatMap((v) => (v.known === undefined ? [] : [v.known])))),
]

describe.skipIf(!armed)("profile chaos", () => {
	for (const seed of seeds) {
		test(`seed ${seed}`, { retry: 0, timeout: SEED_TIMEOUT_MS }, async ({ freshExtensionPerTest }) => {
			const p = list ? planFromList(list, "empty", CAPS, seed) : plan(seed, "empty", CAPS)
			console.log(`[profile-chaos] seed ${seed} on ${JSON.stringify(CAPS)}\n${describePlan(p).join("\n")}`)
			const root = join(process.cwd(), ".e2e-state")
			const record = recordTarget(root, BROWSER, seed)
			const files = `${record.path}.files`
			const run = await startRun(freshExtensionPerTest, CAPS, files)
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
