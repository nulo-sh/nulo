/** Closes the browser window this page runs in; a window reported without an id is left open. */
export function closeCurrentWindow(): void {
	chrome.windows.getCurrent(undefined, (window) => {
		if (window.id) void quietIfGone(chrome.windows.remove(window.id), window.id)
	})
}

/** The window manager or the user may close this window first: a failed remove still rejects unless a
 *  window listing confirms the window is gone. */
async function quietIfGone(removal: Promise<void>, windowId: number): Promise<void> {
	try {
		await removal
	} catch (error) {
		if (await isConfirmedGone(windowId)) return
		throw error
	}
}

/** True only when a listing succeeds without the window; a dying page's API call can throw synchronously. */
async function isConfirmedGone(windowId: number): Promise<boolean> {
	try {
		const open = await chrome.windows.getAll()
		return !open.some((window) => window.id === windowId)
	} catch {
		return false
	}
}
