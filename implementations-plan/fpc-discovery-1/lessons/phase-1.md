# Phase 1: discovery registers outside the FPC lock

- `NetworkService.captureLiveness` reads the reservation count before `isNetworkLive(id, count)` and returns it only if live, so a reservation overlapping the capture refuses the mark; the network test holds a purge open on a gated subscriber to prove none is taken mid-reservation.
- `writeFencedRow` now serves `addFpc` and discovery; the existing addFpc pins (exact refusal messages) pass unchanged.
- Red on the base copy of `service.ts` (from `19399c82`): T1 and T3 fail on their `settled` flag after one macrotask (the base holds the lock across the parked registration), T4 on the registrations it still sends, T5 because the base stores the row once the reservation closes during its fetch. T0 and T2 pass on both, as controls.
- Biome's formatter wrapped one long `rejects.toThrow` line; run `node_modules/.bin/biome format --write` from the root (a root `bunx biome` would be fine here too, but the root binary is the pinned one).
