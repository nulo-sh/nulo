import { describe, expect, test } from "vitest"
import { activeAccountScope } from "./active-scope"

const profile = { id: "p1" }
const network = { id: "n1" }
const account = { address: "0xa1" }

describe("activeAccountScope", () => {
	test("a full scope names all three", () => {
		expect(activeAccountScope({ profile, network, account })).toEqual({ profileId: "p1", networkId: "n1", account: "0xa1" })
	})

	test.each([
		["no profile", { network, account }],
		["no network", { profile, account }],
		["no account", { profile, network }],
		["an empty profile id", { profile: { id: "" }, network, account }],
		["an empty network id", { profile, network: { id: "" }, account }],
		["an empty address", { profile, network, account: { address: "" } }],
		["a null network", { profile, network: null, account }],
	])("%s is no scope", (_, app) => {
		expect(activeAccountScope(app)).toBeUndefined()
	})

	test("reads no further than the first missing part, as the reactive getters it replaces did", () => {
		const reads: string[] = []
		const app = {
			get profile() {
				reads.push("profile")
				return undefined
			},
			get network() {
				reads.push("network")
				return network
			},
			get account() {
				reads.push("account")
				return account
			},
		}
		expect(activeAccountScope(app)).toBeUndefined()
		expect(reads).toEqual(["profile"])
	})
})
