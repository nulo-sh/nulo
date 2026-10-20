import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import BackupReminderBanner from "./BackupReminderBanner.vue"

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	Icon: { template: '<i data-testid="stub-icon" :data-name="name" :data-color="color" />', props: ["name", "size", "color"] },
}
const mountBanner = () => mount(BackupReminderBanner, { global: { stubs: STUBS } })

describe("general/BackupReminderBanner", () => {
	test("says the funds have no backup, as a status", () => {
		const w = mountBanner()
		expect(w.attributes("data-testid")).toBe("backup-reminder-banner")
		expect(w.attributes("role")).toBe("status")
		expect(w.text()).toContain("Your funds have no backup")
	})

	test("carries the warning glyph", () => {
		const icon = mountBanner().get('[data-testid="stub-icon"]')
		expect(icon.attributes("data-name")).toBe("warning")
		expect(icon.attributes("data-color")).toBe("orange")
	})

	test("Save phrase is a button that emits save once per click", async () => {
		const w = mountBanner()
		const save = w.get('[data-testid="backup-reminder-save"]')
		expect(save.element.tagName).toBe("BUTTON")
		expect(save.attributes("type")).toBe("button")
		expect(save.text()).toBe("Save phrase")
		await save.trigger("click")
		expect(w.emitted("save")).toEqual([[]])
	})

	test("nothing else in it acts", async () => {
		const w = mountBanner()
		expect(w.findAll("button")).toHaveLength(1)
		await w.trigger("click")
		expect(w.emitted("save")).toBeUndefined()
	})

	test("the action follows the message", () => {
		const w = mountBanner()
		const children = [...w.element.children]
		expect(children.at(-1)?.getAttribute("data-testid")).toBe("backup-reminder-save")
	})
})
