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
 * Static ban: a feature's sheet is composed only from inside that feature's folder. The sheet moves
 * and changes with its feature, so a composer elsewhere breaks or restyles silently, and Biome's
 * import rules never read a CSS `composes`. A look several features share lives in `src/components/`,
 * at or below its lowest consumer. `REVIEWED` lists the compositions that predate the ban; it only
 * shrinks.
 */

const POLICY: SourcePolicy = { roots: SCAN_ROOTS, exts: ["vue", "css", "scss"], skip: [TEST_FILE, STORY_FILE] }
const SRC = "apps/extension/src"
const PAGES = `${SRC}/popup/pages/`
const SHARED_SHEET = `${SRC}/popup/components/modules/tx/detail-shared.module.css`
/** The extension's Vite aliases for `src` and its root-relative path: every SFC it bundles,
 *  `@nulo/design`'s included, resolves through them. */
const ALIASES = ["@/", "~/", "src/", "/src/"]
/** The folders whose sheets belong to one feature, in match order. `src/components/` is the shared
 *  layer; a sheet anywhere else under `src/` belongs to its own directory. */
const FEATURE_FOLDERS = [
	/^popup\/pages\//,
	/^popup\/windows\/[^/]+\//,
	/^popup\/windows\//,
	/^popup\/components\/modules\/[^/]+\//,
	/^popup\/components\/popups\//,
	/^onboarding\//,
]

type Composition = { file: string; target: string; name: string }
type Reviewed = { file: string; target: string; names: readonly string[]; why: string }

const DETAIL_PAGE_WHY = "a detail page renders the tx rows, and their sheet sits at its lowest consumer (#1966)"
const REVIEWED: readonly Reviewed[] = [
	{
		file: `${SRC}/popup/windows/execute/OperationCard.vue`,
		target: `${SRC}/popup/components/modules/send/fee-shared.module.css`,
		names: ["fee_label"],
		why: "the execute window's fee label is the send fee sheet's",
	},
	{
		file: `${SRC}/popup/pages/settings/developer/account-state/notes/index.vue`,
		target: `${SRC}/popup/components/modules/settings/record-card.module.css`,
		names: ["card", "header", "type", "kv_grid", "kv_key", "kv_val", "kv_val_wrap"],
		why: "the developer notes page lays its notes out as settings record cards",
	},
	{
		file: `${SRC}/popup/components/popups/IncomingTrustPopup.vue`,
		target: SHARED_SHEET,
		names: ["hero_link"],
		why: "the trust popup's contract link is the detail hero's link",
	},
	{
		file: `${PAGES}tx/[id].vue`,
		target: SHARED_SHEET,
		names: [
			"wrapper",
			"content",
			"amount_fiat",
			"amount_value",
			"amount_symbol",
			"caption",
			"type_chip",
			"address_pair",
			"details_box",
			"detail_key",
			"app_key",
			"app_value",
			"detail_link",
			"empty_headline",
			"empty_sub",
		],
		why: DETAIL_PAGE_WHY,
	},
	{
		file: `${PAGES}received/[id].vue`,
		target: SHARED_SHEET,
		names: [
			"wrapper",
			"content",
			"amount_value",
			"amount_symbol",
			"amount_fiat",
			"type_chip",
			"address_pair",
			"details_box",
			"detail_key",
			"detail_value_aux",
			"detail_value_mono",
			"detail_link",
			"empty_headline",
			"empty_sub",
		],
		why: DETAIL_PAGE_WHY,
	},
	{
		file: `${PAGES}journal/[id].vue`,
		target: SHARED_SHEET,
		names: [
			"wrapper",
			"content",
			"amount_value",
			"amount_symbol",
			"amount_fiat",
			"type_chip",
			"details_box",
			"detail_key",
			"detail_value_mono",
			"app_key",
			"app_value",
			"detail_link",
			"empty_headline",
			"empty_sub",
		],
		why: DETAIL_PAGE_WHY,
	},
]

/** The repo-relative sheet `spec` names from `file`, or undefined for a package's sheet. */
function resolveSheet(file: string, spec: string): string | undefined {
	if (spec.startsWith("./") || spec.startsWith("../")) return posix.normalize(posix.join(posix.dirname(file), spec))
	const alias = ALIASES.find((prefix) => spec.startsWith(prefix))
	return alias === undefined ? undefined : posix.join(SRC, spec.slice(alias.length))
}

/** The folder that owns `sheet`, or undefined for a shared home. */
function ownerOf(sheet: string): string | undefined {
	if (!sheet.startsWith(`${SRC}/`)) return undefined
	const rel = sheet.slice(SRC.length + 1)
	if (rel.startsWith("components/")) return undefined
	const folder = FEATURE_FOLDERS.map((pattern) => rel.match(pattern)?.[0]).find((match) => match !== undefined)
	return folder === undefined ? `${posix.dirname(sheet)}/` : `${SRC}/${folder}`
}

function compositions(file: string, source: string): Composition[] {
	return parseSource(file, source).styles.flatMap(({ root }) => {
		const found: Composition[] = []
		root.walkDecls(/^composes$/i, (decl) => {
			const match = decl.value.match(/^(.+?)\s+from\s+(["'])(.+)\2\s*$/)
			const target = match === null ? undefined : resolveSheet(file, match[3])
			if (match === null || target === undefined) return
			for (const name of match[1].trim().split(/\s+/)) found.push({ file, target, name })
		})
		return found
	})
}

const crossFeature = ({ file, target }: Composition): boolean => {
	const owner = ownerOf(target)
	return owner !== undefined && !file.startsWith(owner)
}

const keyOf = ({ file, target, name }: Composition): string => `${file} → ${target} .${name}`
const REVIEWED_KEYS = new Set(REVIEWED.flatMap(({ file, target, names }) => names.map((name) => keyOf({ file, target, name }))))
const unreviewed = (found: Composition[]): Composition[] => found.filter(crossFeature).filter((c) => !REVIEWED_KEYS.has(keyOf(c)))

const tree = (): Composition[] => sourceFiles(POLICY).flatMap((file) => compositions(file, readFileSync(join(REPO_ROOT, file), "utf8")))

describe("no stylesheet outside a feature's folder composes that feature's sheet", () => {
	test("every cross-feature composition in the tree is reviewed", () => {
		expect(unreviewed(tree()).map(keyOf)).toEqual([])
	})

	test("every reviewed composition is still in the tree", () => {
		const found = new Set(tree().filter(crossFeature).map(keyOf))
		expect([...REVIEWED_KEYS].filter((key) => !found.has(key))).toEqual([])
	})

	test("the scan reads the detail pages, a page's own sheet and the shared homes", () => {
		const pairs = tree().map(({ file, target }) => ({ file, target }))
		for (const page of ["tx", "received", "journal"]) {
			expect(pairs, page).toContainEqual({ file: `${PAGES}${page}/[id].vue`, target: SHARED_SHEET })
		}
		expect(pairs).toContainEqual({ file: `${PAGES}received/[id].vue`, target: `${PAGES}empty-state.module.css` })
		expect(pairs).toContainEqual({
			file: `${SRC}/popup/windows/execute/SendTxSummary.vue`,
			target: `${SRC}/components/text-action.module.css`,
		})
		expect(pairs).toContainEqual({ file: `${SRC}/popup/windows/verify/index.vue`, target: `${SRC}/components/a11y.module.css` })
	})

	const MODULE = `${SRC}/popup/components/modules/tx/Row.vue`
	const WINDOW = `${SRC}/popup/windows/fee/index.vue`
	const OPERATION_CARD = `${SRC}/popup/windows/execute/OperationCard.vue`
	const style = (body: string) => `<template><span /></template>\n<style module>\n.a { ${body} }\n</style>\n`
	test.each([
		["a relative path", MODULE, style('composes: x from "../../../pages/x.module.css";'), 1],
		["the @ alias, in single quotes", MODULE, style("composes: x from '@/popup/pages/x.module.css';"), 1],
		["the ~ alias, two names", MODULE, style('composes: x y from "~/popup/pages/x.module.css";'), 2],
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
		["a window, from a module's sheet", WINDOW, style('composes: x from "@/popup/components/modules/send/fee-shared.module.css";'), 1],
		["a module, from another module's sheet", MODULE, style('composes: x from "../send/fee-shared.module.css";'), 1],
		[
			"a popup, from a window's sheet",
			`${SRC}/popup/components/popups/P.vue`,
			style('composes: x from "@/popup/windows/fee/x.module.css";'),
			1,
		],
		[
			"a component, from onboarding's sheet",
			`${SRC}/components/composite/C.vue`,
			style('composes: x from "@/onboarding/pages/x.module.css";'),
			1,
		],
		["a page, from the windows' own sheet", `${PAGES}send.vue`, style('composes: x from "../windows/window-shell.module.css";'), 1],
		["a window, from the windows' own sheet", WINDOW, style('composes: x from "../window-shell.module.css";'), 0],
		["a module, from a sheet in an unlisted folder", MODULE, style('composes: x from "@/utils/x.module.css";'), 1],
		["a module, from a shared component sheet", MODULE, style('composes: visually_hidden from "@/components/a11y.module.css";'), 0],
		[
			"a module, from a composite feature's sheet",
			MODULE,
			style('composes: chip from "../../../../components/composite/activity/activity-card.module.css";'),
			0,
		],
		["a module, from a package's sheet", MODULE, style('composes: x from "@nulo/design/x.module.css";'), 0],
		[
			"a reviewed composition",
			OPERATION_CARD,
			style('composes: fee_label from "@/popup/components/modules/send/fee-shared.module.css";'),
			0,
		],
		[
			"a new name across a reviewed pair",
			OPERATION_CARD,
			style('composes: whole from "@/popup/components/modules/send/fee-shared.module.css";'),
			1,
		],
	])("%s", (_case, file, source, count) => {
		expect(unreviewed(compositions(file, source))).toHaveLength(count)
	})
})
