import { describe, expect, test } from "vitest"
import type { Network } from "@/wallet/services/network/client"
import { type NetworkArrivalInput, networkArrivalView } from "./network-arrival"

const MAINNET = { id: "mn", profileId: "p1", name: "Mainnet", kind: "mainnet" } as unknown as Network

const input = (over: Partial<NetworkArrivalInput> = {}): NetworkArrivalInput => ({
	logined: true,
	route: { name: "popup-general", path: "/popup/general" },
	networkId: "tn",
	arrived: MAINNET,
	takeover: false,
	legalSheet: false,
	...over,
})

describe("networkArrivalView", () => {
	test("shows an unanswered arrival over Home and every other route the takeover would cover", () => {
		for (const path of ["/popup/general", "/popup/settings", "/popup/history", "/popup/send"]) {
			expect(networkArrivalView(input({ route: { name: "x", path } }))).toBe(MAINNET)
		}
	})

	test("waits while the reset takeover shows, while the Terms sheet shows, and until the sheet has a verdict", () => {
		expect(networkArrivalView(input({ takeover: true }))).toBeNull()
		expect(networkArrivalView(input({ legalSheet: true }))).toBeNull()
		expect(networkArrivalView(input({ legalSheet: undefined }))).toBeNull()
	})

	test("never covers a locked popup, the pre-session screens or a dApp window", () => {
		expect(networkArrivalView(input({ logined: false }))).toBeNull()
		for (const name of ["popup-auth", "popup-register", "windows-execute", "windows-connect"]) {
			expect(networkArrivalView(input({ route: { name, path: "/x" } }))).toBeNull()
		}
	})

	test("yields to Networks, the exports and the legal pages", () => {
		for (const path of ["/popup/settings/networks", "/popup/settings/security/export/full", "/popup/legal/terms"]) {
			expect(networkArrivalView(input({ route: { name: "x", path } }))).toBeNull()
		}
	})

	test("shows nothing with no arrival, or when its network is already the active one", () => {
		expect(networkArrivalView(input({ arrived: null }))).toBeNull()
		expect(networkArrivalView(input({ networkId: "mn" }))).toBeNull()
	})
})
