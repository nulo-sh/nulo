import { Flex, Icon, Text } from "@nulo/design"
import { flushPromises, mount } from "@vue/test-utils"
import { describe, expect, test, vi } from "vitest"
import { ref } from "vue"
import ItemsContainer from "@/components/ui/Settings/ItemsContainer.vue"
import SettingItem from "@/components/ui/Settings/SettingItem.vue"
import { changelogUrl, releaseCore } from "@/utils/whats-new"
import { settingsRouter } from "../../../../tests/helpers/settings-rows"

vi.mock("@/utils/core", () => ({ managers: { legal: { getRecord: vi.fn(async () => null) } } }))
vi.mock("@/composables/useLegalAcceptance", () => ({
	useLegalAcceptance: () => ({ status: ref("accepted"), refresh: vi.fn(), dispose: vi.fn() }),
}))
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast: vi.fn() }) }))

import AboutPage from "./about.vue"

describe("settings/about", () => {
	test("What's new links the running release's changelog in a new tab, right under Nulo Website", async () => {
		const w = mount(AboutPage, {
			global: {
				plugins: [settingsRouter()],
				components: { Flex, Icon, Text, ItemsContainer, SettingItem },
				stubs: { SubPageHeader: true },
			},
		})
		await flushPromises()
		const release = releaseCore(__VERSION__)
		const row = w.get('[data-testid="about-whats-new"]')
		expect(row.element.tagName).toBe("A")
		expect(row.attributes()).toMatchObject({ href: changelogUrl(release ?? ""), target: "_blank", rel: "noopener noreferrer" })
		expect(row.get('[data-testid="setting-title"]').element.textContent?.trim()).toBe(`What's new in ${release}`)
		const glyphs = w
			.findAllComponents(Icon)
			.filter((icon) => row.element.contains(icon.element))
			.map((icon) => icon.props("name"))
		expect(glyphs).toEqual(["open"])
		expect(row.element.previousElementSibling?.getAttribute("href")).toBe("https://nulo.sh")
	})
})
