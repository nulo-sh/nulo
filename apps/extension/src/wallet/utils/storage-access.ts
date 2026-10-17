/**
 * Which contexts may reach a storage area. A content script runs inside every web page, so it
 * must not read the wallet's local area; only the extension's own pages and workers may.
 */

/** A storage area as the browser types it; Firefox has no `setAccessLevel`. */
export type AccessLevelArea = Partial<Pick<chrome.storage.StorageArea, "setAccessLevel">>

/**
 * Limits `area` to trusted contexts. The browser keeps the level across restarts, and the worker
 * sets it again at every start. Never rejects: where the method is missing the area stays as it
 * is, and where the browser refuses, one warning is logged.
 */
export async function restrictToTrustedContexts(area: AccessLevelArea): Promise<void> {
	if (typeof area.setAccessLevel !== "function") return
	try {
		await area.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
	} catch (error) {
		console.warn("[storage-access] the browser refused the trusted-contexts level", { error })
	}
}
