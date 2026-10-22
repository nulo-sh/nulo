import { describe, expect, test, vi } from "vitest"
import { showSnack } from "./snack"

describe("showSnack", () => {
	test("opens a success or an error with the label it carries", () => {
		const openToast = vi.fn()
		showSnack(openToast, { kind: "success", label: "Account imported" })
		showSnack(openToast, { kind: "error", label: "Contact import canceled" })
		expect(openToast.mock.calls).toEqual([
			[{ kind: "success", label: "Account imported" }],
			[{ kind: "error", label: "Contact import canceled" }],
		])
	})
})
