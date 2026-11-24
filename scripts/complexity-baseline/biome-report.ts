/**
 * The one reader of Biome's JSON report for the baseline scripts. It decides no policy: each
 * caller states its own for a parse error, a path Biome printed with `./` and a diagnostic with no
 * position.
 */
import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { BASELINED_RULES, type BaselinedRule } from "./scan"

const CATEGORY_PREFIX = "lint/complexity/"
/** This checkout's installed launcher, run on Bun; never one found through the working directory, `PATH` or a runner. */
const BIOME = join(import.meta.dir, "..", "..", "node_modules", ".bin", "biome")

/** A `lint/complexity/*` diagnostic: `category` without the prefix, `path` as Biome printed it. */
export interface BudgetDiagnostic {
	path: string
	category: string
	message: string
	line: number | undefined
}

interface RawDiagnostic {
	category?: string
	message: string
	location: { path: string; start?: { line: number } }
}

/**
 * Lints `paths` in one Biome run from `cwd`. Throws on no output or a truncated report, naming what
 * the report `feeds`, since either would leave that result incomplete.
 */
export function readBiomeReport(
	paths: readonly string[],
	feeds: "baseline" | "audit",
	cwd?: string,
): { budget: BudgetDiagnostic[]; parseErrors: string[] } {
	const res = spawnSync(process.execPath, ["--no-install", BIOME, "lint", "--reporter=json", "--max-diagnostics=none", ...paths], {
		cwd,
		encoding: "utf8",
		maxBuffer: 256 * 1024 * 1024,
	})
	if (!res.stdout) throw new Error(`biome lint produced no output: ${res.stderr}`)
	const report = JSON.parse(res.stdout)
	const notPrinted = report.summary?.diagnosticsNotPrinted ?? 0
	if (notPrinted > 0) throw new Error(`biome truncated ${notPrinted} diagnostic(s) — the ${feeds} would be incomplete`)
	const all = (report.diagnostics ?? []) as RawDiagnostic[]
	const parseErrors = all.filter((d) => (d.category ?? "").startsWith("parse")).map((d) => `${d.location.path}: ${d.message}`)
	const budget = all
		.filter((d) => (d.category ?? "").startsWith(CATEGORY_PREFIX))
		.map((d) => ({
			path: d.location.path,
			category: (d.category as string).slice(CATEGORY_PREFIX.length),
			message: d.message,
			line: d.location.start?.line,
		}))
	return { budget, parseErrors }
}

export function isBaselined(category: string): category is BaselinedRule {
	return (BASELINED_RULES as readonly string[]).includes(category)
}
