/**
 * The per-profile UI keys in `chrome.storage.local`. Deleting a profile removes
 * `profileUiKeys(id)`, so a per-profile key defined anywhere else outlives its profile.
 * Committing a profile row removes them again first, so a key written under an id before
 * that id is adopted again never reaches the new profile; a write after the adoption does.
 */

export const PINNED_TOKENS_ROOT = "nulo:ui:pinnedTokens"
export const FEE_PICKS_ROOT = "nulo:ui:feePaymentMethods"
export const SEND_FEE_PICKS_ROOT = "nulo:ui:sendFeePaymentMethods"
export const RESTORE_OUTCOME_ROOT = "nulo:ui:restoreOutcome"

const PINNED_TOKENS_PREFIX = `${PINNED_TOKENS_ROOT}@`
const FEE_PICKS_PREFIX = `${FEE_PICKS_ROOT}@`
const SEND_FEE_PICKS_PREFIX = `${SEND_FEE_PICKS_ROOT}@`
const RESTORE_OUTCOME_PREFIX = `${RESTORE_OUTCOME_ROOT}@`

/** Each prefix ends in `@`, so a key is its prefix followed by one whole profile id. */
export const PROFILE_UI_KEY_PREFIXES: readonly string[] = [
	PINNED_TOKENS_PREFIX,
	FEE_PICKS_PREFIX,
	SEND_FEE_PICKS_PREFIX,
	RESTORE_OUTCOME_PREFIX,
]

/** Per-profile map of chain id → pinned token contracts; a UI preference, never backed up. */
export const pinnedTokensKey = (profileId: string) => `${PINNED_TOKENS_PREFIX}${profileId}`

/** Per-profile map of account address → the app windows' fee pick (`utils/fee-picks.ts`). */
export const feePicksKey = (profileId: string) => `${FEE_PICKS_PREFIX}${profileId}`

/** Per-profile map of account address → Send's fee pick per transfer side (`utils/fee-picks.ts`). */
export const sendFeePicksKey = (profileId: string) => `${SEND_FEE_PICKS_PREFIX}${profileId}`

/** The networks a full-backup restore of this profile has not restored (`utils/restore-outcome.ts`). */
export const restoreOutcomeKey = (profileId: string) => `${RESTORE_OUTCOME_PREFIX}${profileId}`

/** The exact keys `profileId` can hold: `p1`'s never include `p10`'s. */
export const profileUiKeys = (profileId: string): string[] => PROFILE_UI_KEY_PREFIXES.map((prefix) => `${prefix}${profileId}`)
