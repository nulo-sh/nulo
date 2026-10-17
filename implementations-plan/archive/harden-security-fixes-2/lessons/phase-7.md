# Phase 7: one encoding, one RPC

- 2026-10-16: arc 3 cut from `origin/dev` at `d461b059` (holds #594); the plan carried from `origin/harden-security-fixes-2-arc1` in `86b14f4f`.
- `encodeAuthwitCall(artifact, content)` returns `undefined` for a missing function instead of throwing, so the signing path keeps its frozen "Method not found" and the display tells "unknown-function" from "arguments" without matching error text. Named for every `call`-kind authwit content, private ones included, since `computeCallMessageHash` serves both.
- The display `to` is the normalized `AztecAddress` of `content.contract`, so the token match uses the address the hash binds.
- A non-`call` content reads as `unavailable`: no existing reason fits a content that names no function, today's grant producer sends none, and a new reason would be new copy.
- Tests: `call-decoder.test.ts` (real aztec-standards Token; the shown call's hash equals the signing path's, with a control that another amount's does not; object, decimal and hex arguments; five refused classes), `service.display-decode.test.ts` (one fetch per contract; another profile's network and a 65-grant batch refused before any PXE read).
- Gate F: `bun run lint` 0, `bun run typecheck:all` 0, `bun run test` 0 (804 files).
