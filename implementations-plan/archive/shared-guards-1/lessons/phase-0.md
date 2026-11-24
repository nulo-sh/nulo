# Phase 0: planning consults

## Recon

- AST inventory (TypeScript compiler, the guard's matcher) over the six wallet-core dependents at `4a333b343`: 111 object guards, 9 hex literals, 14 bare typeof tests (out of scope). One Sonnet Explore sweep for the other restated primitives (delay, base64, hex encoding, message extraction, hex shapes, named object guards, prototype checks); its findings are in recon.md.
- A stored-shape Zod predicate is recorded by its `.describe()` label (`stored-shapes/emit.ts:91-103`), so swapping `tolerantRecord` for `isObjectLike` inside `z.custom` leaves the snapshot unchanged.

## Plan audit

- Codex r1 (`gpt-6.1-sol`, high, read-only; session started fresh): `reject`, seven findings. Verified each against the tree: `canonicalizeTransformMap` calls `cloneJsonObject` with no `typeof` check (`row-map-migration.ts:155`); the scratch matcher took any null test in a mixed chain; PR #1945's file list holds `extension-messaging/src/errors.ts`; line 193 is in `cloneJsonObject`, 300 in `applyRowTransform`. All seven accepted (plan § Plan review).
- Opus r1 (Plan agent, opus): `conditional approve`. Verified: `pinned-tokens.ts:26-27` lower-cases before `CONTRACT_RE`; `zeroize-sites.test.ts:52-68` spies `Buffer.from` in `wrapPair`; `complexity-rescore.test.ts` is the CI gate for exact stamps. Accepted all but the `pending` cap, which the ratchet supersedes.
- Final Codex pass (fresh `gpt-6.1-sol` session, high): `conditional approve`, four conditions (explicit retry 0 and Chrome on every e2e command, since `vitest.e2e.network.config.ts` retries twice by default; a K1 pin that tells the two guards apart; K6 named; recon's superseded claims marked). Verified each, applied all; the resumed session answered `approve`.
