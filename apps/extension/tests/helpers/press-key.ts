import { sendEvent } from "./send-event"

/**
 * Presses `key` on `el` the way a browser activates a focused button: focus, a cancelable keydown
 * (`init` sets its `repeat`, `isComposing` or `keyCode`), then a click on that keydown for Enter, or
 * on the keyup for Space, unless a handler cancelled the key. Each goes through `sendEvent`, so a
 * disabled `el` gets none, as a browser sends nothing to a control it cannot focus. It simulates a
 * button's activation only and proves nothing about native form submission or browser timing, so a
 * field case dispatches a plain keydown on the field instead.
 *
 * @returns Whether each key event was sent and went through uncancelled.
 */
export function pressOn(el: HTMLElement, key: "Enter" | " ", init: KeyboardEventInit = {}): boolean[] {
	el.focus()
	const down = wentThrough(sendEvent(el, "keydown", { key, ...init }))
	if (key === "Enter") {
		if (down) sendEvent(el, "click")
		return [down]
	}
	const up = wentThrough(sendEvent(el, "keyup", { key }))
	if (down && up) sendEvent(el, "click")
	return [down, up]
}

const wentThrough = (ev: Event | undefined) => ev !== undefined && !ev.defaultPrevented
