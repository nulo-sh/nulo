import { mount } from "@vue/test-utils"
import { describe, expect, test, vi } from "vitest"
import type { TakeoverContent } from "./takeover"
import TakeoverLayout from "./TakeoverLayout.vue"

const base = (over: Partial<TakeoverContent> = {}): TakeoverContent => ({
	eyebrow: { icon: "refresh", text: "EYEBROW" },
	title: "Title",
	body: "Body.",
	primary: { text: "GO", testid: "x-go", action: vi.fn() },
	...over,
})

function mountLayout(content: TakeoverContent, props: Record<string, unknown> = {}, slot?: string) {
	return mount(TakeoverLayout, {
		props: { content, chip: "TESTNET", testidPrefix: "x", ...props },
		slots: slot ? { default: slot } : {},
		global: {
			stubs: {
				Flex: { template: "<div><slot /></div>" },
				Icon: { template: '<i :data-icon="name" :data-color="color" :data-size="size" />', props: ["name", "color", "size"] },
			},
		},
	})
}

const byId = (w: ReturnType<typeof mountLayout>, id: string) => w.find(`[data-testid="${id}"]`)

describe("TakeoverLayout", () => {
	test("renders the eyebrow, title and body under the prefixed testids", () => {
		const w = mountLayout(base())
		expect(byId(w, "x-takeover").exists()).toBe(true)
		expect(byId(w, "x-title").text()).toBe("Title")
		expect(w.text()).toContain("EYEBROW")
		expect(w.text()).toContain("Body.")
	})

	test("the optional notice, box and note render only when given", () => {
		const bare = mountLayout(base())
		for (const part of ["x-notice", "x-box", "x-note"]) expect(byId(bare, part).exists()).toBe(false)

		const full = mountLayout(base({ notice: "Careful.", box: { lines: [{ text: "One." }] }, note: "Aside." }))
		expect(byId(full, "x-notice").text()).toBe("Careful.")
		expect(byId(full, "x-box").text()).toBe("One.")
		expect(byId(full, "x-note").text()).toBe("Aside.")
	})

	test("a box line carries its label, its number or its mark, and its own testid", () => {
		const w = mountLayout(
			base({
				box: {
					label: "LABEL",
					lines: [
						{ text: "First.", number: 1 },
						{ text: "Checked.", mark: "check", testid: "x-line" },
						{ text: "Gone.", mark: "cross" },
					],
				},
			}),
		)
		expect(byId(w, "x-box").text()).toContain("LABEL")
		expect(byId(w, "x-box").text()).toContain("1")
		expect(byId(w, "x-line").find("[data-icon]").attributes("data-icon")).toBe("check")
		expect(
			byId(w, "x-box")
				.findAll("[data-icon]")
				.map((i) => i.attributes("data-icon")),
		).toEqual(["check", "close"])
	})

	test("the eyebrow's mark is a warning unless the content names its color", () => {
		const eyebrowColor = (w: ReturnType<typeof mountLayout>) => w.findAll("[data-icon]")[1]?.attributes("data-color")
		expect(eyebrowColor(mountLayout(base()))).toBe("txt-warning")
		expect(eyebrowColor(mountLayout(base({ eyebrow: { icon: "add", text: "NEW", color: "primary" } })))).toBe("primary")
	})

	test("the primary and each outlined action run their own action", async () => {
		const secondary = { text: "TWO", testid: "x-two", action: vi.fn() }
		const tertiary = { text: "THREE", testid: "x-three", action: vi.fn() }
		const content = base({ secondary, tertiary })
		const w = mountLayout(content)
		await byId(w, "x-go").trigger("click")
		await byId(w, "x-two").trigger("click")
		await byId(w, "x-three").trigger("click")
		expect(content.primary.action).toHaveBeenCalledOnce()
		expect(secondary.action).toHaveBeenCalledOnce()
		expect(tertiary.action).toHaveBeenCalledOnce()
	})

	test("busy disables the primary and every guarded action, and leaves the others", () => {
		const content = base({
			secondary: { text: "TWO", testid: "x-two", action: vi.fn(), guarded: true },
			tertiary: { text: "THREE", testid: "x-three", action: vi.fn() },
		})
		const idle = mountLayout(content)
		expect(byId(idle, "x-go").attributes("disabled")).toBeUndefined()
		const busy = mountLayout(content, { busy: true })
		expect(byId(busy, "x-go").attributes("disabled")).toBeDefined()
		expect(byId(busy, "x-two").attributes("disabled")).toBeDefined()
		expect(byId(busy, "x-three").attributes("disabled")).toBeUndefined()
	})

	test("a held Enter's repeat never reaches the primary", async () => {
		const w = mountLayout(base())
		const repeat = new KeyboardEvent("keydown", { key: "Enter", repeat: true, cancelable: true })
		byId(w, "x-go").element.dispatchEvent(repeat)
		expect(repeat.defaultPrevented).toBe(true)
		const first = new KeyboardEvent("keydown", { key: "Enter", cancelable: true })
		byId(w, "x-go").element.dispatchEvent(first)
		expect(first.defaultPrevented).toBe(false)
	})

	test("the chip shows its label, a square only when flagged, and reports a press", async () => {
		const plain = mountLayout(base())
		expect(byId(plain, "x-chip").text()).toBe("TESTNET")
		expect(byId(plain, "x-chip").find("span").exists()).toBe(false)
		await byId(plain, "x-chip").trigger("click")
		expect(plain.emitted("chip")).toHaveLength(1)
		expect(
			byId(mountLayout(base(), { flagged: true }), "x-chip")
				.find("span")
				.exists(),
		).toBe(true)
	})

	test("the lock chip is the padlock alone, named for what it does, and reports a press", async () => {
		const w = mountLayout(base())
		const lock = byId(w, "x-lock")
		expect(lock.get("[data-icon]").attributes()).toMatchObject({ "data-icon": "lock", "data-size": "15" })
		expect(lock.text()).toBe("")
		expect(lock.attributes("aria-label")).toBe("Lock wallet")
		expect(lock.attributes("type")).toBe("button")
		await lock.trigger("click")
		expect(w.emitted("lock")).toHaveLength(1)
	})

	test("a density tightens the content, and the default slot renders inside the screen", () => {
		const w = mountLayout(base(), { density: "dense_tight" }, '<div data-testid="x-slot" />')
		expect(byId(w, "x-takeover").find('[data-testid="x-slot"]').exists()).toBe(true)
		expect(w.html()).toMatch(/dense_tight/)
	})

	test("attributes fall through to the screen's root", () => {
		const w = mount(TakeoverLayout, {
			props: { content: base(), chip: "TESTNET", testidPrefix: "x" },
			attrs: { "data-screen": "arrival" },
			global: { stubs: { Flex: { template: "<div><slot /></div>" }, Icon: true } },
		})
		expect(w.attributes("data-screen")).toBe("arrival")
	})
})
