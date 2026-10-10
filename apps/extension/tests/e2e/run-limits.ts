/**
 * Silence after which a network run is failed: twice the longest a green run shows (failed-send-check
 * watches a record for 150 s without logging), floored at 10 min. A test silent for longer needs a
 * progress line.
 */
export const STALL_MS = 10 * 60_000

/**
 * Each network fork's V8 old-space cap, twice the highest peak a green run sampled. It bounds the V8
 * heap only: WASM memory, Chrome and the sandbox are outside it.
 */
export const FORK_HEAP_MIB = 2048
