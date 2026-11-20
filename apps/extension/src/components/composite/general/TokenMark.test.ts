import { describe, expect, test } from "vitest"
import { mount } from "@vue/test-utils"
import { TEST_BRIDGE_ICON, TEST_ICONS } from "@/wallet/services/token-list/list.fixture"
import TokenMark from "./TokenMark.vue"

const STUBS = {
	Icon: {
		props: ["name", "size", "color"],
		template: '<i data-testid="icon" :data-name="name" :data-size="size" :data-color="color" />',
	},
}

type Props = { symbol: string; icon?: string; bridgeIcon?: string; size: 16 | 20 | 32 | 36; badge: boolean }
const mountMark = (props: Partial<Props> = {}) =>
	mount(TokenMark, { props: { symbol: "USDC", size: 32, badge: false, ...props }, global: { stubs: STUBS } })
const root = (w: ReturnType<typeof mountMark>) => w.get('[data-testid="token-mark"]')
/** CSS module classes are hashed (`_disc_3f2a1b`); this reads the authored name. */
const hasClass = (el: { classes(): string[] }, name: string) => el.classes().some((c) => c === name || c.startsWith(`_${name}_`))
const bridge = (w: ReturnType<typeof mountMark>) => w.find('[data-testid="token-mark-bridge"]')

describe("composite/TokenMark", () => {
	test("a picture draws as an image of that data URL, decorative and not draggable", () => {
		const w = mountMark({ icon: TEST_ICONS.USDC })
		expect(root(w).attributes("data-kind")).toBe("logo")
		const img = w.get("img")
		expect(img.attributes("src")).toBe(TEST_ICONS.USDC)
		expect(img.attributes("alt")).toBe("")
		expect(img.attributes("draggable")).toBe("false")
		expect(w.text()).toBe("")
	})

	test("a picture is drawn on no disc: the mark adds no background around a logo", () => {
		const logo = root(mountMark({ icon: TEST_ICONS.USDC }))
		const initials = root(mountMark())
		expect(hasClass(logo, "disc")).toBe(false)
		expect(hasClass(initials, "disc")).toBe(true)
		expect(logo.attributes("style")).not.toMatch(/background|filter|clip/)
	})

	test("no picture draws the initials on the grey disc, with no image", () => {
		const w = mountMark({ symbol: "gbpc" })
		expect(root(w).attributes("data-kind")).toBe("initials")
		expect(w.find("img").exists()).toBe(false)
		expect(w.text()).toBe("GB")
	})

	test.each([
		[16, "U", "initials_10"],
		[20, "U", "initials_10"],
		[32, "US", "initials_12"],
		[36, "US", "initials_13"],
	] as const)("at %i px the mark is that square, with %s in %s", (size, letters, cls) => {
		const w = mountMark({ size })
		expect(root(w).attributes("style")).toContain(`width: ${size}px; height: ${size}px`)
		const text = w.get('[data-testid="token-mark"] > span')
		expect(text.text()).toBe(letters)
		expect(hasClass(text, cls)).toBe(true)
	})

	test("a picture keeps the size it is given", () => {
		expect(root(mountMark({ icon: TEST_ICONS.USDC, size: 16 })).attributes("style")).toContain("width: 16px; height: 16px")
	})

	test("a symbol with no letter or digit draws the empty value", () => {
		expect(mountMark({ symbol: "$$" }).text()).toBe("—")
	})

	test("the badge is the red warning glyph, 8 px under 24 px and 10 px from 24 px", () => {
		for (const [size, px] of [
			[16, "8"],
			[20, "8"],
			[32, "10"],
			[36, "10"],
		] as const) {
			const icon = mountMark({ size, badge: true }).get('[data-testid="icon"]')
			expect(icon.attributes()).toMatchObject({ "data-name": "warning", "data-color": "red", "data-size": px })
			expect(hasClass(icon, "badge")).toBe(true)
		}
	})

	test("no badge draws no glyph, on a logo or on initials", () => {
		expect(mountMark().find('[data-testid="icon"]').exists()).toBe(false)
		expect(mountMark({ icon: TEST_ICONS.USDC }).find('[data-testid="icon"]').exists()).toBe(false)
	})

	test("the badge sits on a logo as on initials", () => {
		const w = mountMark({ icon: TEST_ICONS.USDC, badge: true })
		expect(w.find("img").exists()).toBe(true)
		expect(w.findAll('[data-testid="icon"]')).toHaveLength(1)
	})

	test("a picture that fails to decode falls back to the initials, and a new picture is tried", async () => {
		const w = mountMark({ icon: TEST_ICONS.USDC })
		await w.get("img").trigger("error")
		expect(root(w).attributes("data-kind")).toBe("initials")
		expect(w.find("img").exists()).toBe(false)
		expect(w.text()).toBe("US")

		await w.setProps({ icon: TEST_ICONS.GBPC })
		expect(root(w).attributes("data-kind")).toBe("logo")
		expect(w.get("img").attributes("src")).toBe(TEST_ICONS.GBPC)
	})

	test("a picture taken away falls back to the initials", async () => {
		const w = mountMark({ icon: TEST_ICONS.USDC })
		await w.setProps({ icon: undefined })
		expect(root(w).attributes("data-kind")).toBe("initials")
	})

	test.each([
		[16, "8px", "-2px", "outline_1"],
		[20, "10px", "-2px", "outline_1"],
		[32, "16px", "-4px", "outline_1_5"],
		[36, "18px", "-4px", "outline_1_5"],
	] as const)(
		"at %i px a bridge picture draws after the logo, %s square and %s past the top right, with %s",
		(size, side, offset, outline) => {
			const w = mountMark({ icon: TEST_ICONS.USDC, bridgeIcon: TEST_BRIDGE_ICON, size })
			const [logo, badge] = w.findAll("img")
			expect(logo.attributes("data-testid")).toBe("token-mark-logo")
			expect(badge.attributes()).toMatchObject({
				"data-testid": "token-mark-bridge",
				src: TEST_BRIDGE_ICON,
				alt: "",
				draggable: "false",
			})
			expect(badge.attributes("style")).toBe(`width: ${side}; height: ${side}; top: ${offset}; right: ${offset};`)
			expect(hasClass(badge, outline)).toBe(true)
			expect(root(w).attributes("style")).toContain(`width: ${size}px; height: ${size}px`)
		},
	)

	test("a bridge picture draws over initials as over a logo, and none without one", () => {
		const initials = mountMark({ bridgeIcon: TEST_BRIDGE_ICON })
		expect(root(initials).attributes("data-kind")).toBe("initials")
		expect(bridge(initials).attributes("src")).toBe(TEST_BRIDGE_ICON)
		expect(bridge(mountMark({ icon: TEST_ICONS.USDC })).exists()).toBe(false)
	})

	test("the warning takes the corner: a flagged mark draws no bridge picture, an unflagged one does", () => {
		const flagged = mountMark({ icon: TEST_ICONS.USDC, bridgeIcon: TEST_BRIDGE_ICON, badge: true })
		expect(bridge(flagged).exists()).toBe(false)
		expect(flagged.findAll('[data-testid="icon"]')).toHaveLength(1)
		expect(bridge(mountMark({ icon: TEST_ICONS.USDC, bridgeIcon: TEST_BRIDGE_ICON })).exists()).toBe(true)
	})

	test("a bridge picture that fails to decode hides alone, and a new one is tried", async () => {
		const w = mountMark({ icon: TEST_ICONS.USDC, bridgeIcon: TEST_BRIDGE_ICON })
		await bridge(w).trigger("error")
		expect(bridge(w).exists()).toBe(false)
		expect(w.get('[data-testid="token-mark-logo"]').attributes("src")).toBe(TEST_ICONS.USDC)

		await w.setProps({ bridgeIcon: TEST_ICONS.GBPC })
		expect(bridge(w).attributes("src")).toBe(TEST_ICONS.GBPC)
	})

	test("the mark is hidden from assistive tech and is no tab stop", () => {
		for (const w of [
			mountMark(),
			mountMark({ icon: TEST_ICONS.USDC, badge: true }),
			mountMark({ icon: TEST_ICONS.USDC, bridgeIcon: TEST_BRIDGE_ICON }),
		]) {
			expect(root(w).attributes("aria-hidden")).toBe("true")
			expect(w.find("[tabindex]").exists()).toBe(false)
		}
	})
})
