# Phase 5: arc 2 implementation and review

## Implementation

- No file on arc 2's list changed on `dev` between the plan's base and arc 2's (`git log 4a333b343..origin/dev` over the list is empty), so every site was converted as the table judged it. The one other branch that touches a listed file, `authwit-grant-build-1-a1`, edits a comment in `call-decoder.ts` far from its site.
- `execution/dapp-send-executor.ts` stays on the baseline for arc 3: lane `dapp-estimation-extract-1` (#1934) is splitting it. Its siblings `service.ts`, `transfer-executor.ts` and `estimate-reuse-shared.ts` hold no site.
- `isPlainObject` is `emit.ts`'s body with `===` for `includes` (SameValueZero equals `===` on objects and `null`). `encodeValue` read the prototype twice where the helper reads it once; only a `Proxy` trap could tell, and its input is a dApp's arguments after a structured clone, which carries none.
- Imports follow D9: extend an existing `@nulo/wallet-core/utils` import (config store, price, token list), otherwise the `./guards` leaf.
- The narrowing to `Record<string, unknown>` made the casts after eleven sites redundant; they went with the site. `typecheck:all` passed with no other edit.
- `encodeValue` scored 24 after its prototype check became one call: stamp edited, `baseline:complexity` rewritten, `baseline:rescore` OK.

## Review loop

- Codex r1 (`gpt-6.1-sol`, high, fresh session): approve with one low finding, verified by running it: an array given a `null` prototype passes `isPlainObject`, as it passed `emit.ts`'s old helper and `encodeValue`'s check; the doc overstated the contract. Doc fixed, row pinned.
- Codex r2 (resumed): approve, no new finding. Converged.
- Opus diff review (general-purpose, opus): approve, one nit accepted (four redundant casts in the price and token-list services). It found no set mismatch and confirmed by bundling that `@nulo-sh/wallet-crypto`'s entry holds no `guards.ts`.
- Codex r3 (resumed, targeted): approve; the cast removal emits identical JavaScript.

## Gates

- `audit:vue`'s first run went red on `src/e2e/config.test.ts` ("the window reaches the fixtures only through an armed build's gate", 5 s timeout) at load ~160 on 188 cores: a cold `await import("./execute-fixture-gate")` inside a test body after `vi.resetModules`, the #1951 class that #1952's sweep skipped on purpose (it excluded files with `vi.resetModules` or `vi.stubEnv`). None of that import's graph is an arc 2 file, the same test passed in `test:all` at the same head, and the one rerun was green. Filed as #1961.
- The ratchet resolves the baseline's path against the working directory, so `bun test inline-guard-ratchet.test.ts` from `scripts/ci-cd` reports "predates"; `test:ci-gating` runs from the root, where it reads origin/dev and refuses an added entry (checked).
