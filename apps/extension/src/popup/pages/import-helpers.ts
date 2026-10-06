import type { RestoreStatus } from "@/composables/useFullBackupImport"
import { showsDecryptCta, showsRestoreCta, showsRestoreErrorCtas } from "@/utils/full-backup-ctas"
import type { BackupSelection } from "@/utils/full-backup-helpers"

export type FullBackupEnterAction = "decrypt" | "restore" | "continue" | null

/**
 * The full-backup action an Enter keypress runs: the button predicates, plus two execution guards
 * the buttons express as `disabled` instead. Popup-only; onboarding import has no Enter shortcut.
 */
export function resolveFullBackupEnterAction(state: {
	selectedBackup: BackupSelection | null
	restoreStatus: RestoreStatus
	isRestoreHasErrors: boolean
	isRetrying?: boolean
}): FullBackupEnterAction {
	const { selectedBackup, restoreStatus, isRestoreHasErrors } = state
	const read = { selectedBackup, restoreStatus, isRestoreHasErrors }
	if (showsDecryptCta(read)) return "decrypt"
	// Never resolve to "restore" while a restore is already in flight — the
	// composable guards re-entry too, but not firing the action keeps Enter
	// from queueing a redundant submit mid-import.
	if (showsRestoreCta(read) && restoreStatus !== "progress") return "restore"
	// Continue is disabled while a Retry runs; the shortcut must not reach it either.
	if (showsRestoreErrorCtas(read) && !state.isRetrying) return "continue"
	return null
}
