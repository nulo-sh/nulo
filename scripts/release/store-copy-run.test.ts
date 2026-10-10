import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { ReleaseRecord } from "./attach-assets-run"
import { CHROME_ITEM_ID, main, PRE_ATTESTATION, realStoreIO, type StoreCopyIO } from "./store-copy-run"

const SHA = "a".repeat(40)
const text = (s: string) => new TextEncoder().encode(s)
const hex = (b: Uint8Array) => new Bun.CryptoHasher("sha256").update(b).digest("hex")

type Files = Record<string, string>
const manifest = (version: string, extra: object = {}) =>
	JSON.stringify({ name: "Nulo", version: `${version}.0`, version_name: version, ...extra })
const release = (version: string): Files => ({ "manifest.json": manifest(version), "app.js": "console.debug(1)", ".gitkeep": "" })
const chromeCopy = (version: string): Files => {
	const { ".gitkeep": _, ...rest } = release(version)
	return {
		...rest,
		"manifest.json": manifest(version, { update_url: "https://clients2.google.com/service/update2/crx" }),
		"_metadata/": "",
		"_metadata/verified_contents.json": "[]",
	}
}
const firefoxCopy = (version: string): Files => ({ ...release(version), "META-INF/cose.sig": "sig", "META-INF/mozilla.rsa": "rsa" })

/** A fake zip names the archive it stands for; the fake reader looks it up. */
const zipOf = (key: string) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), text(key)])
function crx(payload: Uint8Array): Uint8Array {
	const head = new Uint8Array(12)
	head.set(text("Cr24"))
	new DataView(head.buffer).setUint32(4, 3, true)
	new DataView(head.buffer).setUint32(8, 8, true)
	return Buffer.concat([head, new Uint8Array(8), payload])
}

interface World {
	version: string
	archives: Record<string, Files>
	/** The store answers, by URL kind; an Error is thrown, as an HTTP failure would be. */
	chrome: Uint8Array | Error
	amo: unknown | Error
	xpi: Uint8Array
	tags: Map<string, string>
	releases: ReleaseRecord[]
	assets: Map<number, Uint8Array>
	attested: boolean
	verifies: boolean
}

function world(version = "1.2.3", over: Partial<World> = {}): World {
	const zips = { chrome: zipOf("release-chrome"), firefox: zipOf("release-firefox") }
	const sums = text(`${hex(zips.chrome)}  nulo-chrome-${version}.zip\n${hex(zips.firefox)}  nulo-firefox-${version}.zip\n`)
	const xpi = zipOf("served-firefox")
	const assets = new Map([
		[1, zips.chrome],
		[2, zips.firefox],
		[3, sums],
	])
	const names = [`nulo-chrome-${version}.zip`, `nulo-firefox-${version}.zip`, "SHASUMS256.txt"]
	return {
		version,
		archives: {
			"release-chrome": release(version),
			"release-firefox": release(version),
			"served-chrome": chromeCopy(version),
			"served-firefox": firefoxCopy(version),
		},
		chrome: crx(zipOf("served-chrome")),
		amo: {
			current_version: { file: { url: "https://addons.mozilla.org/firefox/downloads/file/1/nulo.xpi", hash: `sha256:${hex(xpi)}` } },
		},
		xpi,
		tags: new Map([[`v${version}`, SHA]]),
		releases: [
			{
				id: 9,
				tag: `v${version}`,
				draft: false,
				immutable: true,
				assets: names.map((name, i) => ({ id: i + 1, name, digest: `sha256:${hex(assets.get(i + 1) as Uint8Array)}` })),
			},
		],
		assets,
		attested: true,
		verifies: true,
		...over,
	}
}

const run = (w: World, ...argv: string[]) => runWith(w, () => {}, ...argv)

function runWith(w: World, onRead: (path: string, limit: number) => unknown, ...argv: string[]) {
	const disk = new Map<string, Uint8Array>()
	const logs: string[] = []
	const calls: string[] = []
	const archiveAt = (path: string): Files => {
		const key = new TextDecoder().decode((disk.get(path) ?? new Uint8Array()).subarray(4))
		const files = w.archives[key]
		if (!files) throw new Error(`no archive at ${path}`)
		return files
	}
	const answer = <T>(value: T | Error): T => {
		if (value instanceof Error) throw value
		return value
	}
	const io: StoreCopyIO = {
		async fetchBytes(url) {
			calls.push(`fetch ${url.split("?")[0]}`)
			if (url.startsWith("https://clients2.google.com/")) return answer(w.chrome)
			if (url.includes("/api/v5/addons/addon/")) return text(JSON.stringify(answer(w.amo)))
			return w.xpi
		},
		async writeBytes(path, bytes) {
			disk.set(path, bytes)
		},
		async listEntries(path) {
			return Object.keys(archiveAt(path))
		},
		async readEntry(path, name, limit) {
			onRead(path, limit)
			return text(archiveAt(path)[name] ?? "")
		},
		async releasesFor() {
			return w.releases
		},
		async tagCommit(tag) {
			return w.tags.get(tag) ?? null
		},
		async attested() {
			calls.push("attested")
			return w.attested
		},
		async verifyAttestation(_, digest) {
			calls.push(`verify ${digest}`)
			return w.verifies
		},
		async downloadAsset(id, path) {
			calls.push(`download ${id}`)
			disk.set(path, w.assets.get(id) as Uint8Array)
		},
		async sha256(path) {
			return hex(disk.get(path) as Uint8Array)
		},
		async readText(path) {
			return new TextDecoder().decode(disk.get(path))
		},
		log: (line) => logs.push(line),
	}
	return { exit: main(argv, io, "dist/store-copies"), logs, calls }
}

describe("store-copy-run", () => {
	test("passes copies that are the release up to each store's additions, through the publish path's verifier", async () => {
		const { exit, logs, calls } = run(world(), "both")
		expect(await exit).toBe(0)
		expect(logs.filter((l) => l.startsWith("::"))).toEqual([])
		expect(calls.filter((c) => c.startsWith("download") || c.startsWith("verify"))).toEqual([
			"download 3",
			`verify ${SHA}`,
			"download 1",
			`verify ${SHA}`,
			"download 3",
			`verify ${SHA}`,
			"download 2",
			`verify ${SHA}`,
		])
	})

	test("reports a served file that differs from the release", async () => {
		const w = world()
		w.archives["served-chrome"]["app.js"] = "console.debug(2)"
		const { exit, logs } = run(w, "chrome")
		expect(await exit).toBe(1)
		expect(logs).toContain("::error::chrome 1.2.3: differs: app.js")
	})

	/** A published SHASUMS256.txt with other content, its digest updated so only its lines can fail. */
	const shasums = (w: World, body: string) => {
		w.assets.set(3, text(body))
		w.releases[0].assets[2].digest = `sha256:${hex(text(body))}`
	}
	const FAILS: [string, (w: World) => void, string][] = [
		[
			"a missing Chrome copy",
			(w) => {
				w.chrome = new Uint8Array()
			},
			"chrome: not a CRX3",
		],
		[
			"an HTTP error",
			(w) => {
				w.amo = new Error("GET https://addons.mozilla.org/api/v5/addons/addon/x/: HTTP 500")
			},
			"HTTP 500",
		],
		["a served version with no tag", (w) => w.tags.clear(), "v1.2.3 does not exist"],
		[
			"a tag with no release",
			(w) => {
				w.releases = []
			},
			"no single published release",
		],
		["a tag with two releases", (w) => w.releases.push({ ...w.releases[0], id: 10 }), "no single published release"],
		[
			"an AMO file outside addons.mozilla.org",
			(w) => {
				w.amo = { current_version: { file: { url: "https://example.com/nulo.xpi", hash: `sha256:${hex(w.xpi)}` } } }
			},
			"AMO lists no current file",
		],
		[
			"an AMO hash that is not a sha256",
			(w) => {
				w.amo = { current_version: { file: { url: "https://addons.mozilla.org/f/1/nulo.xpi", hash: `sha1:${"a".repeat(40)}` } } }
			},
			"AMO lists no sha256",
		],
		[
			"a draft release",
			(w) => {
				w.releases[0].draft = true
			},
			"no single published release",
		],
		[
			"an AMO hash mismatch",
			(w) => {
				w.xpi = zipOf("served-firefox-tampered")
			},
			"not the",
		],
		[
			"a non-stable version_name",
			(w) => {
				w.archives["served-chrome"]["manifest.json"] = manifest("1.2.3-rc.1")
			},
			"is not a stable X.Y.Z",
		],
		[
			"an unattested release outside the frozen list",
			(w) => {
				w.attested = false
			},
			"not attested by this workflow",
		],
		[
			"an attestation that does not verify",
			(w) => {
				w.verifies = false
			},
			"does not verify",
		],
		[
			"a SHASUMS256.txt that does not match",
			(w) => shasums(w, `${"e".repeat(64)}  nulo-chrome-1.2.3.zip\n${"f".repeat(64)}  nulo-firefox-1.2.3.zip\n`),
			"SHASUMS256.txt does not match",
		],
		[
			"a SHASUMS256.txt that names another zip",
			(w) => shasums(w, `${hex(w.assets.get(1) as Uint8Array)}  nulo-chrome-1.2.3.zip\n${"f".repeat(64)}  nulo-edge-1.2.3.zip\n`),
			"exactly the two zips",
		],
		[
			"a served entry that climbs out of the archive",
			(w) => {
				w.archives["served-firefox"]["../x"] = "x"
			},
			"climbs out",
		],
		[
			"a SHASUMS256.txt with a third line",
			(w) => shasums(w, `${new TextDecoder().decode(w.assets.get(3))}${"e".repeat(64)}  x.zip\n`),
			"exactly the two zips",
		],
	]
	test.each(FAILS)("exits 1 on %s", async (_, change, reason) => {
		const w = world()
		change(w)
		const { exit, logs } = run(w, "both")
		expect(await exit).toBe(1)
		expect(logs.filter((l) => l.startsWith("::error::")).join("\n")).toContain(reason)
	})

	test("a version on the frozen pre-attestation list passes on digest and SHASUMS256.txt, with a notice", async () => {
		const { exit, logs, calls } = run(world("0.30.2", { attested: false, verifies: false }), "both")
		expect(await exit).toBe(0)
		expect(calls.filter((c) => c === "attested" || c.startsWith("verify"))).toEqual([])
		expect(logs.filter((l) => l.startsWith("::notice::"))).toHaveLength(2)
	})

	test("a pre-attestation version still needs its digests", async () => {
		const w = world("0.30.2", { attested: false })
		w.assets.set(1, zipOf("swapped"))
		const { exit, logs } = run(w, "chrome")
		expect(await exit).toBe(1)
		expect(logs.join("\n")).toContain("does not match sha256:")
	})

	test("every entry of an archive draws on one output budget", async () => {
		const w = world()
		const limits: number[] = []
		const onRead = (path: string, limit: number) => path.endsWith("chrome-store.zip") && limits.push(limit)
		expect(await runWith(w, onRead, "chrome").exit).toBe(0)
		const [first] = Object.values(w.archives["served-chrome"])
		// The first read is the version check's, bounded on its own.
		expect(limits.slice(1, 3)).toEqual([512 << 20, (512 << 20) - text(first).length])
	})

	test("refuses anything but one store name", async () => {
		for (const argv of [[], ["edge"], ["chrome", "firefox"]]) expect(await run(world(), ...argv).exit).toBe(1)
	})
})

describe("pins", () => {
	test("only v0.30.2 may skip the attestation, and the list never grows", () => {
		expect(PRE_ATTESTATION).toEqual(["0.30.2"])
	})

	test("the Chrome item is the one the landing links", () => {
		const install = readFileSync(join(import.meta.dir, "../../apps/landing/src/install.ts"), "utf8")
		expect(install).toContain(`chromewebstore.google.com/detail/${CHROME_ITEM_ID}"`)
	})

	test("the real IO holds the release reads and nothing that writes to a release", () => {
		expect(Object.keys(realStoreIO("o/r", "")).sort()).toEqual(
			[
				"attested",
				"downloadAsset",
				"fetchBytes",
				"listEntries",
				"log",
				"readEntry",
				"readText",
				"releasesFor",
				"sha256",
				"tagCommit",
				"verifyAttestation",
				"writeBytes",
			].sort(),
		)
	})
})
