# popups-modulus-1: phase 2 (the popups refuse a value at or above the modulus)

- Fixtures: 10 values in the four popup tests sat at or above the modulus (`0x` + 64 of `a`-`e`); each moved to a `0x0` prefix, its intent kept. The boundary values are literal hex in `tests/helpers/field-modulus.ts`, so a wrong shared constant cannot pass them.
- `NewTokenPopup.test.ts` never unmounted its wrappers, so an Enter sent from the new rows reached every popup mounted earlier in the file (21 calls for 1). Fixed at the harness: `enableAutoUnmount(afterEach)`; the file's 28 existing tests stay green.
- Red check: with phase 1's four `.vue` files, the 8 modulus rows and the stored-address case red, the other 71 green.
- Smoke at retry 0 on armed builds: Chrome 10/10 in 27.6 s, Firefox 10/10 in 46.3 s (`settings-crud`, `send-picker-add`). No e2e scenario added, so no suite wall-clock moved.
- Fix loop R1: Codex (gpt-6.1-sol, high) approve, two comment points (the modulus doc claimed every hash is below it; `tokenKey`'s doc was long), both taken; it compared 2,025 old and new key expressions with no admitted-input mismatch. Opus (`general-purpose`) approve, comment points taken; its one bug, New sender's Enter adding an address marked "Already exist", predates the lane and is filed as #1499.
- Fix loop R2 (Codex, resumed): approve, no new material finding; the loop converged.
