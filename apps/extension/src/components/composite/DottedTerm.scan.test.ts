import { relative } from "node:path"
import { describe, expect, test } from "vitest"
import { GLOSSARY } from "@/utils/glossary"
import { boundAttr, parseSource, sourceFiles, staticAttr, walkElements } from "../../../scripts/type-roles/source-scan"

/**
 * A dotted term's definition is whatever its key names, so the keys are the contract. Every
 * `<DottedTerm>` in a template must name its key literally: a bound or missing key fails instead of
 * being skipped.
 */

const SRC = "apps/extension/src"

const occurrences = sourceFiles({ roots: [SRC], exts: ["vue"] }).flatMap((file) => {
	const { template } = parseSource(file)
	const found: { where: string; key?: string; bound: boolean }[] = []
	if (template) {
		walkElements(template, (node) => {
			if (node.tag !== "DottedTerm") return
			found.push({ where: relative(SRC, file), key: staticAttr(node, "term"), bound: boundAttr(node, "term") !== undefined })
		})
	}
	return found
})

describe("dotted terms", () => {
	test("the scan finds the terms that exist", () => {
		expect(occurrences.length).toBeGreaterThan(0)
	})

	test("every dotted term names an existing glossary key, literally", () => {
		const offenders = occurrences.flatMap(({ where, key, bound }) => {
			if (bound) return [`${where}: bound term`]
			if (key === undefined) return [`${where}: no term`]
			return Object.hasOwn(GLOSSARY, key) ? [] : [`${where}: unknown key "${key}"`]
		})
		expect(offenders).toEqual([])
	})

	test("every definition a dotted term shows is one sentence of at most 100 characters", () => {
		const used = new Set(occurrences.map(({ key }) => key).filter((key) => key !== undefined && Object.hasOwn(GLOSSARY, key)))
		const tooLong = [...used].flatMap((key) => {
			const { definition } = GLOSSARY[key as keyof typeof GLOSSARY]
			const sentences = definition.split(/(?<=[.!?])\s+/).length
			return definition.length <= 100 && sentences === 1 ? [] : [`${key}: ${sentences} sentences, ${definition.length} chars`]
		})
		expect(tooLong).toEqual([])
	})
})
