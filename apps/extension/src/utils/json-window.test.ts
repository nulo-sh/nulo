import { afterEach, expect, test, vi } from "vitest"
import { openJsonWindow } from "./json-window"

afterEach(() => {
	vi.unstubAllGlobals()
})

test("opens one 900 × 700 popup on the JSON window, naming the request", () => {
	const create = vi.fn(async () => ({}))
	vi.stubGlobal("chrome", {
		runtime: { getURL: (path: string) => `chrome-extension://nulo/${path}` },
		windows: { create },
	})
	openJsonWindow("req-1")
	expect(create).toHaveBeenCalledExactlyOnceWith({
		type: "popup",
		url: "chrome-extension://nulo/src/popup/index.html?requestId=req-1#/windows/json",
		height: 700,
		width: 900,
	})
})
