/**
 * Behavioral pin for the nightly's tag name: `resolve`'s step runs under a `git`, `jq` and `date`
 * that serve a scripted remote, and its chosen tag is read back against `prune-nightlies`, which
 * deletes every nightly past the newest fourteen.
 *
 * Wired into CI via the root `test:ci-gating` script in `_unit-tests.yml`.
 */
import { describe, expect, test } from "bun:test"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { planPrune } from "../release/prune-nightlies"

const ROOT = join(import.meta.dir, "..", "..")
// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
const WORKFLOW: any = Bun.YAML.parse(readFileSync(join(ROOT, ".github/workflows/nightly.yml"), "utf8"))
const STEP: { run: string } = WORKFLOW.jobs.resolve.steps.find((s: { id?: string }) => s.id === "r")

const SHIMS: Record<string, string> = {
	git: `#!/usr/bin/env bash
dir=$(dirname "$0")
case "$1" in
show | tag) ;;
ls-remote)
	[ -f "$dir/tags" ] || exit 128
	refs=$(if [ -n "\${4:-}" ]; then grep -Fx -- "$4" "$dir/tags" || true; else cat "$dir/tags"; fi)
	[ -z "$refs" ] || sed 's#^#0000000000000000000000000000000000000000\t#' <<<"$refs"
	;;
*) echo "git: unexpected $*" >&2; exit 1 ;;
esac
`,
	jq: '#!/usr/bin/env bash\ncat "$(dirname "$0")/version"\n',
	date: '#!/usr/bin/env bash\ncat "$(dirname "$0")/today"\n',
}

/** The tag `resolve` cuts for dev at `version` on day `today`, given the remote's tags (absent: the listing fails). */
function resolveTag(version: string, today: number, tags?: readonly string[]): { code: number; tag?: string } {
	const dir = mkdtempSync(join(tmpdir(), "nightly-resolve-"))
	try {
		for (const [name, body] of Object.entries(SHIMS)) {
			writeFileSync(join(dir, name), body)
			chmodSync(join(dir, name), 0o755)
		}
		writeFileSync(join(dir, "version"), `${version}\n`)
		writeFileSync(join(dir, "today"), `${today}\n`)
		if (tags) writeFileSync(join(dir, "tags"), tags.map((t) => `refs/tags/${t}\n`).join(""))
		const output = join(dir, "output")
		writeFileSync(output, "")
		const env = {
			PATH: `${dir}:${process.env.PATH}`,
			FORCE: "true",
			GITHUB_REF: "refs/heads/dev",
			GITHUB_SHA: "1".repeat(40),
			GITHUB_OUTPUT: output,
		}
		const run = Bun.spawnSync(["bash", "--noprofile", "--norc", "-c", STEP.run], { env, stdout: "ignore", stderr: "ignore" })
		const tag = /^tag=(.*)$/m.exec(readFileSync(output, "utf8"))?.[1]
		return { code: run.exitCode, tag }
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
}

const nights = (version: string, from: number, to: number): string[] =>
	Array.from({ length: to - from + 1 }, (_, i) => `v${version}-nightly.${from + i}`)

describe("nightly.yml resolve", () => {
	test("takes today's code when every nightly is older, whatever stable and rc tags exist", () => {
		const tags = [...nights("0.30.2", 26280, 26282), "v0.30.1", "v0.30.1^{}", "v0.31.0-rc.1"]
		expect(resolveTag("0.30.2", 26286, tags)).toEqual({ code: 0, tag: "v0.30.2-nightly.26286" })
	})

	test("never reuses a pruned name, so the night it publishes survives its own prune", () => {
		// Fifteen re-runs on day 26280 ran the codes ahead of the calendar; the prune then freed 26280.
		const kept = nights("0.30.2", 26281, 26294)
		const { tag } = resolveTag("0.30.2", 26280, kept)
		expect(tag).toBe("v0.30.2-nightly.26295")
		expect(planPrune([], [...kept, tag as string]).map((d) => d.tag)).toEqual(["v0.30.2-nightly.26281"])
	})

	test("starts a new version line above the old line's codes", () => {
		const kept = nights("0.30.2", 26281, 26294)
		const { tag } = resolveTag("0.31.0", 26285, kept)
		expect(tag).toBe("v0.31.0-nightly.26295")
		expect(planPrune([], [...kept, tag as string]).map((d) => d.tag)).toEqual(["v0.30.2-nightly.26281"])
	})

	test("stops on a failed tag listing instead of reading it as no tags", () => {
		expect(resolveTag("0.30.2", 26286).code).not.toBe(0)
	})
})
