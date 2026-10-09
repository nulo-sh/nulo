/**
 * `apps/extension/scripts/e2e/docker-ci-like.sh` runs only the Bun and Node archives its pins file
 * names, at the Bun version CI runs.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..", "..")
const SCRIPT_PATH = "apps/extension/scripts/e2e/docker-ci-like.sh"
const read = (path: string) => readFileSync(join(ROOT, path), "utf8")

const script = read(SCRIPT_PATH)
const pinsText = read("apps/extension/scripts/e2e/docker-ci-like.pins.sha256")
const packageManager: string = JSON.parse(read("package.json")).packageManager

/** Top-level `NAME=value` assignments, each expanded against the ones before it. */
function assignments(source: string): Map<string, string> {
	const vars = new Map<string, string>()
	for (const [, name, raw] of source.matchAll(/^([A-Z_]+)="?([^"\s]*)"?$/gm)) vars.set(name, expand(raw, vars))
	return vars
}

function expand(text: string, vars: Map<string, string>): string {
	return text.replace(/\$\{?([A-Z_]+)\}?/g, (whole, name: string) => vars.get(name) ?? whole)
}

/** Lines that run a download through a shell, or skip the pinned install for a tool on PATH. */
function shellProblems(lines: string[]): string[] {
	const ambient = /\b(command -v|which|type -[pP]|hash)\s+(bun|node)\b/
	const conditional = /(^|\s)(if|elif|while|until|!)\s|&&|\|\|/
	return [
		...lines
			.filter((l) => /\b(curl|wget)\b[^#]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/.test(l))
			.map((l) => `pipes a download into a shell: ${l.trim()}`),
		...lines.filter((l) => ambient.test(l) && conditional.test(l)).map((l) => `short-cuts on an ambient tool: ${l.trim()}`),
	]
}

/** The one download must be fetch_pinned's, and it must check the bytes against their pin. */
function downloadProblems(joined: string, lines: string[]): string[] {
	const body = joined.match(/^fetch_pinned\(\) \{\n([\s\S]*?)\n\}$/m)?.[1] ?? ""
	const downloads = lines.filter((l) => /(^|[;&|(]|\bthen|\bdo)\s*(sudo\s+)?(curl|wget)\s/.test(l))
	const found: string[] = []
	if (downloads.length !== 1 || !body.includes(downloads[0])) found.push("a download outside fetch_pinned")
	if (!/sha256sum -c --strict/.test(body)) found.push("fetch_pinned checks no pin")
	return found
}

/** Each fetch_pinned call names a pinned key and fetches that key's asset; each pin is fetched. */
function keyProblems(source: string, pinned: string[]): string[] {
	const vars = assignments(source)
	const fetched = [...source.matchAll(/^fetch_pinned "([^"]+)" "([^"]+)"$/gm)].map(([, key, url]) => ({
		key: expand(key, vars),
		url: expand(url, vars),
	}))
	const found: string[] = []
	for (const { key, url } of fetched) {
		const [, version, asset] = key.split("/")
		if (pinned.filter((p) => p === key).length !== 1) found.push(`fetched with no single pin: ${key}`)
		if (!url.startsWith("https://") || !url.endsWith(`/${asset}`) || !url.includes(version)) {
			found.push(`url does not fetch its key: ${url} for ${key}`)
		}
	}
	for (const key of pinned) if (!fetched.some((f) => f.key === key)) found.push(`pinned but never fetched: ${key}`)
	return found
}

/** Exactly one Bun and one Node pin, the Bun one at the version CI runs. */
function pinProblems(pins: string[], manager: string): string[] {
	const found = pins.filter((line) => !/^[0-9a-f]{64} {2}\S+$/.test(line)).map((line) => `malformed pin: ${line}`)
	const pinned = pins.map((line) => line.split("  ")[1])
	const bun = pinned.filter((key) => /^bun\/[^/]+\/bun-linux-x64\.zip$/.test(key))
	const node = pinned.filter((key) => /^node\/(v[^/]+)\/node-\1-linux-x64\.tar\.xz$/.test(key))
	if (bun.length !== 1 || node.length !== 1 || pinned.length !== 2) found.push(`expected one bun and one node pin: ${pinned}`)
	if (bun[0] !== `bun/${manager.replace(/^bun@/, "")}/bun-linux-x64.zip`) found.push(`bun pin is not ${manager}`)
	return found
}

/** Every reason the script could run bytes its pins do not name, or a Bun CI does not run. */
function problems(source: string, pinsFile: string, manager: string): string[] {
	const joined = source.replace(/\\\n\s*/g, " ")
	const lines = joined.split("\n").filter((line) => !line.trimStart().startsWith("#"))
	const pins = pinsFile.split("\n").filter((line) => line !== "" && !line.startsWith("#"))
	return [
		...shellProblems(lines),
		...downloadProblems(joined, lines),
		...keyProblems(
			source,
			pins.map((line) => line.split("  ")[1]),
		),
		...pinProblems(pins, manager),
	]
}

describe("docker-ci-like.sh's Bun and Node", () => {
	test("install only pinned archives, Bun at package.json#packageManager", () => {
		expect(problems(script, pinsText, packageManager)).toEqual([])
		expect(script).toContain('export PATH="$TOOLS/bun/bin:$TOOLS/node/bin:$PATH"')
	})

	test.each([
		["a download piped into a shell", `${script}\ncurl -fsSL https://bun.sh/install | bash\n`, "pipes a download into a shell"],
		[
			"a short-cut on an ambient bun",
			script.replace('rm -rf "$TOOLS"', 'if ! command -v bun >/dev/null; then rm -rf "$TOOLS"; fi'),
			"short-cuts on an ambient tool",
		],
		["a short-cut on an ambient node", `${script}\ncommand -v node >/dev/null || exit 1\n`, "short-cuts on an ambient tool"],
		["a Bun version its pin does not key", script.replace("BUN_VERSION=1.4.2", "BUN_VERSION=1.4.3"), "fetched with no single pin"],
		[
			"an unpinned download",
			`${script}\ncurl -fsSL -o node.tar.xz https://nodejs.org/dist/latest/x.tar.xz\n`,
			"a download outside fetch_pinned",
		],
	])("a script copy with %s is refused", (_, copy, problem) => {
		expect(problems(copy, pinsText, packageManager).some((p) => p.startsWith(problem))).toBe(true)
	})

	test("a Bun bump that leaves the pin behind is refused", () => {
		expect(problems(script, pinsText, "bun@1.4.3")).toEqual(["bun pin is not bun@1.4.3"])
	})
})
