import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import PasskeyScreen from "./PasskeyScreen.vue"

const SOURCE = readFileSync(resolve(__dirname, "PasskeyScreen.vue"), "utf8")

type Props = InstanceType<typeof PasskeyScreen>["$props"]

const WAITING = {
	tag: "Unlock · Alice",
	title: ["Use your", "passkey"],
	body: "Confirm the request from your browser or password manager.",
	note: "On Firefox, Nulo uses this window for passkeys.",
} satisfies Partial<Props>

const mountScreen = (
	props: Pick<Props, "layout" | "tone"> & Partial<Props>,
	actions = "<button data-testid='host-cancel'>Cancel</button>",
) => mount(PasskeyScreen, { props: { ...WAITING, ...props }, slots: { actions } })

const glyphs = (w: ReturnType<typeof mountScreen>) => w.findAll('[class*="glyph"]')
const foot = (w: ReturnType<typeof mountScreen>) => w.find('[class*="foot"]')

describe("PasskeyScreen", () => {
	test("the window shows the wordmark, the tag, the two-line title, the body and the note", () => {
		const w = mountScreen({ layout: "window", tone: "waiting" })
		const title = w.find("h1")

		expect(w.find('[class*="wordmark"]').text()).toBe("Nulo")
		expect(w.text()).toContain("Unlock · Alice")
		expect(title.findAll("span").map((s) => s.text())).toEqual(["Use your", "passkey"])
		expect(title.classes().join(" ")).not.toMatch(/compact/)
		expect(w.find('[role="status"]').text()).toBe(WAITING.body)
		expect(w.text()).toContain(WAITING.note)
	})

	test("the card puts the glyph beside the tag, uses the compact title and shows no wordmark or note", () => {
		const w = mountScreen({ layout: "card", tone: "waiting" })
		const head = w.element.firstElementChild

		expect(head?.querySelector('[class*="glyph"]')).not.toBeNull()
		expect(head?.textContent).toContain("Unlock · Alice")
		expect(w.find("h1").classes().join(" ")).toMatch(/compact/)
		expect(w.find('[class*="wordmark"]').exists()).toBe(false)
		expect(w.text()).not.toContain(WAITING.note)
	})

	test("waiting is a dialog labelled by its title and described by its body", () => {
		const w = mountScreen({ layout: "window", tone: "waiting" })

		expect(w.attributes("role")).toBe("dialog")
		expect(w.attributes("aria-modal")).toBe("true")
		expect(w.attributes("aria-labelledby")).toBe(w.find("h1").attributes("id"))
		expect(w.attributes("aria-describedby")).toBe(w.find('[role="status"]').attributes("id"))
	})

	test("waiting breathes, in either layout", () => {
		for (const layout of ["card", "window"] as const) {
			const w = mountScreen({ layout, tone: "waiting" })
			expect(glyphs(w)).toHaveLength(1)
			expect(glyphs(w)[0]?.classes().join(" ")).toMatch(/breathing/)
		}
	})

	test("failed is an alertdialog: the glyph stops breathing and wears the close badge", () => {
		const w = mountScreen({ layout: "window", tone: "failed", title: ["Not", "confirmed"] })

		expect(w.attributes("role")).toBe("alertdialog")
		expect(w.classes().join(" ")).toMatch(/failed/)
		expect(glyphs(w)[0]?.classes().join(" ")).not.toMatch(/breathing/)
		expect(w.find('[class*="badge"]').exists()).toBe(true)
	})

	test("failed drops the window's note", () => {
		const w = mountScreen({ layout: "window", tone: "failed" })
		expect(w.text()).not.toContain(WAITING.note)
	})

	test("finishing hides its footer in place: the note and the host's buttons keep their space, out of reach", () => {
		const w = mountScreen({ layout: "window", tone: "finishing", body: "Finishing up. This window closes by itself." })

		expect(w.attributes("role")).toBe("dialog")
		expect(w.find('[role="status"]').text()).toBe("Finishing up. This window closes by itself.")
		expect(glyphs(w)[0]?.classes().join(" ")).toMatch(/breathing/)
		expect(foot(w).attributes("inert")).toBeDefined()
		expect(foot(w).classes().join(" ")).toMatch(/hidden_in_place/)
		expect(foot(w).text()).toContain(WAITING.note)
		expect(foot(w).find('[data-testid="host-cancel"]').exists()).toBe(true)
	})

	test("waiting leaves its footer within reach", () => {
		const w = mountScreen({ layout: "window", tone: "waiting" })
		expect(foot(w).attributes("inert")).toBeUndefined()
		expect(foot(w).classes().join(" ")).not.toMatch(/hidden_in_place/)
	})

	test("the actions slot renders the host's buttons, test ids included, in the footer", () => {
		const actions = "<button data-testid='host-retry'>Try again</button><button data-testid='host-close'>Close</button>"
		const w = mountScreen({ layout: "window", tone: "failed" }, actions)

		expect(foot(w).find('[data-testid="host-retry"]').text()).toBe("Try again")
		expect(foot(w).find('[data-testid="host-close"]').text()).toBe("Close")
	})

	test("an empty tag renders no tag", () => {
		const w = mountScreen({ layout: "card", tone: "waiting", tag: "" })
		expect(w.element.firstElementChild?.textContent?.trim()).toBe("")
	})

	test("the body carries the test id the host passes, and none when it passes none", () => {
		expect(
			mountScreen({ layout: "window", tone: "failed", bodyTestid: "host-error" }).find('[data-testid="host-error"]').exists(),
		).toBe(true)
		expect(mountScreen({ layout: "window", tone: "waiting" }).html()).not.toContain('data-testid="undefined"')
	})

	test("reduced motion and the Disable animations setting both stop the breathing", () => {
		expect(SOURCE).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.breathing \{\s*animation: none;/)
		expect(SOURCE).toMatch(/:global\(\.noanimations\) \.breathing \{\s*animation: none;/)
	})
})
