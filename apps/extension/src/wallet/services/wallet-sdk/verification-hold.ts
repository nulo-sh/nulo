/**
 * The gate between an established dApp session and dispatch: a session whose emoji check is shown
 * runs none of its calls until the person confirms that very check.
 *
 * A hold opens for every transport session when upstream reports it established, bound to that
 * key exchange's own verification hash, and settles once: released (no check is needed, or the
 * person confirmed it) or dropped (the session ended first). Calls that arrive meanwhile wait on
 * its outcome behind the session's FIFO. Settled or not, the hold counts each call from arrival
 * until its handling settles and refuses one past the bound; nothing here times one out. A hold outlives
 * the check's window, whose slot frees on removal, and leaves the map only when its session ends
 * or the same id key-exchanges again. Nothing persists: a hold dies with the service worker, as
 * the session it gates does.
 */
import { deferred } from "@nulo/wallet-core/utils"
import { describeExternalId } from "@nulo/wallet-bridge"
import type { ILogger } from "@/wallet/logger"
import { LogLevel } from "@/wallet/logger"

/** How a session's hold ended. The drop outcomes are the queued row's failure kinds. */
export type HoldOutcome = "released" | "wallet_refused" | "session_ended"

/** Calls one session may keep waiting or running at once; the next one is answered -32005. */
export const MAX_PENDING_PER_SESSION = 32

/** One transport session's gate on dispatch, opened when upstream reports the session established. */
export interface VerificationHold {
	readonly sessionId: string
	/** The session's own key-exchange hash, the value its check shows. */
	readonly verificationHash: string
	/** Settles once; the first settle wins. */
	readonly outcome: Promise<HoldOutcome>
	/** Counts one arriving call until the returned release runs; `undefined` at the bound. */
	admit(): (() => void) | undefined
	/** No check is needed, or the person confirmed it. */
	release(): void
	/** The session ended before release; held calls are dropped and their queued rows filed as `kind`. */
	drop(kind: Exclude<HoldOutcome, "released">): void
}

class Hold implements VerificationHold {
	readonly outcome: Promise<HoldOutcome>
	private readonly settleWith: (outcome: HoldOutcome) => void
	private settledAs: HoldOutcome | undefined
	/** Admitted calls whose handling has not settled, held or running. */
	private pending = 0

	constructor(
		readonly sessionId: string,
		readonly verificationHash: string,
	) {
		const { promise, resolve } = deferred<HoldOutcome>()
		this.outcome = promise
		this.settleWith = resolve
	}

	get settled(): boolean {
		return this.settledAs !== undefined
	}

	admit(): (() => void) | undefined {
		if (this.pending >= MAX_PENDING_PER_SESSION) return undefined
		this.pending++
		let released = false
		return () => {
			if (released) return
			released = true
			this.pending--
		}
	}

	release(): void {
		this.settle("released")
	}

	drop(kind: Exclude<HoldOutcome, "released">): void {
		this.settle(kind)
	}

	private settle(outcome: HoldOutcome): void {
		if (this.settled) return
		this.settledAs = outcome
		this.settleWith(outcome)
	}
}

/** The holds of the live transport sessions, keyed by session id. */
export class VerificationHolds {
	private readonly holds = new Map<string, Hold>()

	/** Opens the hold for a session, bound to its own hash; settles a previous hold for the same id `wallet_refused`. */
	open(sessionId: string, verificationHash: string): VerificationHold {
		this.holds.get(sessionId)?.drop("wallet_refused")
		const hold = new Hold(sessionId, verificationHash)
		this.holds.set(sessionId, hold)
		return hold
	}

	/** The current hold for `sessionId`, captured by a message on arrival; released holds stay until `end`. */
	get(sessionId: string): VerificationHold | undefined {
		return this.holds.get(sessionId)
	}

	/** Releases the unsettled hold carrying `verificationHash`. False when none does. */
	confirm(verificationHash: string): boolean {
		for (const hold of this.holds.values()) {
			if (hold.settled || hold.verificationHash !== verificationHash) continue
			hold.release()
			return true
		}
		return false
	}

	/** The session ended: drops its hold if still unsettled, and removes it from the map. */
	end(sessionId: string, kind: Exclude<HoldOutcome, "released">): void {
		this.holds.get(sessionId)?.drop(kind)
		this.holds.delete(sessionId)
	}

	/** Holds not yet settled, for the lock rule. */
	unsettled(): VerificationHold[] {
		return [...this.holds.values()].filter((hold) => !hold.settled)
	}
}

/**
 * Releases a hold when its check is confirmed, and ends every session whose hold is unsettled at a
 * lock. A lock sends the check to the unlock screen, so it can no longer be answered there; a
 * confirmed channel keeps today's lock behaviour. Every unsettled hold is dropped before any
 * termination runs, so a termination that throws cannot leave another session's calls held, and
 * each termination's own `end` finds its hold already settled `session_ended`.
 */
export function wireVerificationHold(deps: {
	holds: VerificationHolds
	onActiveProfileChanged: { add(listener: (profile: { id: string } | undefined) => void): unknown }
	onVerificationConfirmed: { add(listener: (payload: { verificationHash: string }) => void): unknown }
	terminateSession: (sessionId: string) => void
	logger: ILogger
}): void {
	deps.onVerificationConfirmed.add(({ verificationHash }) => {
		// A settled, ended or restarted-away session: the page only closes. The hash is never logged.
		if (!deps.holds.confirm(verificationHash)) {
			deps.logger.log("wallet-sdk", LogLevel.Debug, "A confirmed check found no session waiting on it")
		}
	})
	deps.onActiveProfileChanged.add((profile) => {
		if (profile) return
		const dropped = deps.holds.unsettled()
		for (const hold of dropped) hold.drop("session_ended")
		for (const hold of dropped) {
			deps.logger.log(
				"wallet-sdk",
				LogLevel.Info,
				`Lock: ending session ${describeExternalId(hold.sessionId)}, whose check was not confirmed`,
			)
			try {
				deps.terminateSession(hold.sessionId)
			} catch (error) {
				deps.logger.log("wallet-sdk", LogLevel.Warn, `Lock: failed to end session ${describeExternalId(hold.sessionId)}`, {
					error,
				})
			}
		}
	})
}
