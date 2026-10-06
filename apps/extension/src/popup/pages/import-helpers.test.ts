import { describe, expect, test } from "vitest"
import type { BackupSelection } from "@/utils/full-backup-helpers"
import { resolveFullBackupEnterAction } from "./import-helpers"

const sel = (o: Record<string, unknown>) => o as unknown as BackupSelection

describe("resolveFullBackupEnterAction (popup full-backup Enter shortcut)", () => {
	test("encrypted backup not yet decrypted → decrypt", () => {
		expect(
			resolveFullBackupEnterAction({
				selectedBackup: sel({ type: "encrypted", profileType: null }),
				restoreStatus: null,
				isRestoreHasErrors: false,
			}),
		).toBe("decrypt")
	})

	test("decrypted backup (has profileType), not finished → restore", () => {
		expect(
			resolveFullBackupEnterAction({
				selectedBackup: sel({ type: "encrypted", profileType: "password" }),
				restoreStatus: "",
				isRestoreHasErrors: false,
			}),
		).toBe("restore")
	})

	test("restore IN PROGRESS → null (Enter must not resubmit mid-import)", () => {
		// Re-entrancy: firing "restore" again while a restore is in flight would
		// race a second profile creation into the un-locked account restore.
		expect(
			resolveFullBackupEnterAction({
				selectedBackup: sel({ type: "plain", profileType: "passkey" }),
				restoreStatus: "progress",
				isRestoreHasErrors: false,
			}),
		).toBe(null)
	})

	test("finished with errors → continue", () => {
		expect(
			resolveFullBackupEnterAction({
				selectedBackup: sel({ type: "plain", profileType: "password" }),
				restoreStatus: "finished",
				isRestoreHasErrors: true,
			}),
		).toBe("continue")
	})

	test("finished with errors while a Retry runs → null (Continue waits for the Retry to settle)", () => {
		expect(
			resolveFullBackupEnterAction({
				selectedBackup: sel({ type: "plain", profileType: "password" }),
				restoreStatus: "finished",
				isRestoreHasErrors: true,
				isRetrying: true,
			}),
		).toBeNull()
	})

	test("finished without errors → null (completeImport already ran)", () => {
		expect(
			resolveFullBackupEnterAction({
				selectedBackup: sel({ type: "plain", profileType: "password" }),
				restoreStatus: "finished",
				isRestoreHasErrors: false,
			}),
		).toBeNull()
	})

	test("(drift pin) failed → restore, though the Restore button is disabled at failed", () => {
		expect(
			resolveFullBackupEnterAction({
				selectedBackup: sel({ type: "plain", profileType: "password" }),
				restoreStatus: "failed",
				isRestoreHasErrors: false,
			}),
		).toBe("restore")
	})

	test("decrypted backup, null status → restore", () => {
		expect(
			resolveFullBackupEnterAction({
				selectedBackup: sel({ type: "plain", profileType: "passkey" }),
				restoreStatus: null,
				isRestoreHasErrors: false,
			}),
		).toBe("restore")
	})

	test("nothing selected → null", () => {
		expect(resolveFullBackupEnterAction({ selectedBackup: null, restoreStatus: "", isRestoreHasErrors: false })).toBeNull()
	})

	// Each field is read once, up front, in this order; `isRetrying` only when Continue is otherwise due.
	const THREE = ["selectedBackup", "restoreStatus", "isRestoreHasErrors"]
	test.each([
		["decrypt", sel({ type: "encrypted", profileType: null }), null, false, false, "decrypt", THREE],
		["restore", sel({ type: "encrypted", profileType: "password" }), "", false, false, "restore", THREE],
		["in progress", sel({ type: "encrypted", profileType: "password" }), "progress", false, false, null, THREE],
		["continue", sel({ type: "plain", profileType: "password" }), "finished", true, false, "continue", [...THREE, "isRetrying"]],
		["retrying", sel({ type: "plain", profileType: "password" }), "finished", true, true, null, [...THREE, "isRetrying"]],
		["finished clean", sel({ type: "plain", profileType: "password" }), "finished", false, false, null, THREE],
		["nothing selected", null, "", false, false, null, THREE],
	] as const)(
		"reads the state in a fixed order: %s",
		(_label, selectedBackup, restoreStatus, isRestoreHasErrors, isRetrying, action, reads) => {
			const log: string[] = []
			const values: Record<string, unknown> = { selectedBackup, restoreStatus, isRestoreHasErrors, isRetrying }
			const logged = (k: string) => () => {
				log.push(k)
				return values[k]
			}
			const state = Object.defineProperties(
				{},
				Object.fromEntries(Object.keys(values).map((k) => [k, { enumerable: true, get: logged(k) }])),
			) as Parameters<typeof resolveFullBackupEnterAction>[0]
			expect(resolveFullBackupEnterAction(state)).toBe(action)
			expect(log).toEqual(reads)
		},
	)
})
