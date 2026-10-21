/**
 * The network e2e build's wallet clocks. Under `src/` only `./config` may import them: its flag
 * carries the stamp that keeps them out of a release bundle, and a direct import would carry none.
 *
 * The tick stays above the incoming scanner's 5 s tips cache, so a tick whose tips read settled in
 * time reads fresh tips, and above the unlock scan's latency, so a receipt shown within one tick of
 * an unlock was found by that scan. A row this worker sees mined waits 10 s for its first finality
 * read.
 */
export const E2E_WALLET_CLOCK_VALUES = { incomingPollMs: 10_000, finalityReadMs: 10_000 } as const
