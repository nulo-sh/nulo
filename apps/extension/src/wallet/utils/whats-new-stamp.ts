import { seenOnInstall, WHATS_NEW_SEEN_KEY } from "@/utils/whats-new"

/** Writes the What's new marker an `onInstalled` event calls for. Never rejects: a failed stamp
 *  only costs one notice, and the listener's other work must still run. */
export async function stampWhatsNewSeen(details: { reason: string; previousVersion?: string }, running: string): Promise<void> {
	try {
		const stored = await chrome.storage.local.get(WHATS_NEW_SEEN_KEY)
		const seen = seenOnInstall(details, running, stored[WHATS_NEW_SEEN_KEY])
		if (seen !== undefined) await chrome.storage.local.set({ [WHATS_NEW_SEEN_KEY]: seen })
	} catch (error) {
		console.debug("whats-new marker not stamped", { error })
	}
}
