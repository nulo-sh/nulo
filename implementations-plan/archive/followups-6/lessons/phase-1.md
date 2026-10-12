# Phase 1: #315, a fixed category for an unparseable stamp

- 2026-10-12. Pins written first against the base source (`bun --bun vitest run src/pxe/opfs-store.test.ts` in `packages/aztec-runtime`): the parse pin red, as planned, both comparison pins green.
  Red line: expected `{ "reason": "stamp failed to parse" }`, received `{ "detail": "stamp failed to parse (Failed to deserialize version information: SyntaxError: JSON Parse error: Unexpected identifier \"not\")" }`. The received payload quotes the stored stamp's first token, which is the leak.
- After the source edit: 12/12 green. Gate: `bun run --cwd packages/aztec-runtime test` 0, `bun run lint` 0, `bun run typecheck:all` 0, `bun run test` 0.
- Shape: the parse branch sets a flag and logs `{ reason: UNPARSEABLE_STAMP }`; the comparison branches keep `{ detail: mismatch }`. The thrown message is unchanged (D6, OA-1); the parse test asserts it still names the parse failure.
