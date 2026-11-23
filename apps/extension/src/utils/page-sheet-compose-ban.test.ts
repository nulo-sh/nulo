import { readFileSync } from "node:fs"
import { join, posix } from "node:path"
import { describe, expect, test } from "vitest"
import {
	parseSource,
	REPO_ROOT,
	SCAN_ROOTS,
	type SourcePolicy,
	STORY_FILE,
	sourceFiles,
	TEST_FILE,
} from "../../scripts/type-roles/source-scan"

/**
 * Static ban: no stylesheet outside `popup/pages/` composes from one under it. A page's sheet moves
 * with its page, so a lower layer composing it breaks or restyles silently, and Biome's import rules
 * never read a CSS `composes`. A look shared across layers lives at or below its lowest consumer.
 */

const POLICY: SourcePolicy = { roots: SCAN_ROOTS, exts: ["vue", "css", "scss"], skip: [TEST_FILE, STORY_FILE] }
const SRC = "apps/extension/src"
const PAGES = `${SRC}/popup/pages/`
const SHARED_SHEET = `${SRC}/popup/components/modules/tx/detail-shared.module.css`
/** The extension's Vite aliases for `src` and its root-relative path: every SFC it bundles,
 *  `@nulo/design`'s included, resolves through them. */
const ALIASES = ["@/", "~/", "src/", "/src/"]

type Composition = { file: string; target: string }

/** The repo-relative sheet `spec` names from `file`, or undefined for a package's sheet. */
function resolveSheet(file: string, spec: string): string | undefined {
	if (spec.startsWith("./") || spec.startsWith("../")) return posix.normalize(posix.join(posix.dirname(file), spec))
	const alias = ALIASES.find((prefix) => spec.startsWith(prefix))
	return alias === undefined ? undefined : posix.join(SRC, spec.slice(alias.length))
}

function compositions(file: string, source: string): Composition[] {
	return parseSource(file, source).styles.flatMap(({ root }) => {
		const found: Composition[] = []
		root.walkDecls(/^composes$/i, (decl) => {
			const spec = decl.value.match(/\bfrom\s+(["'])(.+)\1\s*$/)?.[2]
			const target = spec === undefined ? undefined : resolveSheet(file, spec)
			if (target !== undefined) found.push({ file, target })
		})
		return found
	})
}

const upward = ({ file, target }: Composition): boolean => target.startsWith(PAGES) && !file.startsWith(PAGES)

const tree = (): Composition[] => sourceFiles(POLICY).flatMap((file) => compositions(file, readFileSync(join(REPO_ROOT, file), "utf8")))

describe("no stylesheet below the pages composes from a page's sheet", () => {
	test("the tree holds none", () => {
		expect(tree().filter(upward)).toEqual([])
	})

	test("the scan reads each detail page composing the shared sheet, and a page composing a page's sheet", () => {
		const found = tree()
		for (const page of ["tx", "received", "journal"]) {
			expect(found, page).toContainEqual({ file: `${PAGES}${page}/[id].vue`, target: SHARED_SHEET })
		}
		expect(found).toContainEqual({ file: `${PAGES}received/[id].vue`, target: `${PAGES}empty-state.module.css` })
	})

	const MODULE = `${SRC}/popup/components/modules/tx/Row.vue`
	const style = (body: string) => `<template><span /></template>\n<style module>\n.a { ${body} }\n</style>\n`
	test.each([
		["a relative path", MODULE, style('composes: x from "../../../pages/x.module.css";'), 1],
		["the @ alias, in single quotes", MODULE, style("composes: x from '@/popup/pages/x.module.css';"), 1],
		["the ~ alias, two names", MODULE, style('composes: x y from "~/popup/pages/x.module.css";'), 1],
		[
			"the rule's second composes",
			MODULE,
			style('composes: type--meta from global; composes: x from "../../../pages/x.module.css";'),
			1,
		],
		[
			"the src alias, from a plain sheet",
			`${SRC}/components/shared.module.scss`,
			'.a { composes: x from "src/popup/pages/x.module.css"; }',
			1,
		],
		["a page from a page's sheet", `${PAGES}tx/[id].vue`, style('composes: x from "../empty-state.module.css";'), 0],
		["a sibling sheet", MODULE, style('composes: x from "./detail-shared.module.css";'), 0],
		["the root-relative path", MODULE, style('composes: x from "/src/popup/pages/x.module.css";'), 1],
		["global", MODULE, style("composes: type--meta from global;"), 0],
	])("%s", (_case, file, source, count) => {
		expect(compositions(file, source).filter(upward)).toHaveLength(count)
	})
})
