# Phase 0: planning consults

## Round 1, dual audit (2026-10-19)

- **Codex** (`gpt-6.1-sol`, high, read-only on the approve-for-me host mode): **reject**. Blocking: R4 lets a stale protocol row land after a completed same-chain reset (the liveness read sees only overlapping reservations; the PrivateFPC instance is in neither the node nor the known bundle, so private fees fail until the row goes); I1 understates the silent-node drain (several cold registrations queued ahead of the clear each make a first attempt). Also: T3 tested only an ongoing reservation; the overlay needed a witness that discovery was retrying at submit. Proposed an FPC-local purge version plus a liveness precheck, and admission dedupe.
- **Opus 5.5** (Plan agent): **conditional approve**. Same R4 path, with the cheaper fence: `NetworkService.reservations`, a never-decremented count, captured as a mark and checked since. Also a second-registration path after a whole purge (orphan store, needs unsupported timing), I1 wording (about 2 × 60 s on a silent node from Home's two legs), T1 folded into the existing park test, red by assertion rather than a 30 s timeout, T3 to assert the return, the lock-wait criterion at 1 s.
- **Decision**: take the reservation mark (D2), checked before each registration and in the shared write; reword I1, I2 and the threat model; T3 rebuilt as a completed reset during the registration, T4 for a discovery admitted mid-purge; dedupe rejected (D3); the offscreen queue test rejected (D8). F10's general class (any late PXE op re-creates a purged chain's store) goes to a closed known-limit issue at close-out.

## Final pass (2026-10-19)

- **Codex**, fresh session (`gpt-6.1-sol`, high): **reject**. `addFpc` could take a mark while a reservation was open and accept a wiped registration after it closed; T3's inline `clearChainState` would deadlock on the base instead of failing by assertion; F10 missed the gap between a reset's reservation release and its chain-id rewrite.
- **Fixes**: `captureLiveness` refuses a mark while the network is missing or reserved (T5 for `addFpc`); T3 parks the registration on a gate and drives the sweep from the test; F10 widened and kept a known limit (D9); I1 no longer claims an aggregate bound.
- **Codex, resumed**: **approve**. One implementation note, folded into the interface text: `captureLiveness` validates its count across its own storage read.
