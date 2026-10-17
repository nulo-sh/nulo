// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the inputs are code samples; their `${…}` is what is under test.

import ts from "typescript"
import { describe, expect, test } from "vitest"
import { callsTo, codeLines } from "./source-code"

const masked = (text: string): string => codeLines("x.ts", text).join("\n")
const blank = (n: number): string => " ".repeat(n)

describe("codeLines", () => {
	test("blanks line, block and JSDoc comments and a shebang, wherever they sit", () => {
		const text = ["#!/usr/bin/env bun", "const a = 1 // c (", "/* b ) */ const b = 2", "/** doc ( */", "f(a /* ) */, b)"].join("\n")
		expect(masked(text)).toBe(
			[blank(18), `const a = 1 ${blank(6)}`, `${blank(9)} const b = 2`, blank(12), `f(a ${blank(7)}, b)`].join("\n"),
		)
	})

	test("blanks string text, escapes included, and keeps the quotes", () => {
		expect(masked(`f("a)\\"b(", 'c\\'(')`)).toBe(`f("${blank(6)}", '${blank(4)}')`)
	})

	test("keeps `${}` bodies as code and text inside them readable, brackets masked", () => {
		expect(masked('log(`a(${row["master-key"]} ${`in(${x})`})`)')).toBe('log(`  ${row["master-key"]} ${`in\0${x}\0`} `)')
		expect(masked('log(`${obj["a(b"]}`)')).toBe('log(`${obj["a\0b"]}`)')
	})

	test("reads a regex after throw, return, `!` and `if (…)`, flags kept", () => {
		const text = ["function f() { throw /\\)/ }", "function g() { return /(/g }", "!/re)/.test(x)", "if (ok) /[))]/.test(x)"].join("\n")
		expect(masked(text)).toBe(
			[
				`function f() { throw ${blank(4)} }`,
				`function g() { return ${blank(3)}g }`,
				`!${blank(5)}.test(x)`,
				`if (ok) ${blank(6)}.test(x)`,
			].join("\n"),
		)
	})

	test("reads a division after a non-null `!`, a postfix `++` and a member named `in`", () => {
		const text = ["a! / b / c", "i++ / 2 / 3", "x.in / 2 / y"].join("\n")
		expect(masked(text)).toBe(text)
	})

	test("keeps a multi-line template's line count", () => {
		expect(codeLines("x.ts", "const t = `a(\nb)\n${c}`\nf(c)")).toEqual(["const t = `  ", "  ", "${c}`", "f(c)"])
	})

	test("a `.vue` file contributes its script blocks at their real lines, a one-line script included", () => {
		const sfc = ["<template>", "  <p>{{ f(secret) }}</p>", "</template>", '<script setup lang="ts">', 'const a = "("', "</script>"]
		expect(codeLines("x.vue", sfc.join("\n"))).toEqual(["", "", "", "", 'const a = " "', ""])
		expect(codeLines("x.vue", '<script setup lang="ts"></script>\n<template>\n  <p>{{ f(secret) }}</p>\n</template>')).toEqual([
			"",
			"",
			"",
			"",
		])
		expect(codeLines("x.vue", "<script setup>log(`${secret}`)</script>")).toEqual(["log(`${secret}`)"])
	})
})

describe("callsTo", () => {
	const shape = (calls: ReturnType<typeof callsTo>) =>
		calls.map(({ line, callee, args }) => [line, callee, args.map((arg) => arg.getText())])

	test("matches the callee's text: an optional call, a member suffix, a `new`", () => {
		const text = ['this._logger?.log?.("a")', 'logger.log("b")', 'mylogger.log("c")', 'const l = new Lock("net", logger)'].join("\n")
		expect(shape(callsTo("x.ts", text, /\b_?logger\??\.log$/))).toEqual([
			[1, "this._logger?.log", ['"a"']],
			[2, "logger.log", ['"b"']],
		])
		expect(shape(callsTo("x.ts", text, /^Lock$/))).toEqual([[4, "Lock", ['"net"', "logger"]]])
	})

	test("reads arguments as nodes, so a paren inside a string is text", () => {
		const [first, second] = callsTo("x.ts", 'openToast({ label: "a)", kind: "info" })\nopenToast("(", x)', /^openToast$/)
		expect(first?.args).toHaveLength(1)
		expect(first?.args[0] && ts.isObjectLiteralExpression(first.args[0])).toBe(true)
		expect(second?.args.map((arg) => arg.getText())).toEqual(['"("', "x"])
	})

	test("reads a `.vue` file's script, interpolations, directive values and dynamic arguments at their real lines", () => {
		const sfc = [
			"<script setup>",
			"openToast(s)",
			"</script>",
			"<template>",
			"  <p>{{ openToast(x) }}</p>",
			'  <b @click="openToast(y)" />',
			'  <i :[openToast(z)]="w" />',
			"</template>",
		].join("\n")
		expect(callsTo("x.vue", sfc, /^openToast$/).map((call) => [call.line, call.args[0]?.getText()])).toEqual([
			[2, "s"],
			[5, "x"],
			[6, "y"],
			[7, "z"],
		])
	})
})
