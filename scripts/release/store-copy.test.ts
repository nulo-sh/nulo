import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { compareCopies, crxPayload, entryListProblem, MAX_ENTRIES, type Store } from "./store-copy"
import { main, realStoreIO } from "./store-copy-run"

const text = (s: string) => new TextEncoder().encode(s)
const MANIFEST = { manifest_version: 3, name: "Nulo", version: "1.2.3.0", version_name: "1.2.3", permissions: ["storage"] }
const RELEASE: [string, string][] = [
	["manifest.json", JSON.stringify(MANIFEST, null, 2)],
	["assets/app.js", "console.debug(1)"],
	[".gitkeep", ""],
]
const archive = (entries: [string, string][]) => new Map(entries.map(([name, body]) => [name, text(body)]))
const compare = (store: Store, served: [string, string][]) => compareCopies({ store, release: archive(RELEASE), served: archive(served) })
const withManifest = (manifest: object) =>
	RELEASE.map(([n, b]): [string, string] => [n, n === "manifest.json" ? JSON.stringify(manifest) : b])

const CHROME_ADDS: [string, string][] = [
	["_metadata/", ""],
	["_metadata/verified_contents.json", "[]"],
]
const AMO_ADDS: [string, string][] = ["cose.manifest", "cose.sig", "manifest.mf", "mozilla.sf", "mozilla.rsa"].map((f) => [
	`META-INF/${f}`,
	"sig",
])
const UPDATE_URL = "https://clients2.google.com/service/update2/crx"

describe("compareCopies", () => {
	test("a copy identical to the release has no finding, on either store", () => {
		expect(compare("chrome", RELEASE)).toEqual([])
		expect(compare("firefox", RELEASE)).toEqual([])
	})

	test("each store's exact additions pass", () => {
		const chrome = [...withManifest({ ...MANIFEST, update_url: UPDATE_URL }), ...CHROME_ADDS].filter(([n]) => n !== ".gitkeep")
		expect(compare("chrome", chrome)).toEqual([])
		const reordered = Object.fromEntries(Object.entries(MANIFEST).reverse())
		expect(compare("firefox", [...withManifest(reordered), ...AMO_ADDS])).toEqual([])
	})

	test.each([
		["one changed byte", [...RELEASE.slice(0, 1), ["assets/app.js", "console.debug(2)"], RELEASE[2]], "differs: assets/app.js"],
		["one extra file", [...RELEASE, ["assets/extra.js", "x"]], "extra: assets/extra.js"],
		["one missing file", RELEASE.filter(([n]) => n !== "assets/app.js"), "missing: assets/app.js"],
		[
			"one changed manifest value",
			withManifest({ ...MANIFEST, permissions: ["storage", "tabs"] }),
			'manifest.json: "permissions" differs',
		],
		[
			"an update_url with another value",
			withManifest({ ...MANIFEST, update_url: "https://example.com/crx" }),
			'manifest.json: "update_url" differs',
		],
		[
			"a manifest key the release lacks, named __proto__",
			withManifest({}).map(([n, b]): [string, string] => [
				n,
				n === "manifest.json" ? `{"__proto__":{},${JSON.stringify(MANIFEST).slice(1)}` : b,
			]),
			'manifest.json: "__proto__" differs',
		],
		[
			"a manifest that is not JSON",
			withManifest({}).map(([n, b]): [string, string] => [n, n === "manifest.json" ? "{" : b]),
			"not a JSON object",
		],
	] as [string, [string, string][], string][])("%s is a finding", (_, served, finding) => {
		expect(compare("chrome", served).join("\n")).toContain(finding)
	})

	test("an addition is exact to its store and its path, and Chrome drops only an empty .gitkeep", () => {
		expect(compare("firefox", [...RELEASE, ...CHROME_ADDS])).toEqual(["extra: _metadata/", "extra: _metadata/verified_contents.json"])
		expect(compare("chrome", [...RELEASE, ["META-INF/cose.sig", "sig"]])).toEqual(["extra: META-INF/cose.sig"])
		expect(compare("firefox", [...RELEASE, ["META-INF/cose.sig.bak", "sig"]])).toEqual(["extra: META-INF/cose.sig.bak"])
		expect(compare("firefox", withManifest({ ...MANIFEST, update_url: UPDATE_URL }))).toEqual(['manifest.json: "update_url" differs'])
		expect(
			compare(
				"firefox",
				RELEASE.filter(([n]) => n !== ".gitkeep"),
			),
		).toEqual(["missing: .gitkeep"])
		const kept = compareCopies({
			store: "chrome",
			release: archive([...RELEASE.slice(0, 2), [".gitkeep", "x"]]),
			served: archive(RELEASE.slice(0, 2)),
		})
		expect(kept).toEqual(["missing: .gitkeep"])
	})
})

/** A CRX3: magic, version, header length, header, then the zip. */
function crx(payload: Uint8Array, version = 3, header = new Uint8Array(16), declared = header.length): Uint8Array {
	const head = new Uint8Array(12)
	const view = new DataView(head.buffer)
	head.set(text("Cr24"))
	view.setUint32(4, version, true)
	view.setUint32(8, declared, true)
	return Buffer.concat([head, header, payload])
}
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), text("rest of a zip")])

describe("crxPayload", () => {
	test("returns the zip after a CRX3 header", () => {
		expect(Buffer.from(crxPayload(crx(ZIP))).equals(ZIP)).toBe(true)
	})

	test.each([
		["a truncated header", crx(ZIP).subarray(0, 10)],
		["a header longer than 1 MiB", crx(ZIP, 3, new Uint8Array(16), (1 << 20) + 1)],
		["a header that runs past the file", crx(ZIP, 3, new Uint8Array(16), 4096)],
		["a CRX2", crx(ZIP, 2)],
		["no Cr24 magic", Buffer.concat([text("Cr25"), crx(ZIP).subarray(4)])],
		["no zip after the header", crx(text("not a zip at all"))],
	] as [string, Uint8Array][])("refuses %s", (_, bytes) => {
		expect(() => crxPayload(bytes)).toThrow(/not a CRX3/)
	})
})

describe("entryListProblem", () => {
	test("a store copy's real names pass", () => {
		expect(entryListProblem(["manifest.json", "_metadata/", "_metadata/verified_contents.json", "META-INF/cose.sig"])).toBeNull()
	})

	test.each([
		["more entries than the bound", Array.from({ length: MAX_ENTRIES + 1 }, (_, i) => `f${i}`), "more than"],
		["a duplicate", ["a.js", "a.js"], "appears twice"],
		["an absolute path", ["/etc/passwd"], "is absolute"],
		["a drive path", ["C:x.js"], "is absolute"],
		["a .. segment", ["assets/../../x.js"], "climbs out"],
		["a control character", ["a\u0001b.js"], "control character"],
		["a wildcard", ["assets/*.js"], "wildcard"],
		["a caret, which is how the listing prints a control character", ["a^Ab.js"], "caret"],
		["a leading dash, which unzip reads as an option", ["-d"], "starts with -"],
	] as [string, string[], string][])("refuses %s", (_, names, reason) => {
		expect(entryListProblem(names)).toContain(reason)
	})
})

describe.skipIf(!process.env.NULO_STORE_COPY_LIVE)("live stores", () => {
	test(
		"each store's public copy is the release zip it names, up to the store's own additions",
		async () => {
			const dir = mkdtempSync(join(tmpdir(), "store-copy-live-"))
			const lines: string[] = []
			const io = { ...realStoreIO("nulo-sh/nulo", process.env.GH_TOKEN ?? ""), log: (line: string) => lines.push(line) }
			try {
				const exit = await main(["both"], io, dir)
				console.log(lines.join("\n"))
				expect(exit).toBe(0)
			} finally {
				rmSync(dir, { recursive: true, force: true })
			}
		},
		{ timeout: 600_000 },
	)
})
