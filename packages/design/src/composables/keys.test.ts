import { describe, expect, test } from "vitest"
import { isComposing, isRepeatOrComposing } from "./keys"

describe("key guards", () => {
	test.each([
		["a plain key", {}, false, false],
		["an auto-repeat", { repeat: true }, false, true],
		["a composing key", { isComposing: true }, true, true],
		["an IME boundary key that reports no composition", { keyCode: 229 }, true, true],
	])("%s", (_case, init, composing, refused) => {
		const e = new KeyboardEvent("keydown", { key: "Enter", ...init })
		expect([isComposing(e), isRepeatOrComposing(e)]).toEqual([composing, refused])
	})
})
