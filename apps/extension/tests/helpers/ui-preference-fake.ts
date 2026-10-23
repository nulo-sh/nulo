import type { PinStore } from "@/composables/usePinnedTokens"
import { readAppPicks, readSendPicks } from "@/utils/fee-picks"
import { type PinMap, sanitizePinMap } from "@/utils/pinned-tokens"
import { feePicksKey, pinnedTokensKey, sendFeePicksKey } from "@/utils/profile-ui-keys"
import type { FeePicks } from "@/wallet/services/ui-preference/spec"

/** A stub area holding a profile's preference maps unsealed, at the keys the service keeps them under. */
type Area = { get(keys: string[]): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void> }

/** `UiPreferenceService.getFeePicks` over `area`: the service's own parsers, with no seal or session check. */
export async function readFeePicks(area: Pick<Area, "get">, profileId: string): Promise<FeePicks> {
	const keys = { app: feePicksKey(profileId), send: sendFeePicksKey(profileId) }
	const stored = await area.get([keys.app, keys.send])
	return { app: readAppPicks(stored[keys.app]), send: readSendPicks(stored[keys.send]) }
}

/** The pin half of the preference client over `area`, sanitized as the service sanitizes it;
 *  `refuseNext` makes the next write resolve `false`, as a session the worker found moved does. */
export function pinStore(area: Area): PinStore & { refuseNext(): void } {
	let refuse = false
	return {
		getPinnedTokens: async (profileId) => {
			const key = pinnedTokensKey(profileId)
			return sanitizePinMap((await area.get([key]))[key])
		},
		setPinnedTokens: async (profileId: string, map: PinMap) => {
			if (refuse) {
				refuse = false
				return false
			}
			await area.set({ [pinnedTokensKey(profileId)]: sanitizePinMap(map) })
			return true
		},
		refuseNext: () => {
			refuse = true
		},
	}
}

/** The whole preference client over whatever `chrome.storage.local` is installed when it is called,
 *  for a `managers.uiPreference` stub: a suite that installs a fresh area per test needs no rebind. */
export function chromeUiPreferences(): PinStore & {
	getFeePicks(profileId: string): Promise<FeePicks>
	saveFeePick(): Promise<boolean>
} {
	const area: Area = { get: (keys) => chrome.storage.local.get(keys), set: (items) => chrome.storage.local.set(items) }
	const pins = pinStore(area)
	return {
		getPinnedTokens: pins.getPinnedTokens,
		setPinnedTokens: pins.setPinnedTokens,
		getFeePicks: (profileId) => readFeePicks(area, profileId),
		saveFeePick: async () => true,
	}
}
