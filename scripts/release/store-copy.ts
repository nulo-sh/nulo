/**
 * Whether the zip a store serves is the release zip it claims to be. Pure: archives come in as entry
 * maps, findings come out. A store copy is hostile input, so every shape is checked before use.
 *
 * What each store may change is exact, measured on the copies both stores served of v0.30.2: no
 * prefix and no key is allowed wholesale, and anything else is a finding.
 */

export type Store = "chrome" | "firefox"

/** Today's copies hold 626 to 631 entries. */
export const MAX_ENTRIES = 2_000

const MAX_CRX_HEADER = 1 << 20

/** Entries a store may add: Chrome's content hashes, AMO's signature. */
const ADDED: Record<Store, ReadonlySet<string>> = {
	chrome: new Set(["_metadata/", "_metadata/verified_contents.json"]),
	firefox: new Set([
		"META-INF/cose.manifest",
		"META-INF/cose.sig",
		"META-INF/manifest.mf",
		"META-INF/mozilla.sf",
		"META-INF/mozilla.rsa",
	]),
}

/** The one key Chrome writes into `manifest.json`, with the one value it writes. */
const CHROME_UPDATE_URL = ["update_url", "https://clients2.google.com/service/update2/crx"] as const

/** Chrome drops this entry, and may only while the release's copy is empty. */
const CHROME_DROPS = ".gitkeep"

/** The zip inside a CRX3; anything but a CRX3 header followed by a zip is refused. */
export function crxPayload(bytes: Uint8Array): Uint8Array {
	if (bytes.length < 12) throw new Error("not a CRX3: shorter than its header")
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	if (view.getUint32(0, true) !== 0x34327243) throw new Error("not a CRX3: no Cr24 magic")
	if (view.getUint32(4, true) !== 3) throw new Error(`not a CRX3: version ${view.getUint32(4, true)}`)
	const header = view.getUint32(8, true)
	if (header > MAX_CRX_HEADER || 12 + header + 4 > bytes.length) throw new Error(`not a CRX3: header of ${header} bytes`)
	const payload = bytes.subarray(12 + header)
	if (new DataView(payload.buffer, payload.byteOffset, 4).getUint32(0, true) !== 0x04034b50)
		throw new Error("not a CRX3: no zip after the header")
	return payload
}

function nameProblem(name: string): string | null {
	if (name === "" || name.startsWith("/") || /^[A-Za-z]:/.test(name)) return "is absolute"
	if (name.split("/").includes("..")) return "climbs out with .."
	if ([...name].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) return "holds a control character"
	// `unzip -Z1` lists a control character as a caret pair, and `unzip` reads the rest as a pattern.
	if (/[*?[\]\\^]/.test(name)) return "holds a wildcard, a backslash or a caret"
	if (name.startsWith("-")) return "starts with -"
	return null
}

/** Why an archive's entry list cannot be compared, or null. */
export function entryListProblem(names: readonly string[]): string | null {
	if (names.length > MAX_ENTRIES) return `${names.length} entries, more than ${MAX_ENTRIES}`
	const seen = new Set<string>()
	for (const name of names) {
		if (seen.has(name)) return `entry ${JSON.stringify(name)} appears twice`
		seen.add(name)
		const problem = nameProblem(name)
		if (problem) return `entry ${JSON.stringify(name)} ${problem}`
	}
	return null
}

/** Key order is not content: objects compare with their keys sorted. */
function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
	if (value !== null && typeof value === "object") {
		const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`
	}
	return JSON.stringify(value) ?? "undefined"
}

function jsonObject(bytes: Uint8Array): Record<string, unknown> | null {
	try {
		const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
		return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
	} catch {
		return null
	}
}

function manifestFindings(store: Store, release: Uint8Array, served: Uint8Array): string[] {
	const ours = jsonObject(release)
	let theirs = jsonObject(served)
	if (!ours || !theirs) return ["manifest.json: not a JSON object on both sides"]
	const [key, url] = CHROME_UPDATE_URL
	if (store === "chrome" && !Object.hasOwn(ours, key) && theirs[key] === url)
		theirs = Object.fromEntries(Object.entries(theirs).filter(([k]) => k !== key))
	// Own keys only: a `__proto__` key would otherwise compare against the inherited prototype.
	const value = (o: Record<string, unknown>, k: string) => (Object.hasOwn(o, k) ? canonical(o[k]) : "absent")
	const keys = new Set([...Object.keys(ours), ...Object.keys(theirs)])
	return [...keys].filter((k) => value(ours, k) !== value(theirs, k)).map((k) => `manifest.json: ${JSON.stringify(k)} differs`)
}

const same = (a: Uint8Array, b: Uint8Array): boolean => Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(b)

/** Every way `served` differs from `release` beyond what `store` may change; empty when it is the release. */
export function compareCopies({
	store,
	release,
	served,
}: {
	store: Store
	release: ReadonlyMap<string, Uint8Array>
	served: ReadonlyMap<string, Uint8Array>
}): string[] {
	const findings: string[] = []
	for (const [name, bytes] of release) {
		const copy = served.get(name)
		if (copy === undefined) {
			if (!(store === "chrome" && name === CHROME_DROPS && bytes.length === 0)) findings.push(`missing: ${name}`)
		} else if (name === "manifest.json") findings.push(...manifestFindings(store, bytes, copy))
		else if (!same(bytes, copy)) findings.push(`differs: ${name}`)
	}
	for (const name of served.keys()) if (!release.has(name) && !ADDED[store].has(name)) findings.push(`extra: ${name}`)
	return findings
}
