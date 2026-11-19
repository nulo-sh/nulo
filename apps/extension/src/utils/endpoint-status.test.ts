import { describe, expect, test } from "vitest"
import { ago, endpointStatus, movedFirstWarning, type RouteView } from "./endpoint-status"

const READ_AT = 10_000_000
/** As the wire carries it: the stored 8-hex endpoint ids, the router's state names, `failure` absent until one counted. */
const view = (endpoints: NonNullable<RouteView["snapshot"]>["endpoints"], activeId: string | null): RouteView => ({
	snapshot: { activeId, endpoints },
	readAt: READ_AT,
})

describe("endpointStatus", () => {
	test("the active endpoint answering is green and in use; another answering is green", () => {
		const v = view(
			[
				{ id: "3f9a1c2e", state: "ready", since: 1 },
				{ id: "b07d44a1", state: "ready", since: 1 },
			],
			"3f9a1c2e",
		)
		expect(endpointStatus(v, "3f9a1c2e")).toEqual({ tone: "green", word: "In use", detail: null })
		expect(endpointStatus(v, "b07d44a1")).toEqual({ tone: "green", word: "Answering", detail: null })
	})

	test("a down endpoint is red with when it stopped and why, even while it holds the role (a lone endpoint)", () => {
		const v = view([{ id: "3f9a1c2e", state: "down", since: READ_AT - 75_000, failure: "unreachable" }], "3f9a1c2e")
		expect(endpointStatus(v, "3f9a1c2e")).toEqual({
			tone: "red",
			word: "Not answering",
			detail: "No answer since 1 min ago. The connection failed.",
		})
	})

	test.each([
		["timeout", "It did not answer in time."],
		["server", "It returned a server error."],
		["malformed", "Its reply could not be read."],
	] as const)("a down endpoint's %s reads as its own sentence", (failure, sentence) => {
		const v = view([{ id: "b07d44a1", state: "down", since: READ_AT - 20_000, failure }], null)
		expect(endpointStatus(v, "b07d44a1").detail).toBe(`No answer since 20 s ago. ${sentence}`)
	})

	test("a down endpoint with no counted kind keeps the first sentence alone", () => {
		const v = view([{ id: "b07d44a1", state: "down", since: READ_AT - 3 * 3_600_000 }], null)
		expect(endpointStatus(v, "b07d44a1").detail).toBe("No answer since 3 h ago.")
	})

	test("behind and on another network are amber, with no line", () => {
		const v = view(
			[
				{ id: "3f9a1c2e", state: "behind", since: 1 },
				{ id: "b07d44a1", state: "wrong-chain", since: 1 },
			],
			null,
		)
		expect(endpointStatus(v, "3f9a1c2e")).toEqual({ tone: "amber", word: "Behind", detail: null })
		expect(endpointStatus(v, "b07d44a1")).toEqual({ tone: "amber", word: "Wrong network", detail: null })
	})

	test("an endpoint the router has not asked, one it does not list, and no route at all are grey", () => {
		const grey = { tone: "gray", word: "Not asked yet", detail: null }
		const v = view([{ id: "3f9a1c2e", state: "unknown", since: 1 }], null)
		expect(endpointStatus(v, "3f9a1c2e")).toEqual(grey)
		expect(endpointStatus(v, "c1d2e3f4")).toEqual(grey)
		expect(endpointStatus({ snapshot: null, readAt: READ_AT }, "3f9a1c2e")).toEqual(grey)
		expect(endpointStatus(null, "3f9a1c2e")).toEqual(grey)
	})
})

describe("ago", () => {
	test("seconds under a minute, whole minutes under an hour, then hours; never zero", () => {
		expect([0, 900, 59_400, 60_000, 119_000, 3_599_000, 3_600_000, 9_000_000].map(ago)).toEqual([
			"1 s ago",
			"1 s ago",
			"59 s ago",
			"1 min ago",
			"1 min ago",
			"59 min ago",
			"1 h ago",
			"2 h ago",
		])
	})
})

describe("movedFirstWarning", () => {
	test("names what the endpoint was doing when it was moved, and promises no particular endpoint", () => {
		expect(movedFirstWarning("down")).toBe("This endpoint was not answering. The wallet will try another if needed.")
		expect(movedFirstWarning("behind")).toBe("This endpoint was behind. The wallet will try another if needed.")
		expect(movedFirstWarning("wrong-chain")).toBe("This endpoint answered for another network. The wallet will try another if needed.")
	})

	test("nothing for an endpoint that answered or that the router had not asked", () => {
		expect([movedFirstWarning("ready"), movedFirstWarning("unknown"), movedFirstWarning(undefined)]).toEqual([null, null, null])
	})
})
