/**
 * The logs and JSON viewers' CodeMirror editor, which lives in its host's shadow root. The host
 * carries the testid; below it a spec reaches CodeMirror's own elements by its documented `cm-`
 * classes, the one exception the e2e selector rule makes.
 */
import type { Page } from "puppeteer"

export type EditorHost = "logs-editor" | "json-editor"

export interface EditorStyles {
	/** CodeMirror's base theme. */
	display: string
	/** The viewer's theme, as the scroller computes it. */
	fontSize: string
	/** A page rule the shadow root carries. */
	scrollbarWidth: string
}

/** Computed styles only the editor's adopted sheets give; null until the editor has mounted. */
export function readEditorStyles(page: Page, host: EditorHost): Promise<EditorStyles | null> {
	return page.evaluate((id) => {
		const root = document.querySelector(`[data-testid="${id}"]`)?.shadowRoot
		const [editor, scroller, content] = [".cm-editor", ".cm-scroller", ".cm-content"].map((cls) => root?.querySelector(cls))
		if (!editor || !scroller || !content) return null
		return {
			display: getComputedStyle(editor).display,
			fontSize: getComputedStyle(scroller).fontSize,
			scrollbarWidth: getComputedStyle(content).scrollbarWidth,
		}
	}, host)
}

/** The editor's rendered text once it has some; CodeMirror renders only the lines near the view. */
export async function editorText(page: Page, host: EditorHost, timeout = 10_000): Promise<string> {
	const shown = await page.waitForFunction(
		(id) =>
			(
				document.querySelector(`[data-testid="${id}"]`)?.shadowRoot?.querySelector(".cm-content") as HTMLElement | null
			)?.innerText.trim() || false,
		{ timeout, polling: 100 },
		host,
	)
	return (await shown.jsonValue()) as string
}
