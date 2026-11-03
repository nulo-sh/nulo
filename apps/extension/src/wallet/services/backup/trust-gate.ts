import { EncryptionKey } from "@nulo/wallet-crypto"
import { BACKUP_SCHEMA_VERSION_FIELD, COMPAT_EPOCH_FIELD, isSupportedCompatEpoch } from "./backup-migration-registry"
import { maxBackupSchemaVersion, migrateBackupData } from "./backup-migrator"

// Beside the checksum, outside the body it covers, in the backups of passkey profiles made before 1.1.
const EARLIER_PASSKEY_CHECK_FIELD = "backup-mac"

/** The full-backup envelope: the checksum and the checksum-covered body. */
export type FullBackupEnvelope = {
	checksum?: string
	[EARLIER_PASSKEY_CHECK_FIELD]?: unknown
	"compat-epoch"?: unknown
	"backup-schema-version"?: unknown
	"master-key"?: string
	"active-chain-id"?: number
	data: Record<string, unknown>
}

/**
 * The migrated backup body the restore stages read and filter in place. `validateAndMigrateBackup`
 * guarantees each present root slice is an array of plain objects with a valid row id, and that
 * `profile` is a {@link BackupProfile}.
 */
export type RestoreData = Record<string, unknown> & {
	account?: Array<Record<string, unknown>>
	token?: Array<Record<string, unknown>>
	"token-balance"?: Array<Record<string, unknown>>
	profile?: unknown
}

/** The backup's profile part as the restore reads it; the profile service judges the `id`. */
export type BackupProfile = { id: unknown; name: string; type: "password" | "passkey" }

/** The checksum-stripped body + the migrated slices that survive stage 1. */
export type ValidatedBackup = {
	data: RestoreData & { profile: BackupProfile }
	backup: Omit<FullBackupEnvelope, "checksum" | typeof EARLIER_PASSKEY_CHECK_FIELD>
	/** The verified checksum: it names this exact backup. */
	checksum: string
}

type ValidateAndMigrateResult = ({ kind: "ok" } & ValidatedBackup) | { kind: "rejected"; title: string; message: string }

/** What a backup that is not the one the wallet exported shows, whichever check refused it. */
const INTEGRITY_FAILED = {
	title: "Backup Integrity Check Failed",
	message: "The backup file appears to be corrupted or has been tampered with. Please ensure you have the correct backup file.",
} as const

const INTEGRITY_REFUSAL = { kind: "rejected", ...INTEGRITY_FAILED } as const

const INCOMPATIBLE_BACKUP = {
	kind: "rejected",
	title: "Incompatible backup",
	message:
		"This backup was created by an incompatible wallet version and cannot be imported. Re-export a backup from a current version of the wallet.",
} as const

/** A body a passkey profile made before 1.1 exported: its master opened with the passkey alone,
 *  so no recovery phrase rides beside it, and no build restores it. Compared by identity. */
export const EARLIER_PASSKEY_BACKUP = {
	kind: "rejected",
	title: "Backup from an earlier version",
	message: "This backup was made by a passkey profile on an earlier version of Nulo, and this version can't restore it.",
} as const

/** That body by its shape: a passkey body carrying the passkey-sealed key or the passkey check, or
 *  with no recovery phrase. A later passkey body carries the password body's fields; a password body
 *  meets its own gates whatever else it carries. */
function isEarlierPasskeyBody(fullBackup: FullBackupEnvelope, profile: BackupProfile): boolean {
	return (
		profile.type === "passkey" &&
		(Object.hasOwn(fullBackup, EARLIER_PASSKEY_CHECK_FIELD) ||
			Object.hasOwn(fullBackup, "imported-keys-dek-sealed") ||
			typeof (fullBackup as Record<string, unknown>).entropy !== "string")
	)
}

/** The restore reads `type` and `name` as the wallet wrote them; `id` is replaced by the service
 *  whenever the wallet would not have generated it. */
function isBackupProfile(profile: unknown): profile is BackupProfile {
	if (typeof profile !== "object" || profile === null || Array.isArray(profile)) return false
	const { type, name } = profile as Record<string, unknown>
	return (type === "password" || type === "passkey") && typeof name === "string"
}

/** Validates and migrates the backup entirely in memory, before any live storage write; a `rejected`
 *  result carries the banner copy the caller shows. */
export async function validateAndMigrateBackup(fullBackup: FullBackupEnvelope): Promise<ValidateAndMigrateResult> {
	const { checksum, [EARLIER_PASSKEY_CHECK_FIELD]: _earlierCheck, ...backup } = fullBackup

	// Trust-gate order is deliberate: integrity FIRST — re-serialized exactly as
	// the exporter hashed it (the exporter also hashed JSON.stringify of the
	// object, so this IS the exported body) — then the non-migratable
	// compat-epoch, then the migratable schema-version range. The checksum is
	// accidental-integrity detection only — a plain backup's checksum is
	// attacker-recomputable, so nothing downstream may treat it as authentication.
	let body: string
	try {
		body = JSON.stringify(backup)
	} catch {
		// A body nested past the engine's stack cannot be re-serialised, so it cannot be verified.
		return INTEGRITY_REFUSAL
	}
	const comparisonChecksum = await EncryptionKey.getHashHex(body)
	if (checksum !== comparisonChecksum) return INTEGRITY_REFUSAL

	// A pre-baseline blob (the legacy conflated `schema-version: 2`, no
	// `compat-epoch`) fails this gate too — intended fail-closed.
	if (!isSupportedCompatEpoch(backup[COMPAT_EPOCH_FIELD])) return INCOMPATIBLE_BACKUP

	const backupSchemaVersion = backup[BACKUP_SCHEMA_VERSION_FIELD]
	if (typeof backupSchemaVersion !== "number" || !Number.isInteger(backupSchemaVersion) || backupSchemaVersion < 1) {
		return {
			kind: "rejected",
			title: "Incompatible backup",
			message: "This backup does not carry a valid schema version. Re-export a backup from a current version of the wallet.",
		}
	}
	if (backupSchemaVersion > maxBackupSchemaVersion()) {
		return {
			kind: "rejected",
			title: "Backup is too new",
			message: "This backup was created by a newer version of the wallet. Update the wallet, then import it again.",
		}
	}

	// Migrate the verified slices forward BEFORE anything touches live storage:
	// pure and in-memory, so a failure here rejects the import with ZERO live
	// state to roll back. The migrated data replaces the parsed slices; the
	// checksum was already verified over the ORIGINAL bytes and is dropped —
	// migration is a pure function of verified input, so its output is covered
	// transitively (never recompute-and-trust a post-migration checksum).
	// `master-key` is a top-level field, not a slice — it never enters the migrator.
	const migrationResult = await migrateBackupData({ data: backup.data, backupSchemaVersion })
	if (migrationResult.kind === "incompatible") {
		return { kind: "rejected", title: "Incompatible backup", message: migrationResult.reason }
	}
	if (migrationResult.kind === "failed") {
		return {
			kind: "rejected",
			title: "Import failed",
			message: `The backup could not be upgraded to the current format: ${migrationResult.reason}`,
		}
	}

	const data = migrationResult.data as RestoreData
	if (!isBackupProfile(data.profile)) return INTEGRITY_REFUSAL
	if (isEarlierPasskeyBody(fullBackup, data.profile)) return EARLIER_PASSKEY_BACKUP
	return { kind: "ok", data: data as ValidatedBackup["data"], backup, checksum: comparisonChecksum }
}

/** Whether a picked or opened body is one {@link EARLIER_PASSKEY_BACKUP} refuses. Asked before a
 *  selection is published, so the refusal shows before any other control; the restore validates
 *  again before it writes. */
export async function refusedAsEarlierPasskey(backup: unknown): Promise<boolean> {
	if (typeof backup !== "object" || backup === null || Array.isArray(backup)) return false
	try {
		return (await validateAndMigrateBackup(backup as FullBackupEnvelope)) === EARLIER_PASSKEY_BACKUP
	} catch {
		return false
	}
}
