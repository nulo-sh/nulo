import type { FullBackupCtaSource } from "@/utils/full-backup-ctas"
import { restoreCtaBlocked, showsDecryptCta, showsRestoreCta, showsRestoreErrorCtas } from "@/utils/full-backup-ctas"

export type FullBackupEnterAction = "decrypt" | "restore" | "continue" | null

/**
 * The full-backup action an Enter keypress runs: the button a press would reach, and only while
 * that button is enabled. Popup-only; onboarding import has no Enter shortcut.
 */
export function resolveFullBackupEnterAction(state: FullBackupCtaSource): FullBackupEnterAction {
	const { selectedBackup, restoreStatus, isAllowedToImportBackup, isRestoreHasErrors } = state
	const read = { selectedBackup, restoreStatus, isAllowedToImportBackup, isRestoreHasErrors }
	if (showsDecryptCta(read)) return "decrypt"
	if (showsRestoreCta(read) && !restoreCtaBlocked(read)) return "restore"
	if (showsRestoreErrorCtas(read) && !state.isRetrying) return "continue"
	return null
}
