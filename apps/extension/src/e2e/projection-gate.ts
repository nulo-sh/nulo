/**
 * An e2e hold on one account's balance projections, between registering the token and registering
 * the account. Projections are what register an inactive account after a backup import, so the
 * hold keeps it unregistered while the incoming-transfer scan polls it against a registered token:
 * the order a slow node produces on a live network, made deterministic.
 */
export interface ProjectionGate {
	/** Resolves when a projection may register `account`; rejects if the hold times out. */
	waitIfArmed(account: string): Promise<void>
}

export const NOOP_PROJECTION_GATE: ProjectionGate = {
	waitIfArmed: () => Promise.resolve(),
}
