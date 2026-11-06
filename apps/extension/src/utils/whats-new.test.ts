import { describe, expect, test } from "vitest"
import { PROFILE_UI_KEY_PREFIXES } from "./profile-ui-keys"
import { changelogUrl, isWhatsNewDue, minorOf, releaseCore, seenOnInstall, WHATS_NEW_SEEN_KEY } from "./whats-new"

/** The marker after each `onInstalled`, then whether Home shows the row: what a person meets. */
function afterEvent(details: { reason: string; previousVersion?: string }, running: string, stored: unknown) {
	const written = seenOnInstall(details, running, stored)
	const marker = written ?? stored
	return { written, due: isWhatsNewDue(running, marker) }
}

describe("the What's new marker", () => {
	test("a fresh install writes its own minor and shows nothing", () => {
		expect(afterEvent({ reason: "install" }, "1.3.0", undefined)).toEqual({ written: "1.3", due: false })
	})

	test("an update from a build without the marker records the minor it came from, so the new minor prompts", () => {
		// `previousVersion` is the 4-part manifest version, not the package's.
		expect(afterEvent({ reason: "update", previousVersion: "1.2.4.0" }, "1.3.0", undefined)).toEqual({ written: "1.2", due: true })
	})

	test("a patch never prompts; a minor and a major do", () => {
		expect(isWhatsNewDue("1.3.0", "1.3")).toBe(false)
		expect(isWhatsNewDue("1.3.1", "1.3")).toBe(false)
		expect(isWhatsNewDue("1.4.0", "1.3")).toBe(true)
		expect(isWhatsNewDue("2.0.0", "1.9")).toBe(true)
		expect(isWhatsNewDue("1.10.0", "1.9")).toBe(true)
	})

	test("a readable marker is never moved by a later event, so a dismissed minor stays dismissed and an untold one stays told", () => {
		expect(afterEvent({ reason: "update", previousVersion: "1.3.0.0" }, "1.3.1", "1.3")).toEqual({ written: undefined, due: false })
		expect(afterEvent({ reason: "update", previousVersion: "1.3.0.0" }, "1.4.0", "1.2")).toEqual({ written: undefined, due: true })
		expect(afterEvent({ reason: "install" }, "1.4.0", "1.4")).toEqual({ written: undefined, due: false })
	})

	test("a prerelease never prompts; its About row uses the X.Y.Z it starts with", () => {
		expect(isWhatsNewDue("1.4.0-rc.1", "1.3")).toBe(false)
		expect(isWhatsNewDue("1.4.0", "1.3")).toBe(true)
		expect(releaseCore("1.4.0-rc.1")).toBe("1.4.0")
		expect(changelogUrl("1.4.0")).toBe("https://nulo.sh/changelog/v1.4.0/")
		// An rc's manifest version carries its number as the fourth part.
		expect(afterEvent({ reason: "update", previousVersion: "1.4.0.1" }, "1.4.0", undefined)).toEqual({ written: "1.4", due: false })
	})

	test("a damaged marker shows nothing and the next install or update replaces it", () => {
		for (const damaged of ["1.3.0", "v1.3", "", 13, null, { minor: "1.3" }]) {
			expect(isWhatsNewDue("1.4.0", damaged)).toBe(false)
			expect(seenOnInstall({ reason: "update", previousVersion: "1.3.2.0" }, "1.4.0", damaged)).toBe("1.3")
		}
	})

	test("a browser update writes nothing", () => {
		expect(seenOnInstall({ reason: "chrome_update" }, "1.4.0", undefined)).toBeUndefined()
		expect(seenOnInstall({ reason: "browser_update" }, "1.4.0", undefined)).toBeUndefined()
	})

	test("the marker survives a profile deletion but not a device reset", () => {
		// A profile deletion removes keys under these prefixes only; a device reset leaves storage empty.
		expect(PROFILE_UI_KEY_PREFIXES.filter((prefix) => WHATS_NEW_SEEN_KEY.startsWith(prefix))).toEqual([])
		expect(isWhatsNewDue("1.4.0", undefined)).toBe(false)
		expect(afterEvent({ reason: "update", previousVersion: "1.4.0.0" }, "1.5.0", undefined)).toEqual({ written: "1.4", due: true })
	})

	test("Dismiss writes the running minor", () => {
		expect(minorOf("1.4.2")).toBe("1.4")
		expect(isWhatsNewDue("1.4.2", minorOf("1.4.2"))).toBe(false)
	})
})
