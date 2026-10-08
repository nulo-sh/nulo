#!/usr/bin/env bun
/**
 * The `bun audit` gate. Every advisory the audit reports must be acknowledged in `audit-acks.json`
 * with the same id, package, affected range and severity, and every acknowledgement must still match
 * a reported advisory: an advisory that changes or goes away reopens its entry.
 *
 *   audit-gate.ts <bun audit --json output> --exit-code <bun audit's exit code> --mode <enforce|report>
 *   audit-gate.ts mode --base <sha> --head <sha>
 *
 * The first form writes the step summary and, in `enforce` mode, exits 1 on any finding. The second
 * prints the mode a pull request gets from its dependency-file diff (`auditMode`).
 */
import { appendFileSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"

export const ACKS_FILE = join(import.meta.dir, "audit-acks.json")
export const SEVERITIES = ["low", "moderate", "high", "critical"] as const
export type Severity = (typeof SEVERITIES)[number]
export type AuditMode = "enforce" | "report"

export interface Advisory {
	id: number
	package: string
	severity: Severity
	vulnerable_versions: string
	url: string
	title: string
}

export interface Ack {
	id: number
	package: string
	severity: Severity
	vulnerable_versions: string
	bundled: boolean
	reason: string
	revisit: string
}

export interface Judgement {
	acknowledged: { advisory: Advisory; ack: Ack }[]
	unacknowledged: { advisory: Advisory; why: string }[]
	stale: Ack[]
	malformed: string[]
}

type Parsed<T> = { ok: true; value: T } | { ok: false; problems: string[] }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0
const isSeverity = (value: unknown): value is Severity => SEVERITIES.includes(value as Severity)
const isId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0

function toAdvisory(pkg: string, entry: unknown): Advisory | undefined {
	if (!isRecord(entry) || !isId(entry.id) || !isSeverity(entry.severity) || !isText(entry.vulnerable_versions)) return undefined
	const text = (value: unknown) => (typeof value === "string" ? value : "")
	return {
		id: entry.id,
		package: pkg,
		severity: entry.severity,
		vulnerable_versions: entry.vulnerable_versions,
		url: text(entry.url),
		title: text(entry.title),
	}
}

/** `bun audit --json` output: advisories listed under each package name; `{}` when clean. */
export function parseReport(text: string): Parsed<Advisory[]> {
	let raw: unknown
	try {
		raw = JSON.parse(text)
	} catch {
		return { ok: false, problems: ["the audit output is not JSON"] }
	}
	if (!isRecord(raw)) return { ok: false, problems: ["the audit output is not an object of packages"] }
	const advisories: Advisory[] = []
	for (const [pkg, list] of Object.entries(raw)) {
		if (!Array.isArray(list)) return { ok: false, problems: [`${pkg}: not a list of advisories`] }
		for (const entry of list) {
			const advisory = toAdvisory(pkg, entry)
			if (!advisory) return { ok: false, problems: [`${pkg}: an advisory lacks an id, a known severity or an affected range`] }
			advisories.push(advisory)
		}
	}
	return { ok: true, value: advisories }
}

function groupProblems(group: Record<string, unknown>, at: string): string[] {
	const problems: string[] = []
	if (typeof group.bundled !== "boolean") problems.push(`${at}: "bundled" is not true or false`)
	if (!isText(group.reason)) problems.push(`${at}: "reason" is empty`)
	if (!isText(group.revisit)) problems.push(`${at}: "revisit" is empty`)
	if (!Array.isArray(group.advisories) || group.advisories.length === 0) problems.push(`${at}: "advisories" is empty`)
	return problems
}

function toAck(group: Record<string, unknown>, entry: unknown): Ack | undefined {
	if (
		!isRecord(entry) ||
		!isId(entry.id) ||
		!isText(entry.package) ||
		!isSeverity(entry.severity) ||
		!isText(entry.vulnerable_versions)
	) {
		return undefined
	}
	return {
		id: entry.id,
		package: entry.package,
		severity: entry.severity,
		vulnerable_versions: entry.vulnerable_versions,
		bundled: group.bundled as boolean,
		reason: group.reason as string,
		revisit: group.revisit as string,
	}
}

/**
 * `audit-acks.json`: groups that share a reason, each listing its advisories. Every advisory carries
 * the fields it is matched on, and an id appears once in the whole file.
 */
export function parseAcks(raw: unknown): Parsed<Ack[]> {
	if (!Array.isArray(raw)) return { ok: false, problems: ["not a list of groups"] }
	const acks: Ack[] = []
	const problems: string[] = []
	for (const [index, group] of raw.entries()) {
		const parsed = groupAcks(group, `group ${index + 1}`)
		if (parsed.ok) acks.push(...parsed.value)
		else problems.push(...parsed.problems)
	}
	const ids = acks.map((ack) => ack.id)
	const twice = new Set(ids.filter((id, index) => ids.indexOf(id) !== index))
	problems.push(...[...twice].map((id) => `advisory ${id} is acknowledged twice`))
	return problems.length > 0 ? { ok: false, problems } : { ok: true, value: acks }
}

function groupAcks(group: unknown, at: string): Parsed<Ack[]> {
	if (!isRecord(group)) return { ok: false, problems: [`${at}: not an object`] }
	const problems = groupProblems(group, at)
	if (problems.length > 0) return { ok: false, problems }
	const acks = (group.advisories as unknown[]).map((entry) => toAck(group, entry))
	if (acks.some((ack) => ack === undefined)) {
		return { ok: false, problems: [`${at}: an advisory lacks an id, a package, a known severity or an affected range`] }
	}
	return { ok: true, value: acks as Ack[] }
}

function mismatch(advisory: Advisory, ack: Ack): string | undefined {
	const fields = (["package", "vulnerable_versions", "severity"] as const).filter((field) => advisory[field] !== ack[field])
	if (fields.length === 0) return undefined
	return fields.map((field) => `${field} is ${JSON.stringify(advisory[field])}, acknowledged as ${JSON.stringify(ack[field])}`).join("; ")
}

/** With `--audit-level=low`, bun audit exits 1 exactly when it reports an advisory. */
function exitProblem(exitCode: number, count: number): string | undefined {
	if (exitCode !== 0 && exitCode !== 1) return `bun audit exited ${exitCode}: a tool failure, not a result`
	if (exitCode === 0 && count > 0) return `bun audit exited 0 but reported ${count} advisories`
	if (exitCode === 1 && count === 0) return "bun audit exited 1 but reported no advisory"
	return undefined
}

export function judgeAudit(input: { report: string; exitCode: number; acks: unknown }): Judgement {
	const judgement: Judgement = { acknowledged: [], unacknowledged: [], stale: [], malformed: [] }
	const acks = parseAcks(input.acks)
	if (!acks.ok) {
		judgement.malformed.push(...acks.problems.map((problem) => `audit-acks.json: ${problem}`))
		return judgement
	}
	const report = parseReport(input.report)
	if (!report.ok) {
		judgement.malformed.push(...report.problems)
		return judgement
	}
	const exit = exitProblem(input.exitCode, report.value.length)
	if (exit) {
		judgement.malformed.push(exit)
		return judgement
	}
	const byId = new Map(acks.value.map((ack) => [ack.id, ack]))
	const reported = new Set<number>()
	for (const advisory of report.value) {
		reported.add(advisory.id)
		const ack = byId.get(advisory.id)
		const why = ack ? mismatch(advisory, ack) : "no acknowledgement"
		if (ack && !why) judgement.acknowledged.push({ advisory, ack })
		else judgement.unacknowledged.push({ advisory, why: why ?? "" })
	}
	judgement.stale = acks.value.filter((ack) => !reported.has(ack.id))
	return judgement
}

export const failing = (judgement: Judgement): boolean =>
	judgement.unacknowledged.length + judgement.stale.length + judgement.malformed.length > 0

/** The files whose diff decides the mode, as git pathspecs; the same set as pr-quick's `deps` filter. */
export const DEPENDENCY_PATHSPECS = ["bun.lock", "bunfig.toml", "scripts/ci-cd/audit-acks.json", ":(glob)**/package.json"]

/** A dependency or an override named `version` sits deeper than a manifest's or a workspace's own field. */
const MANIFEST_VERSION = /^[+-](?:\t| {2})"version": "[^"\\]*",?$/
const WORKSPACE_VERSION = /^[+-] {6}"version": "[^"\\]*",?$/
const isVersioned = (path: string): boolean => path === "bun.lock" || path === "package.json" || path.endsWith("/package.json")

/**
 * The mode for a pull request from `git diff -U0 --no-renames` over `DEPENDENCY_PATHSPECS`: `report`
 * when every changed line is a `"version": "…"` line of a package.json or bun.lock (what a Release PR
 * and the main → dev sync change), `enforce` for anything else, headers included.
 */
export function auditMode(diff: string): { mode: AuditMode; why: string } {
	const state: DiffState = { inHunk: false }
	for (const line of diff.split("\n")) {
		const why = enforcingLine(state, line)
		if (why) return { mode: "enforce", why }
	}
	return { mode: "report", why: state.file ? "only version lines changed" : "no dependency file changed" }
}

type DiffState = { file?: string; inHunk: boolean }

/** Why `line` is more than a version change, or nothing; a hunk's lines are content, never headers. */
function enforcingLine(state: DiffState, line: string): string | undefined {
	const header = /^diff --git a\/.+ b\/(.+)$/.exec(line)
	if (header) {
		state.file = header[1]
		state.inHunk = false
		return isVersioned(header[1]) ? undefined : `${header[1]} changed`
	}
	if (line === "" || line.startsWith("\\")) return undefined
	if (line.startsWith("@@")) {
		state.inHunk = true
		return undefined
	}
	const version = state.file === "bun.lock" ? WORKSPACE_VERSION : MANIFEST_VERSION
	const benign = state.inHunk ? version.test(line) : /^(index |--- |\+\+\+ )/.test(line)
	return benign ? undefined : `${state.file ?? "the diff"}: ${line.slice(0, 120)}`
}

function git(args: string[], cwd: string): string {
	const run = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" })
	if (run.exitCode !== 0) throw new Error(`git ${args[0]} failed: ${run.stderr.toString().trim()}`)
	return run.stdout.toString()
}

/** The pull request's own dependency diff: from the merge base to its head, rendered without config. */
export function dependencyDiff(base: string, head: string, cwd = process.cwd()): string {
	const mergeBase = git(["merge-base", base, head], cwd).trim()
	return git(
		[
			"diff",
			"-U0",
			"--no-color",
			"--no-ext-diff",
			"--no-textconv",
			"--no-renames",
			"--src-prefix=a/",
			"--dst-prefix=b/",
			mergeBase,
			head,
			"--",
			...DEPENDENCY_PATHSPECS,
		],
		cwd,
	)
}

const cell = (text: string): string => text.replace(/[\r\n]+/g, " ").replace(/\|/g, "\\|")
const advisoryLink = (advisory: Advisory): string => (advisory.url ? `[${advisory.id}](${cell(advisory.url)})` : String(advisory.id))

export function renderSummary(judgement: Judgement, mode: AuditMode): string {
	const lines = [`## bun audit (${mode})`, ""]
	const total = judgement.acknowledged.length + judgement.unacknowledged.length
	lines.push(`${total} advisories reported, ${judgement.acknowledged.length} acknowledged in \`scripts/ci-cd/audit-acks.json\`.`, "")
	if (judgement.malformed.length > 0) lines.push("### Unreadable", "", ...judgement.malformed.map((problem) => `- ${cell(problem)}`), "")
	if (judgement.unacknowledged.length > 0) {
		lines.push("### Unacknowledged", "", "| Package | Severity | Advisory | Why |", "|---|---|---|---|")
		for (const { advisory, why } of judgement.unacknowledged) {
			lines.push(
				`| ${cell(advisory.package)} | ${advisory.severity} | ${advisoryLink(advisory)} ${cell(advisory.title)} | ${cell(why)} |`,
			)
		}
		lines.push("")
	}
	if (judgement.stale.length > 0) {
		lines.push(
			"### Acknowledged but no longer reported",
			"",
			...judgement.stale.map((ack) => `- ${ack.id} (${ack.package}): delete its entry`),
			"",
		)
	}
	if (judgement.acknowledged.length > 0) {
		lines.push(
			"<details><summary>Acknowledged</summary>",
			"",
			"| Package | Severity | Advisory | Reason | Revisit |",
			"|---|---|---|---|---|",
		)
		for (const { advisory, ack } of judgement.acknowledged) {
			lines.push(
				`| ${cell(advisory.package)} | ${advisory.severity} | ${advisoryLink(advisory)} | ${cell(ack.reason)} | ${cell(ack.revisit)} |`,
			)
		}
		lines.push("", "</details>", "")
	}
	return lines.join("\n")
}

/** A workflow command's message, escaped so report text cannot end the line and start another command. */
const command = (level: "error" | "warning", message: string): string =>
	`::${level}::${message.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`

function problems(judgement: Judgement): string[] {
	return [
		...judgement.malformed,
		...judgement.unacknowledged.map(
			({ advisory, why }) => `${advisory.package} advisory ${advisory.id} (${advisory.severity}): ${why}`,
		),
		...judgement.stale.map((ack) => `${ack.package} advisory ${ack.id} is acknowledged but no longer reported: delete its entry`),
	]
}

function readJson(path: string): unknown {
	try {
		return JSON.parse(readFileSync(path, "utf8"))
	} catch {
		return undefined
	}
}

function runJudge(reportPath: string, exitCode: number, mode: AuditMode, acksPath: string): number {
	let report = ""
	try {
		report = readFileSync(reportPath, "utf8")
	} catch {
		// An unreadable file judges as non-JSON output, which is malformed.
	}
	const judgement = judgeAudit({ report, exitCode, acks: readJson(acksPath) })
	const summaryPath = process.env.GITHUB_STEP_SUMMARY
	if (summaryPath) appendFileSync(summaryPath, `${renderSummary(judgement, mode)}\n`)
	for (const problem of problems(judgement)) console.log(command(mode === "enforce" ? "error" : "warning", problem))
	console.log(
		`bun audit (${mode}): ${judgement.acknowledged.length} acknowledged, ${judgement.unacknowledged.length} unacknowledged, ` +
			`${judgement.stale.length} stale, ${judgement.malformed.length} unreadable`,
	)
	return mode === "enforce" && failing(judgement) ? 1 : 0
}

/** A diff git cannot produce (a base a force-push left unreachable) costs the exemption, never the PR. */
function modeFor(base: string, head: string): { mode: AuditMode; why: string } {
	try {
		return auditMode(dependencyDiff(base, head))
	} catch (error) {
		console.log(command("warning", `the dependency diff failed, so the audit enforces: ${String(error)}`))
		return { mode: "enforce", why: "the dependency diff failed" }
	}
}

function runMode(base: string | undefined, head: string | undefined): number {
	const sha = /^[0-9a-f]{40}$/
	if (!base || !head || !sha.test(base) || !sha.test(head)) {
		console.error("usage: audit-gate.ts mode --base <40-hex sha> --head <40-hex sha>")
		return 2
	}
	const { mode, why } = modeFor(base, head)
	console.log(`audit mode: ${mode} (${why.replace(/[\r\n]/g, " ")})`)
	const outputPath = process.env.GITHUB_OUTPUT
	if (outputPath) appendFileSync(outputPath, `audit-mode=${mode}\n`)
	return 0
}

function main(argv: string[]): number {
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			"exit-code": { type: "string" },
			mode: { type: "string" },
			acks: { type: "string" },
			base: { type: "string" },
			head: { type: "string" },
		},
	})
	if (positionals[0] === "mode" && positionals.length === 1) return runMode(values.base, values.head)
	const rawExit = values["exit-code"] ?? ""
	const exitCode = /^\d+$/.test(rawExit) ? Number(rawExit) : Number.NaN
	const mode = values.mode
	if (positionals.length !== 1 || !Number.isInteger(exitCode) || (mode !== "enforce" && mode !== "report")) {
		console.error("usage: audit-gate.ts <bun audit --json output> --exit-code <n> --mode <enforce|report> [--acks <file>]")
		return 2
	}
	return runJudge(positionals[0], exitCode, mode, values.acks ?? ACKS_FILE)
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
