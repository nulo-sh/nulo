# Phase 2: #630, the refused-node reset starts with both protocol FPC rows present

The gate's runs used an uncommitted overlay of the committed test: Developer and Debug Mode on, then the service worker's stored trail from 4 s before submit, and the refused node's hit count at submit and at the end. "Purge" is submit to tombstone gone, bounded by `waitForProfilePurged`'s 500 ms poll. "Last PXE retry" is the last `[pxe] foundation:retry` line before submit, ms before it. `clearChainState` is when the trail shows its request, ms after submit; the trail loses lines once the purge removes the profile's Developer Mode, so a blank means not stored, not not called. The purge awaits both `clearChainState` calls before it removes the tombstone, so every purge below bounds them too.

| Run | Purge (ms, ≤) | Last PXE retry before submit (ms) | `clearChainState` at (ms) | Refused hits: at submit → end |
|---|---|---|---|---|
| Chrome 1 | 505 | 671 | 22 | 13 → 14 |
| Chrome 2 | 1,548 | 559 | 24 | 13 → 15 |
| Chrome 3 | 518 | 743 | 85 | 13 → 14 |
| Chrome 4 | 2,050 | 303 | 44 | 14 → 16 |
| Chrome 5 | 506 | 3,620 | not stored | 13 → 15 |
| Firefox 1 | 582 | 1,533 | not stored | 6 → 6 |
| Firefox 2 | 1,656 | 617 | not stored | 14 → 15 |
| Firefox 3 | 2,266 | 210 | 201 | 14 → 15 |
| Firefox 4 | 1,751 | 932 | 140 | 6 → 8 |
| Firefox 5 | 1,076 | 3,516 | not stored | 13 → 15 |

- **What it shows.** In every run a PXE read was in its retry loop against the refusal when the reset was submitted (I2 holds), the FPC purge ran at once (`purgeForProfile` at +22-25 ms, no lock wait), and the purge ended within 2.3 s, against 10.2-10.6 s with discovery holding the FPC lock (recon). Both `clearChainState` calls therefore returned within 2.3 s of submit.
- **Gate.** `bun run lint` 0, `bun run typecheck:all` 0; 5/5 per browser at retry 0 with the overlay, then the committed test once per browser (Chrome 26.5 s, Firefox 39.0 s for the file), all green.
