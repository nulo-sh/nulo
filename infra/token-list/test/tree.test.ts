import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type PinnedKey, PLACEHOLDER_PUBLIC_KEY } from "@nulo/token-list"
import { importSeed, publicKeyOf } from "@nulo/token-list/envelope"
import { main as signCli } from "@nulo/token-list/sign-cli"
import { afterAll, describe, expect, test } from "vitest"
import { canonical, ENVELOPE, envelopeFindings, HOST_ROOT, keyFindings, SOURCE, treeFindings } from "../scripts/check"

const work = mkdtempSync(join(tmpdir(), "token-list-host-"))
afterAll(() => rmSync(work, { recursive: true, force: true }))

async function throwawayKey(): Promise<{ seedHex: string; pinned: PinnedKey }> {
	const seedHex = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("")
	return { seedHex, pinned: { keyId: "nulo-ci-1", publicKey: await publicKeyOf(await importSeed(seedHex)) } }
}

/** A copy of the host tree, the envelope signed by sign-cli itself under a throwaway pinned key. */
async function signedTree(name: string): Promise<{ root: string; pinned: PinnedKey }> {
	const root = join(work, name)
	mkdirSync(join(root, "public/v1"), { recursive: true })
	cpSync(join(HOST_ROOT, SOURCE), join(root, SOURCE))
	cpSync(join(HOST_ROOT, "public/_headers"), join(root, "public/_headers"))
	const { seedHex, pinned } = await throwawayKey()
	const write = process.stdout.write
	process.stdout.write = (() => true) as typeof process.stdout.write
	try {
		await signCli(["--source", join(root, SOURCE), "--out", join(root, ENVELOPE)], { TOKEN_LIST_SIGNING_KEY: seedHex }, [pinned])
	} finally {
		process.stdout.write = write
	}
	return { root, pinned }
}

describe("the host tree", () => {
	// Red until the key ceremony pastes the real public keys into packages/token-list/src/keys.ts.
	test("has no finding", async () => {
		expect(await treeFindings()).toEqual([])
	})

	test("accepts an envelope sign-cli wrote, and nothing else beside it", async () => {
		const { root, pinned } = await signedTree("signed")
		expect(await treeFindings(root, [pinned])).toEqual([])
		writeFileSync(join(root, "public/index.html"), "<p>hi</p>")
		expect(await treeFindings(root, [pinned])).toEqual(["public/index.html: the host serves _headers and v1/list.json only"])
	})

	test("refuses a tampered, re-indented or foreign-key envelope", async () => {
		const { root, pinned } = await signedTree("refused")
		const text = readFileSync(join(root, ENVELOPE), "utf8")
		const envelope = JSON.parse(text)
		const other = await throwawayKey()
		expect(await envelopeFindings(canonical({ ...envelope, payload: `A${envelope.payload.slice(1)}` }), [pinned])).toHaveLength(1)
		expect(await envelopeFindings(JSON.stringify(envelope), [pinned])).toEqual([`${ENVELOPE}: not in canonical form`])
		expect(await envelopeFindings(text, [other.pinned])).toEqual([`${ENVELOPE}: token list envelope refused: bad-signature`])
	})

	test("refuses a non-canonical source", async () => {
		const { root, pinned } = await signedTree("source")
		writeFileSync(join(root, SOURCE), JSON.stringify(JSON.parse(readFileSync(join(root, SOURCE), "utf8"))))
		expect(await treeFindings(root, [pinned])).toEqual([
			`${SOURCE}: not in canonical form (tab indent, payload key order, trailing newline)`,
		])
	})

	test("refuses a placeholder, malformed or repeated key", async () => {
		const { pinned } = await throwawayKey()
		expect(keyFindings([{ keyId: "nulo-ci-1", publicKey: PLACEHOLDER_PUBLIC_KEY }])).toEqual([
			"keys.ts: nulo-ci-1 is still the placeholder; run the key ceremony",
		])
		expect(keyFindings([{ keyId: "x", publicKey: "short" }])).toEqual(["keys.ts: x is not a 32-byte base64url key"])
		expect(keyFindings([pinned, { ...pinned, keyId: "nulo-recovery-1" }])).toEqual(["keys.ts: a public key is pinned twice"])
	})
})
