import { isRecord } from "@nulo/wallet-core/utils"
import { HOME_TOKEN_ROWS } from "@/utils/token-order"

/** Pins fill Home's row budget, never more. */
export const PINNED_TOKENS_MAX = HOME_TOKEN_ROWS
/** Chains a profile can hold pins for; other chains are evicted in key iteration order past it. */
export const PINNED_TOKENS_MAX_CHAINS = 32

const CONTRACT_RE = /^0x[0-9a-f]{64}$/

/** Chain id (as a string) → lowercase contracts, at most `PINNED_TOKENS_MAX` each. */
export type PinMap = Record<string, string[]>

/** A chain key is the canonical decimal form of a safe integer: no sign, no leading zero, no exponent. */
const isChainKey = (key: string) => {
	const n = Number(key)
	return Number.isSafeInteger(n) && n >= 0 && String(n) === key
}

function sanitizeContracts(value: unknown): string[] {
	if (!Array.isArray(value)) return []
	const contracts: string[] = []
	for (const entry of value) {
		if (contracts.length >= PINNED_TOKENS_MAX) break
		if (typeof entry !== "string") continue
		const c = entry.toLowerCase()
		if (CONTRACT_RE.test(c) && !contracts.includes(c)) contracts.push(c)
	}
	return contracts
}

/** A pin map is untrusted bytes (another context or an offline writer may have stored it): rebuilt
 *  on every read and every write. */
export function sanitizePinMap(raw: unknown): PinMap {
	if (!isRecord(raw)) return {}
	const out: PinMap = {}
	for (const [key, value] of Object.entries(raw)) {
		if (Object.keys(out).length >= PINNED_TOKENS_MAX_CHAINS) break
		if (!isChainKey(key)) continue
		const contracts = sanitizeContracts(value)
		if (contracts.length > 0) out[key] = contracts
	}
	return out
}
