/**
 * The network e2e build's wallet clocks, armed by `VITE_NULO_E2E_WALLET_CLOCKS` through
 * `E2E_WALLET_CLOCKS` in `./config`, the only `src/` module allowed to import this one: the stamp
 * that keeps them out of a release artifact travels with that flag, not with these numbers.
 *
 * The tick stays above the incoming scanner's 5 s tips cache, so a tick whose tips read settled in
 * time reads fresh tips, and above the unlock scan's latency, so a receipt shown sooner than one
 * tick after an unlock was found by that scan. A mined row stays visible 10 s before its first
 * finality read.
 */
export const E2E_WALLET_CLOCK_VALUES = { incomingPollMs: 10_000, finalityReadMs: 10_000 } as const
