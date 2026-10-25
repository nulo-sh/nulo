/**
 * The sole profile's pins and fee picks as the popup reads them: through the ui-preference service,
 * which answers only while that profile's session is live, so send these from an unlocked page.
 */
import type { Page } from "puppeteer"
import type { AppPick } from "@/utils/fee-picks"
import type { FeePicks } from "@/wallet/services/ui-preference/spec"
import { captureSoleProfileId } from "../fixtures/profiles"
import { callService } from "../fixtures/session"

export async function savedFeePicks(page: Page): Promise<FeePicks> {
	return callService(page, "ui-preference", "getFeePicks", [await captureSoleProfileId(page)])
}

/** The app windows' saved pick for `account`, or null; the card keys the map by the account's
 *  address, so the lookup ignores hex case. */
export async function savedAppPick(page: Page, account: string): Promise<AppPick | null> {
	const { app } = await savedFeePicks(page)
	return Object.entries(app).find(([address]) => address.toLowerCase() === account.toLowerCase())?.[1] ?? null
}
