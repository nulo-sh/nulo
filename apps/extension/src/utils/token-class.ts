import { BUNDLED_TOKEN_CLASS_IDS } from "@nulo/token-list"
import { sameFieldAddress } from "@nulo/wallet-bridge"

/**
 * Whether the token's class is one whose artifact the wallet bundles and whose sends it checks. A
 * row with no class (added before classes were recorded, or restored and not yet read from the
 * chain) is outside.
 */
export function isValidatedTokenClass(classId?: string): boolean {
	return classId !== undefined && BUNDLED_TOKEN_CLASS_IDS.some((id) => sameFieldAddress(id, classId))
}
