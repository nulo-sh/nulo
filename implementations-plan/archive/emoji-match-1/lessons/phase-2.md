# Phase 2: the check on every connection (wallet side)

- 2026-10-16: merged `origin/dev` (5ec3225b, #601 only) before starting; no conflict.
- 2026-10-16: `session-established.ts` shows the check for every establishment that passes its gates; the `hold` dep and the row type's `trustedVerification` are gone. Red/green proof: the folded case "a reconnect whose row carries the old skip flag shows the check" fails on the base copy (826df75c) and passes after.
- 2026-10-16: D4 in its own commit. Deviation: `background.verify-reservation.pins.test.ts`, not in the change map, scripted `admitAsync` to resolve `undefined` for an admission, a value production can no longer return; it now resolves a real unstarted `WindowReservation`. The reconnect-rate tests in `verify-admission.test.ts` give each slot back with `releaseIfUnstarted` (`harness({ releaseOnServe: true })`).
