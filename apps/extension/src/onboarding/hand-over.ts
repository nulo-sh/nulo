import { ONBOARDING_COMPLETED_KEY } from "@/stores/app.store"
import { isMigrationRunning, storageLocalGet } from "@/utils/storage"
import { clearOnboardingTabTracking } from "@/wallet/utils/onboarding-tab"

/** Opens the wallet in its own popup window and closes this tab. */
export async function openPopupWindowAndClose(): Promise<void> {
	await chrome.windows.create({
		url: chrome.runtime.getURL("src/popup/index.html"),
		type: "popup",
		width: 380,
		height: 620,
	})
	await clearOnboardingTabTracking()
	window.close()
}

/** Never done while a migration runs: the flag's read would wait for it, and a blocked one does not
 *  end, so the tab mounts and its migration barrier offers the recovery. */
export async function isOnboardingDone(): Promise<boolean> {
	if (await isMigrationRunning()) return false
	return (await storageLocalGet(ONBOARDING_COMPLETED_KEY))[ONBOARDING_COMPLETED_KEY] === true
}

export interface OnboardingStart {
	isDone: () => Promise<boolean>
	handOver: () => Promise<void>
	mount: () => void
}

/**
 * Mounts the onboarding app, unless onboarding is already done: then the tab hands over to the popup
 * without mounting, since closing it while its first route's chunk loads cuts that import, which
 * fails as an error. A read or a hand-over that fails mounts the app, as a tab that never handed
 * over did.
 */
export async function startOnboarding({ isDone, handOver, mount }: OnboardingStart): Promise<void> {
	const done = await isDone().catch(() => false)
	if (done) {
		try {
			await handOver()
			return
		} catch (error) {
			console.warn("onboarding hand-over to the popup failed", { error })
		}
	}
	mount()
}
