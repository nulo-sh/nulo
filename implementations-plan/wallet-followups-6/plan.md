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
issues: "#345, #332, #331 (arc 1); #336 (arc 2); #262 known limit, no arc"
---

# wallet-followups-6

Findings filed by earlier lanes. Three sit at the dApp ingress: an unbounded message size (#345), a method name that is not a string (#332), an address in a non-canonical spelling (#331). One sits in the e2e suite: eight window-driving files check one of the two error arrays (#336). One, the chain purge deleting a reused token id (#262), has no reachable trigger and is a known limit. No extension screen changes.

## Scope

| Issue | Arc | What closes it |
|---|---|---|
| #332 | arc 1, phase 1 | A non-string method name is refused as unsupported; an unsupported method logs at `debug`. |
| #331 | arc 1, phase 2 | The parse refuses an address whose wire form is not the exact string the parse writes for it. |
| #345 | arc 1, phase 3 | The envelope check bounds a secure message's `content` before the decrypt. |
| #336 | arc 2, phase 4 | The eight files assert both error arrays at every assertion point. |
| #262 | no arc | Known limit (D-262): no person or trust-boundary input produces it. |

**No arc, with the reason** (named by the lane brief): #322 (a recorded flake, `e2e-followups-5`); #279 (owner page 5, P5-07); #186 (after #279); #277 (page 7, P7-09); #157 (`account-session-life`); #218 (`send-queue-activity`, page 9); #140 and #138 (`incoming-transfers`); #215 (`forms-and-contacts`, page 11); #244 (its trigger is not met); #172 (stop rule); #118 and #188 (`fees-and-sponsors`); #24, #21, #204; every `owner-decision` and `blocked:external` issue. #329 (upper-case hex at the popup's token add, `lane:tokens-and-balances`) stays out: phase 2 touches only the dApp path.

## Assumptions

### Facts

1. `validateContentScriptMessage` types `content` as `z.unknown().optional()` with no length (`apps/extension/src/wallet/services/wallet-sdk/content-script-validator.ts:51-59`); `invalid` is dropped with a debug line by `admitContentMessage` (`background.ts:412-416`) and the pre-boot relay (`content-message-relay.ts:92`); `admitContentMessage` forwards the original message (`background.ts:418`).
2. A secure message's `content` is `{iv, ciphertext}`, both base64; the call's `messageId` is inside the ciphertext (`@aztec-labs/wallet-sdk` `src/extension/provider/extension_wallet.ts:242-252`). `ExtensionWallet` has no per-call timeout and the wallet's PONGs keep the page's liveness check satisfied (`:141, 287-296`): an unanswered call stays pending until the page reloads.
3. The largest legitimate call is `registerContract` with the noir-contracts `Token` artifact: 6,116,730 plaintext bytes, 8,155,664 ciphertext characters, over 44 bundled artifacts (`recon.md` § Measured wire sizes); the playground sends artifacts through the wallet channel (`apps/playground/src/sections/phase.ts:176`).
4. `assertKnownMethod` passes its argument to `Object.hasOwn(METHOD_REGISTRY, …)` with no `typeof` check (`packages/wallet-bridge/src/method-descriptors.ts:338-342`): `{toString: "x"}` throws a `TypeError`; `42` and `null` throw inside `UnsupportedMethodError.forMethod` (`.length`, `packages/extension-messaging/src/errors.ts:271`); `["sendTx"]` passes as `"sendTx"`. `isExpectedRefusal` lacks `UnsupportedMethodError` (`background.ts:1333-1341`).
5. `assertWalletSchemaArgs` is pass/fail and discards the parsed value by design, so later layers read the exact wire args (`packages/wallet-bridge/src/wallet-schema-args.ts:31-52`); it runs before every scope check, handler and window (`dispatcher.ts:233-235`).
6. `schemas.AztecAddress` admits hex (either case, optional `0x`), base64 of 32 bytes and `{type: "Buffer", data}` (`stdlib/src/aztec-address/index.ts:194-201`). The SDK writes `AztecAddress.toString()`, lower-case with `0x` (`:186-191`), and turns any Buffer-shaped object into base64 (`foundation/dest/json-rpc/convert.js:14-29`).
7. `registerContract`'s instance is parsed with `ContractInstancePreimageSchema`, which has no `address` (`stdlib/dest/contract/interfaces/contract_instance.js:7-15`), so the parse drops the field `checkRegisterContract` reads raw (`method-scope-checkers.ts:76`); the executor parses `ContractInstanceWithAddressSchema` (`apps/extension/src/wallet/services/execution/service.ts:1027`).
8. The eight #336 files exist and each asserts one array (`recon.md` § e2e error arrays); `connect-dapp.test.ts:25-26` is the both-arrays pattern.
9. Draft PR #347 touches `background.ts` (`onWalletMessage`, `handleWalletMessage`'s signature, an import hunk at `:83-86`), `background.refusal-log.test.ts` (lines 16-19, its `refuse` helper) and `connect-one-window.test.ts` (imports, one helper); not `isExpectedRefusal`, the validator, `wallet-schema-args.ts`, the dispatcher or the token service.

### Inferences

- I1. No wallet-sdk client sends an address but as `AztecAddress.toString()`: the typed API takes `AztecAddress` objects, whose `toJSON` writes that form. A hand-built client sending another spelling is refused after phase 2.
- I2. One copy of `@aztec-labs/stdlib` is installed, so `instanceof AztecAddress` holds between the schema's output and `wallet-bridge`'s import; phase 2's refused rows fail if a bump splits it.

### Asks (working assumption in brackets; none blocks an arc)

- A1. Do envelope types other than `secure-message` need a size bound? [Out of #345, which concerns a connected app's calls; carried in the orchestrator report, never in a committed file or public issue.]
- A2. The ~18 other files that assert one array (`recon.md` § e2e error arrays)? [Scope left out: one disposition line in the Outcome, no issue (D-orch-3).]

## Outcome & Quality Bar

- **Excellent** (for a person running Nulo next to an app they connected, and the maintainer reading a log export or a red e2e run): a connected page cannot make the wallet decrypt or queue a message over the budget, and every bundled artifact's call stays under half of it (pinned by a test); every address a check, handler, window or signer reads has one spelling; a window-driving e2e file goes red on a console error or an uncaught throw in its window.
- **Good enough**: no new configuration, no new mechanism, no screen change.

## Architecture & Implementation

**#332 (phase 1).** `assertKnownMethod(methodName: unknown)`: a non-string throws ``UnsupportedMethodError.forMethod(`[${typeof methodName}]`)``, `describeWireMethod`'s placeholder written inline (importing it closes a cycle: `external-id.ts:1` imports `method-descriptors.ts`); the `asserts methodName is MethodName` signature stays; the one caller (`dispatcher.ts:265`) is unchanged, batch legs included. `isExpectedRefusal` gains `UnsupportedMethodError`, joining the existing `@nulo/extension-messaging/errors` import outside #347's hunk.

**#331 (phase 2).** The rule: every address the parse produces sits on the wire as exactly `parsed.toString()`; anything else throws inside `assertWalletSchemaArgs`, whose `catch` answers `InvalidWalletArgumentsError.forMethod(method)`. The parse stays pass/fail; no reader changes. After each parse, walk parsed and wire values side by side, iteratively like `assertNoOwnToString`:
- parsed node an `AztecAddress` → apply the rule to the wire node;
- parsed node an object or array (class instances such as `FunctionCall` included), wire node an object, array or absent → descend into each own key of the parsed node, paired with the wire node's same key, so an address made from nothing is refused;
- parsed node an object, wire node a string → stop (a packed encoding such as a `Capsule` or `Fr`); never descend into a `Buffer`, typed array, `Map` or `Set`.

Two schemas strip a key a reader uses; each gets a supplementary parse the walk covers: `createAuthWit`'s intent through the existing `parseCallIntentKeys`, and `registerContract`'s instance through `ContractInstanceWithAddressSchema` (new; a bare preimage, which the executor already refuses, is now refused at ingress). Out of the walk: the artifact argument and `requestCapabilities`' manifest (its own parse, `sameFieldAddress`).

**#345 (phase 3).** `content-script-validator.ts` exports `MAX_SECURE_MESSAGE_CIPHERTEXT_CHARS = 16 * 1024 * 1024` and refuses a `secure-message` whose `content` is not a strict `{iv, ciphertext}`: `iv` a string of at most 32 characters, `ciphertext` a string within the budget. Strict, because upstream forwards the whole `content` into the per-session decrypt queue (`background.ts:618-625`), so an extra key would carry data past a bound on `ciphertext`. The unit is `.length` of the base64 string (equal to its bytes, nothing decoded). The refusal is the validator's existing `invalid`, dropped before the SDK sees it: no reply can be addressed before the decrypt (Fact 2). Other envelope types keep `content: unknown` (A1). No hunk in `background.ts`.

**#336 (phase 4).** At every existing assertion of one array in the eight files, add the other on the same `ctx`, in the `connect-dapp.test.ts` order. No helper.

## Decision ledger

- **D-345a, where to refuse.** (a) Validator drop before the decrypt, no reply; (b) decrypt, measure, answer `InvalidWalletArgumentsError` (decrypts the payload first; sits in #347's hunk); (c) end the session (every other call of the session ends: a behaviour a person notices). **(a)**, both legs. The brief's "standard envelope before the decrypt" did not hold (Fact 2).
- **D-345b, the number.** 16 MiB of ciphertext characters, twice the largest measured call, under Chrome's 64 MiB message ceiling; 8 MiB leaves 3% headroom, 32 MiB lets four held calls pass half a gigabyte. Both legs. **D-345c**: strict `content`, raised by both.
- **D-331a, refuse or rewrite.** (a) Hand later layers the parse's output: reverses the "exact wire args" design, strips unknown keys, adds defaults the window and journal would show, re-serializes artifacts. (b) Rewrite at the issue's sites: misses twelve scope-checker reads. (c) Refuse at the parse any address not in the parse's spelling: one choke point, design kept. **(c)**, both legs.
- **D-331b, which spellings pass.** Codex: keep upper-case `0x` hex, as `field-address.ts` does. Opus: exact only. **Exact**: readers compare with `===` (`method-scope-checkers.ts:270`, `findToken`, `isTokenRegistered`), so a second spelling gets a second answer, the class #331 names; no SDK client writes one (I1); `field-address.ts` serves manifest grant lists, a separate input. The row `dapp-grant.characterization.test.ts:378` moves from a scope refusal to `INVALID`.
- **D-331c, keys the wire lacks.** Skipping every unresolved path is a hole for stripped keys (both legs): descend into absent, stop only at a packed string, supplementary parse per stripping schema.
- **D-262, the chain purge.** Round 1 chose a row-id `Lock` (Codex) over a same-turn re-read (Opus). Under the owner's proportion rule both legs then found no reachable trigger and withdrew: **build nothing**. A person's remove-then-add cannot enter between two sweep deletes, since each admission drains `pendingWrites` and the sweep registers its next tracked delete first (`token/service.ts:530-551`, `purge-rows.ts:22-24`); a backup import remaps every row to the new, inactive profile and `deleteNetwork` purges only the active profile's chain (`full-backup-helpers.ts:439`, `network/service.ts:545-547`). Round 1's restore trigger (I2 then) did not hold.
- **D-336**: no shared helper. **D-grouping**: two arcs, one PR each against `dev`; arc 2 touches no arc 1 file.
- **Orchestrator (2026-10-13).** D-orch-1: no stack, one PR per arc against `dev`. D-orch-2: both arcs approved as planned (D-345a, D-345b, D-331b, D-262 included); arc 2 runs after arc 1's PR exists, on its own branch. D-orch-3: § Proportion v2 governs the close-out: #262 labelled `known-limit`, a `## Known limit` section appended, closed as not planned, the Outcome naming `Known limits: #262`; A2 is scope left out, one Outcome disposition line, no issue. D-orch-4: A1 a private draft advisory filed at close-out. D-orch-5: residual (1) an issue after a twin search. D-orch-6: if #347 is in `dev` before arc 1's final gate, merge it and add `verify-hold` to the e2e list; otherwise open the PR and wait for #347. D-orch-7: commit trailers name the model that ran.
- **Arc 1 deviations (2026-10-13).** D-a1-1: the artifact pin measured 5.3 s on a loaded host, past vitest's 5 s default; it carries a declared 60 s budget. D-a1-2: the arc 1 e2e list runs with `NULO_E2E_PROVERLESS=1` (`tx-sendTx-noFrom` requires it; most CI network shards run so; the arc changes ingress, not proving). D-345d (review): a secure message's own keys are read from the raw value, since zod skips an own `__proto__` key even under `strictObject`. D-345e (review): a `batch` registering several large artifacts in one message can pass 16 MiB and is dropped; plausible, not demonstrated, and moving D-345b is not a review change, so a known limit (filed at close-out).
- **Known limits:** #262: the sweep deletes a row of another chain only if, between its snapshot read and its first delete (`token/service.ts:249-252`), another writer removes the purged chain's highest-id token and an add on another chain commits under that id (a stale window's removal and a queued add inside one storage read), or a service-level multi-row restore overlaps a chain deletion with both timing windows hit.

## Security & Adversarial Considerations

- **Threat model.** A page the person connected controls every byte of its content-script messages and every decrypted argument: it wants to exhaust the worker's memory, make a check read a different value than the signer, or make a refusal look like a bug.
- **Validation.** Phase 3 bounds the one field the wallet keeps; phase 2 makes the parse the one place an address's spelling is settled and checks the `registerContract` address the parse used to drop; phase 1 closes a `TypeError` path past the typed refusal. Every new refusal refuses; nothing new admits.
- **Logs.** Phase 1 moves a refusal a page repeats at will from `error` to `debug`; the placeholder is fixed text, never the wire value. No dependency, crypto or permission change.
- **Residual.** (1) A connected page can still post many in-budget messages: `MAX_HELD_PER_SESSION` (#347) caps the count only while a check is unanswered; trigger: a connected page posting in a loop. Close-out files it as an issue after a twin search. (2) A1.

## UI impact

None (owner boundary held). #345 drops an oversized message (that page's call stays pending); #331 and #332 change what an app receives or a log level; #336 is tests. `OWNER-ASKS.md` says none.

## Phases

Gates run from the worktree root; green is exit 0 with vitest naming the new tests as passed. **Red/green**: copy the implemented file to `~/.cache/nulo-backlog/wallet-followups-6/impl-<name>`, write `git show 36c43155:<path>` over it, see the new tests fail, copy the implementation back, see them pass; never `git checkout --` an implemented file.

**Phase 1, #332** ✓ (gate green; new cases red on base). Change: `method-descriptors.ts` (`assertKnownMethod`), `background.ts` (`isExpectedRefusal`). Tests: `packages/wallet-bridge/src/method-name.test.ts`: `{toString: "x"}`, `42`, `null`, `["sendTx"]` each throw `UnsupportedMethodError`, string cases the control; `background.refusal-log.test.ts`: an unknown string method and `refuse(42 as never, …)` each log at `debug`, answer `-32601`, run nothing, the schema refusal the control (lines 16-19 and `refuse` untouched, #347). Facts 4, 9. **Gate**: `bun run lint && bun run typecheck:all && bun run --cwd packages/wallet-bridge test && bun run --cwd apps/extension test src/wallet/services/wallet-sdk/background.refusal-log.test.ts`; new cases red on base.

**Phase 2, #331** ✓ (gate green; 27 refused rows red on base). Change: `packages/wallet-bridge/src/wallet-schema-args.ts` (the walk, the `registerContract` supplementary parse); `dapp-grant.characterization.test.ts:378` expects `INVALID`; `testing/wire.ts:39` `wireInstance` gains `currentContractClassId` so the existing controls (`wallet-schema-args.test.ts:56,152`) pass the new parse. Tests (`wallet-schema-args.test.ts`, table-driven, `testing/wire.ts` fixtures): one Buffer-shaped row per reader path (`isTokenRegistered[0]`; `registerToken[0]`, `[1]`; `createAuthWit[0]`, `[1].consumer`, `[1].caller`, `[1].call.to`; `grantPublicAuthwit[0]`, `[1].caller`, `[1].contract`; `sendTx[0].calls[0].to`, `sendTx[1].from`; `executeUtility[0].to`; `getContractMetadata[0]`; `getPrivateEvents[1].contractAddress`; `registerSender[0]`; `registerContract[0].address`); base64, un-prefixed hex and upper-case hex at `registerToken[1]`, a `simulateTx` override naming a Buffer-shaped contract, a bare-preimage `registerContract`, and an intent carrying both union branches with a Buffer-shaped `caller`, each refused; controls: every row's canonical twin, a `sendTx` with a populated capsule, a `registerContract` with `wireArtifact()`. `dispatcher.test.ts`: `*`-scope `grantPublicAuthwit` with a Buffer-shaped `contract` rejects with `InvalidWalletArgumentsError` and never calls `dappInteractionService.execute` (no window); the canonical twin reaches it. Facts 5-7; I1, I2. **Gate**: `bun run lint && bun run typecheck:all && bun run --cwd packages/wallet-bridge test && bun run --cwd packages/wallet-sdk-schema-patch test`; refused rows red on base.

**Phase 3, #345** ✓ (gate green; 7 refused cases red on base). Change: `content-script-validator.ts`; fixtures building a `secure-message` meant valid get a well-formed `content` (`content-message-relay.test.ts:93`, `background.transport.test.ts:41`; re-check `rg -n "secure-message" apps/extension/src apps/extension/tests`). Tests: `content-script-validator.test.ts`: a ciphertext at the budget is `valid`, one over `invalid`; an `iv` over 32 characters, a non-string `ciphertext`, a missing or non-object `content`, and an extra key are each `invalid`; existing envelopes of every type validate (control). Compatibility pin (same file): every artifact under `@aztec-labs/noir-contracts.js/artifacts` and `@aztec-foundation/aztec-standards/target`, located with `@nulo/resolve-asset`, loaded with `loadContractArtifact`, wrapped as the SDK wraps `registerContract`, serialized with `jsonStringify`, encrypted with the SDK's `encrypt`: its `content` validates, and twice the largest is within the budget (full scan every run, ~3.4 s, since a bump can change the largest). `background.transport.test.ts`: an over-budget `secure-message` never reaches the SDK listener. Facts 1-3. **Gate**: `bun run lint && bun run typecheck:all && bun run --cwd apps/extension test src/wallet/services/wallet-sdk/`; over-budget and extra-key cases red on base.

**Arc 1 gate** (before the Codex fix loop; merge `origin/dev` first if it moved): `bun run lint && bun run typecheck:all && bun run test:all && bun run test:ci-gating`, then one `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent <files>` run per browser (Chrome, then `NULO_E2E_BROWSER=firefox`; never two at once) over `tests/e2e/network/<name>.test.ts` for: `cap-request-accounts`, `cap-request-basic`, `cap-request-partial`, `cap-request-reject`, `cap-request-repeat-noPopup`, `cap-request-rerequest`, `cap-window`, `connect-dapp`, `connect-deny`, `connect-locked-queue`, `connect-locked-queue-sw-restart`, `connect-one-window`, `connect-unserved-chain`, `connect-verify-mismatch`, `session-reconnect`, `cold-wake-discovery`, `err-scope-and-cap`, `execute-scope-account`, `execute-scope-chain`, `register-token`, `authwit-consume-smoke`, `authwit-lifecycle`, `authwit-variants`, `contracts-getClassMetadata`, `contracts-getMetadata`, `contracts-register`, `data-addressBook`, `data-privateEvents`, `data-registerSender`, `sim-methods`, `sim-from-selfpay`, `multi-account-from`, `senders-advanced`, `meta-batch`, `batch-mixed`, `batch-partial-failure`, `tx-sendTx-default`, `tx-sendTx-feePayer`, `tx-sendTx-multicall`, `tx-sendTx-noFrom`, `tx-sendTx-reject`, `tx-sendTx-selfPay`, `tx-sendTx-sponsoredFpc`, `tx-transfer-row`, `selfpay-phase`, `fee-sponsor-funding`, plus `verify-hold` once #347 is in `dev`. Left out: `stale-anchor-recovery` (needs `NULO_E2E_REORG=1`) and `tx-sendTx-delegated-authwit` (needs `NULO_E2E_STANDARD_CONTRACTS=1`), which `agent.sh` does not provision; no smoke file drives the dApp channel. Pass: every file has a test passed and none failed; a skip only where the file's own browser gate names it (`CHROME_ONLY`, `cap-window.test.ts:202-203`); `data-registerSender` admits either outcome, so phase 2's rows carry the proof. One rerun for a known flake; otherwise a finding.

**Phase 4, #336 (arc 2).** Change: the eight files at the lines in `recon.md` § e2e error arrays. Gate: `bun run lint && bun run typecheck:all`; `own-window` and `rows`, three rounds per browser at retry 0 with the armed build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e tests/e2e/<file>.test.ts --retry=0`; Firefox: `build:firefox`, `NULO_E2E_BROWSER=firefox`); the six network files, three rounds per browser through `agent.sh` at retry 0, all six per run. Pass: every run green. An entry in either array is a finding: fixed here when the test causes it, an issue when the wallet does; never filtered. Fact 8.

## Delivery

| Arc | Phases | Branch | PR title | Closes |
|---|---|---|---|---|
| arc 1 | 1-3 | `worktree-wallet-followups-6` | `fix(dapp): size-bound ingress, canonical addresses, typed method refusal` | #345, #332, #331 |
| arc 2 | 4 | `wallet-followups-6-e2e` (from `origin/dev`) | `test(e2e): assert both error arrays in the window-driving files` | #336 |

- One PR per arc against `dev`, no stack (D-orch-1), opened after its gate and its Codex fix loop, without labels; add `e2e:extension-network`/`e2e:extension-smoke` only if the path filter skipped a needed suite. `/code-review` off.
- Arc 2 may run in parallel with arc 1; it shares `connect-one-window.test.ts` with #347 (other hunks): merge `origin/dev` before its final gate.
- PR bodies: what and why, the validation runs with outcomes, `Closes #n`, the e2e file count before and after (unchanged: neither arc adds a file), ending with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Commits end with the common brief's trailer. The close-out rides the arc that merges last.

## Post-implementation (per arc, after its gate, before its PR)

1. **Codex audit** (`~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`): the arc's diff, this plan, "arc N of 2", the adversarial ask, and verbatim: *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."* and *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*
2. **Fix loop**: accept a finding only with a reachable trigger written; a fix needing a mechanism stops for the orchestrator. Commit, log the round in `lessons/phase-N.md`, resume the session with the fix diff; stop on a round with no new material finding; hard stop at three rounds. Then the PR and `gh pr checks <n> --watch`; merging is the orchestrator's.
3. **Close-out** (last-merging arc), per `implementations-plan/README.md` and CLAUDE.md § Implementation plans: Outcome block (`Known limits: #262`, an A2 disposition line), residual (1) as an issue after a twin search, A1 as a private draft advisory; #262 closed as a known limit (D-orch-3); promote nothing to `lessons.md` (at budget); archive move in its own commit; delete `STATUS.md`.
4. **Teardown** once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/wallet-followups-6/plan.md` succeeds: `agent-worktree done wallet-followups-6 --merged`; relay a refusal.

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high): `reject (with blocking findings: incomplete address coverage, unproved purge ordering, bypassable message-size bound)`. Accepted: `registerContract`'s dropped `address` (supplementary parse); strict `content`; four missing reader paths and a both-branches intent; an explicit e2e list with executed-test pass criteria; a red/green recipe that cannot erase work; skip-unresolved too broad, capsules packed (D-331c); qualified size and UI claims. Then accepted, later withdrawn under the proportion rule: in-order `storage.local` undocumented, so a row-id lock. Rejected: keep upper-case hex (D-331b).

**Round 1, Opus 5.5 lens**: `conditional approve (with conditions: rebuild the #262 test so it fails on base; close the registerContract[0].address gap and complete the #331 reader table; correct the #345 hang claim, refuse extra content keys and add a measured success control; build the arc 1 e2e list from behaviour, run from the repo root)`. Accepted: all but the #262 items, which D-262 moots; the inline placeholder (import cycle); #347 overlap notes.

**Final pass, Codex** (fresh session): `approve`. Accepted: `wireInstance` needs `currentContractClassId`; e2e provisioning exclusions, `cap-window`'s Firefox exclusion, `tx-transfer-row`; a simulation-overrides row; keep the full artifact scan; explicit residuals. Moot with D-262: the lock's held region and the `service.test.ts:631` reorder.

**Round 2, proportion rule** (both legs, #262 only): Codex `known limit: build nothing` (restore needs both timing overlaps; ordinary import cannot activate the profile during the batch); Opus `known limit: build nothing` (remove-then-add cannot interleave past the drain; the restore trigger does not exist on base). D-262 rewritten; phase 4 (purge) dropped.

**Arc 1, Codex round 1** (session 01a13534): `reject`. Accepted and fixed: an own `__proto__` key passed the strict `content` check (high, demonstrated; D-345d); two inexact comments. **Opus 5.5 lens**: `approve with fixes`. Accepted: the same `__proto__` finding; the batch case as a known limit (D-345e); two comment nits. Rejected: trimming the position table and the transport row, both named by phase 2 and 3. **Round 2**: `approve`; its optional nit (a duplicated file-placement clause) applied. Converged (log: `lessons/phase-1-3.md`).

## Seeds

Not run by this planner (orchestrator-owned). Recommended: `/goal`.

```
/goal All phases marked ✓ in implementations-plan/wallet-followups-6/plan.md, each backed by its validation gate reported passing in the transcript; LESSONS_FILE=implementations-plan/wallet-followups-6/lessons/phase-N.md printed per phase; code_review is off and /code-review was NOT run; the Codex fix loop converged for arc 1 and arc 2, each evidenced by a resumed Codex pass reporting no new material findings, quoted; two PRs against dev exist, opened only after their loops converged (gh pr view output in the transcript); the close-out archived the plan in the last-merging arc (git show --stat of the archive-move commit); bun run test:all and bun run lint both exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/wallet-followups-6 forward. Never idle. Each firing: read plan.md and lessons/ (authoritative); if implementations-plan/wallet-followups-6 is gone and `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/wallet-followups-6/plan.md` succeeds, run `agent-worktree done wallet-followups-6 --merged`, report, clear this loop and stop; if the PRs are open, babysit CI only. Otherwise take the next pending phase, run the fast gates after each edit, and mark a phase ✓ only when its gate passes. At an arc boundary run the Codex fix loop (gpt-6.1-sol, high, the plan's two rules) before the PR. Stuck: consult Codex and log it. Never merge, never push to main, never expand scope.
```
