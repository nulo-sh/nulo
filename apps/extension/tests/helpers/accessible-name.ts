/**
 * The name an assistive tool gives `target` from its own attributes (AccName steps 2B and 2C): the
 * text of each `aria-labelledby` id found inside `scope`, joined by a space, else its trimmed
 * `aria-label`, else "". Resolving ids only inside `scope` makes a name borrowed from another row
 * read as missing. Text is `textContent`, not `innerText`, which follows `text-transform`.
 */
export function accessibleName(target: Element, scope: Element): string {
	const referenced = (target.getAttribute("aria-labelledby") ?? "")
		.split(/\s+/)
		.filter(Boolean)
		.map((id) => scope.querySelector(`[id="${id}"]`))
		.filter((el) => el !== null)
	if (referenced.length > 0) return referenced.map((el) => collapse(el.textContent ?? "")).join(" ")
	return collapse(target.getAttribute("aria-label") ?? "")
}

const collapse = (text: string): string => text.replace(/\s+/g, " ").trim()
