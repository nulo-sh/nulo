import { describe, expect, test } from "vitest"
import type { FullBackupCtaSource } from "@/utils/full-backup-ctas"
import type { BackupSelection } from "@/utils/full-backup-helpers"
import { resolveFullBackupEnterAction } from "./import-helpers"

const sel = (o: Record<string, unknown>) => o as unknown as BackupSelection

const at = (s: Partial<FullBackupCtaSource>): FullBackupCtaSource => ({
	selectedBackup: null,
	restoreStatus: "",
	isAllowedToImportBackup: true,
	isRestoreHasErrors: false,
	isRetrying: false,
	...s,
})

describe("resolveFullBackupEnterAction (popup full-backup Enter shortcut)", () => {
	test("encrypted backup not yet decrypted → decrypt", () => {
		expect(
			resolveFullBackupEnterAction(
				at({
					selectedBackup: sel({ type: "encrypted", profileType: null }),
					restoreStatus: null,
					isRestoreHasErrors: false,
				}),
			),
		).toBe("decrypt")
	})

	test("decrypted backup (has profileType), not finished → restore", () => {
		expect(
			resolveFullBackupEnterAction(
				at({
					selectedBackup: sel({ type: "encrypted", profileType: "password" }),
					restoreStatus: "",
					isRestoreHasErrors: false,
				}),
			),
		).toBe("restore")
	})

	test("restore IN PROGRESS → null (Enter must not resubmit mid-import)", () => {
		// Re-entrancy: firing "restore" again while a restore is in flight would
		// race a second profile creation into the un-locked account restore.
		expect(
			resolveFullBackupEnterAction(
				at({
					selectedBackup: sel({ type: "plain", profileType: "passkey" }),
					restoreStatus: "progress",
					isRestoreHasErrors: false,
				}),
			),
		).toBe(null)
	})

	test("finished with errors → continue", () => {
		expect(
			resolveFullBackupEnterAction(
				at({
					selectedBackup: sel({ type: "plain", profileType: "password" }),
					restoreStatus: "finished",
					isRestoreHasErrors: true,
				}),
			),
		).toBe("continue")
	})

	test("finished with errors while a Retry runs → null (Continue waits for the Retry to settle)", () => {
		expect(
			resolveFullBackupEnterAction(
				at({
					selectedBackup: sel({ type: "plain", profileType: "password" }),
					restoreStatus: "finished",
					isRestoreHasErrors: true,
					isRetrying: true,
				}),
			),
		).toBeNull()
	})

	test("finished without errors → null (completeImport already ran)", () => {
		expect(
			resolveFullBackupEnterAction(
				at({
					selectedBackup: sel({ type: "plain", profileType: "password" }),
					restoreStatus: "finished",
					isRestoreHasErrors: false,
				}),
			),
		).toBeNull()
	})

	// Enter never reaches a disabled Restore: after a failure, only picking the file again restarts.
	test("failed → null, as the Restore button is disabled", () => {
		expect(
			resolveFullBackupEnterAction(
				at({
					selectedBackup: sel({ type: "plain", profileType: "password" }),
					restoreStatus: "failed",
				}),
			),
		).toBeNull()
	})

	test("restore not allowed (the form is incomplete) → null", () => {
		expect(
			resolveFullBackupEnterAction(
				at({
					selectedBackup: sel({ type: "plain", profileType: "password" }),
					isAllowedToImportBackup: false,
				}),
			),
		).toBeNull()
	})

	test("decrypted backup, null status → restore", () => {
		expect(
			resolveFullBackupEnterAction(
				at({
					selectedBackup: sel({ type: "plain", profileType: "passkey" }),
					restoreStatus: null,
					isRestoreHasErrors: false,
				}),
			),
		).toBe("restore")
	})

	test("nothing selected → null", () => {
		expect(resolveFullBackupEnterAction(at({}))).toBeNull()
	})

	// Each field is read once, up front, in this order; `isRetrying` only when Continue is otherwise due.
	const FOUR = ["selectedBackup", "restoreStatus", "isAllowedToImportBackup", "isRestoreHasErrors"]
	test.each([
		["decrypt", sel({ type: "encrypted", profileType: null }), null, false, false, "decrypt", FOUR],
		["restore", sel({ type: "encrypted", profileType: "password" }), "", false, false, "restore", FOUR],
		["in progress", sel({ type: "encrypted", profileType: "password" }), "progress", false, false, null, FOUR],
		["continue", sel({ type: "plain", profileType: "password" }), "finished", true, false, "continue", [...FOUR, "isRetrying"]],
		["retrying", sel({ type: "plain", profileType: "password" }), "finished", true, true, null, [...FOUR, "isRetrying"]],
		["finished clean", sel({ type: "plain", profileType: "password" }), "finished", false, false, null, FOUR],
		["nothing selected", null, "", false, false, null, FOUR],
	] as const)(
		"reads the state in a fixed order: %s",
		(_label, selectedBackup, restoreStatus, isRestoreHasErrors, isRetrying, action, reads) => {
			const log: string[] = []
			const values: Record<string, unknown> = {
				selectedBackup,
				restoreStatus,
				isAllowedToImportBackup: true,
				isRestoreHasErrors,
				isRetrying,
			}
			const logged = (k: string) => () => {
				log.push(k)
				return values[k]
			}
			const state = Object.defineProperties(
				{},
				Object.fromEntries(Object.keys(values).map((k) => [k, { enumerable: true, get: logged(k) }])),
			) as FullBackupCtaSource
			expect(resolveFullBackupEnterAction(state)).toBe(action)
			expect(log).toEqual(reads)
		},
	)
})
