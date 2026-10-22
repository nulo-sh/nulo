import type { Page } from "puppeteer"
import { expect } from "vitest"
import { readAppPicks, readSendPicks } from "@/utils/fee-picks"
import { sanitizePinMap } from "@/utils/pinned-tokens"
import { feePicksKey, pinnedTokensKey, sendFeePicksKey } from "@/utils/profile-ui-keys"
import { UI_PREFERENCE_SERVICE_NAME } from "@/wallet/services/ui-preference/spec"
import { parseEnvelope } from "@/wallet/storage/sealed-entity-storage"
import type { ExtensionContext } from "../extension"
import { pollUntil } from "../poll"
import { callService } from "../session"
import { readLocalStorage } from "./in-place"

const isEnvelope = (raw: unknown): boolean => {
	if (typeof raw !== "string") return false
	try {
		return parseEnvelope(JSON.parse(raw)) !== undefined
	} catch {
		return false
	}
}

/**
 * `profileId`'s pins and fee picks as the release stored them in `before`: once the unlock has
 * converted them each key holds an envelope, and the service returns the release's maps. Send from
 * a page unlocked on that profile.
 */
export async function expectReleasePreferences(
	ctx: ExtensionContext,
	page: Page,
	before: Record<string, unknown>,
	profileId: string,
): Promise<void> {
	const keys = { pins: pinnedTokensKey(profileId), app: feePicksKey(profileId), send: sendFeePicksKey(profileId) }
	const pins = sanitizePinMap(before[keys.pins])
	const picks = { app: readAppPicks(before[keys.app]), send: readSendPicks(before[keys.send]) }
	expect(
		[pins, picks.app, picks.send].map((map) => Object.keys(map).length > 0),
		"the release's maps hold an entry each",
	).toEqual([true, true, true])
	await pollUntil(
		() => readLocalStorage(ctx),
		(all) => Object.values(keys).every((key) => isEnvelope(all[key])),
		{ label: "the release's pins and fee picks sealed", timeoutMs: 30_000, intervalMs: 500 },
	)
	expect(await callService(page, UI_PREFERENCE_SERVICE_NAME, "getPinnedTokens", [profileId])).toEqual(pins)
	expect(await callService(page, UI_PREFERENCE_SERVICE_NAME, "getFeePicks", [profileId])).toEqual(picks)
}
