import { describe, expect, test } from "vitest"
import { showsDecryptCta, showsRestoreCta } from "./full-backup-ctas"
import type { BackupSelection } from "./full-backup-helpers"

const UNREADABLE: BackupSelection = { kind: "unreadable", name: "b.json", backup: null, profileType: null }
const PLAIN: BackupSelection = { kind: "plain", name: "b.json", backup: {}, profileType: "password" }
const PLAIN_UNTYPED: BackupSelection = { kind: "plain", name: "b.json", backup: {}, profileType: null }
const SEALED: BackupSelection = { kind: "sealed", name: "b.txt", backup: "nulo:full-backup:v2:AAAA", profileType: null }
const OPENED: BackupSelection = { kind: "opened", name: "b.txt", backup: {}, profileType: "password" }
const OPENED_UNTYPED: BackupSelection = { kind: "opened", name: "b.txt", backup: {}, profileType: null }

describe("full-backup CTAs over each selection kind", () => {
	test.each([
		["nothing picked", null, false, false],
		["unreadable", UNREADABLE, false, false],
		["plain", PLAIN, false, true],
		["plain with no profile type", PLAIN_UNTYPED, false, false],
		["sealed", SEALED, true, false],
		["opened", OPENED, false, true],
		// A decrypted body with no profile type keeps Decrypt: it may be sealed text again.
		["(BUG PIN) opened with no profile type", OPENED_UNTYPED, true, false],
	])("%s: Decrypt %s, Restore %s", (_label, selectedBackup, decrypt, restore) => {
		expect(showsDecryptCta({ selectedBackup })).toBe(decrypt)
		expect(showsRestoreCta({ selectedBackup, restoreStatus: null })).toBe(restore)
	})

	test("a finished restore shows no Restore", () => {
		expect(showsRestoreCta({ selectedBackup: PLAIN, restoreStatus: "finished" })).toBe(false)
	})
})
