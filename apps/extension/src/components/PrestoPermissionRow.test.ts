import { Banner, Text } from "@nulo/design"
import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import PrestoPermissionRow from "./PrestoPermissionRow.vue"

const factory = () =>
	mount(PrestoPermissionRow, {
		global: {
			components: { Banner, Text },
			stubs: { Button: { template: '<button v-bind="$attrs"><slot /></button>' } },
		},
	})

describe("PrestoPermissionRow", () => {
	test("renders the warning line and the Allow button under their testids", () => {
		const w = factory()
		const row = w.find('[data-testid="presto-permission-row"]')
		expect(row.exists()).toBe(true)
		expect(row.text()).toContain("Firefox needs your permission for Nulo to reach Presto.")
		expect(w.find('[data-testid="presto-permission-allow"]').text()).toBe("Allow")
	})

	test("emits allow once per click, and nothing before one", async () => {
		const w = factory()
		expect(w.emitted("allow")).toBeUndefined()
		await w.find('[data-testid="presto-permission-allow"]').trigger("click")
		await w.find('[data-testid="presto-permission-allow"]').trigger("click")
		expect(w.emitted("allow")).toHaveLength(2)
	})
})
