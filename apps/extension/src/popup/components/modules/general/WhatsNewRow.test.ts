import { Flex, Icon, RowAction, Text } from "@nulo/design"
import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import ItemsContainer from "@/components/ui/Settings/ItemsContainer.vue"
import SettingItem from "@/components/ui/Settings/SettingItem.vue"
import { changelogUrl, minorOf, WHATS_NEW_SEEN_KEY } from "@/utils/whats-new"
import { installChromeStorage } from "../../../../../tests/helpers/chrome-storage-mock"
import WhatsNewRow from "./WhatsNewRow.vue"

const COMPONENTS = { Flex, Icon, Text, ItemsContainer, SettingItem, RowAction }
const VERSION = __VERSION__

async function mountRow(stored: Record<string, unknown>) {
	const storage = installChromeStorage(stored)
	const w = mount(WhatsNewRow, { global: { components: COMPONENTS }, attachTo: document.body })
	await flushPromises()
	return { w, storage }
}

afterEach(() => {
	vi.restoreAllMocks()
	document.body.innerHTML = ""
})

describe("general/WhatsNewRow", () => {
	test("shows only under a marker below the running minor", async () => {
		expect((await mountRow({})).w.find('[data-testid="whats-new-row"]').exists()).toBe(false)
		expect((await mountRow({ [WHATS_NEW_SEEN_KEY]: minorOf(VERSION) })).w.find('[data-testid="whats-new-row"]').exists()).toBe(false)
		expect((await mountRow({ [WHATS_NEW_SEEN_KEY]: "0.0" })).w.find('[data-testid="whats-new-row"]').exists()).toBe(true)
	})

	test("reads the signed copy, the open glyph, and a Dismiss control that Tab reaches right after the row", async () => {
		const { w } = await mountRow({ [WHATS_NEW_SEEN_KEY]: "0.0" })
		const row = w.get('[data-testid="whats-new-row"]')
		expect(row.get('[data-testid="setting-title"]').element.textContent?.trim()).toBe(`Nulo ${VERSION}. See what changed`)
		expect(w.findAllComponents(Icon).map((icon) => icon.props("name"))).toEqual(["open", "close"])
		const dismiss = row.get('[data-testid="whats-new-dismiss"]')
		expect(dismiss.attributes("aria-label")).toBe("Dismiss")
		const stops = [...row.element.querySelectorAll<HTMLElement>("button, a[href], [tabindex]")].filter((el) => el.tabIndex >= 0)
		expect(stops).toEqual([row.get("[data-row-target]").element, dismiss.element])
	})

	test("a tap opens the running version's changelog in a new tab and leaves the row and the marker", async () => {
		const open = vi.spyOn(window, "open").mockReturnValue(null)
		const { w, storage } = await mountRow({ [WHATS_NEW_SEEN_KEY]: "0.0" })
		await w.get("[data-row-target]").trigger("click")
		expect(open).toHaveBeenCalledWith(changelogUrl(VERSION), "_blank", "noopener,noreferrer")
		expect(w.find('[data-testid="whats-new-row"]').exists()).toBe(true)
		expect(storage.set).not.toHaveBeenCalled()
	})

	test("Dismiss hides the row and records the running minor, without opening the page", async () => {
		const open = vi.spyOn(window, "open").mockReturnValue(null)
		const { w, storage } = await mountRow({ [WHATS_NEW_SEEN_KEY]: "0.0" })
		await w.get('[data-testid="whats-new-dismiss"]').trigger("click")
		await flushPromises()
		expect(w.find('[data-testid="whats-new-row"]').exists()).toBe(false)
		expect(storage.data[WHATS_NEW_SEEN_KEY]).toBe(minorOf(VERSION))
		expect(open).not.toHaveBeenCalled()
	})
})
