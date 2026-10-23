import { z } from "zod"
import type { AppPick, FeePickUpdate, SendSlots } from "@/utils/fee-picks"
import type { PinMap } from "@/utils/pinned-tokens"

export const UI_PREFERENCE_SERVICE_NAME = "ui-preference"

/** A preference row as stored: the service re-reads every value with the map's own decoder. */
export const PreferenceRowSchema = z.unknown()

export type FeePicks = { app: Record<string, AppPick>; send: Record<string, SendSlots> }

/** The device's last account selection, one row at `SELECTED_ACCOUNT_ROW_ID`, owned by the profile
 *  that made it: a profile opens on it only when it made it. */
export const SELECTED_ACCOUNT_ROOT = "nulo:ui:selectedAccount"
export const SELECTED_ACCOUNT_ROW_ID = "device"

/** The selection every build before the seal stored in plaintext, an address naming no profile. */
export const LEGACY_SELECTED_ACCOUNT_KEY = "nulo:ui:activeAccount"

export const MAX_SELECTED_ADDRESS_LENGTH = 128

export const SelectedAccountRowSchema = z.object({ profileId: z.string(), address: z.string().max(MAX_SELECTED_ADDRESS_LENGTH) })

/**
 * The popup's per-profile preferences, sealed under the profile's row keys. A method answers only
 * the live session's profile: a read for another profile, a locked wallet or a profile whose
 * deletion has begun returns the empty value, and a write resolves `false`, writing nothing.
 */
export type Methods = {
	/** The account the device's last selection names, when that selection was `profileId`'s. */
	getSelectedAccount(profileId: string): string | undefined

	/**
	 * Records `address` as the device's last selection, made by `profileId`.
	 * @throws InvalidWalletArgumentsError when `profileId` is not a string, or `address` is not a
	 *   string of at most 128 characters.
	 */
	setSelectedAccount(profileId: string, address: string): boolean

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
