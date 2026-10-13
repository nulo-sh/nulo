/** The host's tree invariants, as findings: `test/tree.test.ts` asserts none, and `prepare` runs this file. */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { PINNED_KEYS, PLACEHOLDER_PUBLIC_KEY, type PinnedKey } from "@nulo/token-list"
import { decodeBase64Url, verifyEnvelope } from "@nulo/token-list/envelope"
import { checkSource, parsePayload } from "@nulo/token-list/parse"

export const HOST_ROOT = fileURLToPath(new URL("..", import.meta.url))
export const SOURCE = "list.source.json"
export const ENVELOPE = "public/v1/list.json"
const SERVED = ["_headers", "v1/list.json"]

export function canonical(value: unknown): string {
	return `${JSON.stringify(value, null, "\t")}\n`
}

/** Canonical form makes a diff of the source a diff of the tokens. */
function sourceFindings(root: string): string[] {
	const text = readFileSync(join(root, SOURCE), "utf8")
	try {
		const source = checkSource(JSON.parse(text))
		return canonical(source) === text ? [] : [`${SOURCE}: not in canonical form (tab indent, payload key order, trailing newline)`]
	} catch (error) {
		return [`${SOURCE}: ${error instanceof Error ? error.message : "unreadable"}`]
	}
}

/** A placeholder is a finding, so CI stays red until the key ceremony has run. */
export function keyFindings(keys: readonly PinnedKey[]): string[] {
	const findings: string[] = []
	if (keys.length === 0) findings.push("keys.ts: no pinned key")
	for (const { keyId, publicKey } of keys) {
		if (publicKey === PLACEHOLDER_PUBLIC_KEY) findings.push(`keys.ts: ${keyId} is still the placeholder; run the key ceremony`)
		else if (decodeBase64Url(publicKey)?.length !== 32) findings.push(`keys.ts: ${keyId} is not a 32-byte base64url key`)
	}
	if (new Set(keys.map((k) => k.keyId)).size !== keys.length) findings.push("keys.ts: a keyId is pinned twice")
	if (new Set(keys.map((k) => k.publicKey)).size !== keys.length) findings.push("keys.ts: a public key is pinned twice")
	return findings
}

function servedFiles(dir: string, root = dir): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name)
		return statSync(path).isDirectory() ? servedFiles(path, root) : [relative(root, path)]
	})
}

function publicFindings(root: string): string[] {
	return servedFiles(join(root, "public"))
		.filter((file) => !SERVED.includes(file))
		.map((file) => `public/${file}: the host serves _headers and v1/list.json only`)
}

export async function envelopeFindings(text: string, keys: readonly PinnedKey[]): Promise<string[]> {
	try {
		if (canonical(JSON.parse(text)) !== text) return [`${ENVELOPE}: not in canonical form`]
		parsePayload((await verifyEnvelope(text, keys)).payload, "strict")
		return []
	} catch (error) {
		return [`${ENVELOPE}: ${error instanceof Error ? error.message : "refused"}`]
	}
}

export async function treeFindings(root = HOST_ROOT, keys: readonly PinnedKey[] = PINNED_KEYS): Promise<string[]> {
	const envelope = join(root, ENVELOPE)
	return [
		...sourceFindings(root),
		...keyFindings(keys),
		...publicFindings(root),
		...(existsSync(envelope) ? await envelopeFindings(readFileSync(envelope, "utf8"), keys) : []),
	]
}

if (import.meta.main) {
	const findings = await treeFindings()
	for (const finding of findings) console.error(`::error::${finding}`)
	process.exit(findings.length === 0 ? 0 : 1)
}
