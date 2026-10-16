import editorShadowCss from "./editor-shadow.css?inline"

/** An open shadow root for a CodeMirror host: CodeMirror adopts its theme there instead of writing
 *  the `<style>` that `style-src` blocks, beside the page rules no document sheet reaches. */
export function editorShadowRoot(host: HTMLElement): ShadowRoot {
	const root = host.attachShadow({ mode: "open" })
	const sheet = new CSSStyleSheet()
	sheet.replaceSync(editorShadowCss)
	// Before the editor mounts: CodeMirror prepends its own sheet then, which a later assignment drops.
	root.adoptedStyleSheets = [sheet]
	return root
}
