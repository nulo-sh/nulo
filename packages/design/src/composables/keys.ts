/** A composing keydown. An IME's boundary keydown can report `isComposing` false, so `keyCode` 229
 *  counts too. */
export function isComposing(e: KeyboardEvent): boolean {
	return e.isComposing || e.keyCode === 229
}

export function isRepeatOrComposing(e: KeyboardEvent): boolean {
	return e.repeat || isComposing(e)
}
