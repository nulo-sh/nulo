import { describe, expect, test, vi } from "vitest"
import type { ExtensionContextInfo, RuntimePort } from "@nulo/wallet-core/ports"
import type { ILogger } from "@/wallet/logger"
import { closeRestartEndedTabs, isRestartEndedUrl } from "./restart-ended-windows"

const BASE = "chrome-extension://wallet/"
const POPUP = `${BASE}src/popup/index.html`

describe("isRestartEndedUrl", () => {
	test.each([
		["connect", `${POPUP}#/windows/discover?requestId=0x01`],
		["connect, expired", `${POPUP}#/windows/discover?requestId=0x01&expired=1`],
		["capabilities", `${POPUP}#/windows/capabilities?requestId=0x01`],
		["emoji check", `${POPUP}#/windows/verify?sessionId=s&verificationHash=h&isReconnect=false`],
		["a route with no query", `${POPUP}#/windows/verify`],
	])("closes %s", (_name, url) => {
		expect(isRestartEndedUrl(url, POPUP)).toBe(true)
	})

	test.each([
		["the popup's own page", `${POPUP}#/popup/general`],
		["the lock screen", `${POPUP}#/popup/auth`],
		["the onboarding page", `${BASE}src/onboarding/index.html#/windows/verify`],
		["send", `${POPUP}#/windows/execute?requestId=0x01`],
		["fee question", `${POPUP}#/windows/fee?requestId=0x01`],
		["network notice", `${POPUP}#/windows/network-unavailable?requestId=0x01`],
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
		]
		await closeRestartEndedTabs(
			runtimeWith(async () => contexts),
			{ closeTab: async (id) => void closed.push(id) },
			logger(),
		)
		expect(closed.sort()).toEqual([1, 2, 4])
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
