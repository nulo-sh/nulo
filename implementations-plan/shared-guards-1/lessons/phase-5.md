# Phase 5: arc 2 implementation and review

## Implementation

- No file on arc 2's list changed on `dev` between the plan's base and arc 2's (`git log 4a333b343..origin/dev` over the list is empty), so every site was converted as the table judged it. The one other branch that touches a listed file, `authwit-grant-build-1-a1`, edits a comment in `call-decoder.ts` far from its site.
- `execution/dapp-send-executor.ts` stays on the baseline for arc 3: lane `dapp-estimation-extract-1` (#1934) is splitting it. Its siblings `service.ts`, `transfer-executor.ts` and `estimate-reuse-shared.ts` hold no site.
- `isPlainObject` is `emit.ts`'s body with `===` for `includes` (SameValueZero equals `===` on objects and `null`). `encodeValue` read the prototype twice where the helper reads it once; only a `Proxy` trap could tell, and its input is a dApp's arguments after a structured clone, which carries none.
- Imports follow D9: extend an existing `@nulo/wallet-core/utils` import (config store, price, token list), otherwise the `./guards` leaf.
- The narrowing to `Record<string, unknown>` made the casts after eleven sites redundant; they went with the site. `typecheck:all` passed with no other edit.
- `encodeValue` scored 24 after its prototype check became one call: stamp edited, `baseline:complexity` rewritten, `baseline:rescore` OK.
