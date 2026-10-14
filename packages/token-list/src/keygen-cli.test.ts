import { spawnSync } from "node:child_process"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, describe, expect, test } from "vitest"
import { ENVIRONMENT, main, type RunGh, SECRET_NAME, SEED_VARS } from "./keygen-cli"
import { freshKey } from "./test-keys"

const HERE = fileURLToPath(new URL(".", import.meta.url))
const dir = mkdtempSync(join(tmpdir(), "token-list-keygen-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

async function seeds() {
	const ci = await freshKey("nulo-ci-1")
	const recovery = await freshKey("nulo-recovery-1")
	return { ci, recovery, env: { [SEED_VARS.ci]: `0x${ci.seedHex}`, [SEED_VARS.recovery]: `0x${recovery.seedHex}`, LANG: "C.UTF-8" } }
}

describe("keygen-cli install", () => {
	test("hands the CI seed to gh over stdin only and prints only the public keys", async () => {
		const { ci, recovery, env } = await seeds()
		const calls: { args: readonly string[]; stdin: string; env: Record<string, string> }[] = []
		const runGh: RunGh = async (args, stdin, childEnv) => {
			calls.push({ args, stdin, env: childEnv })
			return 0
		}
		const printed: string[] = []
		await main(["install"], env, runGh, (line) => printed.push(line))
		expect(calls).toEqual([
			{
				args: ["secret", "set", SECRET_NAME, "--env", ENVIRONMENT, "--repo", "nulo-sh/nulo"],
				stdin: ci.seedHex,
				env: { LANG: "C.UTF-8" },
			},
		])
		expect(JSON.parse(printed.join("\n"))).toEqual([ci.pinned, recovery.pinned])
		for (const seed of [ci.seedHex, recovery.seedHex]) expect(printed.join("\n")).not.toContain(seed)
	})

	test("refuses equal or malformed seeds, a missing subcommand and a failed gh", async () => {
		const { env } = await seeds()
		const ok: RunGh = async () => 0
		await expect(main(["install"], { ...env, [SEED_VARS.recovery]: env[SEED_VARS.ci] }, ok)).rejects.toThrow("must differ")
		await expect(main(["install"], { ...env, [SEED_VARS.ci]: "0xABC" }, ok)).rejects.toThrow(SEED_VARS.ci)
		await expect(main([], env, ok)).rejects.toThrow("usage")
		await expect(
			main(
				["install"],
				env,
				async () => 1,
				() => {},
			),
		).rejects.toThrow("exited 1")
	})

	test("run as a script, the gh child gets the seed on stdin and neither seed in its environment", async () => {
		const { ci, recovery, env } = await seeds()
		const gh = join(dir, "gh")
		writeFileSync(gh, `#!/bin/sh\nprintf '%s\\n' "$@" > "${dir}/args"\ncat > "${dir}/stdin"\nenv > "${dir}/env"\n`)
		chmodSync(gh, 0o755)
		const run = spawnSync("bun", [join(HERE, "keygen-cli.ts"), "install"], {
			env: { ...env, PATH: `${dir}:${process.env.PATH}` },
			encoding: "utf8",
		})
		expect(run.status).toBe(0)
		expect(readFileSync(join(dir, "stdin"), "utf8")).toBe(ci.seedHex)
		expect(readFileSync(join(dir, "args"), "utf8")).toBe(`secret\nset\n${SECRET_NAME}\n--env\n${ENVIRONMENT}\n--repo\nnulo-sh/nulo\n`)
		const childEnv = readFileSync(join(dir, "env"), "utf8")
		for (const seed of [ci.seedHex, recovery.seedHex]) {
			expect(childEnv).not.toContain(seed)
			expect(`${run.stdout}${run.stderr}`).not.toContain(seed)
		}
		expect(JSON.parse(run.stdout)).toEqual([ci.pinned, recovery.pinned])
	})
})
