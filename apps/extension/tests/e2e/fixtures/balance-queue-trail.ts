/** The first and last lines of one balance-queue tick, from `BalanceJobQueue.tick()` in
 *  `wallet/services/token-balance/balance-job-queue.ts`. */
export const BALANCE_TICK_START = /^Syncing \d+ token balances$/
export const BALANCE_TICK_END = /^Token balances synced in \d+ms$/

/** The service worker stores only its newest lines (`wallet/logger/store.ts`, the flush's slice). */
export const STORED_TRAIL_LINES = 2_000

export type TickState = { kind: "absent" | "open" | "unknown" } | { kind: "idle"; linesSinceEnd: number }

export const TICK_STATE_CAUSE: Record<TickState["kind"], string> = {
	absent: "marker not observed in the retained trail; it needs Developer Mode and Debug Mode on",
	open: "a balance-queue tick was still open at the last marker",
	unknown:
		`no balance-queue tick in the retained ${STORED_TRAIL_LINES}-line trail before the marker; the barrier matches ` +
		`"${BALANCE_TICK_START.source}" and "${BALANCE_TICK_END.source}", so a reworded log line breaks this barrier`,
	idle: "",
}

/**
 * The balance queue's state at the marker's latest line, read from the last tick line before it.
 * No tick line before it reads `unknown`, never idle: history the trail dropped proves nothing.
 */
export function tickStateBefore(lines: string[], marker: string): TickState {
	const at = lines.lastIndexOf(marker)
	if (at === -1) return { kind: "absent" }
	for (let i = at - 1; i >= 0; i--) {
		const line = lines[i] ?? ""
		if (BALANCE_TICK_END.test(line)) return { kind: "idle", linesSinceEnd: at - i - 1 }
		if (BALANCE_TICK_START.test(line)) return { kind: "open" }
	}
	return { kind: "unknown" }
}
