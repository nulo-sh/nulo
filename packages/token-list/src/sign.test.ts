import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, describe, expect, test } from "vitest"
import { BUNDLED_TOKEN_CLASS_IDS } from "./class-ids"
import { readTokenList, SEQUENCE_FLOOR } from "./index"
import { PayloadError } from "./parse"
import { listSha256, publishedSequence, signList } from "./sign"
import { main } from "./sign-cli"
import { freshKey } from "./test-keys"

const HERE = fileURLToPath(new URL(".", import.meta.url))
const SOURCE = {
	tokens: [
		{
			chainId: 1,
			address: `0x${"0".repeat(63)}1`,
			classId: BUNDLED_TOKEN_CLASS_IDS[0],
			symbol: "USDC",
			decimals: 6,
			name: "Test USDC",
			priceId: "usd-coin",
		},
	],
}
const SOURCE_TEXT = `${JSON.stringify(SOURCE, null, "\t")}\n`
const SIGNED = SEQUENCE_FLOOR + 1
const NOW = SIGNED * 1000 + 500
const dir = mkdtempSync(join(tmpdir(), "token-list-sign-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe("signList", () => {
	test("signs a source into a list the wallet reads, sequence from the signing clock", async () => {
		const { seedHex, pinned } = await freshKey("nulo-ci-1")
		const result = await signList({ sourceText: SOURCE_TEXT, seedHex, keyId: "nulo-ci-1", nowMs: NOW, keys: [pinned] })
		const list = await readTokenList(result.envelopeText, [pinned])
		expect(list).toMatchObject({ keyId: "nulo-ci-1", sequence: SIGNED, issuedAt: new Date(SIGNED * 1000).toISOString() })
		expect(list.entries).toEqual(SOURCE.tokens)
		expect(list.flagged).toEqual([])
		expect(result.tokensSha256).toBe(await listSha256({ tokens: SOURCE.tokens, flagged: [] }))
		expect(publishedSequence(result.envelopeText)).toBe(SIGNED)
	})

	test("the wallet refuses a list below the compiled floor and accepts one at it", async () => {
		const { seedHex, pinned } = await freshKey("nulo-ci-1")
		const signedAt = async (sequence: number) =>
			(await signList({ sourceText: SOURCE_TEXT, seedHex, keyId: "nulo-ci-1", nowMs: sequence * 1000, keys: [pinned] })).envelopeText
		const below = await readTokenList(await signedAt(SEQUENCE_FLOOR - 1), [pinned]).catch((error: unknown) => error)
		expect(below).toBeInstanceOf(PayloadError)
		expect((below as PayloadError).path).toBe("payload.sequence")
		expect((await readTokenList(await signedAt(SEQUENCE_FLOOR), [pinned])).sequence).toBe(SEQUENCE_FLOOR)
	})

	test("refuses a non-increasing sequence, a foreign seed, an unexpected token set and an invalid source", async () => {
		const { seedHex, pinned } = await freshKey("nulo-ci-1")
		const other = await freshKey("nulo-ci-1")
		const base = { sourceText: SOURCE_TEXT, seedHex, keyId: "nulo-ci-1", nowMs: NOW, keys: [pinned] }
		const published = (await signList(base)).envelopeText
		await expect(signList({ ...base, publishedText: published })).rejects.toThrow("not above the published sequence")
		await expect(signList({ ...base, nowMs: NOW + 1000, publishedText: published })).resolves.toBeDefined()
		await expect(signList({ ...base, publishedText: "{}" })).rejects.toThrow("published envelope is unreadable")
		await expect(signList({ ...base, keys: [other.pinned] })).rejects.toThrow("does not match the pinned key")
		await expect(signList({ ...base, expectTokensSha256: "0".repeat(64) })).rejects.toThrow("approver was shown")
		await expect(signList({ ...base, sourceText: JSON.stringify({ ...SOURCE, sequence: 9 }) })).rejects.toThrow("source.sequence")
	})

	test("signs the flags, and refuses a flag set the approver was not shown", async () => {
		const { seedHex, pinned } = await freshKey("nulo-ci-1")
		const flagged = [{ chainId: 1, address: `0x${"0".repeat(63)}2` }]
		const base = { sourceText: JSON.stringify({ ...SOURCE, flagged }), seedHex, keyId: "nulo-ci-1", nowMs: NOW, keys: [pinned] }
		const unflagged = await listSha256({ tokens: SOURCE.tokens, flagged: [] })
		await expect(signList({ ...base, expectTokensSha256: unflagged })).rejects.toThrow("approver was shown")
		const shown = await listSha256({ tokens: SOURCE.tokens, flagged })
		const result = await signList({ ...base, expectTokensSha256: shown })
		expect((await readTokenList(result.envelopeText, [pinned])).flagged).toEqual(flagged)
	})
})

describe("sign-cli", () => {
	test("writes the envelope, prints only ids and digests, and drops the seed from the environment", async () => {
		const { seedHex, pinned } = await freshKey("nulo-ci-1")
		writeFileSync(join(dir, "source.json"), SOURCE_TEXT)
		const env: Record<string, string | undefined> = { TOKEN_LIST_SIGNING_KEY: `0x${seedHex}` }
		const writes: string[] = []
		const write = process.stdout.write
		process.stdout.write = ((chunk: string) => writes.push(chunk) > 0) as typeof process.stdout.write
		try {
			await main(["--source", join(dir, "source.json"), "--out", join(dir, "list.json")], env, [pinned])
		} finally {
			process.stdout.write = write
		}
		expect(env).not.toHaveProperty("TOKEN_LIST_SIGNING_KEY")
		expect(writes.join("")).toMatch(
			/^keyId=nulo-ci-1\nsequence=\d+\ntokens=1\ntokensSha256=[0-9a-f]{64}\npayloadSha256=[0-9a-f]{64}\n$/,
		)
		expect((await readTokenList(readFileSync(join(dir, "list.json"), "utf8"), [pinned])).entries).toHaveLength(1)
	})

	test("run as a script, it refuses a seed that is not the pinned key", async () => {
		const { seedHex } = await freshKey()
		writeFileSync(join(dir, "source.json"), SOURCE_TEXT)
		const run = spawnSync(
			"bun",
			["--no-install", join(HERE, "sign-cli.ts"), "--source", join(dir, "source.json"), "--out", join(dir, "x.json")],
			{
				env: { PATH: process.env.PATH, TOKEN_LIST_SIGNING_KEY: seedHex },
				encoding: "utf8",
			},
		)
		expect(run.status).toBe(1)
		expect(run.stderr).toContain("does not match the pinned key nulo-ci-1")
		expect(`${run.stdout}${run.stderr}`).not.toContain(seedHex)
	})
})
