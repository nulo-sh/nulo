import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { FIXTURE_PREFIX } from "./stored-rows"

/**
 * A release's `chrome.storage.local` as the live update scenario left it before updating, so the
 * replay can update the same rows offline. It holds a throwaway profile under the test password.
 */
export type Recording = { tag: string; browser: string; entries: Record<string, unknown> }

export const recordingPath = (tag: string): string => path.join(path.dirname(fileURLToPath(import.meta.url)), `${tag}.storage.json`)

/** Writes `entries`, keys sorted and fixture keys left out, as `tag`'s recording. Chrome's storage
 *  holds JSON values only, so only its recording replays on both browsers. */
export function writeRecording(tag: string, browser: string, entries: Record<string, unknown>): void {
	if (browser !== "chrome") throw new Error(`a recording is made from Chrome, not ${browser}`)
	const kept = Object.keys(entries)
		.filter((key) => !key.startsWith(FIXTURE_PREFIX))
		.sort()
		.map((key) => [key, entries[key]])
	const recording: Recording = { tag, browser, entries: Object.fromEntries(kept) }
	writeFileSync(recordingPath(tag), `${JSON.stringify(recording, null, "\t")}\n`)
}

/** `tag`'s recording, or undefined when none was made. */
export function readRecording(tag: string): Recording | undefined {
	const file = recordingPath(tag)
	return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Recording) : undefined
}

export type PinnedBackup = "password" | "passkey"

const BACKUPS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../src/wallet/storage/stored-shapes/backups")

/** Writes `envelope` as the pinned 1.0.0 backup `name` that the stored-shape guard's R5 imports, and
 *  returns the pin to add beside it. Made from Chrome, as a recording is. */
export function writePinnedBackup(name: PinnedBackup, browser: string, envelope: unknown): string {
	if (browser !== "chrome") throw new Error(`a pinned backup is made from Chrome, not ${browser}`)
	mkdirSync(BACKUPS_DIR, { recursive: true })
	const text = `${JSON.stringify(envelope, null, "\t")}\n`
	writeFileSync(path.join(BACKUPS_DIR, `${name}.json`), text)
	return createHash("sha256").update(text).digest("hex")
}
