import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { listEntries, readEntry } from "./zip-read"

const dir = mkdtempSync(join(tmpdir(), "zip-read-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** A real archive built by Info-ZIP `zip` from `files`, entries in the order given. */
function zipOf(name: string, files: Record<string, string | Uint8Array>): string {
	const src = join(dir, `${name}.src`)
	for (const [path, body] of Object.entries(files)) {
		mkdirSync(join(src, path, ".."), { recursive: true })
		writeFileSync(join(src, path), body)
	}
	const out = join(dir, `${name}.zip`)
	const zip = Bun.spawnSync(["zip", "-q", "-X", "-D", out, "--", ...Object.keys(files)], { cwd: src })
	if (zip.exitCode !== 0) throw new Error(`zip: ${zip.stderr.toString()}`)
	return out
}

describe("zip-read", () => {
	test("lists the entries and reads each one's exact bytes", async () => {
		const bytes = new Uint8Array([0, 1, 2, 255])
		const zip = zipOf("plain", { "manifest.json": '{"a":1}', "assets/x.bin": bytes })
		expect(await listEntries(zip)).toEqual(["manifest.json", "assets/x.bin"])
		expect(new TextDecoder().decode(await readEntry(zip, "manifest.json", 1 << 20))).toBe('{"a":1}')
		expect([...(await readEntry(zip, "assets/x.bin", 1 << 20))]).toEqual([...bytes])
	})

	test("counts what an entry inflates to, not what the central directory claims", async () => {
		const zip = zipOf("lie", { "big.bin": new Uint8Array(5_000_000) })
		const bytes = readFileSync(zip)
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
		const central = bytes.lastIndexOf(Buffer.from("PK\x01\x02", "latin1"))
		expect(central).toBeGreaterThan(0)
		view.setUint32(22, 10, true)
		view.setUint32(central + 24, 10, true)
		writeFileSync(zip, bytes)
		expect(Bun.spawnSync(["unzip", "-Zv", zip, "big.bin"]).stdout.toString()).toMatch(/uncompressed size:\s+10 bytes/)
		await expect(readEntry(zip, "big.bin", 1 << 20)).rejects.toThrow(/passed 1048576 bytes/)
	})

	test("never hands unzip a name it would read as an option or a pattern", async () => {
		const zip = zipOf("odd", { "-dash": "d", "a.txt": "a" })
		for (const name of ["-dash", "*", "a?txt", "[a].txt", "a\\.txt", "a^Ab"])
			await expect(readEntry(zip, name, 1 << 20)).rejects.toThrow(/refusing to read/)
		expect(new TextDecoder().decode(await readEntry(zip, "a.txt", 1 << 20))).toBe("a")
	})

	test("lists a control character as a caret pair, which then cannot be read back", async () => {
		const zip = zipOf("control", { "a\u0001b": "x" })
		expect(await listEntries(zip)).toEqual(["a^Ab"])
		await expect(readEntry(zip, "a^Ab", 1 << 20)).rejects.toThrow(/refusing to read/)
	})

	test("a file that is not a zip fails", async () => {
		const path = join(dir, "not.zip")
		writeFileSync(path, "plain text")
		await expect(listEntries(path)).rejects.toThrow(/unzip -Z1/)
	})
})
