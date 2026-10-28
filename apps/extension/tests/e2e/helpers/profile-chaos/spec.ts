/**
 * The body both profile chaos specs share: the seeds the environment selects, one test per seed on
 * its own launch, and what fails a seed. Read at load, so a bad count or seed fails the file before
 * any browser starts.
 */
import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { describe, expect } from "vitest"
import type { BrowserKind } from "../../fixtures/browser"
import { chaosSeed } from "../../fixtures/chaos-seed"
import { type ExtensionContext, test } from "../../fixtures/extension"
import { inPlaceUpdate, updateBuilds } from "../../fixtures/update/in-place"
import { releaseTraits } from "../../fixtures/update/release"
import { evidenceGaps } from "./checkers"
import { type Caps, describePlan, type ListedStep, type Plan, plan, planFromList, type StartState, startWorld } from "./model"
import { bindPreUpdate, populateRelease, type Released } from "./pre-update"
import { checkStartStorage, recordTarget, runPlan, type Verdict } from "./run"
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

interface SeedRun {
	seed: number
	plan: Plan
	browser: string
	caps: Caps
	network?: NetworkRun
	/** Set on a `pre-update-*` start: what the release left before the update. */
	released?: Released
	/** Set on a `pre-update-*` start: the release tag and the candidate's directory. */
	update?: { tag: string; to: string }
}

/** The candidate's own record of the commit it was built from, when it has one. */
function candidateCommit(to: string): string | undefined {
	const file = join(to, "update-candidate.json")
	return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { commit?: string }).commit : undefined
}

/** One seed on `ctx`: the run, its record and every expectation that fails it. */
async function runSeed(ctx: ExtensionContext, r: SeedRun): Promise<void> {
	const { seed, plan: p } = r
	console.log(`[profile-chaos] seed ${seed} from ${p.start} on ${JSON.stringify(r.caps)}\n${describePlan(p).join("\n")}`)
	// A run the session launcher started keeps its records in that session's directory.
	const records = process.env.NULO_E2E_CHAOS_SESSION ?? join(process.cwd(), ".e2e-state")
	const record = recordTarget(records, r.browser, seed)
	const files = `${record.path}.files`
	const run = await startRun(ctx, r.caps, files, r.network, r.released?.held)
	record.provenance = {
		browserVersion: await ctx.browser.version(),
		extensionVersion: await run.anchor.evaluate(() => chrome.runtime.getManifest().version),
		...(r.update ? { release: { tag: r.update.tag, candidateCommit: candidateCommit(r.update.to) } } : {}),
		flags: {
			actionList: !!process.env.NULO_E2E_CHAOS_ACTIONS,
			proverless: process.env.NULO_E2E_PROVERLESS === "1",
			network: !!r.network,
		},
	}
	let missed: string[] = []
	try {
		const start = r.released
			? [...(await bindPreUpdate(run, r.released, p.start)), ...(await checkStartStorage(run, startWorld(p.start)))]
			: []
		const verdict = await runPlan(run, p, record, start)
		console.log(
			`[profile-chaos] seed ${seed}: ${verdict.kind} in ${verdict.elapsedMs} ms; ${verdict.coverageLine}; needles[phrases=${run.phrases.size} prf=${run.prf.size}]; record ${verdict.recordPath}`,
		)
		expect(
			verdict.start.map((v) => `${v.oracle} ${v.message}`),
			"the start state",
		).toEqual([])
		expect(firstRed(verdict)).toBe("")
		expect(evidenceGaps(verdict.steps, p.steps.length), "steps without complete evidence").toEqual([])
		expect(filedMet(verdict), "filed findings this seed met").toEqual([])
	} finally {
		missed = await run.stop()
		if (missed.length) console.log(`[profile-chaos] seed ${seed}: the local node's stand-in missed ${missed.join("; ")}`)
		if (existsSync(files)) rmSync(files, { recursive: true, force: true })
	}
	expect(missed, "requests the local node's stand-in missed").toEqual([])
}

/** One test per selected seed, each on a fresh launch, skipped unless `armed`; `browser` names
 *  the records. With `NULO_E2E_UPDATE_FROM` set, each seed starts `pre-update-<passkey>`, named by
 *  the release's reviewed passkey trait: the release makes its profiles, the candidate
 *  `NULO_E2E_UPDATE_TO` names replaces it in place, and the run starts on the candidate. */
export function describeProfileChaos(
	title: string,
	opts: { armed: boolean; browser: BrowserKind; caps: Caps; network?: NetworkRun },
): void {
	const { armed, browser, caps, network } = opts
	const first = armed ? chaosSeed(process.env.NULO_E2E_CHAOS_SEED) : 0
	const runs = armed ? runCount(process.env.NULO_E2E_CHAOS_RUNS) : 0
	const list = armed ? listed(process.env.NULO_E2E_CHAOS_ACTIONS) : undefined
	const seeds = list ? [first] : Array.from({ length: runs }, (_, i) => first + i)
	const from = armed ? process.env.NULO_E2E_UPDATE_FROM : undefined
	const passkey = from ? releaseTraits(from).passkey : undefined
	const start: StartState = passkey ? `pre-update-${passkey}` : "empty"
	if (passkey && network) throw new Error("the pre-update start runs in the smoke file only")
	const planOf = (seed: number): Plan => (list ? planFromList(list, start, caps, seed) : plan(seed, start, caps))
	describe.skipIf(!armed)(title, () => {
		for (const seed of seeds) {
			if (passkey)
				test(`seed ${seed} from the release`, { retry: 0, timeout: SEED_TIMEOUT_MS }, async () => {
					const builds = updateBuilds(browser)
					if (!builds) throw new Error("NULO_E2E_UPDATE_FROM names no release")
					await inPlaceUpdate({
						builds,
						populate: (ctx) => populateRelease(ctx, passkey),
						verify: (ctx, released) =>
							runSeed(ctx, { seed, plan: planOf(seed), browser, caps, released, update: { tag: builds.tag, to: builds.to } }),
					})
				})
			else
				test(`seed ${seed}`, { retry: 0, timeout: SEED_TIMEOUT_MS }, async ({ freshExtensionPerTest }) => {
					await runSeed(freshExtensionPerTest, { seed, plan: planOf(seed), browser, caps, network })
				})
		}
	})
}
