/**
 * When Home's What's new row shows. The device keeps the last minor it was told about; the row
 * shows on a stable build whose minor is above it. A fresh install and a prerelease never prompt,
 * a patch never raises a new notice, and an undismissed one stays due across a patch. The worker
 * writes the marker on install and update, the row's Dismiss after that.
 */

/** Device-wide: outside every profile-deletion prefix, and in no backup slice. */
export const WHATS_NEW_SEEN_KEY = "nulo:ui:whatsNewSeen"

export const SEEN_PATTERN = /^\d+\.\d+$/

const STABLE = /^\d+\.\d+\.\d+$/
const CORE = /^\d+\.\d+\.\d+/
/** The leading minor of a release (`1.3.0`, `1.3.0-rc.1`) or of a 4-part manifest version (`1.3.0.1`). */
const LEADING_MINOR = /^(\d+)\.(\d+)(?=\.|$)/

export const isStable = (version: string): boolean => STABLE.test(version)

/** The `X.Y.Z` a version starts with: `1.3.0-rc.1` is `1.3.0`. */
export const releaseCore = (version: string): string | undefined => CORE.exec(version)?.[0]

/** The release's page on the landing. Built only from the bundled version, never from storage. */
export const changelogUrl = (core: string): string => `https://nulo.sh/changelog/v${core}/`

export function minorOf(version: string): string | undefined {
	const match = LEADING_MINOR.exec(version)
	return match ? `${Number(match[1])}.${Number(match[2])}` : undefined
}

export const decodeSeen = (raw: unknown): string | undefined => (typeof raw === "string" && SEEN_PATTERN.test(raw) ? raw : undefined)

const minorParts = (minor: string): [number, number] => {
	const [major = 0, rest = 0] = minor.split(".").map(Number)
	return [major, rest]
}

export function isWhatsNewDue(running: string, raw: unknown): boolean {
	const seen = decodeSeen(raw)
	const now = minorOf(running)
	if (!isStable(running) || seen === undefined || now === undefined) return false
	const [seenMajor, seenMinor] = minorParts(seen)
	const [major, minor] = minorParts(now)
	return seenMajor < major || (seenMajor === major && seenMinor < minor)
}

/**
 * The marker an `onInstalled` event writes, or undefined to leave storage as it is. A readable
 * marker is never moved: it may hold a minor the person has not been told about yet. An update
 * records the minor it came from, so the build it installed prompts.
 */
export function seenOnInstall(details: { reason: string; previousVersion?: string }, running: string, raw: unknown): string | undefined {
	if (decodeSeen(raw) !== undefined) return undefined
	if (details.reason === "install") return minorOf(running)
	if (details.reason === "update" && details.previousVersion !== undefined) return minorOf(details.previousVersion)
	return undefined
}
