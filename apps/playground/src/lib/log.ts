/**
 * Wrap an async wallet-sdk call so the result feed records:
 *   - a pending row immediately on invocation (lets tests detect "call started"
 *     deterministically rather than via timing windows)
 *   - the settled row on success/failure
 *
 * Returns the call's resolved value (or rethrows) — the feed update is a side effect.
 */
import type { Wallet } from "@aztec-labs/aztec.js/wallet"
import { appendPendingResult, setState, settleResult } from "../state"
import { getWallet, NOT_CONNECTED } from "./wallet"

export async function logCall<T>(method: string, fn: () => Promise<T>): Promise<T> {
	const seq = appendPendingResult(method)
	try {
		const result = await fn()
		settleResult(seq, "ok", result)
		return result
	} catch (err) {
		settleResult(seq, "error", err)
		throw err
	}
}

/** A click handler: runs `fn` through {@link logCall} with the connected wallet, or records
 *  {@link NOT_CONNECTED} when there is none. Either failure lands in `lastError`, never as a
 *  rejected handler. */
export function guarded<T>(method: string, fn: (wallet: Wallet) => Promise<T>): () => Promise<void> {
	return async () => {
		const wallet = getWallet()
		if (!wallet) {
			setState({ lastError: NOT_CONNECTED })
			return
		}
		try {
			await logCall(method, () => fn(wallet))
		} catch (err) {
			setState({ lastError: err instanceof Error ? err.message : String(err) })
		}
	}
}
