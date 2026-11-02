/**
 * Open or focus the onboarding tab. Callable from any extension context
 * (service worker, popup, side-panel) since `chrome.tabs.*` and
 * `chrome.storage.session` are available everywhere.
 *
 * Concurrency: a module-level promise lock collapses concurrent calls into a
 * single in-flight open. `onInstalled` (background) and the popup's Go to the
 * tab are different module graphs, so the lock keeps each context
 * single-flight only; the cross-context race resolves because the popup's
 * press comes after onInstalled has tracked its tab.
 *
 * Session-storage tab-id tracking is best-effort. chrome.storage.session is
 * cleared on reload/update/disable/browser-restart, so a stored id can
 * outlive itself — in that case we open a fresh tab and orphan the old one.
 * Acceptable; user can close the duplicate.
 */

const TAB_ID_KEY = "nulo:onboarding:tab-id"
const ONBOARDING_DOCUMENT = "src/onboarding/index.html"
const ONBOARDING_PATH = `${ONBOARDING_DOCUMENT}#/onboarding/welcome`

/** Sent by onboarding's last page on "Open wallet": the background opens the toolbar popup. */
export const OPEN_TOOLBAR_POPUP = "nulo:open-toolbar-popup"

/** The background's answer. `ok: false` when it could not close the tab, which then closes itself. */
export interface OpenToolbarPopupAnswer {
	ok: boolean
}

/** Sent by a hand-off window as its flow ends: the background closes it and reopens the toolbar
 *  panel on `opener`, the browser window the panel handed the flow from. Answered `{ ok: true }`, or
 *  `{ ok: false }` when the sender is in no popup-type window. */
export const RETURN_TO_PANEL = "nulo:return-to-panel"

export interface ReturnToPanelMessage {
	type: typeof RETURN_TO_PANEL
	opener: number | undefined
}

/** The onboarding page's document, without the route its fragment carries. */
export function onboardingDocumentUrl(): string {
	return chrome.runtime.getURL(ONBOARDING_DOCUMENT)
}

let inFlight: Promise<void> | null = null

async function focusTab(tabId: number, windowId: number | undefined): Promise<void> {
	await chrome.tabs.update(tabId, { active: true })
	if (windowId !== undefined) await chrome.windows.update(windowId, { focused: true })
}

export function openOrFocusOnboardingTab(): Promise<void> {
	if (inFlight) return inFlight
	inFlight = (async () => {
		try {
			const stored = await chrome.storage.session.get(TAB_ID_KEY)
			const existingId = stored[TAB_ID_KEY] as number | undefined
			if (typeof existingId === "number") {
				try {
					const tab = await chrome.tabs.get(existingId)
					await focusTab(existingId, tab.windowId)
					return
				} catch {
					// Tab was closed; fall through to fresh create.
				}
			}
			// Opened in the background and tracked before it takes focus: focus closes a toolbar popup, and
			// this context with it, so a write after the focus may never run.
			const tab = await chrome.tabs.create({ url: chrome.runtime.getURL(ONBOARDING_PATH), active: false })
			if (typeof tab.id !== "number") return
			await chrome.storage.session.set({ [TAB_ID_KEY]: tab.id })
			await focusTab(tab.id, tab.windowId)
		} finally {
			inFlight = null
		}
	})()
	return inFlight
}

/** Clear the tracked tab id. Call after onboarding finishes (Done page) so
 * a subsequent popup mount doesn't try to focus a tab that just closed itself. */
export async function clearOnboardingTabTracking(): Promise<void> {
	await chrome.storage.session.remove(TAB_ID_KEY)
}

export interface OnboardingSetupSubject {
	onboardingCompleted: boolean
	profiles: readonly unknown[]
	loadOnboardingCompleted: () => Promise<void>
}

/** Whether setup waits in the onboarding tab: onboarding is not completed and no profile exists. */
export async function setupWaitsInTab(store: OnboardingSetupSubject): Promise<boolean> {
	await store.loadOnboardingCompleted()
	return !store.onboardingCompleted && store.profiles.length === 0
}
