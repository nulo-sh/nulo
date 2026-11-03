/**
 * What a picked or opened full backup shows before Restore: the selection the page publishes and
 * the refusal beside it. Both import pages read and open a selection here and keep their own
 * admission, pick counter and resets.
 */

import {
	AccountFileNotBackupError,
	type BackupSelection,
	openSelection,
	readBackupFile,
	unreadableSelection,
} from "@/utils/full-backup-helpers"
import { EARLIER_PASSKEY_BACKUP, refusedAsEarlierPasskey } from "@/wallet/services/backup/trust-gate"

/** A picked file that is no backup the wallet reads. */
export const UNRECOGNIZED_BACKUP = {
	title: "Unrecognized Backup File",
	message: "The selected file is not a valid backup. Please select a correct backup file.",
} as const

export const DECRYPTION_FAILED = {
	title: "Decryption Failed",
	message:
		"The provided password is incorrect or the backup file is corrupted. Please try again with the correct password or select another file.",
} as const

/** An encrypted account file picked as a backup, recognised once its password opens it. */
export const ACCOUNT_FILE_NOT_BACKUP = {
	title: "Not a Backup File",
	message: "This is an account file. Import it from Settings > Accounts > Import Account.",
} as const

/** A pick whose file could not be read: the banner's whole copy. */
export const BACKUP_READ_FAILED = "Failed to read the backup file"

/** The banner copy a refused selection shows. */
export interface SelectionRefusal {
	readonly title: string
	readonly message: string
}

export interface PickedBackup {
	selection: BackupSelection
	refusal?: SelectionRefusal
}

/**
 * Reads a picked file into the selection to publish, refused when it is an earlier passkey body, an
 * unparsable or oversized file, or no backup the wallet reads. Only the earlier-passkey refusal
 * runs the trust gate this early; Restore validates the whole body again before it writes.
 */
export async function readPickedBackup(file: File): Promise<PickedBackup> {
	const { selection, parseError } = await readBackupFile(file)
	if (selection.kind === "plain" && (await refusedAsEarlierPasskey(selection.backup))) {
		return { selection: unreadableSelection(selection.name), refusal: EARLIER_PASSKEY_BACKUP }
	}
	if (parseError) return { selection, refusal: { title: parseError.title, message: parseError.tooltip } }
	if (selection.kind === "unreadable" || (selection.kind === "plain" && !selection.profileType)) {
		return { selection, refusal: UNRECOGNIZED_BACKUP }
	}
	return { selection }
}

export type OpenedBackup =
	| { kind: "stale" }
	| { kind: "opened"; selection: Extract<BackupSelection, { kind: "opened" }> }
	/** `selection` replaces the target when the file is refused for what it is; a wrong password
	 *  keeps the target. */
	| { kind: "refused"; refusal: SelectionRefusal; selection?: BackupSelection }

/**
 * Opens `target` under `password`. `stale` once `isStale` holds after any await here; the caller
 * checks again when it resumes, since this result reaches it a microtask after the last check.
 */
export async function openPickedBackup(target: BackupSelection, password: string, isStale: () => boolean): Promise<OpenedBackup> {
	try {
		const opened = await openSelection(target, password, isStale)
		if (opened.kind === "stale") return opened
		const refused = await refusedAsEarlierPasskey(opened.selection.backup)
		if (isStale()) return { kind: "stale" }
		if (refused) return { kind: "refused", refusal: EARLIER_PASSKEY_BACKUP, selection: unreadableSelection(target.name) }
		return opened
	} catch (error) {
		if (isStale()) return { kind: "stale" }
		if (error instanceof AccountFileNotBackupError) {
			return { kind: "refused", refusal: ACCOUNT_FILE_NOT_BACKUP, selection: unreadableSelection(target.name) }
		}
		return { kind: "refused", refusal: DECRYPTION_FAILED }
	}
}
