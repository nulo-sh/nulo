/** The text a sighted person reads in `el`: a dotted term's always-mounted definition is `hidden`. */
export function shownText(el: Element): string {
	const clone = el.cloneNode(true) as Element
	for (const node of clone.querySelectorAll("[hidden]")) node.remove()
	return clone.textContent?.replace(/\s+/g, " ").trim() ?? ""
}
