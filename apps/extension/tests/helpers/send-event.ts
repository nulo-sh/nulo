import { DOMWrapper } from "@vue/test-utils"

/**
 * Sends `type` to `el` as a person's later action and returns the event. A raw `click()` or
 * `dispatchEvent` in the millisecond a Vue listener was attached reaches only the first Vue listener
 * on its path, so a test that needs another passes by the clock; `trigger` stamps the event after
 * every render and dispatches it before its promise resolves.
 *
 * Light DOM and a plain type only. `init` names properties of the event's own interface (`key`,
 * `repeat`, `button`): an inherited one (`detail`, `bubbles`) makes `trigger` send nothing. The event
 * is a non-composed `MouseEvent` where `click()` sends a composed `PointerEvent`.
 *
 * @returns `undefined` when `el` has its own `disabled` attribute, which `trigger` skips; throws when
 * nothing else was sent.
 */
export function sendEvent(el: Element, type: string, init: Record<string, unknown> = {}): Event | undefined {
	const root = el.getRootNode()
	const top = root instanceof Document ? (root.defaultView ?? root) : root
	let sent: Event | undefined
	const take = (e: Event) => {
		sent ??= e
	}
	top.addEventListener(type, take, { capture: true })
	try {
		void new DOMWrapper(el).trigger(type, init)
	} finally {
		top.removeEventListener(type, take, { capture: true })
	}
	if (!sent && !el.hasAttribute("disabled")) throw new Error(`no ${type} was sent to ${el.tagName}`)
	return sent
}
