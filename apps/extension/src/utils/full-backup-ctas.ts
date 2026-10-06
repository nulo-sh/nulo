import type { RestoreStatus } from "@/composables/useFullBackupImport"
import type { BackupSelection } from "@/utils/full-backup-helpers"

/**
 * What the full-backup CTA predicates read. Pages pass a `readonly()` view over their refs, so
 * each property is read only when a predicate reaches it, as the inline template expressions
 * were: a read the short-circuit skips adds no render dependency.
 */
export interface FullBackupCtaSource {
	readonly selectedBackup: BackupSelection | null
	readonly restoreStatus: RestoreStatus
	readonly isAllowedToImportBackup: boolean
	readonly isRestoreHasErrors: boolean
	readonly isRetrying: boolean
}

export function showsDecryptCta(s: Pick<FullBackupCtaSource, "selectedBackup">): boolean {
	return s.selectedBackup?.type === "encrypted" && !s.selectedBackup?.profileType
}

export function showsRestoreCta(s: Pick<FullBackupCtaSource, "selectedBackup" | "restoreStatus">): boolean {
	return Boolean(s.selectedBackup?.profileType) && s.restoreStatus !== "finished"
}

export function restoreCtaBlocked(s: Pick<FullBackupCtaSource, "isAllowedToImportBackup" | "restoreStatus">): boolean {
	return !s.isAllowedToImportBackup || s.restoreStatus === "failed" || s.restoreStatus === "progress"
}

/** Continue and View errors. */
export function showsRestoreErrorCtas(s: Pick<FullBackupCtaSource, "restoreStatus" | "isRestoreHasErrors">): boolean {
	return s.restoreStatus === "finished" && s.isRestoreHasErrors
}

export function backCtaBlocked(s: Pick<FullBackupCtaSource, "restoreStatus" | "isRetrying">): boolean {
	return s.restoreStatus === "progress" || s.isRetrying
}
