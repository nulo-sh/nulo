import { type FullBackupEnvelope, validateAndMigrateBackup } from "@/composables/useFullBackupImport"
import { normalizeBackupData } from "@/wallet/services/backup/backup-migration-registry"
import { unreadRows } from "./reads"

/**
 * Why `envelope`, a full backup's content (opened, when it was encrypted), would not validate,
 * migrate and read in this build: the import's refusal, migrated slices that do not restore to
 * storage rows, or a restored row its registered read code returns nothing for. Empty when it
 * would. It stops before each service's `restore()` and its own checks.
 */
export async function backupProblems(envelope: unknown, now = Date.now()): Promise<string[]> {
	const validated = await validateAndMigrateBackup(envelope as FullBackupEnvelope)
	if (validated.kind !== "ok") return [`refused: ${validated.title}: ${validated.message}`]
	const normalized = normalizeBackupData(validated.data)
	if (!normalized.ok) return [`its slices do not restore: ${normalized.reason}`]
	return unreadRows(normalized.normalized.entries, now)
}
