/**
 * The I/O around release-notes.ts, as two commands:
 *
 *   compose   the `release-notes` job, in the tag's checkout: `VERSION`, `CLIFF` (git-cliff's output)
 *             and `OUT` (the body attach-assets publishes). A stable writes its notes above git-cliff's
 *             text, or exits 1 and writes nothing; a prerelease copies git-cliff's text through.
 *   check     every PR into main: the version the tree would release (root `package.json`) must have
 *             notes that can ship, so the Release PR cannot merge without them.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { composeBody, needsNotes, notesPath, notesRefusal } from "./release-notes"
import { command } from "./workflow-command"

export interface NotesIO {
	/** The file's text, or null when it does not exist. */
	read(path: string): string | null
	write(path: string, text: string): void
	log(line: string): void
}

const fail = (io: NotesIO, reason: string): 1 => {
	io.log(command("error", `release notes: ${reason}`))
	return 1
}

const reason = (e: unknown) => (e instanceof Error ? e.message : "unexpected failure")

export function runCompose(env: Record<string, string | undefined>, io: NotesIO): 0 | 1 {
	const { VERSION: version = "", CLIFF: cliffPath = "", OUT: out = "" } = env
	if (!version || !cliffPath || !out) return fail(io, "VERSION, CLIFF and OUT are required")
	const cliff = io.read(cliffPath)
	if (!cliff?.trim()) return fail(io, `${cliffPath} holds no git-cliff output`)
	let stable: boolean
	try {
		stable = needsNotes(version)
	} catch (e) {
		return fail(io, reason(e))
	}
	if (!stable) {
		io.write(out, cliff)
		io.log(`${version}: a prerelease; the body is git-cliff's alone`)
		return 0
	}
	const notes = io.read(notesPath(version))
	const refused = notesRefusal(version, notes)
	if (refused || notes === null) return fail(io, refused ?? `${notesPath(version)} is missing`)
	io.write(out, composeBody(version, notes, cliff))
	io.log(`${version}: the body opens with ${notesPath(version)}`)
	return 0
}

export function runCheck(io: NotesIO): 0 | 1 {
	let version: unknown
	try {
		version = (JSON.parse(io.read("package.json") ?? "") as { version?: unknown }).version
	} catch {
		return fail(io, "package.json is unreadable")
	}
	if (typeof version !== "string") return fail(io, "package.json names no version")
	let refused: string | null
	try {
		refused = notesRefusal(version, io.read(notesPath(version)))
	} catch (e) {
		return fail(io, reason(e))
	}
	if (refused) return fail(io, refused)
	io.log(`${version}: release notes ok`)
	return 0
}

export function main(argv: string[], env: Record<string, string | undefined>, io: NotesIO): 0 | 1 {
	if (argv.length === 1 && argv[0] === "compose") return runCompose(env, io)
	if (argv.length === 1 && argv[0] === "check") return runCheck(io)
	return fail(io, `usage: compose | check (got ${argv.join(" ")})`)
}

if (import.meta.main) {
	const io: NotesIO = {
		read: (path) => (existsSync(path) ? readFileSync(path, "utf8") : null),
		write: (path, text) => writeFileSync(path, text),
		log: (line) => console.log(line),
	}
	process.exit(main(process.argv.slice(2), process.env, io))
}
