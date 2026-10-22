import { z } from "zod"
import type { AppPick, FeePickUpdate, SendSlots } from "@/utils/fee-picks"
import type { PinMap } from "@/utils/pinned-tokens"

export const UI_PREFERENCE_SERVICE_NAME = "ui-preference"

/** A preference row as stored: the service re-reads every value with the map's own decoder. */
export const PreferenceRowSchema = z.unknown()

export type FeePicks = { app: Record<string, AppPick>; send: Record<string, SendSlots> }

/**
 * The popup's per-profile preferences, sealed under the profile's row keys. A method answers only
 * the live session's profile: a read for another profile, a locked wallet or a profile whose
 * deletion has begun returns the empty value, and a write resolves `false`, writing nothing.
 */
export type Methods = {
	/** The profile's pins, sanitized. */
	getPinnedTokens(profileId: string): PinMap

	/** Replaces the profile's pins with `map`, sanitized. */
	setPinnedTokens(profileId: string, map: PinMap): boolean

	/** The profile's saved fee picks, each map re-parsed. */
	getFeePicks(profileId: string): FeePicks

	/**
	 * Saves one fee-method pick, or drops every pick naming a deleted FPC.
	 * @throws InvalidWalletArgumentsError when `update` is not one (`parseFeePickUpdate`).
	 */
	saveFeePick(profileId: string, update: FeePickUpdate): boolean
}

export type Events = Record<never, never>
