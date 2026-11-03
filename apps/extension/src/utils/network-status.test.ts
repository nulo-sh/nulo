import { expect, test } from "vitest"
import { networkStatusTone, networkStatusWord } from "./network-status"

test("a node that answers reads Connected, in green", () => {
	expect([networkStatusWord("Active"), networkStatusTone("Active")]).toEqual(["Connected", "connected"])
})

test("a node that does not answer, or answers for another chain, cannot be reached, in red", () => {
	for (const status of ["Inactive", "InvalidChain"]) {
		expect([networkStatusWord(status), networkStatusTone(status)]).toEqual(["Cannot reach the network", "unreachable"])
	}
})

test("a read in flight, or none yet, is waiting, in grey", () => {
	for (const status of ["sync", undefined]) {
		expect([networkStatusWord(status), networkStatusTone(status)]).toEqual(["Waiting for the network", "waiting"])
	}
})
