import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { OPEN_TOOLBAR_POPUP } from "./onboarding-tab"
import {
	armPopupReturn,
	closeTabThenOpenPopup,
	type FocusWindows,
	POPUP_RETURN_FOCUS_MS,
	registerToolbarPopupMessage,
} from "./toolbar-popup"

const BASE = "chrome-extension://nulo/"
const ONBOARDING = `${BASE}src/onboarding/index.html#/onboarding/done`

type Listener = (message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (answer: unknown) => void) => boolean

let listeners: Listener[]
let tabsInWindow: number
let openPopup: ReturnType<typeof vi.fn>
let removeTab: ReturnType<typeof vi.fn>

beforeEach(() => {
	listeners = []
	tabsInWindow = 2
	openPopup = vi.fn(async () => undefined)
	removeTab = vi.fn(async () => undefined)
	vi.stubGlobal("chrome", {
		runtime: {
			id: "nulo",
			getURL: (path: string) => `${BASE}${path}`,
			onMessage: { addListener: (listener: Listener) => listeners.push(listener) },
		},
		tabs: { query: vi.fn(async () => Array.from({ length: tabsInWindow }, (_, id) => ({ id }))), remove: removeTab },
		action: { openPopup },
	})
})

afterEach(() => {
	vi.unstubAllGlobals()
	vi.useRealTimers()
})

describe("onboarding's Open wallet", () => {
	/** Sends the message as `sender`; resolves with the answer, or `undefined` when it was refused. */
	async function ask(sender: chrome.runtime.MessageSender, message: unknown = { type: OPEN_TOOLBAR_POPUP }) {
		registerToolbarPopupMessage()
		let answer: unknown
		const kept = listeners[0](message, sender, (value) => {
			answer = value
		})
		await vi.waitFor(() => expect(kept ? answer : "refused").toBeDefined())
		return kept ? answer : undefined
	}

	test("closes the onboarding tab, then opens the popup in its window", async () => {
		const answer = await ask({ id: "nulo", url: ONBOARDING, tab: { id: 7, windowId: 3 } as chrome.tabs.Tab })
		expect(answer).toEqual({ ok: true })
		expect(removeTab).toHaveBeenCalledWith(7)
		expect(openPopup).toHaveBeenCalledWith({ windowId: 3 })
		expect(removeTab.mock.invocationCallOrder[0]).toBeLessThan(openPopup.mock.invocationCallOrder[0])
	})

	test("keeps a tab that is its window's last, and opens the popup over it", async () => {
		tabsInWindow = 1
		expect(await closeTabThenOpenPopup({ id: 7, windowId: 3 })).toEqual({ ok: true })
		expect(removeTab).not.toHaveBeenCalled()
		expect(openPopup).toHaveBeenCalledWith({ windowId: 3 })
	})

	test("a tab that would not close answers ok: false, and the popup still opens; a refused popup is no error", async () => {
		removeTab.mockRejectedValueOnce(new Error("No tab with id: 7"))
		openPopup.mockRejectedValueOnce(new Error("openPopup requires a user gesture"))
		expect(await closeTabThenOpenPopup({ id: 7, windowId: 3 })).toEqual({ ok: false })
		expect(openPopup).toHaveBeenCalledWith({ windowId: 3 })
	})

	test("refuses any other sender, and never takes the tab or window from the message", async () => {
		const tab = { id: 7, windowId: 3 } as chrome.tabs.Tab
		const refused: chrome.runtime.MessageSender[] = [
			{ id: "nulo", url: `${BASE}src/popup/index.html#/popup/general`, tab },
			{ id: "other-extension", url: ONBOARDING, tab },
			{ id: "nulo", url: "https://dapp.example/", tab },
			{ id: "nulo", url: ONBOARDING },
		]
		for (const sender of refused) expect(await ask(sender, { type: OPEN_TOOLBAR_POPUP, tabId: 1, windowId: 1 })).toBeUndefined()
		expect(await ask({ id: "nulo", url: ONBOARDING, tab }, { type: "something-else" })).toBeUndefined()
		expect(removeTab).not.toHaveBeenCalled()
		expect(openPopup).not.toHaveBeenCalled()
	})
})

describe("the return to the wallet after a passkey window step", () => {
	/** A browser whose window 3 was focused when the step started, unless `lastFocused` says otherwise. */
	function browserWindows(lastFocused: Partial<chrome.windows.Window> = { id: 3, type: "normal" }, focusedNow = false) {
		const focusListeners = new Set<(windowId: number) => void>()
		const windows: FocusWindows = {
			getLastFocused: async () => lastFocused as chrome.windows.Window,
			get: async (id) => ({ id, focused: focusedNow }) as chrome.windows.Window,
			onFocusChanged: { addListener: (l) => focusListeners.add(l), removeListener: (l) => focusListeners.delete(l) },
		}
		const focus = (windowId: number) => {
			for (const listener of [...focusListeners]) listener(windowId)
		}
		return { windows, focus, listening: () => focusListeners.size }
	}

	test("opens the popup at once on a window that already has focus back", async () => {
		const { windows, listening } = browserWindows(undefined, true)
		await armPopupReturn(windows)()
		expect(openPopup).toHaveBeenCalledWith({ windowId: 3 })
		expect(listening()).toBe(0)
	})

	test("waits for the window to have focus again, through another window's turn", async () => {
		vi.useFakeTimers()
		const { windows, focus, listening } = browserWindows()
		const returned = armPopupReturn(windows)()
		await vi.advanceTimersByTimeAsync(POPUP_RETURN_FOCUS_MS - 1_000)
		focus(9)
		focus(3)
		await returned
		expect(openPopup).toHaveBeenCalledWith({ windowId: 3 })
		expect(listening()).toBe(0)
	})

	test("opens nothing when the window has no focus in time, or the step began elsewhere", async () => {
		vi.useFakeTimers()
		const late = browserWindows()
		const returned = armPopupReturn(late.windows)()
		await vi.advanceTimersByTimeAsync(POPUP_RETURN_FOCUS_MS)
		await returned
		late.focus(3)
		expect(late.listening()).toBe(0)

		await armPopupReturn(browserWindows({ id: 4, type: "popup" }, true).windows)()
		expect(openPopup).not.toHaveBeenCalled()
	})
})
