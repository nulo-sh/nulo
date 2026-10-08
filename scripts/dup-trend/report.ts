/**
 * Duplication trend report (jscpd) — an advisory instrument, never a gate.
 * Clone identity is too unstable to ratchet (boundaries shift whenever either
 * side is edited), so duplication is watched as a trend: nightly's `dup-trend`
 * job pipes this into the step summary; locally it's `bun run audit:dup`.
 * Escalation (a diff-scoped new-clone check) is built only if the trend worsens.
 */
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

/** Exact-pinned (immutable) — bump manually, keeping the version ≥7 days old on npm. */
export const JSCPD_VERSION = "5.0.16"

const SCAN_PATHS = ["apps", "packages", "scripts"]
const IGNORE = [
	"**/node_modules/**",
	"**/dist/**",
	"**/target/**",
	"**/*.d.ts",
	"**/*.json",
	"**/*.md",
	"**/*.svg",
	"**/*.css",
	"**/*.scss",
	"**/types/**",
	"**/artifacts/**",
	"**/storybook-static/**",
].join(",")

const TEST_PATH_RE = /\.test\.|\/tests\/|\/e2e\/|__tests__|\.spec\.|vitest\.setup/

export interface JscpdReport {
	duplicates: { format: string; lines: number; firstFile: { name: string }; secondFile: { name: string } }[]
	statistics: {
		total: {
			sources: number
			lines: number
			clones: number
			duplicatedLines: number
			percentage: number
			percentageTokens: number
		}
	}
}

interface Tally {
	clones: number
	lines: number
}

const tally = (): Tally => ({ clones: 0, lines: 0 })

function count(into: Tally, lines: number): void {
	into.clones++
	into.lines += lines
}

function countIn(map: Map<string, Tally>, key: string, lines: number): void {
	const entry = map.get(key) ?? tally()
	count(entry, lines)
	map.set(key, entry)
}

interface DupSplit {
	prod: Tally
	test: Tally
	mixed: number
	prodFormats: Map<string, Tally>
	prodPairs: Map<string, Tally>
}

/** Splits clones by whether each side is a test file; only production↔production clones are ranked. */
function splitDuplicates(duplicates: JscpdReport["duplicates"]): DupSplit {
	const split: DupSplit = { prod: tally(), test: tally(), mixed: 0, prodFormats: new Map(), prodPairs: new Map() }
	for (const c of duplicates) {
		const a = c.firstFile.name
		const b = c.secondFile.name
		const aTest = TEST_PATH_RE.test(a)
		if (aTest !== TEST_PATH_RE.test(b)) {
			split.mixed++
			continue
		}
		if (aTest) {
			count(split.test, c.lines)
			continue
		}
		count(split.prod, c.lines)
		countIn(split.prodFormats, c.format, c.lines)
		// html-format clones over Vue templates are tokenizer noise (whole-template
		// vocabulary matches with wildly unequal spans), so they stay out of the
		// actionable pair ranking; the per-format split above still counts them.
		if (c.format === "html") continue
		countIn(split.prodPairs, a === b ? `${a} (internal)` : [a, b].sort().join(" ↔ "), c.lines)
	}
	return split
}

/** Renders the jscpd JSON report as the markdown trend summary. */
export function formatDupReport(report: JscpdReport): string {
	const t = report.statistics.total
	const { prod, test, mixed, prodFormats, prodPairs } = splitDuplicates(report.duplicates)
	const formats = [...prodFormats.entries()].sort((x, y) => y[1].lines - x[1].lines)
	const top = [...prodPairs.entries()].sort((x, y) => y[1].lines - x[1].lines).slice(0, 10)
	const out: string[] = []
	out.push("## Duplication trend (jscpd, advisory)")
	out.push("")
	out.push("| files | lines | clones | dup lines | % lines | % tokens |")
	out.push("|--:|--:|--:|--:|--:|--:|")
	out.push(
		`| ${t.sources} | ${t.lines} | ${t.clones} | ${t.duplicatedLines} | ${t.percentage.toFixed(2)}% | ${t.percentageTokens.toFixed(2)}% |`,
	)
	out.push("")
	out.push(
		`Split: **production ${prod.clones} clones / ${prod.lines} lines** · test↔test ${test.clones} / ${test.lines} · mixed ${mixed}.`,
	)
	out.push("")
	if (formats.length > 0) {
		out.push(`Production by format: ${formats.map(([f, e]) => `${f} ${e.clones} / ${e.lines}`).join(" · ")}.`)
		out.push("")
	}
	out.push("### Top production clone pairs (html excluded — Vue-template tokenizer noise)")
	out.push("")
	out.push("| dup lines | clones | pair |")
	out.push("|--:|--:|---|")
	for (const [pair, e] of top) out.push(`| ${e.lines} | ${e.clones} | \`${pair}\` |`)
	out.push("")
	return out.join("\n")
}

function main(): void {
	const outDir = mkdtempSync(join(tmpdir(), "jscpd-"))
	const res = spawnSync(
		"bunx",
		[
			`jscpd@${JSCPD_VERSION}`,
			...SCAN_PATHS,
			"--ignore",
			IGNORE,
			"--min-tokens",
			"50",
			"--reporters",
			"json,silent",
			"--output",
			outDir,
		],
		{ encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
	)
	if (res.error || res.status !== 0) {
		console.error(`jscpd failed (status ${res.status}): ${res.stderr || res.error}`)
		process.exit(1)
	}
	const report: JscpdReport = JSON.parse(readFileSync(join(outDir, "jscpd-report.json"), "utf8"))
	console.log(formatDupReport(report))
}

if (import.meta.main) main()
