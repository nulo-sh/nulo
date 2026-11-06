import { describe, expect, test } from "bun:test"
import { main, type NotesIO } from "./release-notes-run"

const NOTES = "A lead line.\n\n- One change.\n"
const CLIFF = "## 1.3.0\n\n### Install\n"

function fakeIO(files: Record<string, string>) {
	const written: Record<string, string> = {}
	const lines: string[] = []
	const io: NotesIO = {
		read: (path) => files[path] ?? null,
		write: (path, text) => {
			written[path] = text
		},
		log: (line) => lines.push(line),
	}
	return { io, written, output: () => lines.join("\n") }
}

const compose = (version: string, files: Record<string, string>) => {
	const h = fakeIO({ "/tmp/cliff.md": CLIFF, ...files })
	const exit = main(["compose"], { VERSION: version, CLIFF: "/tmp/cliff.md", OUT: "/tmp/release-notes.md" }, h.io)
	return { exit, ...h }
}

describe("compose", () => {
	test("a stable with its notes writes them above git-cliff's text", () => {
		const r = compose("1.3.0", { "release-notes/1.3.0.md": NOTES })
		expect(r.exit).toBe(0)
		expect(r.written["/tmp/release-notes.md"]).toBe(`## What's new in 1.3.0\n\n${NOTES.trim()}\n\n---\n\n${CLIFF}`)
	})

	test("a stable without its notes exits 1, names the file and writes nothing", () => {
		const r = compose("1.3.0", { "release-notes/1.2.0.md": NOTES })
		expect(r.exit).toBe(1)
		expect(r.output()).toContain("::error::release notes: release-notes/1.3.0.md is missing")
		expect(r.written).toEqual({})
	})

	test("a stable whose notes break a rule exits 1 and writes nothing", () => {
		const r = compose("1.3.0", { "release-notes/1.3.0.md": "## Heading\n" })
		expect(r.exit).toBe(1)
		expect(r.written).toEqual({})
	})

	test("a prerelease copies git-cliff's text through", () => {
		const r = compose("1.3.0-rc.0", {})
		expect(r.exit).toBe(0)
		expect(r.written["/tmp/release-notes.md"]).toBe(CLIFF)
	})

	test("a missing git-cliff output or a missing input refuses and writes nothing", () => {
		const h = fakeIO({ "release-notes/1.3.0.md": NOTES })
		expect(main(["compose"], { VERSION: "1.3.0", CLIFF: "/tmp/none.md", OUT: "/tmp/release-notes.md" }, h.io)).toBe(1)
		expect(main(["compose"], { VERSION: "1.3.0", CLIFF: "/tmp/cliff.md" }, h.io)).toBe(1)
		expect(h.written).toEqual({})
	})
})

describe("check", () => {
	const check = (version: string, files: Record<string, string> = {}) => {
		const h = fakeIO({ "package.json": JSON.stringify({ version }), ...files })
		return { exit: main(["check"], {}, h.io), output: h.output() }
	}

	test("the tree's stable version passes with its notes and fails without them", () => {
		expect(check("1.3.0", { "release-notes/1.3.0.md": NOTES }).exit).toBe(0)
		const missing = check("1.3.0", { "release-notes/1.2.0.md": NOTES })
		expect(missing.exit).toBe(1)
		expect(missing.output).toContain("release-notes/1.3.0.md is missing")
	})

	test("a prerelease passes without notes; an unreadable version fails", () => {
		expect(check("1.3.0-rc.0").exit).toBe(0)
		expect(check("v1.3.0").exit).toBe(1)
	})
})
