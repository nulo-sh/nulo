/**
 * Dependabot's configuration. It updates only GitHub Actions: Bun's lockfile is unreadable to it, and
 * Bun, Biome and the Aztec line are bumped by hand. One weekly group moves every use of an action
 * together, which action-pins.test.ts ("one action, one SHA") requires, and the commit prefix keeps
 * its pull request titles valid for commitlint.
 */
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "../..")
// biome-ignore lint/suspicious/noExplicitAny: parsed-YAML shape is dynamic.
const config = Bun.YAML.parse(readFileSync(join(ROOT, ".github/dependabot.yml"), "utf8")) as any

test("one GitHub Actions entry over the workflows and every composite action, grouped, weekly, after a 7-day cooldown", () => {
	expect(config.version).toBe(2)
	expect(config.updates).toHaveLength(1)
	const [u] = config.updates
	expect(u["package-ecosystem"]).toBe("github-actions")
	expect(u.directories).toEqual(["/", "/.github/actions/*"])
	expect(u.schedule.interval).toBe("weekly")
	expect(u.cooldown["default-days"]).toBe(7)
	expect(u["commit-message"].prefix).toBe("chore(deps)")
	expect(u.groups).toEqual({ actions: { patterns: ["*"] } })
})
