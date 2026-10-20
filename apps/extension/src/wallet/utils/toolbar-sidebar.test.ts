import { EventHandler } from "@nulo/wallet-core/utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { ConfigProp } from "@/wallet/config"
import { registerToolbarSidebar } from "./toolbar-sidebar"

let clicked: (() => void) | undefined
let setPopup: ReturnType<typeof vi.fn>
let open: ReturnType<typeof vi.fn>
let onUpdate: EventHandler<ConfigProp>

function stubBrowser({ firefox }: { firefox: boolean }) {
	vi.stubGlobal("chrome", {
		...(firefox ? {} : { sidePanel: {} }),
		action: { onClicked: { addListener: (listener: () => void) => (clicked = listener) }, setPopup },
	})
	vi.stubGlobal("browser", firefox ? { sidebarAction: { open } } : undefined)
}

beforeEach(() => {
	clicked = undefined
	setPopup = vi.fn(async () => undefined)
	open = vi.fn(async () => undefined)
	onUpdate = new EventHandler<ConfigProp>()
})

describe("registerToolbarSidebar", () => {
	test("Chrome keeps its own side-panel behaviour: no click listener, and no popup change on the setting", () => {
		stubBrowser({ firefox: false })
		registerToolbarSidebar({ onUpdate })
		onUpdate.invoke({ key: "sidePanel", value: true })
		expect(clicked).toBeUndefined()
		expect(setPopup).not.toHaveBeenCalled()
	})

	test("on Firefox the setting clears the toolbar popup and gives the manifest's back, and nothing else touches it", () => {
		stubBrowser({ firefox: true })
		registerToolbarSidebar({ onUpdate })
		onUpdate.invoke({ key: "sidePanel", value: true })
		onUpdate.invoke({ key: "theme", value: "dark" })
		onUpdate.invoke({ key: "sidePanel", value: false })
		expect(setPopup.mock.calls).toEqual([[{ popup: "" }], [{ popup: null }]])
	})

	test("on Firefox a toolbar click opens the sidebar inside the click's own listener", () => {
		stubBrowser({ firefox: true })
		registerToolbarSidebar({ onUpdate })
		expect(open).not.toHaveBeenCalled()
		clicked?.()
		expect(open).toHaveBeenCalledTimes(1)
	})
})
