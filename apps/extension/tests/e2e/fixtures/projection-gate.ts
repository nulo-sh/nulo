import type { Page } from "puppeteer"
import { PROJECTION_GATE_KEY } from "@/e2e/chrome-storage-projection-gate"

/**
 * Drive the projection gate from an e2e test against a PROVERLESS build: while armed, every balance
 * projection of `account` parks after registering its tokens and before registering the account.
 */
export async function holdAccountRegistration(extensionPage: Page, account: string): Promise<void> {
	await extensionPage.evaluate((key, value) => chrome.storage.session.set({ [key]: value }), PROJECTION_GATE_KEY, { account })
}

/** True once a projection of the armed account has parked on the gate. */
export async function isAccountRegistrationHeld(extensionPage: Page): Promise<boolean> {
	return extensionPage.evaluate(async (key) => {
		const rec = (await chrome.storage.session.get(key))[key] as { held?: boolean } | undefined
		return rec?.held === true
	}, PROJECTION_GATE_KEY)
}

export async function releaseAccountRegistration(extensionPage: Page): Promise<void> {
	await extensionPage.evaluate((key) => chrome.storage.session.remove(key), PROJECTION_GATE_KEY)
}
