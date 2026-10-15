#!/usr/bin/env bun
/**
 * Signs `list.source.json` into the envelope the host serves.
 *
 *   bun --no-install packages/token-list/src/sign-cli.ts --source <list.source.json> --out <list.json>
 *     [--published <list.json>] [--key-id nulo-ci-1] [--seed-env TOKEN_LIST_SIGNING_KEY]
 *     [--expect-tokens-sha256 <hex>]
 *
 * The seed is read from the named environment variable and removed from the environment before
 * anything else runs; it is never an argument. Prints the key id, sequence and digests only.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import type { PinnedKey } from "./envelope"
import { PINNED_KEYS } from "./keys"
import { signList } from "./sign"

type Flags = { source: string; out: string; published?: string; keyId: string; seedEnv: string; expect?: string }

const FLAG_NAMES: Record<string, keyof Flags> = {
	"--source": "source",
	"--out": "out",
	"--published": "published",
	"--key-id": "keyId",
	"--seed-env": "seedEnv",
	"--expect-tokens-sha256": "expect",
}

function parseFlags(argv: readonly string[]): Flags {
	const flags: Partial<Flags> = { keyId: "nulo-ci-1", seedEnv: "TOKEN_LIST_SIGNING_KEY" }
	for (let i = 0; i < argv.length; i += 2) {
		const name = FLAG_NAMES[argv[i]]
		const value = argv[i + 1]
		if (!name || value === undefined) throw new Error(`unknown or incomplete flag: ${argv[i]}`)
		flags[name] = value
	}
	if (!flags.source || !flags.out) throw new Error("--source and --out are required")
	return flags as Flags
}

export async function main(
	argv: readonly string[],
	env: Record<string, string | undefined>,
	keys: readonly PinnedKey[] = PINNED_KEYS,
): Promise<number> {
	const flags = parseFlags(argv)
	const seedHex = env[flags.seedEnv]
	delete env[flags.seedEnv]
	if (!seedHex) throw new Error(`${flags.seedEnv} is not set`)
	const published = flags.published && existsSync(flags.published) ? readFileSync(flags.published, "utf8") : undefined
	const result = await signList({
		sourceText: readFileSync(flags.source, "utf8"),
		publishedText: published,
		seedHex,
		keyId: flags.keyId,
		nowMs: Date.now(),
		keys,
		expectTokensSha256: flags.expect,
	})
	writeFileSync(flags.out, result.envelopeText)
	process.stdout.write(
		[
			`keyId=${flags.keyId}`,
			`sequence=${result.sequence}`,
			`tokens=${result.tokenCount}`,
			`tokensSha256=${result.tokensSha256}`,
			`payloadSha256=${result.payloadSha256}`,
			"",
		].join("\n"),
	)
	return 0
}

if (import.meta.main) {
	main(process.argv.slice(2), process.env).then(
		(code) => process.exit(code),
		(error: unknown) => {
			process.stderr.write(`sign-cli: ${error instanceof Error ? error.message : "failed"}\n`)
			process.exit(1)
		},
	)
}
