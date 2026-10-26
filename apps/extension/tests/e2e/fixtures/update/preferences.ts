import type { Page } from "puppeteer"
import { expect } from "vitest"
import { readAppPicks, readSendPicks } from "@/utils/fee-picks"
import { type PinMap, sanitizePinMap } from "@/utils/pinned-tokens"
import { feePicksKey, pinnedTokensKey, sendFeePicksKey } from "@/utils/profile-ui-keys"
import { type FeePicks, UI_PREFERENCE_SERVICE_NAME } from "@/wallet/services/ui-preference/spec"
import type { ExtensionContext } from "../extension"
import { pollUntil } from "../poll"
import { callService } from "../session"
import { readLocalStorage } from "./in-place"
import type { ReleasePreferences } from "./release-reads"
import { isEnvelope } from "./verify"

/** `profileId`'s maps as a release that keeps them in plaintext stored them in `before`. */
export function plaintextPreferences(before: Record<string, unknown>, profileId: string): ReleasePreferences {
	return {
		pins: sanitizePinMap(before[pinnedTokensKey(profileId)]),
		picks: { app: readAppPicks(before[feePicksKey(profileId)]), send: readSendPicks(before[sendFeePicksKey(profileId)]) },
	}
}

/** `profileId`'s maps through the UI-preference service of the build `page` belongs to. Send from a
 *  page unlocked on that profile. */
export async function readPreferences(page: Page, profileId: string): Promise<ReleasePreferences> {
	return {
		pins: await callService<PinMap>(page, UI_PREFERENCE_SERVICE_NAME, "getPinnedTokens", [profileId]),
		picks: await callService<FeePicks>(page, UI_PREFERENCE_SERVICE_NAME, "getFeePicks", [profileId]),
	}
}

/**
 * `profileId`'s pins and fee picks as the release held them, `release`: once the unlock has
 * converted them each key holds an envelope, and the service returns the release's maps. Send from
 * a page unlocked on that profile.
 */
export async function expectReleasePreferences(
	ctx: ExtensionContext,
	page: Page,
	release: ReleasePreferences,
	profileId: string,
): Promise<void> {
	const keys = { pins: pinnedTokensKey(profileId), app: feePicksKey(profileId), send: sendFeePicksKey(profileId) }
	expect(
		[release.pins, release.picks.app, release.picks.send].map((map) => Object.keys(map).length > 0),
		"the release's maps hold an entry each",
	).toEqual([true, true, true])
	await pollUntil(
		() => readLocalStorage(ctx),
		(all) => Object.values(keys).every((key) => isEnvelope(all[key])),
		{ label: "the release's pins and fee picks sealed", timeoutMs: 30_000, intervalMs: 500 },
	)
	expect(await callService(page, UI_PREFERENCE_SERVICE_NAME, "getPinnedTokens", [profileId])).toEqual(release.pins)
	expect(await callService(page, UI_PREFERENCE_SERVICE_NAME, "getFeePicks", [profileId])).toEqual(release.picks)
}
