/**
 * Compares the copy each store serves with the release zip it claims to be:
 *
 *   bun scripts/release/store-copy-run.ts chrome|firefox|both
 *
 * The store side is public and unauthenticated. The release side reuses the publish path's own
 * verifier through `PublishedReadIO`, so this script cannot write to a release. Environment:
 * GITHUB_REPOSITORY, GH_TOKEN (read-only). Exits 1 on any finding and on anything it cannot check.
 */

import { mkdirSync } from "node:fs"
import { assetNames, parseShasums, type RemoteAsset } from "./attach-assets"
import { fetchVerified, type PublishedReadIO, readBounded, realIO as releaseIO } from "./attach-assets-run"
import { AMO_API, GECKO_ID } from "./publish-firefox-amo"
import { compareCopies, crxPayload, entryListProblem, type Store } from "./store-copy"
import { command } from "./workflow-command"
import { listEntries, readEntry } from "./zip-read"

export const CHROME_ITEM_ID = "jlmiaokmjoicmclelpiiocdhncddkdmc"

/** Published before release attestations existed; frozen, so no later version skips the attestation. */
export const PRE_ATTESTATION: readonly string[] = ["0.30.2"]

const CHROME_CRX = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=140.0&acceptformat=crx3&x=id%3D${CHROME_ITEM_ID}%26uc`
const AMO_ADDON = `${AMO_API}/addons/addon/${encodeURIComponent(GECKO_ID)}/`
/** Every download, store copy and release asset alike; the Chrome copy measured 36.7 MB. */
export const DOWNLOAD_LIMIT = 128 << 20
/** What all of one archive's entries may inflate to, whatever its central directory claims. */
const OUTPUT_LIMIT = 512 << 20

export interface StoreCopyIO extends PublishedReadIO {
	/** GET `url`, following redirects; throws on a non-2xx answer or past `limit` bytes. */
	fetchBytes(url: string, limit: number): Promise<Uint8Array>
	writeBytes(path: string, bytes: Uint8Array): Promise<void>
	listEntries(path: string): Promise<string[]>
	readEntry(path: string, name: string, limit: number): Promise<Uint8Array>
}

const hex = (bytes: Uint8Array): string => new Bun.CryptoHasher("sha256").update(bytes).digest("hex")

/** The AMO listing's current file, refused unless every field has its exact shape. */
function amoFile(json: unknown): { url: string; hash: string } {
	const file = (json as { current_version?: { file?: { url?: unknown; hash?: unknown } } } | null)?.current_version?.file
	if (typeof file?.url !== "string" || !file.url.startsWith("https://addons.mozilla.org/")) throw new Error("AMO lists no current file")
	if (typeof file.hash !== "string" || !/^sha256:[0-9a-f]{64}$/.test(file.hash)) throw new Error("AMO lists no sha256 for its file")
	return { url: file.url, hash: file.hash.slice("sha256:".length) }
}

/** Downloads the store's copy once and writes its zip to `path`. */
async function fetchServed(io: StoreCopyIO, store: Store, path: string): Promise<void> {
	if (store === "chrome") {
		const crx = await io.fetchBytes(CHROME_CRX, DOWNLOAD_LIMIT)
		io.log(`chrome: served ${crx.length} bytes, sha256 ${hex(crx)}`)
		return io.writeBytes(path, crxPayload(crx))
	}
	const file = amoFile(JSON.parse(new TextDecoder().decode(await io.fetchBytes(AMO_ADDON, 1 << 20))))
	const xpi = await io.fetchBytes(file.url, DOWNLOAD_LIMIT)
	const digest = hex(xpi)
	io.log(`firefox: served ${xpi.length} bytes, sha256 ${digest}`)
	if (digest !== file.hash) throw new Error(`the AMO file hashes to ${digest}, not the ${file.hash} AMO lists`)
	return io.writeBytes(path, xpi)
}

/** Every entry's bytes, after the entry list itself passed; the sum is bounded, not each claim. */
async function readArchive(io: StoreCopyIO, path: string): Promise<Map<string, Uint8Array>> {
	const names = await io.listEntries(path)
	const problem = entryListProblem(names)
	if (problem) throw new Error(`${path.slice(path.lastIndexOf("/") + 1)}: ${problem}`)
	const entries = new Map<string, Uint8Array>()
	let budget = OUTPUT_LIMIT
	for (const name of names) {
		const bytes = await io.readEntry(path, name, budget)
		budget -= bytes.length
		entries.set(name, bytes)
	}
	return entries
}

/** The stable version the copy's manifest names; a store serves no prerelease. */
async function servedVersion(io: StoreCopyIO, path: string): Promise<string> {
	const manifest = JSON.parse(new TextDecoder().decode(await io.readEntry(path, "manifest.json", 1 << 20))) as { version_name?: unknown }
	const version = manifest?.version_name
	if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version))
		throw new Error(`manifest.json's version_name ${JSON.stringify(version)} is not a stable X.Y.Z`)
	return version
}

async function fetchDigestOnly(io: StoreCopyIO, tag: string, assets: RemoteAsset[], name: string, path: string): Promise<string | null> {
	const asset = assets.find((a) => a.name === name)
	if (!asset?.digest) return `${tag}: ${name} has no digest`
	await io.downloadAsset(asset.id, path)
	return `sha256:${await io.sha256(path)}` === asset.digest ? null : `${name}: the download does not match ${asset.digest}`
}

/** The release's zip for `store`, verified as the publish path verifies it; its path, or why not. */
async function releaseZip(io: StoreCopyIO, store: Store, version: string, dir: string): Promise<{ path: string } | { problem: string }> {
	const tag = `v${version}`
	const tagSha = await io.tagCommit(tag)
	if (tagSha === null) return { problem: `the store serves ${version}, and ${tag} does not exist` }
	const found = await io.releasesFor(tag)
	const [release] = found
	if (found.length !== 1 || !release || release.draft) return { problem: `${tag} has no single published release` }
	const zip = `nulo-${store}-${version}.zip`
	const legacy = PRE_ATTESTATION.includes(version)
	if (legacy) io.log(command("notice", `${tag} predates release attestations: checked by digest and SHASUMS256.txt only`))
	for (const name of ["SHASUMS256.txt", zip]) {
		const path = `${dir}/${name}`
		const problem = legacy
			? await fetchDigestOnly(io, tag, release.assets, name, path)
			: await fetchVerified(io, { tag, tagSha }, release.assets, name, path)
		if (problem) return { problem }
	}
	const sums = parseShasums(await io.readText(`${dir}/SHASUMS256.txt`))
	const zips = assetNames(version).filter((name) => name.endsWith(".zip"))
	if (!sums || sums.size !== zips.length || !zips.every((name) => sums.has(name)))
		return { problem: "SHASUMS256.txt does not list exactly the two zips" }
	if (sums.get(zip) !== (await io.sha256(`${dir}/${zip}`))) return { problem: `SHASUMS256.txt does not match ${zip}` }
	return { path: `${dir}/${zip}` }
}

/** Every finding for one store, each already a workflow error line; empty when the copy is the release. */
export async function checkStore(io: StoreCopyIO, store: Store, dir: string): Promise<string[]> {
	const served = `${dir}/${store}-store.zip`
	await fetchServed(io, store, served)
	const version = await servedVersion(io, served)
	const release = await releaseZip(io, store, version, `${dir}/release-${store}`)
	if ("problem" in release) return [`${store}: ${release.problem}`]
	const findings = compareCopies({ store, release: await readArchive(io, release.path), served: await readArchive(io, served) })
	io.log(`${store}: compared the served ${version} with v${version}'s ${release.path.slice(release.path.lastIndexOf("/") + 1)}`)
	return findings.map((finding) => `${store} ${version}: ${finding}`)
}

export async function main(argv: string[], io: StoreCopyIO, dir: string): Promise<0 | 1> {
	const [which] = argv
	const stores: Store[] | null = which === "both" ? ["chrome", "firefox"] : which === "chrome" || which === "firefox" ? [which] : null
	if (argv.length !== 1 || !stores) {
		io.log(command("error", `usage: chrome | firefox | both (got ${argv.join(" ")})`))
		return 1
	}
	let failed = false
	for (const store of stores) {
		const findings = await checkStore(io, store, dir).catch((e: unknown) => [
			`${store}: ${e instanceof Error ? e.message : "unexpected failure"}`,
		])
		for (const finding of findings) io.log(command("error", finding))
		if (findings.length === 0) io.log(`${store}: the served copy is the release zip, up to the store's own additions`)
		failed ||= findings.length > 0
	}
	return failed ? 1 : 0
}

export function realStoreIO(repo: string, token: string): StoreCopyIO {
	// Only the read half of the publish path's IO: nothing here can write to a release.
	const r = releaseIO(repo, token, DOWNLOAD_LIMIT)
	return {
		releasesFor: r.releasesFor,
		tagCommit: r.tagCommit,
		attested: r.attested,
		verifyAttestation: r.verifyAttestation,
		downloadAsset: r.downloadAsset,
		sha256: r.sha256,
		readText: r.readText,
		log: r.log,
		async fetchBytes(url, limit) {
			const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(300_000) })
			const where = `GET ${url.split("?")[0]}`
			if (!res.ok || !res.body) throw new Error(`${where}: HTTP ${res.status}`)
			return readBounded(res, limit, where)
		},
		async writeBytes(path, bytes) {
			mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true })
			await Bun.write(path, bytes)
		},
		listEntries,
		readEntry,
	}
}

if (import.meta.main) {
	const io = realStoreIO(process.env.GITHUB_REPOSITORY ?? "", process.env.GH_TOKEN ?? "")
	process.exit(await main(process.argv.slice(2), io, "dist/store-copies"))
}
