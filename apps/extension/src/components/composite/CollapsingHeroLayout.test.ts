import { afterEach, describe, expect, test, vi } from "vitest"
import { flushPromises, mount } from "@vue/test-utils"
import { ScrollMoreButton } from "@nulo/design"
import { defineComponent, h, ref } from "vue"
import CollapsingHeroLayout from "./CollapsingHeroLayout.vue"

const STUBS = {
	Flex: {
		// v-bind="$attrs" mirrors the real Flex, which inherits fallthrough
		// attrs onto its root div — the layout's attr-forwarding contract.
		template: '<div :ref="forwardRef" v-bind="$attrs"><slot /></div>',
		props: ["forwardRef"],
		inheritAttrs: false,
	},
	SubPageHeader: {
		template: '<header><slot name="title" /></header>',
		props: ["backTo"],
	},
}

const factory = (props: Record<string, unknown> = {}, slots: Record<string, string> = {}) =>
	mount(CollapsingHeroLayout, {
		props: {
			heroMain: "Secret",
			heroSub: "Key",
			collapsingLabel: "Secret Key",
			backTo: "/popup/settings/security/export",
			...props,
		},
		slots,
		global: { stubs: STUBS, components: { ScrollMoreButton } },
	})

/** A Flex that exposes its root as `wrapper`, as the real one does, so the layout finds its scroller. */
const ExposingFlex = defineComponent({
	inheritAttrs: false,
	setup(_, { attrs, expose, slots }) {
		const wrapper = ref<HTMLElement | null>(null)
		expose({ wrapper })
		return () => h("div", { ...attrs, ref: wrapper }, slots.default?.())
	},
})

/** A `moreBelow` layout whose scroller holds 700 px in a 445 px view, scrolled to `scrollTop`. */
async function scrolled(scrollTop: number, props: Record<string, unknown> = { moreBelow: true }) {
	const w = mount(CollapsingHeroLayout, {
		props: { heroMain: "Delete", collapsingLabel: "Delete", backTo: "/x", ...props },
		global: { stubs: { ...STUBS, Flex: ExposingFlex }, components: { ScrollMoreButton } },
	})
	await flushPromises()
	const scroller = w.get('[data-testid="collapsing-hero-scroller"]').element as HTMLElement
	Object.defineProperties(scroller, {
		scrollHeight: { value: 700, configurable: true },
		clientHeight: { value: 445, configurable: true },
	})
	scroller.scrollTop = scrollTop
	scroller.scrollTo = vi.fn() as unknown as HTMLElement["scrollTo"]
	scroller.dispatchEvent(new Event("scroll"))
	await flushPromises()
	return { w, scroller }
}

afterEach(() => document.documentElement.classList.remove("noanimations"))

describe("the more-below button", () => {
	test("a layout without moreBelow has neither the button nor the room after its content", async () => {
		const { w } = await scrolled(0, {})
		expect(w.find('[data-testid="scroll-more"]').exists()).toBe(false)
		expect(w.html()).not.toContain("padding-bottom")
	})

	test("it shows only while more than its 48 px footprint is left, and 28 px of room follow the content", async () => {
		const at = async (scrollTop: number) => (await scrolled(scrollTop)).w.find('[data-testid="scroll-more"]').exists()
		expect(await at(207)).toBe(false)
		expect(await at(206.5)).toBe(true)
		expect((await scrolled(0)).w.html()).toContain("padding-bottom: 28px")
	})

	test("a press scrolls smoothly to the end when no section is marked", async () => {
		const { w, scroller } = await scrolled(0)
		await w.get('[data-testid="scroll-more"]').trigger("click")
		expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 255, behavior: "smooth" })
	})

	test("under Disable animations a press jumps", async () => {
		document.documentElement.classList.add("noanimations")
		const { w, scroller } = await scrolled(0)
		await w.get('[data-testid="scroll-more"]').trigger("click")
		expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 255, behavior: "auto" })
	})
})

describe("composite/CollapsingHeroLayout", () => {
	test("renders heroMain in the title stack", () => {
		const w = factory({ heroMain: "Encrypted" })
		expect(w.text()).toContain("Encrypted")
	})

	test("renders heroSub when provided", () => {
		const w = factory({ heroMain: "Plain", heroSub: "Key" })
		const text = w.text()
		expect(text).toContain("Plain")
		expect(text).toContain("Key")
	})

	test("omits the heroSub line when heroSub is empty", () => {
		const w = factory({ heroMain: "Solo", heroSub: "" })
		// Only one title element renders.
		const titles = w.findAll("span").filter((s) => s.text() === "Solo")
		expect(titles.length).toBe(1)
	})

	test("collapsingLabel renders inside the SubPageHeader, hidden from a screen reader, which reads the hero", () => {
		const w = factory({ collapsingLabel: "Plain Key" })
		const label = w.get("header span")
		expect(label.text()).toBe("Plain Key")
		expect(label.attributes("aria-hidden")).toBe("true")
	})

	test("default slot renders inside the content area", () => {
		const w = factory({}, { default: '<p data-testid="body-content">body</p>' })
		expect(w.find('[data-testid="body-content"]').exists()).toBe(true)
	})

	test("bottom slot renders in a dedicated bottom container", () => {
		const w = factory({}, { bottom: '<button data-testid="cta-bottom">Go</button>' })
		expect(w.find('[data-testid="cta-bottom"]').exists()).toBe(true)
	})

	test("bottom container is omitted when bottom slot is empty", () => {
		const w = factory()
		// The bottom slot gates the wrapper; with no slot, we shouldn't have a bottom div.
		// With Flex stubbed as a div, all top-level divs come from <Flex>. The bottom <div>
		// uses CSS module class — assert no <div> with the bottom class is present.
		const html = w.html()
		expect(html).not.toMatch(/class="[^"]*bottom[^"]*"/)
	})

	test("default tone renders no destructive classes", () => {
		const w = factory()
		expect(w.html()).not.toContain("destructive")
	})

	test("destructive tone reds the hero title and bar", () => {
		const w = factory({ tone: "destructive" })
		expect(w.html()).toMatch(/title_main_destructive/)
		expect(w.html()).toMatch(/hero_bar_destructive/)
	})

	test("overlay slot renders bare after the bottom bar", () => {
		const w = factory({}, { overlay: '<dialog data-testid="ceremony">x</dialog>' })
		expect(w.find('[data-testid="ceremony"]').exists()).toBe(true)
	})

	test("extra attributes fall through to the root element", () => {
		const w = mount(CollapsingHeroLayout, {
			props: { heroMain: "X", collapsingLabel: "X", backTo: "/x" },
			attrs: { "data-profile-name": "acc-1" },
			global: { stubs: STUBS },
		})
		expect(w.attributes("data-profile-name")).toBe("acc-1")
	})
})
