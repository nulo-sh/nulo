/** `target`'s `aria-labelledby` ids, in order. */
export const labelIds = (target: Element): string[] => (target.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean)

/**
 * The plain-text name `target`'s own attributes give it: the `textContent` of the first element in
 * `root` carrying each `aria-labelledby` id, as `getElementById` resolves it, joined by a space; else
 * its trimmed `aria-label`; else "". A subset of AccName 2B/2C, without its hidden-content and
 * recursion rules; `textContent`, not `innerText`, which follows `text-transform`.
 */
export function accessibleName(target: Element, root: ParentNode): string {
	const referenced = labelIds(target)
		.map((id) => root.querySelector(`[id="${id}"]`))
		.filter((el) => el !== null)
	if (referenced.length > 0) return referenced.map((el) => collapse(el.textContent ?? "")).join(" ")
	return collapse(target.getAttribute("aria-label") ?? "")
}

const collapse = (text: string): string => text.replace(/\s+/g, " ").trim()
