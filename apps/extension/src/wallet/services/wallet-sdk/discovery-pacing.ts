/**
 * A token bucket per tab over discovery messages, asked before upstream records one: a tab's
 * discoveries reach the approval flow at most `DISCOVERY_BURST` at once and one per
 * `DISCOVERY_REFILL_MS` after that, and a discovery past it is dropped unanswered. Tabs are never
 * pooled, so one page's tabs cannot spend another dApp's allowance.
 */

import type { ClockPort } from "@nulo/wallet-core/ports"

export const DISCOVERY_BURST = 8
export const DISCOVERY_REFILL_MS = 1_000

type Bucket = { tokens: number; refilledAt: number }

export class DiscoveryPacing {
	private readonly buckets = new Map<number, Bucket>()

	public constructor(private readonly clock: Pick<ClockPort, "now">) {}

	/** Spends one of `tabId`'s tokens; `false` when it has none left. */
	public admit(tabId: number): boolean {
		const now = this.clock.now()
		this.refillAll(now)
		const bucket = this.buckets.get(tabId) ?? { tokens: DISCOVERY_BURST, refilledAt: now }
		if (bucket.tokens === 0) return false
		bucket.tokens -= 1
		this.buckets.set(tabId, bucket)
		return true
	}

	public get trackedTabs(): number {
		return this.buckets.size
	}

	/** A bucket that has refilled is dropped at the next admission. */
	private refillAll(now: number): void {
		for (const [tabId, bucket] of this.buckets) {
			// A wall clock set back would otherwise freeze an empty bucket until it caught up.
			if (now < bucket.refilledAt) bucket.refilledAt = now
			const earned = Math.floor((now - bucket.refilledAt) / DISCOVERY_REFILL_MS)
			if (earned <= 0) continue
			bucket.tokens = Math.min(DISCOVERY_BURST, bucket.tokens + earned)
			if (bucket.tokens >= DISCOVERY_BURST) this.buckets.delete(tabId)
			else bucket.refilledAt += earned * DISCOVERY_REFILL_MS
		}
	}
}
