/**
 * Runs one plan against a launched wallet: before each step a census, then the step's driver, then
 * every oracle over what it left. A run stops at its first violation not filed yet, a check that
 * threw or an unplanned restart; a step whose evidence is incomplete is recorded as such and never
 * counted green, and a filed finding keeps the seed red. The replay record
 * names symbols, ids, keys and needle names only; an error's text is kept masked.
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { decryptAccountExport } from "@nulo/aztec-runtime/account"
import { getEntropy } from "@nulo/wallet-core/utils"
import { openFullBackupText } from "@/utils/full-backup-helpers"
import { backgroundOrigin } from "../../fixtures/browser"
import { derivedAddresses } from "./accounts-io"
import {
	allowedFor,
	runVerdict,
	type RunVerdict,
	stopsRun,
	UNPLANNED_RESTART,
	type Bindings,
	checkErrors,
	checkLeaks,
	checkLogContinuity,
	checkProfiles,
	checkSession,
	checkSettle,
	checkVerify,
	checkWrites,
	findNeedles,
	type LeakHit,
	type Needle,
	RESTART_LOG_GAP,
	type StoredEntry,
	type StructureReading,
	type Violation,
} from "./checkers"
import { drainLogs, logErrors, readCensus, readProfiles, readSession, scanStorage } from "./collect"
import { DRIVERS, type Drive } from "./drivers"
import {
	type ActionName,
	coverage,
	coverageLine,
	endsOf,
	live,
	type Plan,
	type PlannedStep,
	profileOf,
	startWorld,
	type World,
} from "./model"
import { type Driven, type RunState, secretFor, wrongSecret } from "./state"
import { dismissNotices, isLocked, whereStuck } from "./ui"

export type VerdictKind = RunVerdict

export interface StepRecord {
	index: number
	action: ActionName
	params: unknown
	outcome?: string
	elapsedMs: number
	incomplete: string[]
	violations: Violation[]
	/** A check that threw: the step's evidence is unread, and the run stops. */
	crashed?: string
}

export interface Verdict {
	kind: VerdictKind
	seed: number
	steps: StepRecord[]
	coverageLine: string
	elapsedMs: number
	recordPath: string
}

/** Every secret the run knows, in each encoding a leak could take. */
async function needlesOf(s: RunState): Promise<Needle[]> {
	const out: Needle[] = []
	const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64")
	for (const [ref, value] of s.secrets)
		out.push({ name: `${ref}/password`, value }, { name: `${ref}/password-b64`, value: b64(Buffer.from(value)) })
	for (const [ref, words] of s.phrases) {
		const entropy = await getEntropy(words)
		out.push(
			{ name: `${ref}/words`, value: words.join(" ") },
			{ name: `${ref}/entropy-hex`, value: Buffer.from(entropy).toString("hex") },
			{ name: `${ref}/entropy-b64`, value: b64(entropy) },
		)
	}
	for (const [ref, file] of s.files) {
		if (!file.signingKey) continue
		const hex = file.signingKey.replace(/^0x/, "")
		out.push({ name: `${ref}/signing-key`, value: hex }, { name: `${ref}/signing-key-b64`, value: b64(Buffer.from(hex, "hex")) })
	}
	return out
}

const URL_IN_TEXT = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'\\<>]+/gi
const LOOPBACK_ORIGIN = /^[a-z][a-z0-9+.-]*:\/\/(localhost|127\.0\.0\.1|\[::1\])(?![\w.-])(:\d+)?/i

/** Every URL and every needle's value replaced by a name, so the record can carry an error's text:
 *  a node URL may carry a provider key. A loopback URL keeps its origin, which names a local port. */
function mask(text: string, needles: readonly Needle[]): string {
	const unlinked = text.replace(URL_IN_TEXT, (url) => LOOPBACK_ORIGIN.exec(url)?.[0] ?? "<url>")
	return needles.reduce((t, n) => (n.value.length >= 8 ? t.split(n.value).join(`<${n.name}>`) : t), unlinked)
}

const add = (into: Record<string, number>, from: Readonly<Record<string, number>>): void => {
	for (const [key, n] of Object.entries(from)) into[key] = (into[key] ?? 0) + n
}

const idsOf = (b: Bindings, refs: readonly string[]): Set<string> =>
	new Set(refs.flatMap((ref) => (b.profiles.get(ref as never) ? [b.profiles.get(ref as never) as string] : [])))
const openRefs = (w: World): string[] => (w.session.kind === "open" ? [w.session.ref] : [])

/** Opens an export with its own password, then with another: the property O7 asks of it. */
async function opensOnlyWith(
	open: (pw: string) => Promise<unknown>,
	password: string,
): Promise<{ opensWithOwn: boolean; refusesOther: boolean; body?: string }> {
	const body = await open(password).then(
		(b) => (typeof b === "string" ? b : JSON.stringify(b)),
		() => undefined,
	)
	const refusesOther = await open(wrongSecret()).then(
		() => false,
		() => true,
	)
	return { opensWithOwn: body !== undefined, refusesOther, body }
}

interface FileScan {
	hits: LeakHit[]
	exports: StructureReading["exports"]
	prfSalt: string[]
}

/** One new file: its text scanned raw; a password export opened with its own password, refused
 *  another, and its opened body scanned apart (an account file's own key excepted). */
async function scanFile(s: RunState, next: World, ref: string, needles: readonly Needle[], out: FileScan): Promise<void> {
	const held = s.files.get(ref as never)
	if (!held) return
	const text = readFileSync(held.path, "utf8")
	out.hits.push(...findNeedles(text, needles).map((needle) => ({ where: `file:${ref}`, needle })))
	if (text.includes("prfSalt")) out.prfSalt.push(`file:${ref}`)
	const model = next.files.find((f) => f.ref === ref)
	if (!model?.password) return
	const open = held.kind === "backup" ? (pw: string) => openFullBackupText(text, pw) : (pw: string) => decryptAccountExport(text, pw)
	const { body, ...check } = await opensOnlyWith(open, secretFor(s, model.password))
	out.exports.push({ file: ref, ...check })
	if (body === undefined) return
	const own = needles.filter((n) => !(held.kind === "account" && n.name.startsWith(`${ref}/signing-key`)))
	out.hits.push(...findNeedles(body, own).map((needle) => ({ where: `file:${ref}:opened`, needle })))
	if (body.includes("prfSalt")) out.prfSalt.push(`file:${ref}:opened`)
}

async function scanFiles(s: RunState, next: World, needles: readonly Needle[]): Promise<FileScan> {
	const out: FileScan = { hits: [], exports: [], prfSalt: [] }
	for (const ref of s.files.keys()) {
		if (s.scanned.has(ref)) continue
		s.scanned.add(ref)
		await scanFile(s, next, ref, needles, out)
	}
	return out
}

interface StepEvidence {
	violations: Violation[]
	incomplete: string[]
}

async function checkStepLogs(
	s: RunState,
	step: PlannedStep,
	before: World,
	restarted: boolean,
	needles: readonly Needle[],
): Promise<StepEvidence & { hits: LeakHit[] }> {
	const drained = await drainLogs(s.anchor, s.logs.lastId)
	const incomplete: string[] = []
	if (restarted) incomplete.push(RESTART_LOG_GAP)
	else {
		const continuity = checkLogContinuity(
			s.logs.lastId,
			drained.map((l) => l.id),
		)
		if (!continuity.complete) incomplete.push(`logs: ${continuity.reason}`)
	}
	if (drained.length) s.logs.lastId = drained[drained.length - 1].id
	const logs = [...s.logs.carried, ...drained]
	s.logs.carried = []
	const pageErrors = s.errors.since(s.errorMark)
	s.errorMark += pageErrors.length
	const hits = logs.flatMap((l) => findNeedles(l.text, needles).map((needle) => ({ where: `log:${l.id}`, needle })))
	const errors = checkErrors([...pageErrors, ...logErrors(logs)], endsOf(step, before), allowedFor(s.caps))
	add(s.warns, errors.warns)
	add(s.allowed, errors.allowed)
	return { violations: errors.violations, incomplete, hits }
}

/** Learns what the step showed for the first time: a restored profile's name, and each derived
 *  address of the open profile at its first sighting. */
async function learn(s: RunState, next: World): Promise<void> {
	const ref = next.session.kind === "open" ? next.session.ref : undefined
	const id = ref && s.bindings.profiles.get(ref)
	// The session oracle reports a wallet that holds no session where the model expects one.
	if (!ref || !id || (await isLocked(s.anchor))) return
	if (profileOf(next, ref)?.name === undefined && !s.bindings.names.has(ref)) {
		const listed = (await readProfiles(s.anchor)).listed.find((p) => p.id === id)
		if (listed) s.bindings.names.set(ref, listed.name)
	}
	const seen = s.bindings.addresses.get(ref) ?? []
	const now = await derivedAddresses(s.anchor, id)
	s.bindings.addresses.set(ref, [...seen, ...now.slice(seen.length)])
}

async function checkState(s: RunState, step: PlannedStep, before: World, census: StoredEntry[]): Promise<Violation[]> {
	const next = step.expect.next
	const pages = [{ label: "anchor", page: s.anchor, anchor: true }, ...s.extras]
	const out = [
		...checkSession(next, await readSession(s.anchor, pages, next.session.kind === "locked"), s.bindings),
		...checkProfiles(next, await readProfiles(s.anchor), s.bindings),
		...(step.action === "verifyAll" ? checkVerify(before, s.verified, s.bindings) : []),
	]
	out.push(
		...checkWrites({
			before: census,
			after: await readCensus(s.anchor),
			contract: step.expect.writes,
			bindings: s.bindings,
			knownIds: new Set(s.bindings.profiles.values()),
			openIds: idsOf(s.bindings, [...openRefs(before), ...openRefs(next)]),
			deletedIds: idsOf(
				s.bindings,
				before.profiles.filter((p) => p.deleted).map((p) => p.ref),
			),
		}),
	)
	return out
}

async function checkStep(
	s: RunState,
	step: PlannedStep,
	before: World,
	census: StoredEntry[],
	driven: Driven,
	restarted: boolean,
): Promise<StepEvidence> {
	const next = step.expect.next
	const out: Violation[] = []
	if (!step.expect.outcomes.includes(driven.outcome))
		out.push({ oracle: "O5", message: `${step.action} ended ${driven.outcome}; the model allows ${step.expect.outcomes.join(" or ")}` })
	out.push(...checkSettle(step.action, driven.settle))
	if (out.length) return { violations: out, incomplete: [] }
	await learn(s, next)
	const needles = await needlesOf(s)
	out.push(...(await checkState(s, step, before, census)))
	const logs = await checkStepLogs(s, step, before, restarted, needles)
	const storage = await scanStorage(s.anchor, needles)
	const files = await scanFiles(s, next, needles)
	const structure = { ...storage.structure, prfSalt: [...storage.structure.prfSalt, ...files.prfSalt], exports: files.exports }
	const passkeyIds = idsOf(
		s.bindings,
		live(next)
			.filter((p) => p.method === "passkey")
			.map((p) => p.ref),
	)
	out.push(...logs.violations, ...checkLeaks([...storage.hits, ...logs.hits, ...files.hits], structure, passkeyIds))
	for (const v of out) if (v.detail) v.detail = mask(v.detail, needles)
	return { violations: out, incomplete: logs.incomplete }
}

const revision = (): string => {
	try {
		return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()
	} catch {
		return "unknown"
	}
}

/** Where a run's replay record goes, and the browser it names. */
export interface RecordTarget {
	path: string
	browser: string
}

/** The replay record's path: per browser, seed and launch, so two runs never share one. */
export function recordTarget(root: string, browser: string, seed: number): RecordTarget {
	const dir = join(root, "profile-chaos")
	mkdirSync(dir, { recursive: true })
	return { path: join(dir, `${browser}-${seed}-${Date.now().toString(36)}.json`), browser }
}

function writeRecord(out: RecordTarget, plan: Plan, s: RunState, steps: StepRecord[], kind: VerdictKind, line: string): void {
	const body = {
		revision: revision(),
		browser: out.browser,
		seed: plan.seed,
		start: plan.start,
		caps: plan.caps,
		verdict: kind,
		coverage: line,
		bindings: Object.fromEntries(s.bindings.profiles),
		plan: plan.steps.map((p) => ({ action: p.action, params: p.params })),
		steps,
	}
	writeFileSync(out.path, `${JSON.stringify(body, null, 2)}\n`)
}

const recordOf = (step: PlannedStep, t0: number, rest: Partial<StepRecord>): StepRecord => ({
	index: step.index,
	action: step.action,
	params: step.params,
	elapsedMs: Date.now() - t0,
	incomplete: [],
	violations: [],
	...rest,
})

/** The innermost profile chaos frame of a driver's error, as `file:line`. */
const callSite = (err: unknown): string => {
	const frame = (err instanceof Error ? err.stack : undefined)?.split("\n").find((l) => /profile-chaos\/\w+\.ts:\d+/.test(l))
	const at = frame && /profile-chaos\/(\w+\.ts:\d+)/.exec(frame)?.[1]
	return at ? ` (from ${at})` : ""
}

async function runOne(s: RunState, step: PlannedStep, before: World): Promise<StepRecord> {
	await dismissNotices(s.anchor)
	const census = await readCensus(s.anchor)
	const origin = await backgroundOrigin(s.ctx)
	const t0 = Date.now()
	let driven: Driven
	try {
		driven = await (DRIVERS[step.action] as Drive)(s, step.params, step, before)
	} catch (err) {
		const text = `${err instanceof Error ? err.message : String(err)}${callSite(err)} ${await whereStuck(s.anchor)}`
		const detail = mask(text, await needlesOf(s))
		return recordOf(step, t0, { violations: [{ oracle: "O5", message: `${step.action}'s driver could not finish the step`, detail }] })
	}
	const restarted = endsOf(step, before).includes("background")
	if (!restarted && (await backgroundOrigin(s.ctx)) !== origin)
		return recordOf(step, t0, { outcome: driven.outcome, incomplete: [UNPLANNED_RESTART] })
	if (restarted) s.logs.lastId = 0
	try {
		const evidence = await checkStep(s, step, before, census, driven, restarted)
		return recordOf(step, t0, { outcome: driven.outcome, ...evidence })
	} catch (err) {
		const crashed = mask(`${err instanceof Error ? err.message : String(err)}${callSite(err)}`, await needlesOf(s))
		return recordOf(step, t0, { outcome: driven.outcome, crashed })
	}
}

/** A step's progress line: its outcome, time and every flag its evidence raised. */
function progressLine(seed: number, step: PlannedStep, r: StepRecord): string {
	const flags = [
		r.violations.some((v) => v.known === undefined) ? "RED" : "",
		r.violations.some((v) => v.known !== undefined) ? "KNOWN" : "",
		r.crashed ? "CHECKS-THREW" : "",
		r.incomplete.length ? `incomplete(${r.incomplete.join("; ")})` : "",
	].filter(Boolean)
	return `[profile-chaos] ${seed}#${step.index} ${step.action} ${r.outcome ?? "-"} ${r.elapsedMs}ms${flags.map((f) => ` ${f}`).join("")}`
}

const tally = (keys: readonly string[]): Record<string, number> => {
	const out: Record<string, number> = {}
	for (const k of keys) out[k] = (out[k] ?? 0) + 1
	return out
}

/** The coverage line over the steps that completed: none but filed findings, no check that threw. */
function runCoverage(s: RunState, steps: readonly StepRecord[]): string {
	const completed = steps.filter((r) => r.violations.every((v) => v.known !== undefined) && !r.crashed)
	const incomplete = tally(steps.filter((r) => r.incomplete.length).map((r) => r.action))
	const known = tally(steps.flatMap((r) => r.violations.flatMap((v) => (v.known === undefined ? [] : [`#${v.known}`]))))
	return coverageLine(coverage(completed.map((r) => r.action)), s.warns, incomplete, s.allowed, known)
}

/** Runs `plan` until `stopsRun` says it cannot go on, and writes the record. */
export async function runPlan(s: RunState, plan: Plan, target: RecordTarget): Promise<Verdict> {
	const t0 = Date.now()
	// A background clears its ring once its config loads, so its first ids are gone before the run:
	// the continuity check starts after the last line the run found, and step 0 reads those lines.
	s.logs.carried = await drainLogs(s.anchor, 0)
	s.logs.lastId = s.logs.carried.at(-1)?.id ?? 0
	const steps: StepRecord[] = []
	let world = startWorld(plan.start)
	for (const step of plan.steps) {
		const result = await runOne(s, step, world)
		steps.push(result)
		console.log(progressLine(plan.seed, step, result))
		if (stopsRun(result)) break
		world = step.expect.next
	}
	const kind = runVerdict(steps, plan.steps.length)
	const line = runCoverage(s, steps)
	writeRecord(target, plan, s, steps, kind, line)
	return { kind, seed: plan.seed, steps, coverageLine: line, elapsedMs: Date.now() - t0, recordPath: target.path }
}
