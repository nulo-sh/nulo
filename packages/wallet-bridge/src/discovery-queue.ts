import { describeExternalId } from "./external-id"
import type { BackgroundConnectionHandler, PendingDiscovery } from "@aztec-labs/wallet-sdk/extension/handlers"
import type { ILogger } from "@nulo/wallet-core/logger"
import { LogLevel } from "@nulo/wallet-core/logger"

// Bound discovery staleness to the SDK's discovery window, not an
// arbitrary 5 minutes. The extension provider's DEFAULT_DISCOVERY_TIMEOUT_MS is
// 60s — the dApp removes its DISCOVERY_RESPONSE listener at t=60s. Approving a
// discovery past that window strands a half-open handshake the dApp can no
// longer complete. 55s leaves a ~5s margin for the DISCOVERY_RESPONSE to be
// scheduled and delivered before t=60s (the subsequent 2s ECDH exchange runs
// over the already-transferred port, so it is not what the 60s bounds). This is
// a policy value: a dApp may pass a shorter custom timeout, which the SDK does
// not surface per-discovery, so it cannot be honored exactly — we align to the
// documented default.
export const DISCOVERY_STALE_MS = 55 * 1000 // 55 seconds — just inside the SDK's 60s discovery timeout

/**
 * True when `discovery` has aged past the SDK's discovery window and must be
 * rejected rather than approved. MUST be re-checked immediately before EVERY
 * approval (and before any durable session write), not only at drain-gate
 * entry: an interactive approval popup can resolve after t=60s.
 */
export function isDiscoveryExpired(discovery: PendingDiscovery, now: number = Date.now()): boolean {
	return now - discovery.timestamp > DISCOVERY_STALE_MS
}

// Bound the locked-wallet discovery queue so a flooding dApp cannot grow
// it without limit. A legitimate dApp needs at most a handful of concurrent
// discoveries; anything past these caps is dropped (the dApp re-discovers on
// its next broadcast). Reject-new, never evict — evicting could drop a
// legitimate earlier discovery the user was about to approve.
const GLOBAL_CAP = 32
const PER_ORIGIN_CAP = 4

interface QueuedDiscovery {
	/** The SDK's row for this receipt. The SDK replaces a row with a fresh object whenever a page
	 *  reuses its id, so the entry may act only while the SDK still holds this very object. */
	discovery: PendingDiscovery
	chainId: string
}

export class DiscoveryQueue {
	private queue: QueuedDiscovery[] = []

	constructor(
		private handler: BackgroundConnectionHandler,
		private logger: ILogger,
	) {
		// Reconcile the badge at construction (= every SW boot). The badge
		// is Chrome-level state that SURVIVES a service-worker kill, while this
		// queue is in-memory and boots empty — without this, a worker killed with
		// a non-empty queue leaves a permanent ghost count (the empty-queue drain
		// below early-returns without touching the badge, so even unlocking never
		// clears it). The queue is authoritative: paint what it actually holds.
		this.updateBadge()
	}

	get size(): number {
		return this.queue.length
	}

	/**
	 * Queue a discovery while the wallet is locked, keeping only the newest live request (by the
	 * SDK's receipt time) per `(origin, chainId)`. The queue itself rejects every request it refuses
	 * or supersedes, so the SDK's unbounded pending map never keeps one; the caller rejects nothing.
	 */
	enqueue(discovery: PendingDiscovery, chainId: string): void {
		const entry = { discovery, chainId }
		// A request that is gone or expired by now must not displace a live one, nor be counted.
		if (!this.liveDiscovery(entry)) return
		this.sweep()
		this.admit(entry)
	}

	/**
	 * Drain the queue. Calls `processFn` for each live discovery. If `processFn` returns false (the
	 * wallet locked mid-drain), the unprocessed rest is queued again under the same rule.
	 */
	async drain(processFn: (discovery: PendingDiscovery) => Promise<boolean>): Promise<void> {
		if (this.queue.length === 0) return

		this.logger.log("wallet-sdk", LogLevel.Info, "Draining the discovery queue", { queued: this.queue.length })

		const snapshot = this.queue
		this.queue = []
		this.updateBadge()

		for (let i = 0; i < snapshot.length; i++) {
			// Checked per entry: processing an earlier discovery (which can await a popup) may
			// itself push a later one past the window.
			const discovery = this.liveDiscovery(snapshot[i])
			if (!discovery) continue
			if (!(await processFn(discovery))) {
				this.requeue(snapshot.slice(i))
				return
			}
		}

		this.logger.log("wallet-sdk", LogLevel.Info, "Discovery queue drain complete")
	}

	/** A request that arrived during the drain may already hold an entry's pair, so the rest goes
	 *  back through `admit`, never a bare push. */
	private requeue(rest: readonly QueuedDiscovery[]): void {
		this.sweep()
		for (const entry of rest) if (this.liveDiscovery(entry)) this.admit(entry)
		this.logger.log("wallet-sdk", LogLevel.Warn, "Wallet locked during drain; the rest was queued again", {
			queued: this.queue.length,
		})
	}

	/** Expects `entry` live, with nothing awaited since that check. */
	private admit(entry: QueuedDiscovery): void {
		const { origin, timestamp } = entry.discovery
		const at = this.queue.findIndex((q) => q.discovery.origin === origin && q.chainId === entry.chainId)
		if (at !== -1) {
			const queued = this.queue[at].discovery
			if (timestamp > queued.timestamp) {
				this.rejectOwned(queued)
				this.queue[at] = entry
				this.logger.log("wallet-sdk", LogLevel.Debug, "Discovery superseded by a newer one for its pair", {
					request: describeExternalId(queued.requestId),
				})
			} else {
				this.refuse(entry, "older than the queued request for its pair")
			}
			return
		}
		const refusal = this.capRefusal(origin)
		if (refusal) {
			this.refuse(entry, refusal)
			return
		}
		this.queue.push(entry)
		this.updateBadge()
		this.logger.log("wallet-sdk", LogLevel.Info, "Discovery queued (wallet locked)", { queued: this.queue.length })
	}

	private capRefusal(origin: string): string | undefined {
		if (this.queue.filter((q) => q.discovery.origin === origin).length >= PER_ORIGIN_CAP) return "per-origin cap"
		if (this.queue.length >= GLOBAL_CAP) return "global cap"
		return undefined
	}

	private refuse(entry: QueuedDiscovery, reason: string): void {
		this.rejectOwned(entry.discovery)
		this.logger.log("wallet-sdk", LogLevel.Debug, "Discovery refused while locked", {
			request: describeExternalId(entry.discovery.requestId),
			reason,
		})
	}

	/** Drops every entry that can no longer succeed, so the caps and the badge count live requests. */
	private sweep(): void {
		const before = this.queue.length
		this.queue = this.queue.filter((entry) => this.liveDiscovery(entry) !== undefined)
		if (this.queue.length !== before) this.updateBadge()
	}

	/** The entry's discovery while the SDK holds that very object and it awaits an answer. A gone,
	 *  replaced or answered row yields nothing and is never rejected (it is no longer this entry's);
	 *  an expired one is rejected. */
	private liveDiscovery(entry: QueuedDiscovery): PendingDiscovery | undefined {
		const { discovery } = entry
		const request = describeExternalId(discovery.requestId)
		if (this.handler.getPendingDiscovery(discovery.requestId) !== discovery || discovery.status !== "pending") {
			this.logger.log("wallet-sdk", LogLevel.Debug, "Discovery skipped (gone, replaced or answered)", { request })
			return undefined
		}
		if (isDiscoveryExpired(discovery)) {
			this.handler.rejectDiscovery(discovery.requestId)
			this.logger.log("wallet-sdk", LogLevel.Debug, "Discovery rejected (stale)", { request })
			return undefined
		}
		return discovery
	}

	private rejectOwned(discovery: PendingDiscovery): void {
		if (this.handler.getPendingDiscovery(discovery.requestId) === discovery) this.handler.rejectDiscovery(discovery.requestId)
	}

	private updateBadge(): void {
		const text = this.queue.length > 0 ? String(this.queue.length) : ""
		chrome.action.setBadgeText({ text })
		if (this.queue.length > 0) {
			chrome.action.setBadgeBackgroundColor({ color: "#FF6B00" })
		}
	}
}
