import { describe, expect, test } from "vitest"
import { restoreNoticeText, restoreWarningText, retryResultText, withNetworkNames } from "./restore-warning"

describe("restoreWarningText", () => {
	test.each([
		[
			"one network",
			["Alpha V5"],
			false,
			"Alpha V5 didn't answer in time, so what was saved for it may not be restored. You can retry or continue.",
		],
		[
			"two networks",
			["Alpha V5", "Testnet"],
			false,
			"Alpha V5 and Testnet didn't answer in time, so what was saved for them may not be restored. You can retry or continue.",
		],
		[
			"three networks",
			["Alpha V5", "Testnet", "Local Network"],
			false,
			"Alpha V5, Testnet, and Local Network didn't answer in time, so what was saved for them may not be restored. You can retry or continue.",
		],
		[
			"a network and another error",
			["Alpha V5"],
			true,
			"Alpha V5 didn't answer in time, so what was saved for it may not be restored. You can retry, review the details, or continue.",
		],
		["other errors only", [], true, "Profile import completed with some errors. You can review the details or continue."],
	])("%s", (_, names, hasOtherErrors, sentence) => {
		expect(restoreWarningText(names, hasOtherErrors)).toBe(sentence)
	})
})

describe("retryResultText", () => {
	test.each([
		[["Testnet"], "Retry didn't work · Testnet still not restored"],
		[["Testnet", "Local Network"], "Retry didn't work · Testnet and Local Network still not restored"],
	])("%j", (names, line) => {
		expect(retryResultText(names)).toBe(line)
	})
})

describe("restoreNoticeText", () => {
	test.each([
		[["Testnet"], "Some entries from the backup couldn't be restored. Testnet didn't finish restoring."],
		[
			["Testnet", "Local Network"],
			"Some entries from the backup couldn't be restored. Testnet and Local Network didn't finish restoring.",
		],
		[[], "Some entries from the backup couldn't be restored."],
	])("%j", (names, notice) => {
		expect(restoreNoticeText(names)).toBe(notice)
	})
})

describe("withNetworkNames", () => {
	const names = new Map([["3f2a9c1e", "Testnet"]])

	test("names a known network just before its id and keeps every other row as it is", () => {
		const known = { networkId: "3f2a9c1e", senders: [], restoreError: "Skipped: the node did not answer" }
		const unknown = { networkId: "0badc0de", restoreError: "Network not found" }
		const noId = { row: 3, restoreError: "Skipped: its network is not one of the built-in networks" }
		const named = withNetworkNames({ "account-state": [known, unknown], transaction: [noId] }, names)

		expect(named).toEqual({
			"account-state": [{ network: "Testnet", ...known }, unknown],
			transaction: [noId],
		})
		expect(Object.keys(named["account-state"][0] as object)).toEqual(["network", "networkId", "senders", "restoreError"])
	})

	test("leaves the log's own rows untouched", () => {
		const row = { networkId: "3f2a9c1e", restoreError: "Skipped: the node did not answer" }
		const log = { "account-state": [row] }
		withNetworkNames(log, names)
		expect(log["account-state"][0]).toBe(row)
		expect(row).not.toHaveProperty("network")
	})
})
