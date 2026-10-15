import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"
import { mount } from "@vue/test-utils"
import ConnectStepBar from "./ConnectStepBar.vue"

/** Test runs answer every CSS-module name with a class, so a segment's colour shows only here. */
const SOURCE = readFileSync(resolve(__dirname, "ConnectStepBar.vue"), "utf8")

describe("windows/ConnectStepBar", () => {
	test("step 1 fills one of two segments, step 2 both, and the bar is hidden from assistive tech", async () => {
		const w = mount(ConnectStepBar, { props: { step: 1 } })
		const filled = () => w.findAll('[data-filled="true"]').length
		expect(w.attributes("aria-hidden")).toBe("true")
		expect(w.findAll("[data-filled]")).toHaveLength(2)
		expect(filled()).toBe(1)
		await w.setProps({ step: 2 })
		expect(filled()).toBe(2)
	})

	test("an empty segment draws the track token and a filled one the accent", () => {
		expect(SOURCE).toMatch(/\.segment \{[^}]*background: var\(--nulo-track\);/)
		expect(SOURCE).toMatch(/\.filled \{\s*background: var\(--nulo-accent\);/)
	})
})
