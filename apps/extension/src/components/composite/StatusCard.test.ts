import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import { declarationsOf, parseSource } from "../../../scripts/type-roles/source-scan"
import StatusCard from "./StatusCard.vue"

const SpinnerStub = { name: "Spinner", props: ["size", "color"], template: "<i data-spinner :data-size='size' :data-color='color' />" }

function mountCard(props: Record<string, unknown>, attrs: Record<string, string> = {}) {
	return mount(StatusCard, { props, attrs, global: { stubs: { Spinner: SpinnerStub } } })
}

describe("StatusCard", () => {
	test("shows the title", () => {
		const w = mountCard({ title: "Creating your backup" })
		expect(w.get("span").text()).toBe("Creating your backup")
	})

	test("shows the description under the title", () => {
		const w = mountCard({ title: "Exporting your contacts", description: "Gathering your contacts into a file." })
		expect(w.get("p").text()).toBe("Gathering your contacts into a file.")
		expect(w.text()).toBe("Exporting your contactsGathering your contacts into a file.")
	})

	test("renders no description line without one", () => {
		const w = mountCard({ title: "Encrypting your backup" })
		expect(w.find("p").exists()).toBe(false)
	})

	test("is a polite status region announced whole", () => {
		const root = mountCard({ title: "T" }).get("div")
		expect(root.attributes()).toMatchObject({ role: "status", "aria-live": "polite", "aria-atomic": "true" })
	})

	test("the spinner is the accent colour at 28px", () => {
		const spinner = mountCard({ title: "T" }).get("[data-spinner]")
		expect(spinner.attributes()).toMatchObject({ "data-size": "28", "data-color": "--nulo-accent" })
	})

	test("the spinner is hidden from assistive technology", () => {
		expect(mountCard({ title: "T" }).get("[data-spinner]").attributes("aria-hidden")).toBe("true")
	})

	test("a testid lands on the status region", () => {
		const w = mountCard({ title: "T" }, { "data-testid": "backup-status-card" })
		expect(w.get('[data-testid="backup-status-card"]').attributes("role")).toBe("status")
	})

	test("the title is the row-title role at 16px", () => {
		expect(declarationsOf(parseSource("apps/extension/src/components/composite/StatusCard.vue"), ".title")).toMatchObject({
			composes: "type--row-title from global",
			"font-size": "16px",
		})
	})

	test("the description is the body role, at most 280px wide", () => {
		expect(declarationsOf(parseSource("apps/extension/src/components/composite/StatusCard.vue"), ".description")).toMatchObject({
			composes: "type--body from global",
			"max-width": "280px",
		})
	})

	test("follows its props as the work moves on", async () => {
		const w = mountCard({ title: "Creating your backup", description: "Gathering your wallet data into your backup file." })
		await w.setProps({ title: "Encrypting your backup", description: "" })
		expect(w.get("span").text()).toBe("Encrypting your backup")
		expect(w.find("p").exists()).toBe(false)
	})
})
