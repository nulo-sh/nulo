import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { E2E_STATE_DIR } from "../../lockfile"
import type { ReleaseTraits } from "./release"
import { FIXTURE_PREFIX } from "./stored-rows"
import { missingFamilies } from "./verify"

/**
 * A release's `chrome.storage.local` as the live update scenario left it before updating, so the
 * replay can update the same rows offline. It holds a throwaway profile under the test password.
 * A release that seals its rows also names `dials`, every loopback origin they point at, since the
 * replay cannot move a sealed row's endpoint off them.
 */
export type Recording = { tag: string; browser: string; entries: Record<string, unknown>; dials?: string[] }

export const recordingPath = (tag: string): string => path.join(path.dirname(fileURLToPath(import.meta.url)), `${tag}.storage.json`)

/** Writes `entries`, keys sorted and fixture keys left out, as `tag`'s recording. Chrome's storage
 *  holds JSON values only, so only its recording replays on both browsers. */
export function writeRecording(tag: string, browser: string, entries: Record<string, unknown>, dials?: string[]): void {
	if (browser !== "chrome") throw new Error(`a recording is made from Chrome, not ${browser}`)
	const kept = Object.keys(entries)
		.filter((key) => !key.startsWith(FIXTURE_PREFIX))
		.sort()
		.map((key) => [key, entries[key]])
	const recording: Recording = { tag, browser, entries: Object.fromEntries(kept), ...(dials ? { dials } : {}) }
	writeFileSync(recordingPath(tag), `${JSON.stringify(recording, null, "\t")}\n`)
}

/** `tag`'s recording, or undefined when none was made. */
export function readRecording(tag: string): Recording | undefined {
	const file = recordingPath(tag)
	return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Recording) : undefined
}

const DIAL = /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/

/**
 * Why `recording` cannot be replayed as `tag`'s, a release of `storage`, or nothing: it names another
 * release or browser, it lacks a key family such a release holds, or its `dials` do not match its
 * storage (a sealing release's must name loopback origins, a plaintext one's none).
 */
export function recordingProblems(recording: Recording, tag: string, storage: ReleaseTraits["storage"]): string[] {
	const named = [
		...(recording.tag === tag ? [] : [`the recording names ${recording.tag}, not ${tag}`]),
		...(recording.browser === "chrome" ? [] : [`the recording was made from ${recording.browser}, not Chrome`]),
	]
	const missing = missingFamilies(recording.entries, storage)
	const families = missing.length > 0 ? [`the recording of ${tag} holds no ${missing.join(", ")}: record it again`] : []
	return [...named, ...families, ...dialProblems(recording.dials, tag, storage)]
}

function dialProblems(dials: unknown, tag: string, storage: ReleaseTraits["storage"]): string[] {
	if (storage === "plaintext") {
		return dials === undefined ? [] : ["a plaintext release's recording names no dials: the replay moves its endpoints itself"]
	}
	const named = Array.isArray(dials) && dials.length > 0 && dials.every((dial) => typeof dial === "string" && DIAL.test(dial))
	return named ? [] : [`the recording of ${tag} names no loopback dials: record it again`]
}

export type PinnedBackup = "password" | "passkey"

/** Writes `file`, a full backup's content as the candidate wrote it (gunzipped), under the
 *  checkout's e2e state, and returns its path and SHA-256. Copying it into `stored-shapes/backups/` and pinning it is done by
 *  hand: a pinned backup is never replaced. Made from Chrome, as a recording is. */
export function writePinnedBackup(name: PinnedBackup, browser: string, file: string): { path: string; pin: string } {
	if (browser !== "chrome") throw new Error(`a pinned backup is made from Chrome, not ${browser}`)
	const dir = path.join(E2E_STATE_DIR, "pinned-backups")
	mkdirSync(dir, { recursive: true })
	// The wallet names an encrypted backup `.txt`, and every full backup it writes is encrypted.
	const written = path.join(dir, `${name}.txt`)
	writeFileSync(written, file)
	return { path: written, pin: createHash("sha256").update(file).digest("hex") }
}
