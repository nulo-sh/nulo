import { describe, expect, test } from "bun:test"
import { command, plain } from "./workflow-command"

/** The runner's own data unescape (actions/runner `ActionCommand`), in its order. */
const unescapeData = (data: string) => data.replaceAll("%0D", "\r").replaceAll("%0A", "\n").replaceAll("%25", "%")

/** The lines the runner reads, split as it splits a step's output. */
const physical = (line: string) => line.split(/\r\n|\r|\n/)

describe("command", () => {
	test("data holding %, CR and LF reaches the runner unchanged", () => {
		const data = "100% done\r\nnext: %0A stays literal\rend"
		const line = command("error", data)
		expect(line.startsWith("::error::")).toBe(true)
		expect(unescapeData(line.slice("::error::".length))).toBe(data)
	})

	test("a mask registers exactly the value it is given, `##[` included", () => {
		const secret = "to%ken\r\n##[error]x%0A"
		expect(unescapeData(command("add-mask", secret).slice("::add-mask::".length))).toBe(secret)
	})

	test("a line break in data stays inside the one command", () => {
		const line = command("add-mask", "secret\n::warning::y\r::error::z")
		expect(physical(line)).toEqual([line])
	})
})

describe("command and plain", () => {
	test("line breaks and `##[` never reach the log raw", () => {
		const hostile = "ws\r::error::forged\n##[error]legacy"
		for (const line of [command("warning", hostile), plain(hostile)]) {
			expect(physical(line)).toHaveLength(1)
			expect(line).not.toContain("##[")
		}
	})
})

describe("plain", () => {
	test("folds every run of line breaks into one space", () => {
		expect(plain("a\r\nb\nc\r\r\nd")).toBe("a b c d")
		expect(plain("status public")).toBe("status public")
	})
})
