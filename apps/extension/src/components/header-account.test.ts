import { describe, expect, test } from "vitest"
import { headerAccountState } from "./header-account"

const live = { id: "ln", chainId: 0 }
const account = { profileId: "p1", chainId: 0 }

describe("headerAccountState", () => {
	test("an account of the active profile and chain shows", () => {
		expect(headerAccountState({ profileId: "p1", network: live, staleNetworkId: undefined, account })).toBe("shown")
	})

	test("a quarantined active network hides the group, whatever account is loaded", () => {
		expect(headerAccountState({ profileId: "p1", network: live, staleNetworkId: "ln", account })).toBe("hidden")
		expect(headerAccountState({ profileId: "p1", network: undefined, staleNetworkId: undefined, account })).toBe("hidden")
	})

	test("another network's stale view leaves the active one shown", () => {
		expect(headerAccountState({ profileId: "p1", network: live, staleNetworkId: "tn", account })).toBe("shown")
	})

	test("no account yet, the previous chain's or another profile's: the skeleton holds the place", () => {
		expect(headerAccountState({ profileId: "p1", network: live, staleNetworkId: undefined, account: undefined })).toBe("loading")
		expect(
			headerAccountState({ profileId: "p1", network: live, staleNetworkId: undefined, account: { profileId: "p1", chainId: 7 } }),
		).toBe("loading")
		expect(
			headerAccountState({ profileId: "p1", network: live, staleNetworkId: undefined, account: { profileId: "p2", chainId: 0 } }),
		).toBe("loading")
	})
})
