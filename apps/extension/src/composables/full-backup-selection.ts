/**
 * What a picked or opened full backup shows before Restore: the selection the page publishes and
 * the refusal beside it. The caller owns pick admission, the pick counter and resets.
 */

import type { Ref } from "vue"
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

export interface SelectionBanner {
	fillError: (type: string, title: string, tooltip?: string) => void
	clearError: () => void
}

/**
 * Opens `selected`'s backup under `password` and publishes the result: the opened selection, then
 * `onOpened`, or the refusal with the selection that replaces a file refused for what it is. No
 * await separates its last stale check from its writes, so a selection replaced while it runs is
 * never overwritten.
 */
export async function decryptSelection(
	selected: Ref<BackupSelection | null>,
	password: string,
	banner: SelectionBanner,
	onOpened?: (selection: Extract<BackupSelection, { kind: "opened" }>) => void,
): Promise<void> {
	const target = selected.value
	if (!password || !target) return
	const stale = () => selected.value !== target
	try {
		const opened = await openSelection(target, password, stale)
		if (opened.kind === "stale") return
		const refused = await refusedAsEarlierPasskey(opened.selection.backup)
		if (stale()) return
		if (refused) return refuse(selected, banner, EARLIER_PASSKEY_BACKUP, target.name)
		selected.value = opened.selection
		onOpened?.(opened.selection)
		banner.clearError()
	} catch (error) {
		if (stale()) return
		if (error instanceof AccountFileNotBackupError) return refuse(selected, banner, ACCOUNT_FILE_NOT_BACKUP, target.name)
		banner.fillError("full_backup", DECRYPTION_FAILED.title, DECRYPTION_FAILED.message)
	}
}

function refuse(selected: Ref<BackupSelection | null>, banner: SelectionBanner, refusal: SelectionRefusal, name: string) {
	selected.value = unreadableSelection(name)
	banner.fillError("full_backup", refusal.title, refusal.message)
}
