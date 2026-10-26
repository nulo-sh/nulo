/** Persisted preference for which profile to surface on the lock screen and
 *  in the router fallback. Written whenever a profile becomes active
 *  (create / unlock / switch / import); read in app.vue's loadProfile,
 *  auth.vue, which also follows its changes, and the router's guard. */
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

/** Calls `listener` with the id any page writes to the pointer, from the event's own value: on
 *  Firefox a read from the listener can still answer the old one. Returns the unsubscribe. */
export function onLastActiveProfileChanged(listener: (id: string | undefined) => void): () => void {
	const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
		if (area !== "local" || !Object.hasOwn(changes, LAST_ACTIVE_PROFILE_KEY)) return
		const id = changes[LAST_ACTIVE_PROFILE_KEY]?.newValue
		listener(typeof id === "string" ? id : undefined)
	}
	chrome.storage.onChanged.addListener(onChanged)
	return () => chrome.storage.onChanged.removeListener(onChanged)
}
