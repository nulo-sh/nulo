/** jsdom's `ShadowRoot` has no `adoptedStyleSheets`: the helper's assignment stands in for it, which
 *  sends CodeMirror down the adopted-sheet path a browser takes. */
import { readFileSync } from "node:fs"
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { resolveExportedAsset } from "@nulo/resolve-asset"
import { afterEach, expect, test } from "vitest"
import jsonViewerSfc from "./JsonViewer.vue?raw"
import editorShadowCss from "./editor-shadow.css?inline"
import { editorShadowRoot } from "./editor-shadow"

const rulesOf = (css: string): string[] => {
	const sheet = new CSSStyleSheet()
	sheet.replaceSync(css)
	return [...sheet.cssRules].map((rule) => rule.cssText)
}

/** The page rules the editors' elements match, measured in both browsers. `.noanimations *` is left
 *  out: it only removes transitions, and no editor element has one. */
const MATCHED_SELECTORS = ["*,\n*::before,\n*::after", "*", "*::-webkit-scrollbar", "button", "input", "::selection"]

const cleanups: (() => void)[] = []
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup()
})

test("the editor mounts in the host's shadow root, its theme adopted there, and no <style> is written", () => {
	const host = document.body.appendChild(document.createElement("div"))
	const view = new EditorView({ state: EditorState.create({ doc: "{}" }), parent: editorShadowRoot(host) })
	cleanups.push(() => {
		view.destroy()
		host.remove()
	})
	const root = host.shadowRoot
	if (!root) throw new Error("no shadow root")

	expect(root.contains(view.dom)).toBe(true)
	expect(document.querySelectorAll("style")).toHaveLength(0)
	expect(root.querySelectorAll("style")).toHaveLength(0)
	const adopted = root.adoptedStyleSheets.map((sheet) => [...sheet.cssRules].map((rule) => rule.cssText))
	expect(adopted).toHaveLength(2)
	expect(adopted[0].some((rule) => rule.includes(".cm-"))).toBe(true)
	// Last, as the page's stylesheets followed CodeMirror's `<style>` at the head's start: an equal
	// selector resolves as it did in the document.
	expect(adopted[1]).toEqual(rulesOf(editorShadowCss))
})

test("it carries exactly the page rules the editor matched, verbatim", () => {
	const jsonViewerCss = /<style module>([\s\S]*?)<\/style>/.exec(jsonViewerSfc)?.[1] ?? ""
	const baseCss = readFileSync(resolveExportedAsset("@nulo/design", "./base.css", { from: import.meta.url }), "utf8")
	const pageRules = [...rulesOf(baseCss), ...rulesOf(jsonViewerCss)]
	const sourceOf = (selector: string) => pageRules.find((rule) => rule.startsWith(`${selector} {`))
	const carried = rulesOf(editorShadowCss)
	expect(carried.map((rule) => rule.slice(0, rule.indexOf(" {")))).toEqual(MATCHED_SELECTORS)
	for (const [i, selector] of MATCHED_SELECTORS.entries()) expect(carried[i]).toBe(sourceOf(selector))
})
