#!/usr/bin/env bun
/**
 * Installs the CI signing key and prints the two public keys to pin. Runs only as a keyed run
 * (`infra/token-list/keys.env.example`), which streams both 1Password-generated seeds into its
 * environment:
 *
 *   bun packages/token-list/src/keygen-cli.ts install [--repo nulo-sh/nulo]
 *
 * The CI seed reaches `gh secret set` over stdin, in a child whose environment holds neither seed.
 * Nothing else leaves the process: stdout carries the public keys and nothing derived from a seed.
 */
import { spawn } from "node:child_process"
import { importSeed, publicKeyOf } from "./envelope"

export const SEED_VARS = { ci: "TOKEN_LIST_CI_SEED", recovery: "TOKEN_LIST_RECOVERY_SEED" } as const
export const SECRET_NAME = "TOKEN_LIST_SIGNING_KEY"
export const ENVIRONMENT = "token-list"

export type RunGh = (args: readonly string[], stdin: string, env: Record<string, string>) => Promise<number>

const SEED = /^(0x)?[0-9a-f]{64}$/

/** The environment a child gets: this one without either seed. */
export function scrubbedEnv(env: Record<string, string | undefined>): Record<string, string> {
	const out: Record<string, string> = {}
	for (const [name, value] of Object.entries(env)) {
		if (value !== undefined && name !== SEED_VARS.ci && name !== SEED_VARS.recovery) out[name] = value
	}
	return out
}

// Bun.spawn ignores deletions from a copied env object; node:child_process honours an explicit env.
const spawnGh: RunGh = (args, stdin, env) =>
	new Promise((resolve, reject) => {
		const child = spawn("gh", [...args], { env, stdio: ["pipe", "inherit", "inherit"] })
		child.on("error", reject)
		child.on("close", (code) => resolve(code ?? 1))
		child.stdin.end(stdin)
	})

function readSeed(env: Record<string, string | undefined>, name: string): string {
	const value = env[name]
	if (value === undefined || !SEED.test(value)) throw new Error(`${name} must be 32 bytes of lower-case hex`)
	return value.startsWith("0x") ? value.slice(2) : value
}

export async function main(
	argv: readonly string[],
	env: Record<string, string | undefined>,
	runGh: RunGh = spawnGh,
	print: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Promise<number> {
	const repoAt = argv.indexOf("--repo")
	const repo = repoAt >= 0 ? argv[repoAt + 1] : "nulo-sh/nulo"
	if (argv[0] !== "install" || !repo) throw new Error("usage: keygen-cli.ts install [--repo <owner/name>]")
	const ci = readSeed(env, SEED_VARS.ci)
	const recovery = readSeed(env, SEED_VARS.recovery)
	if (ci === recovery) throw new Error("the CI and recovery seeds must differ")
	const keys = [
		{ keyId: "nulo-ci-1", publicKey: await publicKeyOf(await importSeed(ci)) },
		{ keyId: "nulo-recovery-1", publicKey: await publicKeyOf(await importSeed(recovery)) },
	]
	const code = await runGh(["secret", "set", SECRET_NAME, "--env", ENVIRONMENT, "--repo", repo], ci, scrubbedEnv(env))
	if (code !== 0) throw new Error(`gh secret set exited ${code}`)
	print(JSON.stringify(keys, null, "\t"))
	return 0
}

if (import.meta.main) {
	main(process.argv.slice(2), process.env).then(
		(code) => process.exit(code),
		(error: unknown) => {
			process.stderr.write(`keygen-cli: ${error instanceof Error ? error.message : "failed"}\n`)
			process.exit(1)
		},
	)
}
