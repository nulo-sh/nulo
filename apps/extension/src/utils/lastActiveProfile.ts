/** Persisted preference for which profile to surface on the lock screen and
 *  in the router fallback. Written whenever a profile becomes active
 *  (create / unlock / switch / import); read in app.vue's loadProfile,
 *  auth.vue's onMounted, and the router's guard. */
import { storageLocalGet, storageLocalSet } from "@/utils/storage"

export const LAST_ACTIVE_PROFILE_KEY = "nulo:ui:lastActiveProfile"

export async function getLastActiveProfileId(): Promise<string | undefined> {
	const result = await storageLocalGet(LAST_ACTIVE_PROFILE_KEY)
	return result[LAST_ACTIVE_PROFILE_KEY] as string | undefined
}

/** `unless` is the storage facade's: consulted right before the write, which it skips when true. */
export async function setLastActiveProfileId(id: string, options?: { unless?: () => boolean }): Promise<void> {
	await storageLocalSet({ [LAST_ACTIVE_PROFILE_KEY]: id }, options)
}
