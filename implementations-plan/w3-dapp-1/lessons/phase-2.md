# Phase 2 (arc 2): a call string the card cannot print whole

## Consults

- 2026-11-03, Codex arc 2 plan r1 (`gpt-6.1-sol`, high, read-only) on the widened § Arc 2: conditional approve. (1) UTF-8 `cd 8f` decodes to U+034F, a default-ignorable combining mark `safeWire` keeps, so the print check alone would admit an invisible character a grant refuses today; D5 now refuses `\p{Default_Ignorable_Code_Point}`. (2) Tests: a nested struct and array, a four-byte emoji, and `readableGrants` then `callSurface` reading the original string once. (3) Injectivity holds per `str<N>` and as exact text, not as glyphs. (4) Comments. All accepted. It confirmed A for OA-2, display placement (every decoded string reaches the card through `callSurface`), and a field past 0xFF as unreadable against the pinned serde (`type_impls.nr`, `u8` deserialization).

## Facts checked

- Bun: `/\p{Default_Ignorable_Code_Point}/u` matches U+034F, U+00AD, U+3164, U+200B, U+E0001, U+FEFF; `new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })` keeps a leading BOM and throws `TypeError` on a lone `e9`.
- No smoke e2e file opens the execute window: it needs a dApp, so its e2e gate is the network files that open it.

## Runs (retry 0)

- Red at `0ef779bad` against the base `call-surface.ts`: `call-surface.real.test.ts` 16 failed (every new case; the "as today" rows fail on the padding only), `call-surface.test.ts` 2 failed, `OperationCard.wire.test.ts` 2 failed, `index.test.ts` 1 failed (the UTF-8 grant). The index call-Confirm case passes on the base by design (the window stubs the card): a pin, not red evidence.
- Fix `c334716d3`: execute + fee tests 428/428; lint 0; typecheck:all 0 (after typing the test's `0x` fields, folded into the red commit before any push); `test:all` 0 in 186 s.
- Round 1 fixes `8bbf0f564`: execute + fee 431/431; lint 0; typecheck:all 0. Mutation check, each reverted after: dropping `fn` on the raw surface, the right-to-left test, the NFC step, or the default-ignorable test each reds exactly its own case.

## Arc 2 review round 1

- Codex r1 (`gpt-6.1-sol`, high): approve, one comment. Opus r1 (`general-purpose`): conditional approve. Its title finding holds: a raw surface had no `fn`, so `surfaceName` fell back to `call.name`, the dApp's label (`call-surface.ts` `surfaceName`). The worker's selector binding (`assertSelectorBinding`) runs at simulation, not before the window draws. Its right-to-left point holds and is #1380's own consequence; JavaScript has no `Bidi_Class` property escape, so the check uses UAX #9's default R and AL ranges, which hold every assigned R and AL character.
- Codex r2 (resumed): approve, no new finding; the loop converged at `8bbf0f564`.
- Network e2e at `8bbf0f564`, retry 0, `type-roles-windows.test.ts` + `authwit-lifecycle.test.ts`: Chrome 6/6 in 327 s; Firefox 6/6 in 583 s. No scenario added.
- Cross-arc: one fresh Codex session over #1573 and arc 2: approve, no cross-arc finding.
- Captures: a seed harness from the shots branch (the execute window fed a recorded payload, the real decoder's output and a fixed estimate) applied uncommitted, built with CI's smoke flags, captured on Chrome, then removed; the "before" build swapped in `dev`'s `call-surface.ts` only.
- Close-out: `## Decision` on #1380, a note on #127 (the queue drops a row a reused id replaced), OA-2 filed as #1644 and OA-3 as #1645 (`owner-decision`, no duplicate found).
