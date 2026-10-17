/**
 * Home's "Get started" card: which reminders a profile still shows. The flags record what the
 * person did or dismissed, never proof of a backup; they live per profile beside the other UI keys
 * (`profile-ui-keys.ts`), so a deletion or a row commit clears them and no backup carries them.
 */
import { getStartedAztecOpenedKey, getStartedBackupSavedKey, getStartedHiddenKey, getStartedPhraseSavedKey } from "@/utils/profile-ui-keys"
import { storageLocalGet, storageLocalSet } from "@/utils/storage"

export type GetStartedFlag = "phraseSaved" | "backupSaved" | "aztecOpened" | "hidden"

export type GetStartedFlags = Readonly<Record<GetStartedFlag, boolean>>

const KEYS: Readonly<Record<GetStartedFlag, (profileId: string) => string>> = {
	phraseSaved: getStartedPhraseSavedKey,
	backupSaved: getStartedBackupSavedKey,
	aztecOpened: getStartedAztecOpenedKey,
	hidden: getStartedHiddenKey,
}

const FLAGS = Object.keys(KEYS) as GetStartedFlag[]

/** The storage keys of `profileId`'s flags, for a reader that listens for their changes. */
export const getStartedKeys = (profileId: string): string[] => FLAGS.map((flag) => KEYS[flag](profileId))

/** A flag counts only when stored as `true`: anything else in storage reads as not done. */
export async function readGetStarted(profileId: string): Promise<GetStartedFlags> {
	const stored = await storageLocalGet(getStartedKeys(profileId))
	return Object.fromEntries(FLAGS.map((flag) => [flag, stored[KEYS[flag](profileId)] === true])) as Record<GetStartedFlag, boolean>
}

/** Records a flag. Never rejects: a lost write leaves the reminder up, and the action it rides on
 *  (a link, a download, leaving the phrase step) must go ahead. */
export async function markGetStarted(profileId: string, flag: GetStartedFlag): Promise<void> {
	try {
		await storageLocalSet({ [KEYS[flag](profileId)]: true })
	} catch (error) {
		console.debug("get-started flag write failed", { error })
	}
}
