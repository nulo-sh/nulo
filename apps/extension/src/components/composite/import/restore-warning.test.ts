import { describe, expect, test } from "vitest"
import {
	heldAccountRestoreError,
	RESTORE_AGAIN_OTHER_BACKUP,
	restoreAgainDoneText,
	restoreAgainFailedText,
	restoreAgainIntroText,
	restoreNoticeText,
	restoreWarningText,
	retryResultText,
	withNetworkNames,
} from "./restore-warning"

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

describe("restoreWarningText — imported accounts held for a network", () => {
	const held = (name: string, chainId: number) => ({ name, chainId })
	test.each([
		[
			"one account",
			[],
			[held("Savings", 1337)],
			"Profile import completed with some errors. The imported account “Savings” was not restored. Add the network with chain ID 1337 to restore it, or import it again from its account file. Turn on Developer Mode in Settings to add a network. You can review the details or continue.",
		],
		[
			"two accounts on one chain",
			[],
			[held("Savings", 1337), held("Trading", 1337)],
			"Profile import completed with some errors. The imported accounts “Savings” and “Trading” were not restored. Add the network with chain ID 1337 to restore them, or import them again from their account files. Turn on Developer Mode in Settings to add a network. You can review the details or continue.",
		],
		[
			"two accounts on two chains",
			[],
			[held("Savings", 1337), held("Trading", 4242)],
			"Profile import completed with some errors. The imported accounts “Savings” and “Trading” were not restored. Add the networks with chain IDs 1337 and 4242 to restore them, or import them again from their account files. Turn on Developer Mode in Settings to add a network. You can review the details or continue.",
		],
		[
			"past three accounts and three chains",
			[],
			[held("A", 1), held("B", 2), held("C", 3), held("D", 4), held("E", 5)],
			"Profile import completed with some errors. “A”, “B”, “C”, and 2 more imported accounts were not restored. Add the networks with chain IDs 1, 2, 3, and 2 more to restore them, or import them again from their account files. Turn on Developer Mode in Settings to add a network. You can review the details or continue.",
		],
		[
			"four accounts on one chain",
			[],
			[held("A", 1337), held("B", 1337), held("C", 1337), held("D", 1337)],
			"Profile import completed with some errors. “A”, “B”, “C”, and 1 more imported account were not restored. Add the network with chain ID 1337 to restore them, or import them again from their account files. Turn on Developer Mode in Settings to add a network. You can review the details or continue.",
		],
		[
			"beside a network a Retry replays",
			["Testnet"],
			[held("Savings", 1337)],
			"Testnet didn't answer in time, so what was saved for it may not be restored. The imported account “Savings” was not restored. Add the network with chain ID 1337 to restore it, or import it again from its account file. Turn on Developer Mode in Settings to add a network. You can retry, review the details, or continue.",
		],
	])("%s", (_, names, accounts, sentence) => {
		expect(restoreWarningText(names, true, accounts)).toBe(sentence)
	})
})

describe("restoreWarningText — imported accounts on a retired network", () => {
	const [RC1, RC3, ALPHA_V5] = [2904119610, 3415328944, 4248422646]
	const held = (name: string, chainId: number) => ({ name, chainId })
	const opening = "Profile import completed with some errors."
	const closing = "You can review the details or continue."
	test.each([
		[
			"one account",
			[held("Trading", RC1)],
			"The imported account “Trading” was not restored. It was on Testnet V6-RC.1, which has been retired.",
		],
		[
			"two accounts on one retired network",
			[held("A", RC1), held("B", RC1)],
			"The imported accounts “A” and “B” were not restored. They were on Testnet V6-RC.1, which has been retired.",
		],
		[
			"accounts on two retired networks, in the order the networks retired",
			[held("A", RC3), held("B", RC1)],
			"The imported account “B” was not restored. It was on Testnet V6-RC.1, which has been retired. The imported account “A” was not restored. It was on Testnet V6-RC.3, which has been retired.",
		],
		[
			"more than three accounts on one retired network",
			["A", "B", "C", "D", "E"].map((name) => held(name, ALPHA_V5)),
			"“A”, “B”, “C”, and 2 more imported accounts were not restored. They were on Alpha V5, which has been retired.",
		],
	])("%s", (_, accounts, sentence) => {
		expect(restoreWarningText([], true, accounts)).toBe(`${opening} ${sentence} ${closing}`)
	})

	test("the View Errors line leads with a retired network's name; any other chain keeps waiting for its network", () => {
		expect(heldAccountRestoreError(RC1)).toBe("Testnet V6-RC.1 has been retired. Not restored.")
		expect(heldAccountRestoreError(677692)).toBe("Waiting for a network with chain ID 677692")
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

describe("Restore again's words", () => {
	test("the line above the file picker", () => {
		expect(restoreAgainIntroText(["Testnet"])).toBe(
			"Choose the backup file you restored this profile from. Only Testnet will be restored, into this profile.",
		)
		expect(restoreAgainIntroText(["Testnet", "Local Network"])).toBe(
			"Choose the backup file you restored this profile from. Only Testnet and Local Network will be restored, into this profile.",
		)
	})

	test("the toast, the warning for what no Retry restores, and the other-backup refusal", () => {
		expect(restoreAgainDoneText(["Testnet"])).toBe("Testnet restored")
		expect(restoreAgainDoneText(["Testnet", "Local Network"])).toBe("Testnet and Local Network restored")
		expect(restoreAgainFailedText(["Testnet"])).toBe(
			"Testnet couldn't be restored from this backup. You can review the details or continue.",
		)
		expect(RESTORE_AGAIN_OTHER_BACKUP).toEqual({
			title: "This isn't the backup you restored",
			message: "Choose the file you restored this profile from.",
		})
	})
})
