/** The host's tree invariants, as findings: `test/tree.test.ts` asserts none, and `prepare` runs this file. */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { PINNED_KEYS, PLACEHOLDER_PUBLIC_KEY, type PinnedKey } from "@nulo/token-list"
import { decodeBase64Url, verifyEnvelope } from "@nulo/token-list/envelope"
import { checkSource, parsePayload } from "@nulo/token-list/parse"
import { publishedSequence } from "@nulo/token-list/sign"
import { FLOOR_PATH, floorText } from "./floor"

export const HOST_ROOT = fileURLToPath(new URL("..", import.meta.url))
export const SOURCE = "list.source.json"
export const ENVELOPE = "public/v1/list.json"
export const FORMAT = "FORMAT.md"
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

const KEY_TABLE = /\n### Public keys\n\n((?:.+\n)+)/g
const KEY_ROW = /^\| `([a-z0-9][a-z0-9-]{0,31})` \| `([A-Za-z0-9_-]{43})` \| [^|]+ \|$/

/**
 * Third parties verify against the published table, so it must name exactly the pinned keys.
 * Every line up to the blank one must parse as a row: Markdown renders any it skipped inside the table.
 */
export function formatFindings(text: string, keys: readonly PinnedKey[]): string[] {
	const tables = [...text.matchAll(KEY_TABLE)]
	const rows = tables.length === 1 ? tables[0][1].trimEnd().split("\n").slice(2) : []
	const pairs = rows.map((row) => KEY_ROW.exec(row)?.slice(1, 3).join(" "))
	const pinned = keys.map(({ keyId, publicKey }) => `${keyId} ${publicKey}`)
	const exact = pairs.length === pinned.length && new Set(pairs).size === pairs.length && pinned.every((p) => pairs.includes(p))
	return exact ? [] : [`${FORMAT}: the key table does not match keys.ts`]
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

/** The signer's key order, and no other key: the committed bytes are exactly what it wrote. */
export async function envelopeFindings(text: string, keys: readonly PinnedKey[]): Promise<string[]> {
	try {
		const { format, keyId, payload, signature } = JSON.parse(text) as Record<string, unknown>
		if (canonical({ format, keyId, payload, signature }) !== text) return [`${ENVELOPE}: not in canonical form`]
		parsePayload((await verifyEnvelope(text, keys)).payload, "strict")
		return []
	} catch (error) {
		return [`${ENVELOPE}: ${error instanceof Error ? error.message : "refused"}`]
	}
}

/**
 * The compiled floor: canonical, at least 1, and at most the committed list's sequence, since every
 * build refuses a list below it. Lowering it is a reviewed source change, like an edit to `keys.ts`.
 */
export function floorFindings(text: string, served: number | undefined): string[] {
	let sequence: unknown
	try {
		sequence = (JSON.parse(text) as { sequence?: unknown }).sequence
	} catch {
		return [`${FLOOR_PATH}: not JSON`]
	}
	if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 1)
		return [`${FLOOR_PATH}: sequence must be an integer from 1`]
	if (floorText(sequence) !== text) return [`${FLOOR_PATH}: not in canonical form`]
	return served !== undefined && sequence > served ? [`${FLOOR_PATH}: above the committed list's sequence ${served}`] : []
}

export async function treeFindings(root = HOST_ROOT, keys: readonly PinnedKey[] = PINNED_KEYS): Promise<string[]> {
	const envelope = join(root, ENVELOPE)
	const envelopeText = existsSync(envelope) ? readFileSync(envelope, "utf8") : undefined
	return [
		...sourceFindings(root),
		...keyFindings(keys),
		...formatFindings(readFileSync(join(root, FORMAT), "utf8"), keys),
		...publicFindings(root),
		...(envelopeText === undefined ? [] : await envelopeFindings(envelopeText, keys)),
		...floorFindings(readFileSync(join(HOST_ROOT, "..", "..", FLOOR_PATH), "utf8"), servedSequence(envelopeText)),
	]
}

function servedSequence(envelopeText: string | undefined): number | undefined {
	if (envelopeText === undefined) return undefined
	try {
		return publishedSequence(envelopeText)
	} catch {
		return undefined
	}
}

if (import.meta.main) {
	const findings = await treeFindings()
	for (const finding of findings) console.error(`::error::${finding}`)
	process.exit(findings.length === 0 ? 0 : 1)
}
