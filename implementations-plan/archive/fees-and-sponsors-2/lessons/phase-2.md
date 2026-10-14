# Phase 2: the app-paid row and the Confirm wait

## What landed

- `OperationCard.vue`: once the app-paid estimate lands, the row reads "Fee up to **X FJ**" and, when the committed priority is not zero, ", includes a Y FJ priority fee the app asked for" (shot `o-188-prio-B`; the figure takes the same role as the app name it replaces, `name` at the row's size). Until it lands, and after a failure, today's sentence. `execute-op-fee-set-badge` stays on the row; the sentence carries `execute-op-app-fee`.
- `index.vue`: `awaitsAppFeeFigure`, a computed value over the existing estimate map, holds Confirm and refuses in `approve()` while a standard send whose app set a cap or priority has no landed estimate, and keeps holding after a failure (OA-3 A). A default-entrypoint operation is skipped. Truthiness matches the planner's, so the wait holds exactly when the planner commits an app fee setting.

## Deviation

- The plan says the fixture's fee settings are "`0x` hex fields". The wallet-sdk serializes `GasFees` with `jsonStringify`, whose replacer writes each bigint as a decimal string, so the fixtures carry decimal strings; the call arguments stay 32-byte hex.

## Tests

- `OperationCard.fee.test.ts`: four cases replace "reads as before": no estimate; a landed estimate (`Fee up to 3.577824 FJ`); a priority (B's sentence, exact); a short estimate (the figure and the notice, both proven values).
- `index.test.ts`: the wait for a cap and for a priority (off while estimating, approve sends nothing, on once landed); off after a failure; the control, never held for an app that set nothing. A mutation that removes the wait reds the three wait cases.

## Gate (2026-10-14)

`bun run lint` exit 0; `bun run typecheck:all` exit 0; `bun run --cwd apps/extension test src/popup/windows/execute` (with the copy-dash and type-role scans) 304 passed. Pass.
