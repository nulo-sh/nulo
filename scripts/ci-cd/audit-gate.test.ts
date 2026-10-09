/**
 * The `bun audit` gate: what it refuses, the mode a pull request's dependency diff selects, and that
 * nothing but pr-quick's `changes` job can select `enforce`.
 */
import { describe, expect, test } from "bun:test"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { lockWithVersion } from "../release/lock-version"
import {
	ACKS_FILE,
	auditMode,
	command,
	DEPENDENCY_PATHSPECS,
	dependencyDiff,
	failing,
	judgeAudit,
	parseAcks,
	plain,
	renderSummary,
} from "./audit-gate"

const ROOT = join(import.meta.dir, "..", "..")
const GATE = join(import.meta.dir, "audit-gate.ts")

const advisory = (id: number, severity: string, range: string) => ({
	id,
	url: `https://github.com/advisories/GHSA-test-${id}`,
	title: `advisory ${id}`,
	severity,
	vulnerable_versions: range,
	cwe: [],
	cvss: {},
})
const REPORT = JSON.stringify({ undici: [advisory(11, "high", "<6.24.0")], ws: [advisory(12, "moderate", ">=8.0.0 <8.20.1")] })
const group = (advisories: object[]) => ({ bundled: false, reason: "Node-only.", revisit: "the next Aztec bump", advisories })
const ACKS = [
	group([
		{ id: 11, package: "undici", severity: "high", vulnerable_versions: "<6.24.0" },
		{ id: 12, package: "ws", severity: "moderate", vulnerable_versions: ">=8.0.0 <8.20.1" },
	]),
]

describe("judgeAudit", () => {
	test("a report whose every advisory is acknowledged passes", () => {
		const judgement = judgeAudit({ report: REPORT, exitCode: 1, acks: ACKS })
		expect(judgement.acknowledged.map(({ advisory }) => advisory.id)).toEqual([11, 12])
		expect(failing(judgement)).toBe(false)
		expect(failing(judgeAudit({ report: "{}\n", exitCode: 0, acks: [] }))).toBe(false)
	})

	test("an advisory with no acknowledgement fails", () => {
		const judgement = judgeAudit({ report: REPORT, exitCode: 1, acks: [group([ACKS[0].advisories[0]])] })
		expect(judgement.unacknowledged).toEqual([{ advisory: expect.objectContaining({ id: 12 }), why: "no acknowledgement" }])
	})

	test.each([
		["package", "undici-fork"],
		["vulnerable_versions", "<6.23.0"],
		["severity", "moderate"],
	])("an acknowledgement whose %s no longer matches stops covering the advisory", (field, value) => {
		const acks = [group([{ ...ACKS[0].advisories[0], [field]: value }, ACKS[0].advisories[1]])]
		const judgement = judgeAudit({ report: REPORT, exitCode: 1, acks })
		expect(judgement.unacknowledged).toHaveLength(1)
		expect(judgement.unacknowledged[0].why).toStartWith(`${field} is `)
	})

	test("an acknowledgement no advisory matches is stale", () => {
		const report = JSON.stringify({ undici: [advisory(11, "high", "<6.24.0")] })
		const judgement = judgeAudit({ report, exitCode: 1, acks: ACKS })
		expect(judgement.stale.map((ack) => ack.id)).toEqual([12])
		expect(failing(judgement)).toBe(true)
	})

	test.each([
		["not JSON", "bun audit: network error", 1],
		["an advisory without an id", JSON.stringify({ ws: [{ severity: "high", vulnerable_versions: "<8.21.0" }] }), 1],
		["findings under exit 0", REPORT, 0],
		["exit 1 without findings", "{}", 1],
	])("a malformed report fails: %s", (_, report, exitCode) => {
		expect(judgeAudit({ report, exitCode, acks: ACKS }).malformed).toHaveLength(1)
	})

	test("an exit code other than 0 or 1 is a tool failure", () => {
		expect(judgeAudit({ report: "{}", exitCode: 2, acks: [] }).malformed).toEqual(["bun audit exited 2: a tool failure, not a result"])
	})

	test("an acknowledgement file with an empty reason or revisit, or one id twice, is refused", () => {
		expect(parseAcks([{ ...ACKS[0], reason: " " }])).toEqual({ ok: false, problems: ['group 1: "reason" is empty'] })
		expect(parseAcks([{ ...ACKS[0], revisit: "" }])).toEqual({ ok: false, problems: ['group 1: "revisit" is empty'] })
		expect(parseAcks([...ACKS, group([ACKS[0].advisories[1]])])).toEqual({ ok: false, problems: ["advisory 12 is acknowledged twice"] })
	})

	test("the committed audit-acks.json parses", () => {
		const parsed = parseAcks(JSON.parse(readFileSync(ACKS_FILE, "utf8")))
		expect(parsed.ok ? [] : parsed.problems).toEqual([])
	})
})

describe("the gate's command line", () => {
	test("enforce exits 1 on a finding where report exits 0, and both write the step summary", () => {
		const dir = mkdtempSync(join(tmpdir(), "nulo-audit-gate-"))
		try {
			const report = join(dir, "audit.json")
			const acks = join(dir, "acks.json")
			writeFileSync(report, REPORT)
			writeFileSync(acks, JSON.stringify([group([ACKS[0].advisories[0]])]))
			for (const [mode, exit] of [
				["enforce", 1],
				["report", 0],
			] as const) {
				const summary = join(dir, `summary-${mode}.md`)
				const run = Bun.spawnSync(["bun", GATE, report, "--exit-code", "1", "--mode", mode, "--acks", acks], {
					env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
					stdout: "pipe",
				})
				expect(run.exitCode, run.stdout.toString()).toBe(exit)
				expect(readFileSync(summary, "utf8")).toContain(`## bun audit (${mode})`)
				expect(run.stdout.toString()).toContain("ws advisory 12 (moderate): no acknowledgement")
			}
		} finally {
			rmSync(dir, { recursive: true, force: true })
		}
	})
})

describe("log output", () => {
	test("report text cannot start or embed a workflow command", () => {
		const hostile = "ws\r::error::forged\n##[error]legacy"
		for (const line of [command("warning", hostile), plain(hostile)]) {
			const physical = line.split(/\r\n|\r|\n/)
			expect(physical).toHaveLength(1)
			expect(line).not.toContain("##[")
		}
	})

	test("a backslash in report text cannot cancel a summary cell's pipe escape", () => {
		const report = JSON.stringify({ ws: [{ ...advisory(12, "moderate", "<8.20.1"), title: "a\\|b" }] })
		const summary = renderSummary(judgeAudit({ report, exitCode: 1, acks: [] }), "enforce")
		expect(summary).toContain("a\\\\\\|b")
	})

	test("only a URL a summary link cannot misread becomes a link", () => {
		const report = JSON.stringify({
			undici: [advisory(11, "high", "<6.24.0")],
			ws: [{ ...advisory(12, "moderate", "<8.20.1"), url: "https://example.org/a)b c" }],
		})
		const summary = renderSummary(judgeAudit({ report, exitCode: 1, acks: [] }), "enforce")
		expect(summary).toContain("[11](https://github.com/advisories/GHSA-test-11)")
		expect(summary).toContain("| moderate | 12 advisory 12 |")
	})
})

describe("the mode command", () => {
	test("a diff git cannot produce selects enforce without failing the job", () => {
		const repo = mkdtempSync(join(tmpdir(), "nulo-audit-mode-cli-"))
		try {
			Bun.spawnSync(["git", "init", "--quiet"], { cwd: repo })
			const output = join(repo, "github-output")
			const missing = "0".repeat(40)
			const run = Bun.spawnSync(["bun", GATE, "mode", "--base", missing, "--head", missing], {
				cwd: repo,
				env: { ...process.env, GITHUB_OUTPUT: output },
				stdout: "pipe",
			})
			expect(run.exitCode, run.stdout.toString()).toBe(0)
			expect(readFileSync(output, "utf8")).toBe("audit-mode=enforce\n")
		} finally {
			rmSync(repo, { recursive: true, force: true })
		}
	})
})

describe("auditMode", () => {
	const FILES = ["package.json", "apps/extension/package.json", "bun.lock", "bunfig.toml", "scripts/ci-cd/audit-acks.json"]
	const git = (cwd: string, ...args: string[]) => {
		const run = Bun.spawnSync(
			["git", "-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args],
			{
				cwd,
				stdout: "pipe",
				stderr: "pipe",
			},
		)
		if (run.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr.toString()}`)
		return run.stdout.toString().trim()
	}
	/** The mode a branch gets that copies this tree's dependency files, then applies `edit`. */
	const modeAfter = (edit: (read: (file: string) => string, write: (file: string, text: string) => void) => void) => {
		const repo = mkdtempSync(join(tmpdir(), "nulo-audit-mode-"))
		try {
			for (const file of FILES) {
				mkdirSync(dirname(join(repo, file)), { recursive: true })
				cpSync(join(ROOT, file), join(repo, file))
			}
			git(repo, "init", "--quiet")
			git(repo, "add", ".")
			git(repo, "commit", "--quiet", "-m", "base")
			const base = git(repo, "rev-parse", "HEAD")
			edit(
				(file) => readFileSync(join(repo, file), "utf8"),
				(file, text) => writeFileSync(join(repo, file), text),
			)
			git(repo, "commit", "--quiet", "-am", "change")
			return auditMode(dependencyDiff(base, git(repo, "rev-parse", "HEAD"), repo))
		} finally {
			rmSync(repo, { recursive: true, force: true })
		}
	}
	const bumpVersion = (text: string) => text.replace(/("version": ")[^"]+"/, '$19.9.9"')

	test("a Release PR's version bump reports", () => {
		const result = modeAfter((read, write) => {
			write("package.json", bumpVersion(read("package.json")))
			write("apps/extension/package.json", bumpVersion(read("apps/extension/package.json")))
			const lock = lockWithVersion(read("bun.lock"), "9.9.9")
			if (!lock.ok || lock.value === null) throw new Error("the lockfile kept its version")
			write("bun.lock", lock.value)
		})
		expect(result).toEqual({ mode: "report", why: "only version lines changed" })
	})

	test.each([
		[
			"an added dependency",
			"apps/extension/package.json",
			(text: string) => text.replace('"zod": ', '"left-pad": "1.3.0",\n\t\t"zod": '),
		],
		[
			"a dependency named version",
			"apps/extension/package.json",
			(text: string) => text.replace('"zod": ', '"version": "0.1.2",\n\t\t"zod": '),
		],
		["a changed range", "apps/extension/package.json", (text: string) => text.replace(/"zod": "[^"]+"/, '"zod": "^4.0.0"')],
		["a bunfig.toml change", "bunfig.toml", (text: string) => text.replace("minimumReleaseAge = 604800", "minimumReleaseAge = 0")],
		["an acknowledgement change", "scripts/ci-cd/audit-acks.json", (text: string) => text.replace('"the next Aztec bump"', '"never"')],
	])("%s enforces", (_, file, change) => {
		const result = modeAfter((read, write) => {
			const before = read(file)
			write(file, change(before))
			if (read(file) === before) throw new Error(`the edit left ${file} unchanged`)
		})
		expect(result.mode).toBe("enforce")
	})
})

describe("the audit mode's wiring", () => {
	// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
	type Workflows = Record<string, any>
	const WORKFLOWS = [...new Bun.Glob("*.yml").scanSync(join(ROOT, ".github/workflows"))]
	const load = (): Workflows =>
		Object.fromEntries(WORKFLOWS.map((file) => [file, Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows", file), "utf8"))]))
	const LINT = "./.github/workflows/_lint-and-typecheck.yml"
	const PR_MODE = "${{ needs.changes.outputs.audit-mode }}"

	function callerSources(workflows: Workflows): string[] {
		const calls = Object.entries(workflows).flatMap(([file, workflow]) =>
			Object.entries<Workflows>(workflow.jobs ?? {}).map(([name, job]) => ({ file, name, job })),
		)
		return calls
			.filter(({ job }) => job.uses === LINT && job.with?.audit_mode !== undefined)
			.filter(
				({ file, job }) => file !== "pr-quick.yml" || job.with.audit_mode !== PR_MODE || ![job.needs].flat().includes("changes"),
			)
			.map(({ file, name, job }) => `${file} ${name}: ${job.with.audit_mode}`)
	}

	function enforceSources(workflows: Workflows): string[] {
		const found = callerSources(workflows)
		const input = workflows["_lint-and-typecheck.yml"].on.workflow_call.inputs.audit_mode
		if (input?.default !== "report") found.push(`_lint-and-typecheck.yml: audit_mode defaults to ${input?.default}`)
		const changes = workflows["pr-quick.yml"].jobs.changes
		if (changes.outputs["audit-mode"] !== "${{ steps.audit-mode.outputs.audit-mode }}") found.push("pr-quick.yml: audit-mode output")
		const run = String(changes.steps.find((step: Workflows) => step.id === "audit-mode")?.run ?? "")
		if (!run.includes("audit-gate.ts mode --base") || run.includes("audit-mode=enforce")) found.push("pr-quick.yml: audit-mode step")
		return [...found, ...deliveryGaps(workflows)]
	}

	function deliveryGaps(workflows: Workflows): string[] {
		const found: string[] = []
		if (workflows["pr-quick.yml"].jobs["lint-and-typecheck"].with?.audit_mode !== PR_MODE)
			found.push("pr-quick.yml: lint job's audit_mode")
		const steps = workflows["_lint-and-typecheck.yml"].jobs["lint-and-typecheck"].steps
		const audit = steps.find((step: Workflows) => step.name === "bun audit")
		if (audit?.env?.AUDIT_MODE !== "${{ inputs.audit_mode }}" || !String(audit?.run).includes('--mode "$AUDIT_MODE"')) {
			found.push("_lint-and-typecheck.yml: the audit step's mode")
		}
		return found
	}

	test("only pr-quick's changes job selects enforce, and its choice reaches the gate", () => {
		expect(enforceSources(load())).toEqual([])
		const forced = load()
		const nightly = Object.values<Workflows>(forced["nightly.yml"].jobs).find((job) => job.uses === LINT)
		if (!nightly) throw new Error("nightly.yml no longer calls the lint workflow")
		nightly.with = { ...nightly.with, audit_mode: "enforce" }
		expect(enforceSources(forced)).toEqual([expect.stringContaining("nightly.yml")])
		const dropped = load()
		dropped["pr-quick.yml"].jobs["lint-and-typecheck"].with.audit_mode = undefined
		expect(enforceSources(dropped)).toEqual(["pr-quick.yml: lint job's audit_mode"])
		const pinned = load()
		const audit = pinned["_lint-and-typecheck.yml"].jobs["lint-and-typecheck"].steps.find(
			(step: Workflows) => step.name === "bun audit",
		)
		audit.env.AUDIT_MODE = "report"
		expect(enforceSources(pinned)).toEqual(["_lint-and-typecheck.yml: the audit step's mode"])
	})

	test("pr-quick's deps filter watches the files the mode reads", () => {
		const changes = load()["pr-quick.yml"].jobs.changes
		const filter = changes.steps.find((step: Workflows) => String(step.uses).includes("dorny/paths-filter"))
		expect((Bun.YAML.parse(filter.with.filters) as Record<string, string[]>).deps).toEqual(
			DEPENDENCY_PATHSPECS.map((spec) => spec.replace(":(glob)", "")),
		)
	})
})
