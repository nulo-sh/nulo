import { describe, expect, test } from "vitest"
import type { StaleNetworkView } from "@/wallet/services/network-reset/client"
import { type TakeoverInput, takeoverScreen, takeoverView } from "./stale-takeover"

const view = (over: Partial<StaleNetworkView> = {}): StaleNetworkView => ({
	networkId: "tn",
	name: "Testnet",
	cause: { networkReset: true, addressesMoved: false },
	blocked: false,
	accounts: [{ name: "Account 1", address: "0x01" }],
	unmovable: [],
	switchToSeedNode: false,
	probedEndpoint: null,
	...over,
})

const input = (over: Partial<TakeoverInput> = {}): TakeoverInput => ({
	logined: true,
	route: { name: "popup-general", path: "/popup/general" },
	networkId: "tn",
	stale: view(),
	running: null,
	...over,
})

describe("takeoverView", () => {
	test("covers every route of the stale active network but Networks, the exports and the legal pages", () => {
		for (const path of ["/popup/general", "/popup/settings", "/popup/settings/security", "/popup/history", "/popup/send"]) {
			expect(takeoverView(input({ route: { name: "x", path } }))?.networkId).toBe("tn")
		}
		for (const path of [
			"/popup/settings/networks",
			"/popup/settings/networks/tn",
			"/popup/settings/security/export",
			"/popup/settings/security/export/full",
			"/popup/legal/terms",
		]) {
			expect(takeoverView(input({ route: { name: "x", path } }))).toBeNull()
		}
	})

	test("never covers a locked popup, the pre-session screens or a dApp window, even while a reset runs", () => {
		const running = view({ networkId: "ln", name: "Local Network" })
		expect(takeoverView(input({ logined: false, running }))).toBeNull()
		for (const name of ["popup-auth", "popup-register", "windows-execute", "windows-connect"]) {
			expect(takeoverView(input({ route: { name, path: "/x" }, running }))).toBeNull()
		}
	})

	test("a run covers every other route, on whatever network is active", () => {
		const running = view({ networkId: "tn", reset: { running: true, purged: false, doneCount: 0 } })
		const onLocal = input({ networkId: "ln", stale: null, running, route: { name: "x", path: "/popup/settings/networks" } })
		expect(takeoverView(onLocal)).toBe(running)
	})

	test("a live active network, or another network's stale view, shows the route", () => {
		expect(takeoverView(input({ stale: null }))).toBeNull()
		expect(takeoverView(input({ networkId: "ln" }))).toBeNull()
	})

	test("a network cause with nothing to move shows no screen while it resets by itself", () => {
		expect(takeoverView(input({ stale: view({ accounts: [] }) }))).toBeNull()
		expect(takeoverView(input({ stale: view({ accounts: [], cause: { networkReset: false, addressesMoved: true } }) }))).toBeNull()
		expect(takeoverView(input({ stale: view({ accounts: [], unmovable: ["Imported 1"] }) }))?.networkId).toBe("tn")
		expect(takeoverView(input({ stale: view({ accounts: [], switchToSeedNode: true }) }))?.networkId).toBe("tn")
	})
})

describe("takeoverScreen", () => {
	test("precedence: a run, Mainnet, a paused journal, another network's journal, a held chain, a node down, then the cause", () => {
		const all = view({
			blocked: true,
			reset: { running: false, purged: true, doneCount: 0 },
			otherPending: { networkId: "x", name: "X" },
			heldBy: { name: "My Testnet" },
		})
		expect(takeoverScreen(all, true, true)).toBe("progress")
		expect(takeoverScreen(all, false, true)).toBe("blocked")
		expect(takeoverScreen({ ...all, blocked: false }, false, true)).toBe("paused")
		expect(takeoverScreen({ ...all, blocked: false, reset: undefined }, false, true)).toBe("one-at-a-time")
		expect(takeoverScreen({ ...all, blocked: false, reset: undefined, otherPending: undefined }, false, true)).toBe("already-added")
		expect(takeoverScreen(view(), false, true)).toBe("node-down")
		expect(takeoverScreen(view(), false, false)).toBe("network-reset")
		expect(takeoverScreen(view({ cause: { networkReset: true, addressesMoved: true } }), false, false)).toBe("network-reset")
		expect(takeoverScreen(view({ cause: { networkReset: false, addressesMoved: true } }), false, false)).toBe("new-addresses")
	})

	test("a journal whose run is in flight shows the progress before the popup hears of the run", () => {
		expect(takeoverScreen(view({ reset: { running: true, purged: false, doneCount: 0 } }), false, false)).toBe("progress")
	})

	test("a run that moves no account shows the loader, whoever started it", () => {
		expect(takeoverScreen(view({ accounts: [] }), true, false)).toBe("loading")
		expect(takeoverScreen(view({ accounts: [], reset: { running: true, purged: true, doneCount: 0 } }), false, false)).toBe("loading")
		expect(takeoverScreen(view({ accounts: [], reset: { running: false, purged: true, doneCount: 0 } }), false, false)).toBe("paused")
	})
})
