---
plan: wallet-followups-6
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 Sonnet agents; panel = Codex (gpt-6.1-sol, high) + one Opus 5.5 Plan lens per round
base: origin/dev 36c43155
issues: "#345, #332, #331, #262 (arc 1); #336 (arc 2)"
---

# wallet-followups-6

Five small findings filed by earlier lanes. Three sit at the dApp ingress: an unbounded message size (#345), a method name that is not a string (#332), and an address in a non-canonical encoding (#331). One sits in the token service: the chain purge can delete a reused id (#262). One sits in the e2e suite: eight window-driving files check one of the two error arrays (#336). No extension screen changes.

## Scope

| Issue | Arc | What closes it |
|---|---|---|
| #332 | arc 1, phase 1 | A non-string method name is refused as unsupported; an unsupported method logs at `debug`. |
| #331 | arc 1, phase 2 | The parse refuses an address whose wire form is not the exact string the parse writes for it. |
| #345 | arc 1, phase 3 | The envelope check bounds a secure message's `content` before the decrypt. |
| #262 | arc 1, phase 4 | The chain purge deletes a row only while it still belongs to the purged profile and chain, and no id is reallocated between that check and the delete. |
| #336 | arc 2, phase 5 | The eight files assert both error arrays at every assertion point. |

**No arc, with the reason** (named by the lane brief): #322 (a recorded flake, `e2e-followups-5`); #279 (owner page 5, P5-07); #186 (after #279); #277 (page 7, P7-09); #157 (`account-session-life`); #218 (`send-queue-activity`, page 9); #140 and #138 (`incoming-transfers`); #215 (`forms-and-contacts`, page 11); #244 (its trigger is not met); #172 (stop rule); #118 and #188 (`fees-and-sponsors`); #24, #21, #204; every `owner-decision` and `blocked:external` issue. #329 (upper-case hex at the popup's token add, `lane:tokens-and-balances`) is near #331 and stays out: phase 2 touches only the dApp path.

## Assumptions

### Facts

1. `validateContentScriptMessage` types `content` as `z.unknown().optional()` and checks no length (`apps/extension/src/wallet/services/wallet-sdk/content-script-validator.ts:51-59`). Its `invalid` verdict is dropped with a debug line by `admitContentMessage` (`background.ts:412-416`) and by the pre-boot relay (`content-message-relay.ts:92`). `admitContentMessage` forwards the original message, not the parsed one (`background.ts:418`).
2. A secure message's `content` is `{iv, ciphertext}`, both base64 strings; the call's `messageId` is inside the ciphertext (`@aztec-labs/wallet-sdk` `src/extension/provider/extension_wallet.ts:242-252`, `src/crypto.ts:370-380`). `ExtensionWallet` has no per-call timeout, and the wallet's PONGs keep the page's liveness check satisfied (`extension_wallet.ts:141, 287-296`): a call the wallet never answers stays pending until the page reloads.
3. The largest legitimate call measured is `registerContract` with the noir-contracts `Token` artifact: 6,116,730 plaintext bytes, 8,155,664 ciphertext characters, over 44 bundled artifacts (`recon.md` § Measured wire sizes). The playground sends artifacts through the wallet channel (`apps/playground/src/sections/phase.ts:176`). `apps/extension` declares `@aztec-labs/noir-contracts.js` and `@aztec-foundation/aztec-standards`.
4. `assertKnownMethod` passes its argument to `Object.hasOwn(METHOD_REGISTRY, …)` with no `typeof` check (`packages/wallet-bridge/src/method-descriptors.ts:338-342`). `{toString: "x"}` throws a `TypeError` there; `42` and `null` pass that call and throw inside `UnsupportedMethodError.forMethod` (`.length`, `packages/extension-messaging/src/errors.ts:271`); `["sendTx"]` passes as the key `"sendTx"`. `isExpectedRefusal` lacks `UnsupportedMethodError` (`background.ts:1333-1341`).
5. `assertWalletSchemaArgs` is a pass/fail predicate whose parsed value is discarded by design, so later layers read the exact wire args (`packages/wallet-bridge/src/wallet-schema-args.ts:31-52`); it runs before every scope check, handler and window (`dispatcher.ts:233-235`).
6. `schemas.AztecAddress` admits a hex string (either case, optional `0x`), a base64 string of 32 bytes and a `{type: "Buffer", data}` object (`stdlib/src/aztec-address/index.ts:194-201`). The SDK writes an address as `AztecAddress.toString()`, lower-case with `0x` (`aztec-address/index.ts:186-191`), and turns any Buffer-shaped object into base64 (`foundation/dest/json-rpc/convert.js:14-29`).
7. `registerContract`'s first argument is parsed with `ContractInstancePreimageSchema`, which has no `address` (`stdlib/dest/contract/interfaces/contract_instance.js:7-15`), so the parse drops the field `checkRegisterContract` reads raw (`method-scope-checkers.ts:76`); the executor later parses the same instance with `ContractInstanceWithAddressSchema` (`apps/extension/src/wallet/services/execution/service.ts:1027`).
8. `clearChainState` deletes each snapshot row by id with no re-read (`apps/extension/src/wallet/services/token/service.ts:228-255`); `nextNumericId` reuses a freed highest id (`apps/extension/src/wallet/services/id-allocators.ts:17-30`); the only allocators are the add (`:433`) and the restore (`:915`), both under the token lock; every token-row write is `track`ed.
9. The eight #336 files exist and each asserts only one array (`recon.md` § e2e error arrays); `connect-dapp.test.ts:25-26` is the both-arrays pattern.
10. Draft PR #347 touches `background.ts` (`onWalletMessage`, `handleWalletMessage`'s signature, hunks ending at `:1320`, an import hunk at `:83-86`), `background.refusal-log.test.ts` (lines 16-19 and its `refuse` helper) and `connect-one-window.test.ts` (imports and one helper); it does not touch `isExpectedRefusal` (`:1333`), the validator, `wallet-schema-args.ts`, the dispatcher or the token service.

### Inferences

- I1. No legitimate wallet-sdk client sends an address in any form but `AztecAddress.toString()`: the SDK's typed API takes `AztecAddress` objects, whose `toJSON` writes that form. A hand-built client sending upper-case hex, un-prefixed hex, base64 or a Buffer-shaped object at an address position is refused after phase 2.
- I2. The #262 race needs a token-row writer already inside the token lock while the purge runs, because a writer's admission drains the purge's tracked deletes first. The reachable case: a multi-row restore whose earlier row is in the purge's snapshot and is compensate-deleted (`service.ts:937-940`), after which a later row of the same restore, on another chain, allocates the freed id (`:915`).
- I3. None of the eight #336 files raises a console error or page error today on either browser; the issue's sweep found both arrays empty, and phase 5 re-proves it.
- I4. One copy of `@aztec-labs/stdlib` is installed (`node_modules/.bun/@aztec-labs+stdlib@6.0.0-rc.1+c1edb6f0433b9698`), so `instanceof AztecAddress` holds between the schema's output and `wallet-bridge`'s import. Phase 2's refused rows fail if a bump ever splits it.

### Asks (working assumption in brackets; none blocks the arcs)

- A1. Do envelope types other than `secure-message` need a size bound? [Out of #345, which concerns a connected app's calls. The orchestrator report carries the question; if it holds, the close-out files it as a private draft advisory, never a public issue.]
- A2. Extend #336 to the ~18 other single-array files recon found? [No: the issue names eight; a new issue at close-out lists the rest.]

## Outcome & Quality Bar

- **For whom**: a person whose browser runs Nulo next to an app they connected, and the maintainer who reads the wallet's log export or a red e2e run.
- **Excellent looks like**: (1) a connected page cannot make the wallet decrypt or queue a message larger than the budget, and every call the bundled artifacts produce stays under half the budget (a test pins it); (2) every address a check, handler, window or signer reads is the exact string the parse writes for it, so one address has one spelling and one answer; (3) a token added on one chain never disappears because another chain is being removed; (4) a window-driving e2e file goes red on a console error or an uncaught throw in its window.
- **Good enough**: no new configuration, no change to an extension screen, one new lock confined to the token service.

## Architecture & Implementation

### #332: a non-string method name (phase 1)

- `assertKnownMethod(methodName: unknown)`: a non-string throws `UnsupportedMethodError.forMethod(\`[${typeof methodName}]\`)`, the placeholder form `describeWireMethod` uses for log lines, written inline (importing `describeWireMethod` would close an import cycle: `external-id.ts:1` imports `method-descriptors.ts`). The registry check runs only on strings. The `asserts methodName is MethodName` signature stays.
- `isExpectedRefusal` gains `UnsupportedMethodError`; its import joins the existing `@nulo/extension-messaging/errors` import, outside #347's hunk at `:83-86`.
- The one caller (`dispatcher.ts:265`) keeps its declared `string`: the guard lives in the function every dispatch path calls, batch legs included.

### #331: one spelling per address (phase 2)

- **The rule.** Every address the parse produces must sit on the wire as the exact string `parsed.toString()` (lower-case, `0x`, 64 digits). Anything else at an address position throws inside `assertWalletSchemaArgs`, whose existing `catch` answers `InvalidWalletArgumentsError.forMethod(method)`. The parse stays a pass/fail predicate; no reader changes.
- **Finding the positions.** After each parse, walk the parsed value and the wire value side by side, iteratively like `assertNoOwnToString`:
  - the parsed node is an `AztecAddress` → apply the rule to the wire node;
  - the parsed node is an object or array (a class instance such as `FunctionCall` included) and the wire node is an object, an array or absent → descend into each own key of the parsed node, paired with the wire node's same key (absent if missing), so an address the parse produced from nothing is refused;
  - the parsed node is an object and the wire node is a string → stop: a packed encoding the schema decoded (a `Capsule`, an `Fr`), whose inner addresses never reach a reader as a JSON field;
  - never descend into a `Buffer`, a typed array, a `Map` or a `Set`.
- **The keys the parse drops.** Two schemas strip a key a reader uses; each gets a supplementary parse that the walk then covers, side by side:
  - `createAuthWit`'s intent: `parseCallIntentKeys`, already present (the union takes the inner-hash branch first and strips `caller` and `call`).
  - `registerContract`'s instance: new, parsed with `ContractInstanceWithAddressSchema`, the shape the executor already requires (Fact 7). A call carrying a bare preimage (no `address` or `currentContractClassId`), which upstream's schema admits and Nulo's executor already refuses, is now refused at ingress as `INVALID_PARAMS`.
- **Out of the walk.** The artifact argument (`ARTIFACT_ARG`) and `requestCapabilities`' manifest, which keeps its own parse and compares addresses through `sameFieldAddress`.

### #345: a size bound before the decrypt (phase 3)

- `content-script-validator.ts` exports `MAX_SECURE_MESSAGE_CIPHERTEXT_CHARS = 16 * 1024 * 1024` and refuses a `secure-message` whose `content` is not exactly `{iv, ciphertext}` (a strict object: no other key), with `iv` a string of at most 32 characters and `ciphertext` a string of at most the budget. Other envelope types keep `content: unknown` (A1).
- **Why strict.** Upstream forwards the whole `content` into the decrypt call, and `serializeDecryption` queues that call per session (`background.ts:618-625`); `admitContentMessage` forwards the original message (Fact 1). An extra key on `content` would carry any amount of data past a bound on `ciphertext` alone.
- **The unit.** UTF-16 code units of the base64 strings (`.length`), the unit a JavaScript string's memory scales with; a legitimate ciphertext is ASCII, so it equals its byte count. Nothing is decoded.
- **The number.** A policy budget: twice the largest call measured over the 44 bundled artifacts (Fact 3), under Chrome's 64 MiB message ceiling. A test re-measures it on every run (phase 3).
- **The refusal.** The validator's existing `invalid`: dropped before the SDK handler sees it, with the existing debug line. No reply can be addressed before the decrypt (Fact 2), so the issue's and the brief's "standard invalid-request envelope" cannot be sent there. The page's call stays pending until the page reloads (Fact 2); the headroom keeps every legitimate call far from that. No extension screen changes.
- No hunk in `background.ts`.

### #262: identity in the chain purge (phase 4)

- **A row-id lock.** A second `Lock` in `TokenService` (`new Lock("token-row-ids", logger, null)`: no watchdog, since it is never held across a network call, another lock or a fetch). It is held:
  - by the add, from `nextNumericId` to the row's `set` (`advanceAdd`, `:433-451`);
  - by the restore, from `nextNumericId` to the row's `set` (`restoreRow`, `:915-934`);
  - by the purge, for each snapshot row, from its re-read to its delete.
  The held region is exactly allocation to `set` (or re-read to delete): the lock is released before any compensation, `finishAdd`, journal write or retry admission. Lock order is token lock → row-id lock, and the purge (network lock held) takes only the row-id lock; no holder of the row-id lock waits on another lock, so no cycle exists. The liveness reads inside the held regions (`isNetworkLive`, `isChainLive`) take no lock (`network/service.ts:589-608`).
- **The purge.** `clearChainState` keeps its lockless snapshot and its drain. For each snapshot row, under the row-id lock: read the stored row at that id; if it is gone or no longer has the purged `profileId` and `chainId`, skip it (no delete, no emit); otherwise `track` the delete, await it, and emit `onTokenDeleted` for the row read. `purgeRows`' `remove` may now return `false` to mean "nothing deleted, emit nothing"; every other caller returns nothing and is unchanged.
- **Why this is enough.** Only an allocation can put a different row at a snapshot id, and allocation-to-write and the purge's check-to-delete now exclude each other. A delete by another writer between the purge's check and its delete removes the same row (harmless). A row on the purged chain re-added at the same id is still deleted: the purge owns every row of that chain, and adds are refused while the reservation stands.
- A holder the token lock's watchdog released may still hold the row-id lock while parked in a storage or liveness read; a successor then waits for that read, never on a lock, so no cycle forms.
- The comment above the sweep (`:236-247`) gains one sentence: the sweep holds the row-id lock, never the token lock.

### #336: both error arrays (phase 5)

At every existing assertion of one array in the eight files, add the other on the same `ctx`, in the `connect-dapp.test.ts` order (`consoleErrors`, then `pageErrors`). No helper: two inline lines are the suite's idiom.

## Decision ledger

- **D-345a, where and how to refuse.** (a) The validator drops an over-budget `secure-message` before the decrypt, with no reply. (b) Decrypt, measure at `onWalletMessage`'s arrival, answer `InvalidWalletArgumentsError`: a reply, but the oversized payload is decrypted first, and the hunk sits inside #347's. (c) End the session before the decrypt: the page learns at once, but every other call of the session ends, a behaviour a person notices. **Chosen (a)**, by both panel members. The issue's and brief's "standard envelope before the decrypt" did not hold (Fact 2).
- **D-345b, the number.** 16 MiB of ciphertext characters, as policy. 8 MiB leaves 3% headroom; 32 MiB lets four held calls pass half a gigabyte. **Chosen 16 MiB**, by both; a test pins the 2× headroom.
- **D-345c, extra keys on `content`.** **Strict `{iv, ciphertext}`**, raised by both (Codex finding 2, Opus finding 4).
- **D-331a, canonical by refusal or by rewrite.** (a) Hand later layers the parse's output: reverses the documented "exact wire args" design for every method, strips unknown keys and adds defaults the window and journal would show, re-serializes multi-megabyte artifacts. (b) Rewrite at the issue's listed sites: misses the twelve scope-checker reads. (c) Refuse at the parse any address not in the parse's own spelling: keeps the pass/fail design and covers every reader at the one choke point. **Chosen (c)**, by both. The issue's "hand later layers the parsed address" is replaced; the brief's test ("refused as INVALID_PARAMS before any window opens") holds.
- **D-331b, which spellings pass.** Codex: keep upper-case `0x` hex, as `field-address.ts` admits it, and surface lower-case-only as a compatibility decision. Opus: exact `toString()` only. **Chosen exact**: readers compare with `===` (`method-scope-checkers.ts:270`, `findToken`, `isTokenRegistered`'s lookup), so an upper-case spelling gets a different answer than its lower-case twin, which is the defect class #331 names; no SDK client writes another spelling (I1). `field-address.ts`' tolerance serves grant lists the dApp writes into a manifest, a separate input. The pinned row "a session account in upper case" (`dapp-grant.characterization.test.ts:378`) moves from a scope refusal to `INVALID`, both refusals.
- **D-331c, unresolved paths.** Codex: skipping every unresolved path is too broad. Opus: safe for added or renamed keys, a hole for stripped keys. **Chosen**: descend when the wire side is absent (an address made from nothing is refused), stop only at a packed string, and give each stripping schema a supplementary parse.
- **D-262, how the purge proves identity.** (a) Re-read, then delete in the same turn the read resolves, exact if `storage.local` services and resolves one extension's operations in issue order (Opus: sound, and smallest). (b) A row-id lock shared by allocation-to-write and the purge's re-read-to-delete (Codex; also the sketch the tokens-and-balances panel filed with #262). (c) `withTokenLock`: the ABBA deadlock with the network lock. (d) Compare bytes: a same-identity update between snapshot and delete would orphan the row on the removed chain. **Chosen (b)**: (a)'s ordering is neither in Chrome's `storage` documentation nor in the `MinimalStorageArea` contract (`entity_storage.ts:15-18`), and a destructive delete should be correct by exclusion, not by an inference about two browsers' internals. The cost is three held regions in one service. Opus's dissent is recorded here.
- **D-262b, the emit.** `purgeRows`' `remove` returning `false` (Opus) over a closure sharing a set between two callbacks.
- **D-336, a shared helper.** None.
- **D-grouping.** Two arcs, one PR each against `dev`, as the lane brief groups them; arc 2 touches no arc 1 file.

## Security & Adversarial Considerations

- **Threat model.** A page the person connected controls every byte of its content-script messages and every decrypted argument. It wants to exhaust the service worker's memory, make an authorization check read a different value than the signer, or make a refusal look like a bug. A second writer inside the wallet (a restore) races the chain purge.
- **Input validation.** Phase 3 bounds the one field the wallet keeps (the ciphertext, queued for the decrypt and then kept as the decrypted call). Phase 2 makes the parse the single place an address's spelling is settled, so a scope check, a window and a signer cannot read one address two ways; the `registerContract` address the parse used to drop is now checked. Phase 1 closes a `TypeError` path past the typed refusal.
- **Fail-closed.** Every new refusal refuses; nothing new admits. The purge's identity check fails toward keeping a row: a row it skips belongs to a live chain or is already gone.
- **Concurrency.** The row-id lock is never held across a network call, a metadata fetch or another lock, so it cannot join the token-lock/network-lock cycle the sweep's comment describes.
- **Log hygiene.** Phase 1 moves a refusal a page can repeat at will from `error` to `debug` (CLAUDE.md § Logging policy). The placeholder method name is fixed text, never the wire value.
- **Supply chain, cryptography, least privilege.** No dependency, no crypto change, no permission change.
- **Residual risk.** (1) The worker can still hold many messages of up to the budget each: `MAX_HELD_PER_SESSION` (#347, not yet on `dev`) caps the count only while a check is unanswered, and a confirmed session's queue has no count cap; a new issue at close-out. (2) Envelope types other than `secure-message` keep `content: unknown` (A1).

## UI impact

No extension screen changes. #345 drops an oversized message from a page (that page's call stays pending); #331 and #332 change what an app receives or a log line's level; #262 keeps a row that today can vanish; #336 is tests. `OWNER-ASKS.md` says none.

## Phases

Every gate runs from the worktree root. Green means exit 0 and vitest names the new tests as passed.

**Red/green method** (every phase): copy the implemented file aside (`cp <path> ~/.cache/nulo-backlog/wallet-followups-6/impl-<name>`), write the base copy over it (`git show 36c43155:<path> > <path>`), run the new tests and see them fail, copy the implementation back and see them pass. Never `git checkout --` an implemented file.

### Phase 1: #332, a non-string method name

- Change map:
  - `packages/wallet-bridge/src/method-descriptors.ts`: `assertKnownMethod(methodName: unknown)` refuses a non-string with the inline placeholder.
  - `apps/extension/src/wallet/services/wallet-sdk/background.ts`: `isExpectedRefusal` lists `UnsupportedMethodError`.
- Tests:
  - `packages/wallet-bridge/src/method-name.test.ts`: `{toString: "x"}`, `42`, `null` and `["sendTx"]` each throw `UnsupportedMethodError`; the existing string cases are the control.
  - `apps/extension/src/wallet/services/wallet-sdk/background.refusal-log.test.ts`: an unknown string method and a non-string method (`refuse(42 as never, …)`) each log at `debug`, answer `-32601`, and run nothing; the existing schema-refusal case is the control. Leave lines 16-19 and the `refuse` helper alone (#347 edits them).
- Assumptions: Facts 4, 10.
- **Validation gate**: `bun run lint && bun run typecheck:all && bun run --cwd packages/wallet-bridge test && bun run --cwd apps/extension test src/wallet/services/wallet-sdk/background.refusal-log.test.ts`. Pass: all exit 0; the new cases fail on the base copy. Layers: lint, typecheck, unit.

### Phase 2: #331, one spelling per address

- Change map:
  - `packages/wallet-bridge/src/wallet-schema-args.ts`: the side-by-side walk after each parse; the `registerContract` supplementary parse beside `parseCallIntentKeys`; both throw into the existing `catch`.
  - `packages/wallet-bridge/src/dapp-grant.characterization.test.ts:378`: the upper-case session account row expects `INVALID`.
  - `packages/wallet-bridge/src/testing/wire.ts:39`: `wireInstance` gains `currentContractClassId`, so the existing `registerContract` controls (`wallet-schema-args.test.ts:56,152`) satisfy the new supplementary parse.
- Tests (`packages/wallet-bridge/src/wallet-schema-args.test.ts`, table-driven, wire-shaped fixtures from `testing/wire.ts`):
  - **One refused row per reader path**, each with a Buffer-shaped address: `isTokenRegistered[0]`; `registerToken[0]` and `[1]`; `createAuthWit[0]`, `[1].consumer` (inner-hash intent), `[1].caller` and `[1].call.to` (call intent); `grantPublicAuthwit[0]`, `[1].caller`, `[1].contract`; `sendTx[0].calls[0].to` (the one execution-payload row: `simulateTx` and `profileTx` share the schema) and `sendTx[1].from`; `executeUtility[0].to`; `getContractMetadata[0]`; `getPrivateEvents[1].contractAddress`; `registerSender[0]`; `registerContract[0].address`.
  - **One row per other refused spelling**, at `registerToken[1]`: base64, un-prefixed hex, upper-case hex.
  - **A nested address inside a transformed class**: a `simulateTx` whose `opts.overrides` (`SimulationOverrides`) names a Buffer-shaped contract address, refused, with its canonical twin as the control.
  - **A bare-preimage `registerContract`** (no `address`, no `currentContractClassId`): refused.
  - **An intent carrying both union branches** with a Buffer-shaped `caller`: refused.
  - **Controls** (each passes): every row's canonical twin; a `sendTx` with a populated capsule; a `registerContract` with `wireArtifact()`.
  - `packages/wallet-bridge/src/dispatcher.test.ts`: `grantPublicAuthwit` under a `*` transaction scope with a Buffer-shaped `contract` rejects with `InvalidWalletArgumentsError`, and `dappInteractionService.execute` is never called, so no window opens; the canonical twin reaches `execute` (control).
- Assumptions: Facts 5, 6, 7; I1, I4.
- **Validation gate**: `bun run lint && bun run typecheck:all && bun run --cwd packages/wallet-bridge test && bun run --cwd packages/wallet-sdk-schema-patch test`. Pass: all exit 0; the refused rows fail on the base copy. Layers: lint, typecheck, unit.

### Phase 3: #345, the ciphertext budget

- Change map:
  - `apps/extension/src/wallet/services/wallet-sdk/content-script-validator.ts`: the exported budget and the strict `secure-message` content.
  - Fixtures that build a `secure-message` without a well-formed `content` get one where the test means a valid message (`content-message-relay.test.ts:93`, `background.transport.test.ts:41`; re-check with `rg -n "secure-message" apps/extension/src apps/extension/tests`).
- Tests:
  - `content-script-validator.test.ts`: ciphertext of exactly the budget is `valid`, one character over is `invalid`; an `iv` over 32 characters, a non-string `ciphertext`, a missing or non-object `content`, and a small valid `{iv, ciphertext}` with any extra key are each `invalid`; the existing well-formed envelopes of every type still validate (control).
  - **Compatibility pin** (same file): every artifact under `@aztec-labs/noir-contracts.js/artifacts` and `@aztec-foundation/aztec-standards/target`, located through `@nulo/resolve-asset`, loaded with `loadContractArtifact`, wrapped as the SDK wraps `registerContract`, serialized with `jsonStringify` and encrypted with the SDK's `encrypt`: its `content` validates, and twice the largest ciphertext is within the budget. It goes red when an Aztec bump outgrows the headroom. The scan covers every artifact on every run (about 3.5 s measured without the encryption): a bump can make another artifact the largest.
  - `background.transport.test.ts`: an over-budget `secure-message` never reaches the SDK listener, beside the existing "malformed envelope is dropped" case.
- Assumptions: Facts 1, 2, 3.
- **Validation gate**: `bun run lint && bun run typecheck:all && bun run --cwd apps/extension test src/wallet/services/wallet-sdk/`. Pass: all exit 0; the over-budget and extra-key cases fail on the base copy. Layers: lint, typecheck, unit (real-data compatibility pin).

### Phase 4: #262, identity in the chain purge

- Change map:
  - `apps/extension/src/wallet/services/token/service.ts`: the row-id lock; held in `advanceAdd` and `restoreRow` from allocation to `set`, and in `clearChainState`'s `remove` from re-read to delete; the sweep comment's added sentence.
  - `apps/extension/src/wallet/services/purge-rows.ts`: `remove` may return `false`, which skips that row's emit; its doc says so.
- Tests (`apps/extension/src/wallet/services/token/service.test.ts`, beside the `:964` template):
  - **The race** (I2): a profile with chain-1 token A, then `restore([R1 on chain 1, R2 on chain 2])` and `clearChainState("p1", 1)` interleaved so that the purge's snapshot holds R1 at id N, R1 is compensate-deleted, and R2 takes id N before the purge reaches N (park the restore's post-set `isChainLive` for R1 and the purge's remove of A). With the fix, release the parked remove of A once R2 is queued on the row-id lock, without awaiting R2's write first. R2's row survives at N, and no `onTokenDeleted` names R2's contract. Red on the base copy.
  - **Control in the same test**: A is deleted and its `onTokenDeleted` fires once.
  - `apps/extension/src/wallet/services/purge-rows.test.ts`: a `remove` returning `false` skips that row's emit; one returning nothing emits (control).
  - The existing ABBA pin (`service.test.ts:313`) stays green: the sweep still never takes the token lock.
  - `service.test.ts:631` ("released in the pre-set network check, it resumes on a fresh id") awaits the successor add before releasing the predecessor's held read, which the row-id lock now makes wait. Reorder only its awaits: start the successor, assert it has not completed, release the read, then await both. Every assertion stays as written.
- Assumptions: Fact 8; I2.
- **Validation gate**: `bun run lint && bun run typecheck:all && bun run --cwd apps/extension test src/wallet/services/token/ src/wallet/services/network/ src/wallet/services/purge-rows.test.ts`. Pass: all exit 0; the race test fails on the base copy. Layers: lint, typecheck, unit.

### Arc 1 gate (after phase 4, before the Codex fix loop)

- `bun run lint && bun run typecheck:all && bun run test:all && bun run test:ci-gating`. Merge `origin/dev` first if it moved.
- Network e2e at retry 0, one `agent.sh` run per browser (never two at once in this worktree), every file below in that run: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent <files>`, then the same with `NULO_E2E_BROWSER=firefox`. Files (`tests/e2e/network/<name>.test.ts`), chosen by the RPC or service each drives:
  - ingress and connection: `cap-request-accounts`, `cap-request-basic`, `cap-request-partial`, `cap-request-reject`, `cap-request-repeat-noPopup`, `cap-request-rerequest`, `cap-window`, `connect-dapp`, `connect-deny`, `connect-locked-queue`, `connect-locked-queue-sw-restart`, `connect-one-window`, `connect-unserved-chain`, `connect-verify-mismatch`, `session-reconnect`, `cold-wake-discovery`, `err-scope-and-cap`, plus `verify-hold` once #347 is in `dev`;
  - address positions: `execute-scope-account`, `execute-scope-chain`, `register-token`, `authwit-consume-smoke`, `authwit-lifecycle`, `authwit-variants`, `contracts-getClassMetadata`, `contracts-getMetadata`, `data-addressBook`, `data-privateEvents`, `data-registerSender`, `sim-methods`, `sim-from-selfpay`, `multi-account-from`, `senders-advanced`, `meta-batch`, `batch-mixed`, `batch-partial-failure`, `tx-sendTx-default`, `tx-sendTx-feePayer`, `tx-sendTx-multicall`, `tx-sendTx-noFrom`, `tx-sendTx-reject`, `tx-sendTx-selfPay`, `tx-sendTx-sponsoredFpc`;
  - artifact-sized calls and sends: `contracts-register`, `selfpay-phase`, `fee-sponsor-funding`, `tx-transfer-row`;
  - network or profile deletion (the chain purge): `networks`, `profile-reimport-matrix`.
- Not in the local list, with the reason: `stale-anchor-recovery` needs `NULO_E2E_REORG=1` and a reorg-capable sandbox; `tx-sendTx-delegated-authwit` needs `NULO_E2E_STANDARD_CONTRACTS=1` and a network that publishes those contracts. Neither is provisioned by `agent.sh`.
- Smoke at retry 0 on both browsers, with phase 5's armed build: `tests/e2e/settings-crud.test.ts` (it deletes a network).
- Pass: vitest lists every named file with at least one test passed and none failed; a skip is accepted only where the file's own browser gate names it (`CHROME_ONLY` in `fixtures/browser/index.ts`, or `cap-window`'s Firefox media-emulation exclusion at `cap-window.test.ts:202-203`). `data-registerSender` admits either outcome of its call, so it proves no refusal: phase 2's unit rows do. A red reruns once only for a known flake (lessons § red on base); otherwise it is a finding.

### Phase 5: #336, both error arrays (arc 2)

- Change map: the eight files in `recon.md` § e2e error arrays; at each listed line add the missing array's `expect(...).toEqual([])` on the same `ctx`.
- Tests: the change is the test.
- Assumptions: Fact 9; I3.
- **Validation gate**:
  - `bun run lint && bun run typecheck:all` (the e2e type gate covers `tests/e2e`).
  - Smoke files (`own-window`, `rows`), three rounds per browser at retry 0. Chrome: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e tests/e2e/<file>.test.ts --retry=0`. Firefox: the same with `build:firefox` and `NULO_E2E_BROWSER=firefox`.
  - Network files (the other six), three rounds per browser through `agent.sh` at retry 0, as in the arc 1 gate (all six in one run per round and browser).
  - Pass: every run green, vitest naming each file's tests as passed. An entry in either array is a finding: fixed in this PR when the test causes it, filed as an issue when the wallet does; never filtered.

## Delivery

One PR per arc against `dev`, no stack (orchestrator's standing D-orch-1). Each PR opens only after its arc gate passes and its Codex fix loop converges; open it without labels, then add `e2e:extension-network` and/or `e2e:extension-smoke` only if the path filter skipped a suite the change needs.

| Arc | Phases | Branch | PR title (≤ 93 chars) | Closes | `/code-review` |
|---|---|---|---|---|---|
| arc 1 | 1–4 | `worktree-wallet-followups-6` | `fix(dapp): size-bound ingress, canonical addresses, typed method refusal; safe chain purge` | #345, #332, #331, #262 | off |
| arc 2 | 5 | `wallet-followups-6-e2e` (from `origin/dev`) | `test(e2e): assert both error arrays in the window-driving files` | #336 | off |

- Arc 2 may be built and opened in parallel with arc 1 by the same session; it shares no file with arc 1. It shares `connect-one-window.test.ts` with #347 (different hunks); merge `origin/dev` before its final gate.
- The plan's close-out lands as the final commits of the arc that merges last (the orchestrator orders merges); the other PR's body names it.
- PR bodies: what changed and why, the validation runs with outcomes, `Closes #n` per issue, ending with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Commits end with the trailer the orchestrator's common brief names.

## Post-implementation

Runs per arc, after its gate, before its PR.

1. **Codex audit** (`~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`): the arc's diff, this plan and its decision ledger, the arc map ("arc N of 2"), the adversarial ask (what an attacker targets, what we trust that we should not), and these two rules verbatim:
   - *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*
   - *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*
2. **Fix loop**: verify each finding against the tree, apply the accepted ones, commit, log the round in `lessons/phase-N.md`, resume the same Codex session (`resume-codex.sh`) with the fix diff. Stop when a round has no new material finding. Hard stop at three rounds: surface to the orchestrator.
3. **Delivery**: open the arc's PR (§ Delivery), then `gh pr checks <n> --watch`.
4. **Close-out** (final commits of the last-merging arc):
   - `## Outcome` directly after the front matter: date, status, what shipped with PR numbers, each dropped or rejected item with its disposition, `Open items:` (issue or advisory numbers, or `none`), and one line retiring the `/goal` and `/loop` seeds.
   - Lessons: `lessons.md` is at its 8 KiB budget; promote nothing unless a retirement pays for it.
   - Open items: the residual-risk issue (a confirmed session's queue has no count cap) and A2's issue, each deduped first (`gh issue list --state all --search "<words>"`) with five sections (What happens, Where, Impact, Possible fix, Record); A1, if it holds, as a private draft advisory, recorded in the plan only as "tracked privately: GHSA-…".
   - An issue this lane left out, or found not to hold, gets a comment with the reason and stays open.
   - Merge `origin/dev`, read what changed in `index.md` and `lessons.md` (no union merge), then `git mv implementations-plan/wallet-followups-6 implementations-plan/archive/wallet-followups-6` in its own commit, repair links one level deeper, move the index line to `archive/index.md`, delete `STATUS.md`.

   | Situation | Home |
   |---|---|
   | Work inside the implementation you are on | the active `plan.md` and the PR |
   | Actionable work that outlives the plan | a GitHub issue, with a domain label and a `Record` link to the archived plan |
   | Needs a product call, or waits on something outside the repo | an issue labelled `owner-decision` or `blocked:external` |
   | A suspected exploitable weakness | a private draft security advisory |
   | Rejected, superseded or already done | a disposition line in the Outcome block |
   | Knowledge that prevents a repeat | `implementations-plan/lessons.md` (8 KiB budget) |
   | A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` |
   | Accepted code work that blocks launch | the `v1.0.0` milestone |

5. **Report and wait**: merging is the orchestrator's call.
6. **Teardown after the merge**: once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/wallet-followups-6/plan.md` succeeds, run `agent-worktree done wallet-followups-6 --merged` (this session did not enter through `EnterWorktree`, so there is nothing to exit). On a refusal, relay its output and stop. A `/loop` session checks this on every firing; a `/goal` session arms one background wait after its report: `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/wallet-followups-6/plan.md; do sleep 300; done`.

## Audit verdicts

### Round 1

**Codex** (gpt-6.1-sol, high; fresh session): `reject (with blocking findings: incomplete address coverage, unproved purge ordering, bypassable message-size bound)`.

| # | Finding | Disposition |
|---|---|---|
| 1 | `registerContract`'s instance schema drops `address`, which the scope checker reads raw | Accepted: supplementary parse with `ContractInstanceWithAddressSchema` (Opus's form), test row |
| 2 | Bounding `ciphertext` alone lets extra `content` keys through | Accepted: strict `{iv, ciphertext}`, test row |
| 3 | Reader table misses four paths and a both-branches intent | Accepted: rows added (with Opus's `from` row) |
| 4 | e2e list built from an `rg` that matches nothing; tests must actually run | Accepted: explicit list by behaviour; pass criterion names executed tests |
| 5 | Red/green recipe could erase the implementation | Accepted: copy aside, never `git checkout --` |
| 6 | In-order `storage.local` is no documented contract | Accepted: D-262 (b), the row-id lock |
| 7 | Skip-unresolved is too broad; capsules are packed | Accepted in part: D-331c (descend into absent, stop at packed strings), capsule control |
| 8 | Keep upper-case `0x` hex unless the owner narrows it | Rejected: D-331b (exact spelling; a wallet-protocol compatibility call, not a screen, so the panel decides) |
| 9 | Qualify the size and UI claims | Accepted: budget stated as policy, code units, "no extension screen changes" |

**Opus 5.5 lens** (Plan agent): `conditional approve (with conditions: rebuild the #262 test so it fails on base; close the registerContract[0].address gap and complete the #331 reader table; correct the #345 hang claim, refuse extra content keys and add a measured success control; build the arc 1 e2e list from behaviour, run from the repo root)`.

| # | Finding | Disposition |
|---|---|---|
| 1 | The planned #262 test cannot fail on base: the parked remove is tracked and writers drain it | Accepted: the race test models a restore already inside the token lock (I2) |
| 2 | `registerContract[0].address` outside the walk | Accepted (same as Codex 1) |
| 3 | Reader table incomplete; the characterization row at `:378` changes | Accepted |
| 4 | A dropped call does not time out; add a measured success control; strict content; non-string ciphertext row | Accepted: Fact 2 corrected, compatibility pin, rows |
| 5 | Residual risk understated | Accepted: § Residual risk, close-out issue, A1 |
| 6 | e2e list by behaviour; run from the repo root | Accepted |
| 7 | Importing `describeWireMethod` closes an import cycle | Accepted: inline placeholder |
| 8 | #347 overlap is clean; keep imports off lines 16-19 | Accepted: phase 1 note |
| D-262 | Same-turn re-read is sound and smallest | Rejected for (b): see D-262 |
| D-331b | Exact spelling | Accepted |

### Final pass

**Codex** (gpt-6.1-sol, high; fresh session with the consolidated plan and decision ledger): `approve`.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | Medium | `wireInstance` lacks `currentContractClassId`, so the supplementary parse would refuse the existing controls; qualify that a bare preimage is now refused at ingress | Accepted: phase 2 change map and row; § #331 note |
| 2 | Medium | Row-id lock is deadlock-free, but `service.test.ts:631` would wait on it; release the lock before compensation; race test sequencing | Accepted: § #262 held region, phase 4 test notes (awaits reordered, assertions unchanged) |
| 3 | Medium | `stale-anchor-recovery` and `tx-sendTx-delegated-authwit` need provisioning the local run lacks; `cap-window`'s Firefox exclusion; add `tx-transfer-row` | Accepted: arc 1 gate list |
| 4 | Low | Walk and exact spelling sound for the installed schemas; add a nested-address pair for simulation overrides | Accepted: phase 2 row |
| 5 | Medium | Keep the full artifact scan; no fallback to today's largest | Accepted: phase 3 (3.4 s measured) |
| 6 | Low | Keep residual risks explicit | Kept: § Residual risk, close-out issue, A1 |

D-262 confirmed by the final pass: the row-id lock is "the smallest reliable exclusion here; Opus's same-turn read/delete still depends on storage ordering absent from `MinimalStorageArea`".

## Seeds

Not run by this planner (orchestrator-owned). Recommended: `/goal`.

```
/goal All phases marked ✓ in implementations-plan/wallet-followups-6/plan.md, each backed by its validation gate reported passing in the transcript; LESSONS_FILE=implementations-plan/wallet-followups-6/lessons/phase-N.md printed per phase; code_review is off and /code-review was NOT run; the Codex fix loop converged for arc 1 and arc 2, each evidenced by a resumed Codex pass reporting no new material findings, quoted; two PRs against dev exist, opened only after their loops converged (gh pr view output in the transcript); the close-out archived the plan in the last-merging arc (git show --stat of the archive-move commit); bun run test:all and bun run lint both exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/wallet-followups-6 forward. Never idle. Each firing: read plan.md and lessons/ (authoritative); if implementations-plan/wallet-followups-6 is gone and `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/wallet-followups-6/plan.md` succeeds, run `agent-worktree done wallet-followups-6 --merged`, report, clear this loop and stop; if the PRs are open, babysit CI only. Otherwise take the next pending phase, run the fast gates after each edit, and mark a phase ✓ only when its gate passes. At an arc boundary run the Codex fix loop (gpt-6.1-sol, high, the plan's two rules) before the PR. Stuck: consult Codex and log it. Never merge, never push to main, never expand scope.
```
