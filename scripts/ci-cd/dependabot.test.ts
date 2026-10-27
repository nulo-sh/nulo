/**
 * Dependabot's configuration. It updates only GitHub Actions; npm dependencies, Bun, Biome and the
 * Aztec line are bumped by hand, as policy (SECURITY.md, Dependency policy). One weekly group moves
 * every use of an action together, which action-pins.test.ts ("one action, one SHA") requires. The
 * commit prefix gives its titles a Conventional type and scope; the case of "bump" is Dependabot's
 * guess from the default branch's history, which the merger corrects (CLAUDE.md, Dependency policy).
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
