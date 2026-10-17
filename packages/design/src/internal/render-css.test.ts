import { describe, expect, test } from "vitest"
import { typeRoles } from "../token-contract"
import { renderUtilitiesCss } from "./render-css"

type Rule = { selector: string; declarations: Map<string, string> }

function rulesOf(css: string): Rule[] {
	return [...css.matchAll(/^([^\s{][^{\n]*) \{\n((?:\t[^\n]*\n)*)\}/gm)].map(([, selector, body]) => ({
		selector,
		declarations: new Map(
			body
				.trim()
				.split("\n")
				.map((line) => line.trim().replace(/;$/, "").split(": ") as [string, string]),
		),
	}))
}

const rules = rulesOf(renderUtilitiesCss())
const roleRules = rules.filter((rule) => rule.selector.startsWith(".type--"))
const roleRule = (name: string): Rule => {
	const found = roleRules.find((rule) => rule.selector === `.type--${name}`)
	if (!found) throw new Error(`no rule for ${name}`)
	return found
}
const names = Object.keys(typeRoles) as (keyof typeof typeRoles)[]
const namesWhere = (keep: (spec: (typeof typeRoles)[keyof typeof typeRoles]) => boolean): string[] =>
	names.filter((name) => keep(typeRoles[name])).sort()
const ruleNamesWhere = (keep: (rule: Rule) => boolean): string[] =>
	roleRules
		.filter(keep)
		.map((rule) => rule.selector.slice(".type--".length))
		.sort()

/** The layer's utility families; a role block may add no other selector. */
const UTILITY_PREFIXES = /^\.(lh--|type--|ta--|color--|flex$|flex-wide$|gap--|justify-|items-|content-|wrap-|flex-direction-)/

describe("type role rules in utilities.css", () => {
	test("one .type-- rule per role, and no selector outside the utility families", () => {
		expect(roleRules.map((rule) => rule.selector)).toEqual(names.map((name) => `.type--${name}`))
		expect(rules.filter((rule) => !UTILITY_PREFIXES.test(rule.selector)).map((rule) => rule.selector)).toEqual([])
	})

	test("the role block follows the last .lh-- rule, unbroken", () => {
		const lastLineHeight = rules.findLastIndex((rule) => rule.selector.startsWith(".lh--"))
		const first = rules.findIndex((rule) => rule.selector.startsWith(".type--"))
		expect(first).toBe(lastLineHeight + 1)
		expect(rules.slice(first, first + roleRules.length)).toEqual(roleRules)
	})

	test("font-size is absent exactly on the site-sized roles", () => {
		expect(ruleNamesWhere((rule) => !rule.declarations.has("font-size"))).toEqual(namesWhere((spec) => spec.size === null))
	})

	test("upper case exactly on the upper-case roles; every other role resets case", () => {
		expect(ruleNamesWhere((rule) => rule.declarations.get("text-transform") === "uppercase")).toEqual(
			namesWhere((spec) => spec.uppercase),
		)
		expect(ruleNamesWhere((rule) => rule.declarations.get("text-transform") === "none")).toEqual(namesWhere((spec) => !spec.uppercase))
	})

	test("tabular figures on the tabular roles, normal on every other, since the property inherits", () => {
		expect(ruleNamesWhere((rule) => rule.declarations.get("font-variant-numeric") === "tabular-nums")).toEqual(
			namesWhere((spec) => spec.tabular),
		)
		expect(ruleNamesWhere((rule) => rule.declarations.get("font-variant-numeric") === "normal")).toEqual(
			namesWhere((spec) => !spec.tabular),
		)
	})

	test("tracking 0 renders letter-spacing: normal; any other renders in em", () => {
		for (const name of names) {
			const { tracking } = typeRoles[name]
			expect(roleRule(name).declarations.get("letter-spacing"), name).toBe(tracking === 0 ? "normal" : `${tracking}em`)
		}
	})

	test("every role declares exactly its face, weight, tracking, case, figures and, when fixed, its size", () => {
		for (const name of names) {
			const spec = typeRoles[name]
			const declared = roleRule(name).declarations
			expect(declared.get("font-family"), name).toBe(`var(${spec.family})`)
			expect(declared.get("font-weight"), name).toBe(String(spec.weight))
			expect(declared.get("font-size"), name).toBe(spec.size === null ? undefined : `${spec.size}px`)
			expect(declared.size, name).toBe(spec.size === null ? 5 : 6)
		}
	})
})
