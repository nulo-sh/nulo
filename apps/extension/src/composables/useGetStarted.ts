import { computed, shallowRef, watch } from "vue"
import { changedGetStarted, type GetStartedFlags, type MarkableGetStartedFlag, markGetStarted, readGetStarted } from "@/utils/get-started"

const NOTHING_DONE: GetStartedFlags = {
	phraseSaved: false,
	backupSaved: false,
	aztecOpened: false,
	feeJuiceHeld: false,
	hidden: false,
	imported: false,
	notFirst: false,
}

/**
 * The active profile's Get started flags, kept current across pages: another page (Settings'
 * phrase, a full backup) sets them while Home is open in another window. `flags` is `undefined`
 * until the active profile's own read lands, so a profile switch never shows the old profile's.
 * The parent calls `dispose()` in its `onBeforeUnmount`.
 */
export function useGetStarted(opts: { profileId: () => string | undefined }) {
	const read = shallowRef<{ profileId: string; flags: GetStartedFlags } | undefined>()
	/** What change events said about the active profile since its read began: newer than that read. */
	let changedSinceRead: { profileId: string; flags: Partial<GetStartedFlags> } | undefined
	let readSeq = 0
	const changedFor = (profileId: string) => (changedSinceRead?.profileId === profileId ? changedSinceRead.flags : {})

	async function reread(): Promise<void> {
		const seq = ++readSeq
		const profileId = opts.profileId()
		changedSinceRead = undefined
		if (profileId === undefined) return
		let flags: GetStartedFlags
		try {
			flags = await readGetStarted(profileId)
		} catch (error) {
			// Unread is not done: the reminders show rather than vanish.
			console.debug("get-started read failed", { error })
			flags = NOTHING_DONE
		}
		if (seq !== readSeq || opts.profileId() !== profileId) return
		read.value = { profileId, flags: { ...flags, ...changedFor(profileId) } }
	}

	function onStorageChanged(changes: Record<string, unknown>, area: string) {
		const profileId = opts.profileId()
		if (area !== "local" || profileId === undefined) return
		const changed = changedGetStarted(profileId, changes)
		if (Object.keys(changed).length === 0) return
		changedSinceRead = { profileId, flags: { ...changedFor(profileId), ...changed } }
		const current = read.value
		if (current?.profileId === profileId) read.value = { profileId, flags: { ...current.flags, ...changed } }
	}
	chrome.storage.onChanged.addListener(onStorageChanged)

	const stopWatch = watch(opts.profileId, () => void reread(), { immediate: true })

	const flags = computed(() => {
		const current = read.value
		return current && current.profileId === opts.profileId() ? current.flags : undefined
	})

	async function mark(flag: MarkableGetStartedFlag): Promise<void> {
		const profileId = opts.profileId()
		if (profileId) await markGetStarted(profileId, flag)
	}

	function dispose() {
		readSeq++
		stopWatch()
		chrome.storage.onChanged.removeListener(onStorageChanged)
	}

	return { flags, mark, dispose }
}
