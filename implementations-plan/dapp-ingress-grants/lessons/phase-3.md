# Phase 3: arc 3 log

## Before building (2026-10-12)

- Page 3 (2026-10-12) approved P3-01 to P3-04 as stated; Ask 5 = B, Ask 6 = A; #87 is settled by page 0. Each issue's `## Decision` section is the sign-off (H5).
- #199's signed text bounds `version` to the u32 range "once the implementer confirms every served network's version is below 2^32". The orchestrator's brief read Ask 4 as "version at 2^53 only". The signed text wins (D-impl-18). Evidence: `RollupCore.sol` declares `uint32 internal immutable VERSION` (`@aztec-foundation/l1-artifacts` 6.0.0-rc.1, `l1-contracts/src/core/RollupCore.sol:200`), and testnet's rollup version is 2914217885 (`apps/extension/src/utils/chain-ids.ts`). The local network's composite id 0 says nothing about its version (Codex Q4).
- The wire: `@aztec-labs/wallet-sdk` 6.0.0-rc.1's content script `JSON.parse`s the page's discovery message and the background copies `request.chainInfo` into the session, never deserialized; a dApp's own `jsonStringify` serializes `Fr` as `0x` + 64 hex. Encrypted calls are `JSON.parse`d after decryption (`dest/crypto.js` `decrypt`). So `chainInfo` and every argument are JSON values: no cycles, functions or symbols.

## Phase 3.1 (#87, #201)

- The batched `requestCapabilities` pin lives in `dapp-grant.characterization.test.ts` (its harness counts windows): alone and batched, one window each and the same answer.
- `TooManyPendingError` rebuilds with its wire message and no details (`drop-details`), like `ScopeViolationError`. Both production throwers use the default message.
- The old guard test used `TooManyPendingError` as its example of a class that must not ride the code channel; it now uses `CapabilityNotGrantedError`, which loses its `capabilityType` on the message-only channel.
- Red on base: the five `TOO_MANY_PENDING` rebuild rows and the -32005 envelope case.
- Gate 3.1: `bun run lint` 0; `bun run typecheck:all` 0; wallet-bridge 682; extension-messaging 385; root `bun run test` 11388 passed. Commit b82a5a3.

## Phase 3.2 (#89)

- `assertNoOwnToString` pushes children in a loop, never `push(...values)`: a spread over a large array (an artifact's) can throw `RangeError`, which the parse's catch would turn into a refusal of a valid call.
- Proof the walk is iterative: a recursive mutant passes every refusal row (the stack overflow is caught and refused too) and fails only the control, a 100,000-deep tree with no own `toString` that must pass. The deep refusal row alone cannot tell the two apart.
- `schemas.AztecAddress` accepts `{ type: "Buffer", data: [32 bytes] }`; with an own `toString` it is now refused at the parse (dispatcher test on `registerToken`), without one it still becomes `"[object Object]"` (the residual issue).
- The dApp-facing refusal-log row for `grantPublicAuthwit` sent `"SENTINEL-CALLER"`; the parse now refuses it before the scope check, so the row sends sentinel addresses (a3f7bca). Gate 3.2 as written runs no root `bun run test`, so this surfaced in gate 3.3's run.
- Lint slip: `bunx --bun biome` at the root once (fetches `@latest`); `git status` showed nothing stray. Use `./node_modules/.bin/biome check --diagnostic-level=error <paths>` to see an error `bun run lint` hides behind "Diagnostics not shown".
- Red on base: all eight new refusal rows in `wallet-schema-args.test.ts`, the three in `apply*.test.ts`, and the dispatcher's throwing-shape case.
- Gate 3.2: `bun run lint` 0 (first run red: a test variable named `valueOf`, `noShadowRestrictedNames`); `bun run typecheck:all` 0; schema-patch 15; wallet-bridge 692; `bun run test:release` 294 pass, 0 fail (stage.test 17/17 with the new README); `bun run test:ci-gating` 526. Commit 4cc415a.

## Phase 3.3 (#199)

- `schemas.Fr` takes strings only (a number, a boolean, an `Fr` instance are refused), accepts short hex (`0x00000001`) and decimal (`2904119610`), and its transform THROWS a plain `Error` on `""` and `"abc"` instead of reporting an issue, so `safeParse` alone throws. `parsedField` catches.
- `BigInt("")` is `0n`: a blank `chainInfo` folded onto the local network (id 0) before this change.
- `handleDiscovery` scored 17 with the level choice inline; `rejectFailedDiscovery` holds it. Establishment's failure log is `logEstablishmentFailure`, so its catch stays one call.
- A failing discovery popup (a throw) reaches the catch; a declined one (`approved: false`) does not, so the warn control uses a throw.
- Red on base: 15 cases (10 refused classes, the order case, establishment's cleanup and debug log, discovery's debug log, ingress's -32602, the queued row's class). The canonical-id rows pass on base, which pins today's ids.
- Gate 3.3: `bun run lint` 0 (first runs red: format, then `handleDiscovery` complexity 17); `bun run typecheck:all` 0 (first run red: the ingress test's session type); `bun run test` 11417 passed. Commit 754927a.

## Phase 3.4 (#84, #125)

- Codex design consult (gpt-6.1-sol, high, session `01a13285`): Q1 composition case, no playground bundle (the generic playground only requests `classes: "*"`); and `contracts-getClassMetadata.test.ts` accepted "ok or error", proving silence, not admission: it now sends the token's real class id and asserts both results ok. Q2 keep the wire message. Q3 refusing `Fr` instances is correct (upstream verified). Q4 the bound matches the signed text; correct the "local id 0" reasoning and the plan's obsolete 2^53 control.
- The composition case drives the real `WalletSdkDispatcher` over the real `DappSessionService` on `FakeBrowserApi`; the window is the only fake and echoes the delta. It asserts the stored grant (real state) and the window count.
- Red on base: seven coverage cases, the rejected-widening row for contract classes, and the composition case.
- Gate 3.4: `bun run lint` 0; `bun run typecheck:all` 0; wallet-bridge 701; `bun run test` 11427 passed. Commit bac198a.

## Post-implementation review (2026-10-13)

- Network e2e on bac198a, retry 0: Chrome 7/7 files, 7/7 tests; Firefox 7/7 files, 7/7 tests.
- Codex round 1 (session `01a1328b`): approve with fixes. C1 (Med) was real: a contract artifact's `storageLayout` is keyed by storage-field names, so the blanket own-`toString` walk refused a legal `registerContract`; the walk now skips the artifact argument. C2: a capacity refusal is repeatable with silent sends, so it logs at debug. C3: two comments. All three new tests red on base. Commit af22322.
- Opus review: approve with fixes, four Lows. O1: `schemas.AztecAddress` admits the Buffer shape that `z.string()` refused, so `grantPublicAuthwit` joins #331's residual. O2: filed as #332 (pre-existing, outside the arc). O3, O4 fixed in dfdaaf2.
- The planned PR title fails commitlint's `subject-case` on the bare `chainInfo`; backticks pass (D-impl-31).
