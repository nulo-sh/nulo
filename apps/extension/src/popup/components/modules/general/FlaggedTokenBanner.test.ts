import { mount } from "@vue/test-utils"
import { Banner } from "@nulo/design"
import { describe, expect, test } from "vitest"
import FlaggedTokenBanner from "./FlaggedTokenBanner.vue"

describe("FlaggedTokenBanner", () => {
	test("an error banner with the signed title above the signed text", () => {
		const w = mount(FlaggedTokenBanner, { global: { components: { Banner } } })
		const banner = w.findComponent(Banner)
		expect(banner.props()).toMatchObject({ variant: "error", direction: "vertical" })
		expect(w.attributes("data-testid")).toBe("token-flagged-banner")
		const lines = w.findAll("span").map((s) => s.text())
		expect(lines).toEqual([
			"Nulo flagged this token as a scam",
			"Its name and balance can be fake. Do not buy it or follow links that promote it.",
		])
	})
})
