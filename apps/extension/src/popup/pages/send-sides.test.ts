import { describe, expect, test } from "vitest"
import { openingSendSide } from "./send-sides"

describe("openingSendSide", () => {
	test.each([
		["public only", "public", { publicBalance: "1000", privateBalance: "0" }],
		["public only, private side absent", "public", { publicBalance: "1000" }],
		["private only", "private", { publicBalance: "0", privateBalance: "1000" }],
		["both sides", "private", { publicBalance: "1000", privateBalance: "1" }],
		["neither side", "private", { publicBalance: "0", privateBalance: "0" }],
		["no row", "private", undefined],
		["a malformed public side", "private", { publicBalance: "1e3", privateBalance: "0" }],
		["a malformed private side", "private", { publicBalance: "1000", privateBalance: "-1" }],
	])("%s opens on %s", (_, side, row) => {
		expect(openingSendSide(row)).toBe(side)
	})
})
