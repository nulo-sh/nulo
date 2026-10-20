import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { FIXTURE_PREFIX } from "./stored-rows"

/**
 * A release's `chrome.storage.local` as the live update scenario left it before updating, so the
 * replay can update the same rows offline. It holds a throwaway profile under the test password.
 */
export type Recording = { tag: string; browser: string; entries: Record<string, unknown> }

export const recordingPath = (tag: string): string => path.join(path.dirname(fileURLToPath(import.meta.url)), `${tag}.storage.json`)

/** Writes `entries`, keys sorted and fixture keys left out, as `tag`'s recording. */
export function writeRecording(tag: string, browser: string, entries: Record<string, unknown>): void {
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
