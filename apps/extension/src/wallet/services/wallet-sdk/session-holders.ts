/**
 * The state each live channel owns, keyed by its session id. Everything here ends with the session,
 * in `end`; state keyed by a request id or an `(origin, chainId)` pair, or that must outlive the
 * session, stays out.
 */
import { KeyedLock } from "@nulo/wallet-core/utils"
import { VerificationHolds } from "./verification-hold"

export class SessionHolders {
	/**
	 * Live-channel identity binding: sessionId → owning profileId, stamped at
	 * establishment from the validated DappSession row (approver-checked via
	 * the pending-verification marker). Consumed by the dispatch guard and the
	 * profile-switch teardown; same lifetime as the upstream activeSessions
	 * (both die with the SW), cleaned in `end`.
	 */
	readonly sessionProfiles = new Map<string, string>()
	/**
	 * Per-session message queue — ensures messages from the same dApp session
	 * are processed sequentially (FIFO). Without this, the fire-and-forget
	 * onWalletMessage callback processes messages concurrently, causing race
	 * conditions (e.g. executeUtility runs before registerContract completes).
	 */
	readonly sessionQueues = new Map<string, Promise<void>>()
	/**
	 * Per-session establishment-validation result. The SDK sends the
	 * key-exchange response BEFORE invoking `onSessionEstablished`, whose async
	 * validation (row lookup, hash persist, verify-window open) may then TERMINATE
	 * the session as unverified. `onWalletMessage` awaits this promise before
	 * dispatching, so a message can never ride a session that's concurrently being
	 * torn down. Resolves `true` when established, `false` when terminated.
	 */
	readonly establishmentStatus = new Map<string, Promise<boolean>>()
	/** Per-session gate on dispatch until the person confirms the session's check (see `verification-hold.ts`). */
	readonly holds = new VerificationHolds()
	/**
	 * Per-session decrypt lane, which also carries refusal replies (`serializeDecryption` in
	 * `background.ts`). No watchdog: a force-release would let the next decrypt run beside a slow
	 * one, out of order.
	 */
	readonly decryptLocks = new KeyedLock({ maxHoldMs: null })

	/** The session ended: forget everything it held, and drop its unsettled hold as `wallet_refused`. */
	end(sessionId: string): void {
		this.sessionProfiles.delete(sessionId)
		this.sessionQueues.delete(sessionId)
		this.decryptLocks.delete(sessionId)
		this.establishmentStatus.delete(sessionId)
		this.holds.end(sessionId, "wallet_refused")
	}
}
