import { describe, expect, test, vi } from "vitest"
import type { ExtensionContextInfo, MessagePortLike, MessageSender, RuntimePort, WindowPort } from "@nulo/wallet-core/ports"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import type { ILogger } from "@/wallet/logger"
import { closeRestartEndedTabs, isRestartEndedUrl, trackOpenWindows } from "./restart-ended-windows"

const BASE = "chrome-extension://wallet/"
const POPUP = `${BASE}src/popup/index.html`

describe("isRestartEndedUrl", () => {
	test.each([
		["connect", `${POPUP}#/windows/discover?requestId=0x01`],
		["connect, expired", `${POPUP}#/windows/discover?requestId=0x01&expired=1`],
		["capabilities", `${POPUP}#/windows/capabilities?requestId=0x01`],
		["emoji check", `${POPUP}#/windows/verify?sessionId=s&verificationHash=h&isReconnect=false`],
		["send or sign", `${POPUP}#/windows/execute?requestId=0x01`],
		["fee question", `${POPUP}#/windows/fee?requestId=0x01`],
		["network notice", `${POPUP}#/windows/network-unavailable?requestId=0x01`],
		["a route with no query", `${POPUP}#/windows/verify`],
	])("closes %s", (_name, url) => {
		expect(isRestartEndedUrl(url, POPUP)).toBe(true)
	})

	test.each([
		["the popup's own page", `${POPUP}#/popup/general`],
		["the lock screen", `${POPUP}#/popup/auth`],
		["the onboarding page", `${BASE}src/onboarding/index.html#/windows/verify`],
		["request JSON", `${POPUP}#/windows/json`],
		["logs viewer", `${POPUP}#/windows/logger`],
		["passkey", `${POPUP}#/windows/passkey`],
		["a deeper path under a closed route", `${POPUP}#/windows/verify/more`],
		["another extension on Chrome", "chrome-extension://other/src/popup/index.html#/windows/verify"],
		["another extension on Firefox", "moz-extension://other/src/popup/index.html#/windows/verify"],
		["a web page", "https://wallet/src/popup/index.html#/windows/verify"],
		["not a URL", "#/windows/verify"],
	])("keeps %s", (_name, url) => {
		expect(isRestartEndedUrl(url, POPUP)).toBe(false)
	})

	test("tells two Firefox extensions apart", () => {
		const own = "moz-extension://wallet/src/popup/index.html"
		expect(isRestartEndedUrl(`${own}#/windows/verify`, own)).toBe(true)
		expect(isRestartEndedUrl("moz-extension://other/src/popup/index.html#/windows/verify", own)).toBe(false)
	})
})

describe("closeRestartEndedTabs", () => {
	const logger = () => ({ log: vi.fn() }) as unknown as ILogger & { log: ReturnType<typeof vi.fn> }
	const tab = (tabId: number, route: string, windowId = tabId): ExtensionContextInfo => ({
		contextId: `c${tabId}`,
		contextType: "TAB",
		tabId,
		windowId,
		documentUrl: `${POPUP}#/windows/${route}?requestId=0x0${tabId}`,
	})
	const runtimeWith = (getContexts: RuntimePort["getContexts"]) =>
		({ getURL: (path: string) => `${BASE}${path}`, getContexts }) as unknown as RuntimePort

	test("closes the tab of each restart-ended window, and only those", async () => {
		const closed: number[] = []
		const contexts = [
			tab(1, "discover"),
			tab(2, "verify"),
			tab(3, "execute"),
			tab(4, "capabilities"),
			{ ...tab(5, "x"), documentUrl: `${POPUP}#/popup/general` },
			tab(6, "passkey"),
		]
		await closeRestartEndedTabs(
			runtimeWith(async () => contexts),
			{ closeTab: async (id) => void closed.push(id) },
			logger(),
		)
		expect(closed.sort()).toEqual([1, 2, 3, 4])
	})

	test("a refused close neither throws nor stops the rest, and nothing logged names a URL", async () => {
		const closed: number[] = []
		const log = logger()
		const closeTab = async (id: number) => {
			if (id === 1) throw new Error(`No tab with id: 1 at ${POPUP}#/windows/discover?requestId=0x01`)
			closed.push(id)
		}
		await closeRestartEndedTabs(
			runtimeWith(async () => [tab(1, "discover"), tab(2, "verify")]),
			{ closeTab },
			log,
		)
		expect(closed).toEqual([2])
		expect(log.log).toHaveBeenCalledWith("wallet", expect.anything(), expect.any(String), { closed: 1, failed: 1 })
		expect(JSON.stringify(log.log.mock.calls)).not.toContain("requestId")
	})

	test.each([
		["is missing", undefined],
		["throws", async () => Promise.reject(new Error("getContexts unavailable"))],
	])("closes nothing and does not throw when getContexts %s", async (_name, getContexts) => {
		const closeTab = vi.fn(async () => {})
		await expect(closeRestartEndedTabs(runtimeWith(getContexts), { closeTab }, logger())).resolves.toBeUndefined()
		expect(closeTab).not.toHaveBeenCalled()
	})
})

const at = (route: string) => `${POPUP}#/windows/${route}?requestId=0x01`
const settled = () => new Promise((resolve) => setTimeout(resolve, 0))
function tracked() {
	const api = new FakeBrowserApi()
	const fake = api.windows as WindowPort & { creates: unknown[]; closeByUser(id: number): void }
	const runtime = api.runtime as RuntimePort & { connect(options: { name: string }, sender?: MessageSender): MessagePortLike }
	const removed: number[] = []
	fake.onRemoved((id) => removed.push(id))
	/** A window a page opened itself, then a port from the page it shows. */
	const pageWindow = async (url: string, type: "popup" | "normal" = "popup") => {
		const { id } = await fake.create({ type, url })
		runtime.connect({ name: "logger" }, { id: "wallet", url, tab: { id: 7, windowId: id } })
		await settled()
		return id as number
	}
	return { fake, runtime, removed, pageWindow, windows: trackOpenWindows(fake, runtime, POPUP) }
}

type Tracked = ReturnType<typeof tracked>

describe("trackOpenWindows", () => {
	test("delegates to the adapter unchanged", async () => {
		const { fake, windows } = tracked()
		const { id } = await windows.create({ type: "popup", url: at("discover"), width: 1, height: 1 })
		expect(fake.creates).toEqual([{ type: "popup", url: at("discover"), width: 1, height: 1 }])
		expect(await windows.isPopup(id as number)).toBe(true)
		await expect(windows.update(999, { focused: true })).rejects.toThrow("No window with id: 999.")
	})

	test("closes every window it opened, the passkey window included", async () => {
		const { removed, windows } = tracked()
		const ids = []
		for (const url of [at("discover"), `${POPUP}#/windows/verify?sessionId=s`, at("execute"), at("passkey")]) {
			ids.push((await windows.create({ type: "popup", url })).id)
		}
		windows.closeOwnWindows()
		await settled()
		expect(removed.sort()).toEqual(ids.sort())
	})

	test.each([
		["the logs viewer", `${POPUP}#/windows/logger`],
		["a request's JSON", `${POPUP}#/windows/json?requestId=0x01`],
		["an export in its own window", `${POPUP}#/popup/settings/security/export/full?window=own`],
		["an import in its own window", `${POPUP}#/popup/import?window=own`],
		["the popup in its own window", POPUP],
	])("closes %s, a popup window a wallet page reported from", async (_name, url) => {
		const { removed, pageWindow, windows } = tracked()
		const id = await pageWindow(url)
		windows.closeOwnWindows()
		await settled()
		expect(removed).toEqual([id])
	})

	test.each([
		["a wallet page in a person's own window", (t: Tracked) => t.pageWindow(POPUP, "normal")],
		["a web page's port in a popup window", (t: Tracked) => t.pageWindow("https://app.example/", "popup")],
		["another extension's page", (t: Tracked) => t.pageWindow("chrome-extension://other/src/popup/index.html", "popup")],
		[
			"a port with no tab (the toolbar popup)",
			async (t: Tracked) => {
				t.runtime.connect({ name: "logger" }, { id: "wallet", url: POPUP })
				await settled()
			},
		],
	])("keeps %s", async (_name, open) => {
		const t = tracked()
		await open(t)
		t.windows.closeOwnWindows()
		await settled()
		expect(t.removed).toEqual([])
	})

	test("forgets a window once it closes, even one closing before its type answers", async () => {
		const { fake, runtime, windows } = tracked()
		const opened = await windows.create({ type: "popup", url: at("discover") })
		await fake.remove(opened.id as number)
		const { id } = await fake.create({ type: "popup", url: `${POPUP}#/windows/logger` })
		runtime.connect({ name: "logger" }, { id: "wallet", url: POPUP, tab: { id: 7, windowId: id } })
		fake.closeByUser(id as number)
		await settled()
		const remove = vi.spyOn(fake, "remove")
		windows.closeOwnWindows()
		expect(remove).not.toHaveBeenCalled()
	})

	test("fires every removal and returns while they are pending; a refused one stops none", async () => {
		const calls: number[] = []
		let nextId = 1
		const port = {
			create: async () => ({ id: nextId++ }),
			onRemoved: () => () => {},
			remove: (id: number) => {
				calls.push(id)
				if (id === 1) throw new Error(`${POPUP}#/windows/discover?requestId=0x01`)
				if (id === 2) return Promise.reject(new Error("No window with id: 2."))
				return new Promise<void>(() => {})
			},
		} as unknown as WindowPort
		const windows = trackOpenWindows(port, { onConnect: () => () => {} }, POPUP)
		for (const route of ["discover", "verify", "capabilities"]) await windows.create({ url: at(route) })
		expect(windows.closeOwnWindows()).toBeUndefined()
		expect(calls).toEqual([1, 2, 3])
	})
})
