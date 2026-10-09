# Phase 6 — the real decoder test, the test-count measurement

## 106 — `call-surface.real.test.ts`

Node environment. Three cases over the real aztec-standards Token's `transfer_private_to_private`
(`from, to, amount: u128, _nonce`): `encodeArguments` → `FunctionSelector.fromNameAndParameters` →
`decodeCallForDisplay` (a lookup that returns the artifact at the call's address) → `callSurface`.

- Registered token, real call: the vocabulary's transfer (`to`, `amount: "5000000"`, explicit sender,
  `nonce: "3"`). The success control.
- Relabeled artifact (`amount` as `u64`), the call built from it (its own selector): decodes
  (`kind: "decoded"` asserted), and reads as decoded rows, since the selector is not the vocabulary's.
- Real call with `tokenKnown = false` (the lookalike address): decoded rows.

Gate check: with `corroborates(...) || true` forced in a throwaway edit of `call-surface.ts`, the
relabeled case fails and the other two pass; reverted (`git diff` empty).

## 174 — the test count, measured (stop rule applied)

At commit `7b3a24c`, clean tree, `apps/extension`: five `bun --bun vitest list --json` and three
`bun --bun vitest run --reporter=json` (scripts and outputs under the lane's scratch dir `p174/`).

| Runs | Count | Agreement |
|---|---|---|
| 5 lists | 10,426 ids each (10,419 distinct names) | union = intersection: identical |
| 3 full runs | 10,437 each: 10,426 passed, 4 skipped, 7 todo | union = intersection: identical |

The list count is the run's passed count; lists omit the 11 skipped and todo cases. No test came or
went. Per the stop rule nothing is fixed; the close-out rewrites entry 174 with this measurement (the
8,797/8,798 pair was not reproduced at one commit on one host).

Seen along the way, not acted on: five test names repeat inside their file (7 extra ids), e.g.
`hardening.test.ts` "hostile requestId undefined → no response" ×2 and `operation-validation.parity.test.ts`
"aztec_sendTx" ×4. A reporter that keys by name would count fewer tests than ran; stable either way.

## Gate (2026-10-09) — pass

`bun run --cwd apps/extension test -- call-surface.real`: 3/3; the forced-open check fails the
relabeled case; the 174 measurement is recorded above.
