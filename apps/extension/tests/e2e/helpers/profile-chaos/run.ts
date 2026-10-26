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
import { callService } from "../../fixtures/session"
import { derivedAddresses } from "./accounts-io"
import {
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
	carriedBy,
} from "./checkers"
import { drainLogs, logErrors, readCensus, readProfiles, readSession, scanStorage } from "./collect"
import { DRIVERS } from "./drivers"
import {
	type ActionName,
	coverage,
	coverageLine,
	endsOf,
	type FileRef,
	live,
	type Plan,
	type PlannedStep,
	profileOf,
	type StepEnd,
	startWorld,
	type World,
} from "./model"
import { type Drive, type Driven, type RunState, type ScannedFile, secretFor, wrongSecret } from "./state"
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
export async function needlesOf(s: RunState): Promise<Needle[]> {
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
export function mask(text: string, needles: readonly Needle[]): string {
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

/** A file's first sight: its raw text, and, for a password export, the check that it opens with its
 *  own password and refuses another, keeping the opened body. */
async function readHeldFile(s: RunState, next: World, ref: FileRef, out: FileScan): Promise<ScannedFile | undefined> {
	const held = s.files.get(ref)
	if (!held) return undefined
	const text = readFileSync(held.path, "utf8")
	if (text.includes("prfSalt")) out.prfSalt.push(`file:${ref}`)
	const model = next.files.find((f) => f.ref === ref)
	if (!model?.password) return { text, carried: () => false }
	const open = held.kind === "backup" ? (pw: string) => openFullBackupText(text, pw) : (pw: string) => decryptAccountExport(text, pw)
	const { body, ...check } = await opensOnlyWith(open, secretFor(s, model.password))
	out.exports.push({ file: ref, ...check })
	if (body?.includes("prfSalt")) out.prfSalt.push(`file:${ref}:opened`)
	return { text, body, carried: carriedBy(model) }
}

/** Every held file against every needle known now. A body may carry a secret by design under another
 *  needle's name as well (an imported account file re-exported), so what it carries is excepted by
 *  value. */
async function scanFiles(s: RunState, next: World, needles: readonly Needle[]): Promise<FileScan> {
	const out: FileScan = { hits: [], exports: [], prfSalt: [] }
	for (const ref of s.files.keys()) {
		let file = s.scanned.get(ref)
		if (!file) {
			file = await readHeldFile(s, next, ref, out)
			if (!file) continue
			s.scanned.set(ref, file)
		}
		out.hits.push(...findNeedles(file.text, needles).map((needle) => ({ where: `file:${ref}`, needle })))
		if (file.body === undefined) continue
		const carried = new Set(needles.filter((n) => file.carried(n.name)).map((n) => n.value))
		const own = needles.filter((n) => !carried.has(n.value))
		out.hits.push(...findNeedles(file.body, own).map((needle) => ({ where: `file:${ref}:opened`, needle })))
	}
	return out
}

export interface StepEvidence {
	violations: Violation[]
	incomplete: string[]
}

/** Drains the logs since the last read and checks them with the page errors since the last mark:
 *  O4 over what `ends` allows, the continuity of the ids, and every needle in every line, the lines
 *  read before included for a needle learnt since. */
export async function checkStepLogs(
	s: RunState,
	ends: readonly StepEnd[],
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
	incomplete.push(...s.logs.gaps.splice(0))
	if (drained.length) s.logs.lastId = drained[drained.length - 1].id
	const logs = [...s.logs.carried, ...drained]
	s.logs.carried = []
	const pageErrors = s.errors.since(s.errorMark)
	s.errorMark += pageErrors.length
	const fresh = needles.filter((n) => !s.logs.searched.has(n.name))
	const hits = [
		...s.logs.seen.flatMap((l) => findNeedles(l.text, fresh).map((needle) => ({ where: `log:${l.id}`, needle }))),
		...logs.flatMap((l) => findNeedles(l.text, needles).map((needle) => ({ where: `log:${l.id}`, needle }))),
	]
	s.logs.seen.push(...logs.map(({ id, text }) => ({ id, text })))
	for (const n of needles) s.logs.searched.add(n.name)
	const errors = checkErrors([...pageErrors, ...logErrors(logs)], ends)
	add(s.warns, errors.warns)
	add(s.allowed, errors.allowed)
	return { violations: errors.violations, incomplete, hits }
}

/** Each live password profile's phrase, read once through the wallet's own export with its
 *  password, so a phrase leaked before any reveal is a needle from its first step; a phrase it
 *  cannot read leaves the leak scan short, a gap of the step. */
export async function learnPhrases(s: RunState, next: World): Promise<string[]> {
	const gaps: string[] = []
	for (const p of live(next)) {
		const id = s.bindings.profiles.get(p.ref)
		if (p.method !== "password" || !p.phrase || !p.password || !id || s.phrases.has(p.phrase)) continue
		const words = await callService<string[]>(s.anchor, "profile", "exportMnemonic", [id, secretFor(s, p.password)]).catch(
			() => undefined,
		)
		if (words) s.phrases.set(p.phrase, words)
		else gaps.push(`leaks: ${p.ref}'s phrase could not be read with its password`)
	}
	return gaps
}

/** Learns what the step showed for the first time: each password profile's phrase, a restored
 *  profile's name, and each derived address of the open profile at its first sighting; returns
 *  what it could not read. */
async function learn(s: RunState, next: World): Promise<string[]> {
	const gaps = await learnPhrases(s, next)
	const ref = next.session.kind === "open" ? next.session.ref : undefined
	const id = ref && s.bindings.profiles.get(ref)
	// The session oracle reports a wallet that holds no session where the model expects one.
	if (!ref || !id || (await isLocked(s.anchor))) return gaps
	if (profileOf(next, ref)?.name === undefined && !s.bindings.names.has(ref)) {
		const listed = (await readProfiles(s.anchor)).listed.find((p) => p.id === id)
		if (listed) s.bindings.names.set(ref, listed.name)
	}
	const seen = s.bindings.addresses.get(ref) ?? []
	const now = await derivedAddresses(s.anchor, id)
	s.bindings.addresses.set(ref, [...seen, ...now.slice(seen.length)])
	return gaps
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
	if (out.length) {
		const known = await needlesOf(s)
		for (const v of out) if (v.detail) v.detail = mask(v.detail, known)
		return { violations: out, incomplete: [] }
	}
	const unread = await learn(s, next)
	const needles = await needlesOf(s)
	out.push(...(await checkState(s, step, before, census)))
	const logs = await checkStepLogs(s, endsOf(step, before), restarted, needles)
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
	return { violations: out, incomplete: [...logs.incomplete, ...unread] }
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

/** Runs the step's driver, the network file's own where it binds one; on a run with a node, a
 *  profile the step opened for the first time goes on the node's network before any check. */
async function drive(s: RunState, step: PlannedStep, before: World): Promise<Driven> {
	const run = (s.network?.drivers[step.action] ?? DRIVERS[step.action]) as Drive
	const driven = await run(s, step.params, step, before)
	const next = step.expect.next.session
	const opened = next.kind === "open" && !live(before).some((p) => p.ref === next.ref)
	if (s.network && opened && driven.outcome === "committed") await s.network.placeOpened(s)
	return driven
}

async function runOne(s: RunState, step: PlannedStep, before: World): Promise<StepRecord> {
	await dismissNotices(s.anchor)
	const census = await readCensus(s.anchor)
	const origin = await backgroundOrigin(s.ctx)
	const t0 = Date.now()
	// A restart during the last step's checks or since loses lines the drain can never read.
	if (s.origin !== undefined && origin !== s.origin) return recordOf(step, t0, { incomplete: [UNPLANNED_RESTART] })
	let driven: Driven
	try {
		driven = await drive(s, step, before)
	} catch (err) {
		const text = `${err instanceof Error ? err.message : String(err)}${callSite(err)} ${await whereStuck(s.anchor)}`
		const detail = mask(text, await needlesOf(s))
		return recordOf(step, t0, { violations: [{ oracle: "O5", message: `${step.action}'s driver could not finish the step`, detail }] })
	}
	const restarted = endsOf(step, before).includes("background")
	const served = await backgroundOrigin(s.ctx)
	if (!restarted && served !== origin) return recordOf(step, t0, { outcome: driven.outcome, incomplete: [UNPLANNED_RESTART] })
	if (restarted) s.logs.lastId = 0
	try {
		const evidence = await checkStep(s, step, before, census, driven, restarted)
		s.origin = await backgroundOrigin(s.ctx)
		// A restart during the checks loses lines a later drain cannot tell apart from none.
		const lost = s.origin === served ? [] : [UNPLANNED_RESTART]
		return recordOf(step, t0, { outcome: driven.outcome, ...evidence, incomplete: [...evidence.incomplete, ...lost] })
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
