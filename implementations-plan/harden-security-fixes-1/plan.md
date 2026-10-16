---
plan: harden-security-fixes-1
tier: mid
status: approved by the orchestrator 2026-10-16 (three PRs; OA-1 = A); in progress
issues: "none open; the sources are tracked privately and the PR carries no Closes for them. Files one closed known-limit issue (C9) at close-out."
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet); Codex audit (gpt-6.1-sol, high) with resumes; one Opus Plan leg; a fresh final Codex pass
base: origin/dev at c5e9c8e8
trunk: dev
post_implementation_hardening: not scheduled
---

# harden-security-fixes-1: bounds at trust boundaries, dApp ingress, dependency logs, publish summary

Three PRs against `dev`, a phase per change (C1 to C9): A carries phases 1-3, B phases 4-6, C phases 7-9 with this plan and its close-out. Each change states the invariant it adds and nothing else. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Scope

| Change | Invariant the code protects after it | Phase |
|---|---|---|
| C1 bounded response bodies | the worker parses no node, price or token-list reply larger than that endpoint's byte budget | 1 |
| C2 backup restore bounds | a backup's token and balance slices have a row cap; a refused balance row costs no storage read; one restore lists the balance keys at most once | 2 |
| C3 discovery envelope shape | a `discovery-request` passes the wallet's ingress only in the SDK's shape, every key known and every string bounded | 3 |
| C4 key exchange bound to its discovery | a key exchange is admitted only from the discovery's tab, from a document whose own origin is the origin the session is credited to; a document receives an approval only for a request it sent | 4 |
| C5 Activity title from the declared name | a dApp call's title comes from its `name`, the key the wallet checks, cleaned by `sanitizeWireString(…, 64)` | 5 |
| C6 the wallet's copy of a contract class first | the wallet resolves a class it ships from its compiled-in copy; a registration writes the wallet's copy (compiled-in, then stored) whenever one exists, so a provided artifact serves only a class the wallet has no copy of | 6 |
| C7 dependency logs | Aztec dependency loggers emit warn and above only, and no 32-byte hex value from the PXE host frame reaches the log | 7 |
| C8 publish summary base | the summary covers every signing-path change since the parent of the commit that first published the current envelope bytes; the envelope is byte-equal to the signer's fixed order | 8 |
| C9 passkey RP trust note | SECURITY.md names the browser trust the passkey derivation rests on; a closed `known-limit` issue records it | 9 |

## Outcome & Quality Bar

**For whom:** a person using Nulo with dApps, backups and the default endpoints; the owner approving a token-list publish. **Excellent:** (1) every conforming dApp, backup, node and price reply behaves as today, proven by the e2e suites that drive them; (2) each refusal is one deterministic check at its boundary, with a test per refused class beside a success control; (3) no screen changes for conforming input. **Good enough:** budgets are generous constants with their reason in one comment, not tuned per method.

## Architecture & Implementation

- **C1.** New `readBodyCapped(response, maxBytes): Promise<string>` and `ResponseTooLargeError` in `packages/wallet-core/src/utils/read-capped.ts`, exported from the `utils` barrel. It refuses a `content-length` above the budget and cancels the body, else counts streamed bytes and cancels past the budget; a cancel that rejects keeps the oversize refusal. It decodes UTF-8 as `resp.json()` does. Callers keep their own timer, so the abort stays live through the read.
  - `fetch.ts` `fetchOnce`: `JSON.parse(await readBodyCapped(resp, MAX_NODE_RESPONSE_BYTES))` replaces `resp.json()`. `ResponseTooLargeError` passes the existing parse catch and becomes a `NoRetryError`, on an ok or a failed status. `MAX_NODE_RESPONSE_BYTES = 32 MiB` is a budget, not a protocol maximum: a batch of up to 100 calls shares it, and the largest single replies are realistically under 1 MB (recon § Sizing).
  - `price/service.ts`: `MAX_PRICE_RESPONSE_BYTES = 16 KiB` (a real reply is about 300 bytes); oversize takes the existing failure path, so stored prices stay.
  - `token-list/service.ts`: its private `readCapped` goes; `download()` maps `ResponseTooLargeError` to `DownloadError("oversize")`.
- **C2.** The `root` slice descriptor gains an optional `maxRows`: `token` 1024, `token-balance` 16384 (D3, OA-1). `normalizeRootSlice` refuses a longer slice before reading its rows, through the existing `{ ok: false, reason }`. `TokenBalanceService.restore` checks the owned token and the pair before it allocates. Its first accepted row lists the balance keys, once, into `numericIdBatch(keys)` (new, `id-allocators.ts`). Each `next(fenced)` returns what `nextNumericId` would over the listed keys, every id the batch returned, and the live fence set; it reads no storage. `nextNumericId` delegates to the same rule. A row that fails to parse after allocation leaves its id unused; ids stay unique. The token restore keeps per-row allocation and liveness reads (its sweep fence needs them); the cap bounds it.
- **C3.** `content-script-validator.ts` splits `discovery-request` from the generic branch. An own-key check on the raw value runs at the content level (`type`, `requestId`, `appId`, `chainInfo`) and inside `chainInfo` (`chainId`, `version`), own `__proto__` included, as for `secure-message`. Then `z.object` with strings: `requestId` ≤ 128, `appId` ≤ 256, `chainId` and `version` ≤ 80, `type` the SDK's exported discovery constant. Every envelope's `sessionId` becomes a string ≤ 128. The envelope keys are built by the SDK's content script, not the page, so they keep today's check.
- **C4.** Background: `ContentWrapperDeps` gains `discoveryCredit(sessionId)`, which returns `{ origin, tabId }` from `handler.getPendingDiscovery`. In `admitContentMessage`, after the envelope check, a `key-exchange-request` whose discovery exists is dropped with a fixed debug line unless all hold:
  - `sender.tab?.id` equals the discovery's tab;
  - the credited origin is not `"unknown"`;
  - the sender document's own origin equals the credited origin: `sender.origin` when the browser sets it (an opaque `"null"` stays `"null"` and refuses), else the origin of `sender.url`; neither present refuses.

  Under `VITE_NULO_ALLOW_IFRAME_DAPPS`, a same-origin subframe still completes a key exchange and a cross-origin one does not; the flag's comment says so (D4). Content script: `content.ts` wraps its two transport callbacks with `src/content-script/approval-filter.ts`. The filter records the `requestId` of each `discovery-request` the document forwards and drops a `discovery-approved` for any other id. The approval is sent to every frame of the tab; the filter keeps it to the document that asked. Record: in the document's memory only, newest 32 ids; a repeated approval for a recorded id passes. Ids correlate, they do not authenticate: the background check is the boundary.
- **C5.** `utils/primary-method.ts` gains `wireTitle(s)` (`sanitizeWireString(s, 64)`, the approval window's bound for function names) and `pickPrimaryWireMethod(calls: unknown)`. The latter projects each call to `{ name }` when `name` is a string, runs `pickPrimaryMethod` (fee-skip rules unchanged) and returns `wireTitle` of the pick. `extractPrimaryMethodFromSendTx` and `dapp-send-executor.ts` `primaryMethodCalls` call it. `operation-planner.ts:246-250` keeps its `name ?? selector` projection and passes the pick through `wireTitle`. `methodOf` keeps `method ?? name` for the wallet's own `TxCall` and `Action` shapes.
- **C6.** `artifact-registry.ts`: `RESOLUTION_ORDER = ["known", "pxe-local"]`. `PxeService.registerContract` resolves the class inside its existing write callback, on the raw PXE it holds: `this.artifacts.resolve(classId, (id) => pxe.getContractArtifact(id))`. It never calls the public read wrapper, whose read would wait on the write already held. When a copy exists (compiled-in, then stored), that copy is the one registered; a provided artifact serves only a class with neither. The registry's PXE read fills the store's cache first. The execution service's two register paths and the account-state restore inherit it; their class-id checks on a provided artifact stay (D5). Upstream's store keeps the first artifact it caches per class, so a copy stored before this change can stay in the store; nothing the wallet shows reads it for a class the wallet ships, because resolution is compiled-in first. `registerContractClass` (`pxe/service.ts:427`) is the other write seam; no production path hands it a provided artifact (dApp class registration is refused, `method-scope-checkers.ts:376-380`).
- **C7.** `vite.shared.ts` exports `DEPENDENCY_LOG_LEVEL = "warn"`, which `vite.config.ts`'s `process.env` define uses. The PXE host frame logs through one wrapper in `offscreen/index.ts`: its capture hooks (console methods, unhandled rejection, error) and the logger it hands `createPxeOffscreen` both use it. The wrapper replaces every `0x` + 64-hex token in a line's strings, at any depth, before the line leaves the frame. `scrubHex32` lives beside `scrubUrls` in `wallet/logger/utils.ts`. The wrapper runs `trim` first and rewrites the strings of its copy, so `trim`'s projection, depth limit and redaction still hold and no object a caller holds changes (D6). Cost: diagnostics in that frame lose full ids too, such as a class-id mismatch's expected and computed values. The `logging-policy` skill gains one line on each part.
- **C8.** `check.ts` `envelopeFindings` compares the text with `canonical({ format, keyId, payload, signature })` of the parsed envelope, so another key order or an extra key is refused. `summary.ts` exports `signingChanges(root)`. Its base is the first commit that introduced the envelope blob HEAD holds (`git log --reverse --format=%H --find-object=<blob> -- <envelope>`, first line), diffed as `${base}^..HEAD`. A base with no parent, or no envelope, lists as a first publish: every commit touching the signing paths, with no count limit (today's 50 goes) (D7). SECURITY.md § Token list signing names that base.
- **C9.** One sentence appended to SECURITY.md's **Passkey RP ID** bullet: the derivation trusts the browser to let only this extension evaluate the credential's PRF for this RP id, and another extension the browser authorizes for it is a compromised browser, outside the threat model (known limit #N). The issue is filed at close-out.

## Phases

Fast gate `F`: `bun run lint && bun run typecheck:all && bun run test`. Pass: each exits 0. A phase is ✓ only when its gate passes; each logs to `lessons/phase-N.md`. Test names state the invariant.

E2E commands, from the repo root unless noted:
- Armed smoke build per browser: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<chrome|firefox>`.
- Smoke: `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/<f>.test.ts --retry=0`.
- Network: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<f>.test.ts --retry=0`; add `NULO_E2E_PROVERLESS=1` for a file marked `@requires-proverless`.
- Firefox: prefix `NULO_E2E_BROWSER=firefox`.
- A network run leaves its own bundle in `dist`: rebuild the armed build before the next smoke run. One `e2e:agent` at a time in this worktree. Start a run only while `load1 < 150`; wait, never skip. A gate passes only when every named test ran.

1. **C1.** Change: `packages/wallet-core/src/utils/{read-capped.ts,read-capped.test.ts,index.ts}`, `packages/aztec-runtime/src/utils/fetch.ts`, `fetch.pins.test.ts` (fakes become real `Response` objects), `price/service.ts` and its test, `token-list/service.ts`. Tests:
   - helper: a body at the budget reads; one byte over refuses and cancels the reader; an oversize `content-length` refuses and cancels before any read; a rejecting cancel still refuses as oversize; chunks count together;
   - node: an over-budget reply on an ok and on a failed status is a `NoRetryError`, and `fetch` runs once; a reply at the budget parses, and a 5xx is still retried (controls); the stalled-body abort pin holds;
   - price: an over-budget reply merges nothing and keeps stored prices; a normal reply merges (control);
   - token list: `service.composition.test.ts`'s oversize case stays green.

   Gate: `F`, then `bun run test:all`.
2. **C2.** Change: `backup/backup-migration-registry.ts` and its test, `token-balance/service.ts`, `balance-repository.ts`, `id-allocators.ts` and their tests. Tests:
   - each capped slice: at the cap normalizes; one over refuses with the reason; an uncapped slice of the same length normalizes (control);
   - balance restore: a batch whose rows all name an unowned token lists no keys and writes nothing; one valid row followed by repeats of its pair lists once and writes once; N valid rows restore with distinct ids after exactly one listing (control);
   - `numericIdBatch` matches successive `nextNumericId` calls over sane keys, non-canonical keys and a `MAX_SAFE_INTEGER` key, and skips fenced ids.

   UI impact: OA-1. Gate: `F`, then the armed smoke build, then smoke `backup-roundtrip`, `backup-migration`, `restore-outcome`.
3. **C3.** Change: `content-script-validator.ts` and its test, `content-message-relay.test.ts` and `background.transport.test.ts` fixtures. Tests: one refusal per class (an unknown content key, an unknown `chainInfo` key, an own `__proto__` key at each level, oversize `requestId`, `appId`, `chainId`, `version`, another content `type`, missing `content`, oversize `sessionId`). Controls: the message `ExtensionProvider.discoverWallets` posts, with 66-character fields, passes; the pre-boot relay drops an over-bound discovery and buffers a valid one. Gate: `F`.
4. **C4.** Change: `background.ts` (the wrapper and the flag's comment), `background.transport.test.ts` (its sender helper gains `origin` and `url`), `src/content-script/{content.ts,approval-filter.ts,approval-filter.test.ts}`. Tests through the real SDK key exchange:
   - refused, no session, no response: a key exchange from the discovery's tab whose document origin differs from the credited one; one from another tab of the same origin; one with neither `origin` nor `url`; one whose credited origin is `"unknown"`;
   - control: the discovery's tab and document origin establish the session;
   - under the flag: a same-origin subframe establishes; a cross-origin subframe is refused;
   - filter: an approval for a recorded id passes; another id drops; the record keeps the newest 32.

   Gate: `F`, then network `connect-dapp`, `connect-locked-queue`, `session-reconnect`, `session-tabNavigate`, `cold-wake-discovery` on Chrome, and the first four on Firefox.
5. **C5.** Change: `utils/primary-method.ts` and its test, `queued-journal.ts` and its test, `dapp-send-executor.ts`, `operation-planner.ts` and its test. Tests:
   - a call with `name` and another `method` titles by `name` at all three sites;
   - a name with control characters, or over 64 characters, is stored as `sanitizeWireString` returns it;
   - the fee-skip cases still pick as before, and "uses `args[0].calls[0].name`" stays green (controls).

   UI impact: none for a call whose `name` has at most 64 characters and no `method` key. Gate: `F`.
6. **C6.** Change: `packages/aztec-runtime/src/pxe/{artifact-registry.ts,service.ts,register-contract.test.ts}`, `apps/extension/src/wallet/services/pxe/artifact-registry.test.ts` (the order cases are rewritten on purpose). Tests:
   - a compiled-in class whose stored copy differs resolves to the compiled-in copy;
   - `registerContract` with a provided artifact for a compiled-in class writes the compiled-in copy; for a stored custom class, the stored copy;
   - an unknown class writes the provided one (control);
   - the execution paths still refuse a provided artifact of another class id.

   Gate: `F`, then network `contracts-register`, `register-token`.
7. **C7.** Change: `apps/extension/vite.shared.ts`, `vite.config.ts`, a test beside `scripts/strip-artifact-debug-info.test.ts` (`DEPENDENCY_LOG_LEVEL` is `"warn"` and a member of foundation's `LogLevels`), `wallet/logger/utils.ts` and its test, `offscreen/index.ts` (the wrapper, in a module of its own if the test needs it), `.claude/skills/logging-policy/SKILL.md`. Tests: the wrapper replaces a 32-byte hex value in a message, a nested data value and an error's projected message, and leaves the caller's `Error` unchanged; the wrapper scrubs a line from the console hook and one sent through the logger handed to `createPxeOffscreen`; a shorter hex value and plain text pass unchanged (controls). Gate: `F`; `bun run build` exits 0; then `grep -rlE 'LOG_LEVEL.{0,3}warn' apps/extension/dist | grep -q .` exits 0 and `grep -rqE 'LOG_LEVEL.{0,3}verbose' apps/extension/dist` exits 1.
8. **C8.** Change: `infra/token-list/scripts/{check.ts,summary.ts}`, `infra/token-list/test/` (a temp-repository test for `signingChanges`; envelope cases), `SECURITY.md` § Token list signing. Tests:
   - the range starts at the parent of the commit that first carried the current envelope bytes: with a signing-path edit in that commit, in an earlier unpublished commit beside an envelope-only commit, and after a later commit restores older envelope bytes;
   - another key order and an extra key are refused;
   - a first publish lists a signing-path edit older than 50 commits;
   - controls: a publish touching only the envelope reads "No signing-relevant change"; a second ordinary publish bases on itself; no envelope, or a base with no parent, lists as a first publish; the committed envelope passes.

   Gate: `F`, then `bun run test:all`.
9. **C9.** Change: `SECURITY.md`. Gate: `bun run lint`; `scripts/check-no-local-paths.sh`.
10. **Full gate**, per PR over its phases' e2e files, on its final head. `bun run test:all`, `bun run test:ci-gating`, `bun run lint:actions`, `bun run check:plans` after staging. Armed smoke on Chrome: `backup-roundtrip`, `backup-migration`, `restore-outcome`, `fiat-display`, `token-list`, `observability`, `endpoints`. Network on Chrome: phase 4's and phase 6's files, `tx-sendTx-selfPay`, and `backup-restore-sw-restart` with `NULO_E2E_PROVERLESS=1`. Firefox: phase 4's four. Pass: all green; no e2e scenario is added.

## Security & Adversarial Considerations

- **Tracked privately.** The PR, commits, tests and comments describe each change and its invariant only.
- **Boundaries.** A web page (C3, C4), a connected dApp (C5, C6), a backup file (C2, C6), a contacted endpoint (C1), a commit landed on `dev` (C8), the browser (C9). No change adds persisted state, a background task, a permission or a public contract; C4's record lives in one document's memory.
- **Fail closed.** C1, C2, C3 and C4 refuse; C5 and C6 substitute the wallet's own value; C7 drops or rewrites; C8 widens the range shown. None retries.
- **Logging.** New lines are fixed categories at debug. C7's rewrite also applies to the PXE node client's lines in that frame (the #432 lines keep their level and wording; only 32-byte hex values change).
- **Supply chain, crypto, privileges.** No dependency, key, workflow or permission change. C3 and C6 rest on `@aztec-labs/*`'s exported constant and class-id function, pinned.

## Assumptions

- **Facts.** (1) Sites and sizes: recon.md. (2) `admitContentMessage` runs on every content-script message, buffered ones too (`content-message-relay.ts:117-129`). (3) Only the content script builds envelopes; the page supplies `content`. (4) `normalizeBackupData` runs on every import (`backup-migrator.ts:94`). (5) `vite.shared.ts` is already imported by a unit test (`scripts/strip-artifact-debug-info.test.ts:7`). (6) `PxeService.registerContract` (`pxe/service.ts:435-457`) is the PXE write every contract registration with an artifact uses; `registerContractClass` writes a class alone and has no caller with a provided artifact. (7) Wallet code in the PXE host frame does log full ids today (`pxe/service.ts:354`, `artifact-class-id.ts`), through the logger `createPxeOffscreen` receives; C7's wrapper covers that logger.
- **Inferences.** I1: no wallet-sdk dApp sends `chainInfo` as numbers (`jsonStringify` of `Fr`); phase 4's e2e prove it. I2: Firefox sets `sender.url` on content-script messages; phase 4's Firefox runs prove it, since a missing one refuses. I3: 32 MiB is far above any reply on the networks Nulo serves; the budget is enforced, the claim is not. I4: no real profile holds over 1024 token rows or 16384 balance rows; export has no such limit (OA-1).
- **Asks.** A1 (orchestrator, answered 2026-10-16): three PRs, phases 1-3, 4-6 and 7-9 (D1). A2: residual items of the private sources stay in them; any known-limit issue for them waits until they publish (C9's is owner-cleared now). A3: OA-1, answered A with the limits as written (the owner sees it on a decision page; another pick is a follow-up).

## Decision ledger

| # | Question | Chosen | Not taken |
|---|---|---|---|
| D1 | delivery | three PRs off `dev` (A: 1-3, B: 4-6, C: 7-9 with the plan and close-out), stacked only where two edit one file (orchestrator, 2026-10-16) | one PR (the plan's draft); a stack throughout |
| D2 | node reply budget | 32 MiB, `NoRetryError` | per-method budgets (one option per caller); no node budget (outline B: the endpoint's reply would stay the only bound on the parse) |
| D3 | backup bounds | caps on two slices, checks before allocation, one lazy balance key listing | caps alone (each accepted row still lists the whole area); a token key batch (its liveness reads stay per row) |
| D4 | key exchange | tab id, a known credited origin, and the document's own origin equal to it; plus the document filter | the tab URL's origin alone (round 1 draft, Opus): the document's own origin is what binds the sender document, and equals the tab's for every top frame; `documentId` (absent from the SDK's send) |
| D5 | provided artifacts | the wallet's copy wins at `registerContract`; provided ones keep their class-id check | refuse a byte-different provided artifact (outline B): a new error for a re-registration that differs only in debug data; a helper in the execution service (misses the account-state restore) |
| D6 | dependency logs | define `warn`, plus the frame's 32-byte hex rewrite | `loggers.pxe` (reaches the service logger only; outline B); a module filter in the define (names upstream modules across bumps); `error` (drops reorg and store-reset warnings a bug report needs); a known limit for warn lines (the rewrite is local and stateless) |
| D7 | summary base | the first commit carrying the current envelope bytes | `${last}^` alone (the base follows the newest commit touching the file, which a revert or restore moves) |

## Delivery

Three PRs against `dev`, each on its own branch off `dev`, opened in order as each converges through its own Codex loop: `harden-security-fixes-1-a` (phases 1-3), `-b` (4-6), `-c` (7-9, this plan, the close-out). A later PR stacks on an earlier one only if both edit one file, and its body says so. Titles at most 93 characters; bodies state each change as its invariant, the validation runs, "no e2e scenario added", a `UI impact` line per change (none for conforming input; OA-1's reason text in A), and no `Closes` or `Refs` to a private source. Open each without labels; add `e2e:extension-network` or `e2e:extension-smoke` only if the path filter skips a suite the change needs. C merges `origin/dev` before its close-out. No parallel lanes.

## Post-implementation

The steps are `implementations-plan/README.md` § Post-implementation standard at `c5e9c8e8`, multi-arc placement: a loop per PR before it opens, then one fresh session over the net diff from `dev` for cross-arc issues. No diff review (`code_review: off`). Loop: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, at most three rounds, logged in the PR's last phase's `lessons/phase-N.md` (3, 6, 9) and the cross-arc pass in `lessons/phase-10.md`. Prompts carry the standard's two rules verbatim, the adversarial ask, and the rule that no committed word describes a weakness. A fix that grows the design stops for the orchestrator; persistence, permissions, public contracts and background work go to the owner. Close-out: C's final commits, after merging `origin/dev` and reading `index.md` and `lessons.md`. It files C9's closed `known-limit` issue (five sections, the trust boundary only; reopen when a browser binds PRF evaluation to the calling extension, or the owner adds a second factor to the derivation), puts its number in SECURITY.md and the Outcome's `Known limits:`. Teardown after merge: `agent-worktree done harden-security-fixes-1 --merged`; the delivering session arms the background wait the standard names.

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session 01a144e7): reject, 10 findings. Accepted: #1 keys inside `chainInfo` (C3); #2 the document's own origin, not the tab's, under the iframe flag (C4, D4); #3 warn-level lines (C7: the frame rewrite, D6); #4 cancel on a header refusal, the oversize class through the parse catch, budget wording (C1); #5 a lazy listing, and export has no limit (C2, OA-1); #6 the clamp wording (C5); #8 more summary cases (C8); #10 the block-body fact, `lint:actions`, recon wording. Rejected: #7's request for cold and warm store tests, since the wallet never reads a class it ships from the store; the final pass corrected the reason (a warm cache can keep an earlier copy), and C6's invariant is narrowed to match.

**Round 1, Opus Plan:** conditional approve, 9 findings, all accepted. #1 the e2e commands (armed build, proverless file, root `e2e:agent`); #2 nested keys (C3); #3 refuse an `"unknown"` credit; #4 the filter's written reason; #5 the third title site (`operation-planner.ts`); #6 committed wording; #7 `--reverse` and the squash probe; #8 the pin test and the bundle grep; #9 the account-state restore (C6 moves into `registerContract`) and `fetch.ts`'s catch. Its preference for the tab URL's origin (D4) lost to Codex #2: the document's origin equals it for every top frame and binds the sender document under the flag too.

**Round 2, Codex** (resume): conditional approve, 4 findings, all accepted. #1 the PXE host frame also logs through the logger `createPxeOffscreen` receives (C7 wraps it; Fact 7 corrected); #2 resolve inside the write callback on the raw PXE (C6); #3 one D4 phrase; #4 the duplicate-pair test cases (C2). It verified C1 to C6 and C8 as fixed in the plan, kept an opaque `"null"` origin as a refusal, and found no wallet-internal registration that C6 changes.

**Final pass, Codex** (fresh session 01a14502, gpt-6.1-sol, high): **conditional approve**, conditions applied. #1 a first publish listed only 50 commits (C8 drops the limit, with a test); #2 C6 claimed what the store keeps; upstream keeps the first cached copy, so the invariant now covers what the wallet resolves and writes, and Fact 6 names the class-only seam. It also asked for a fail-closed bundle check (phase 7). Its resume over the applied conditions: **approve**, no remaining material finding. On the contested points it kept D1, D2 (a budget, not a maximum), D3 (subject to OA-1), D4 (the document's origin; refusing cross-origin frames under the flag is the justified restriction), D5, D6 (warn plus the frame scrub, keeping `trim`'s projection and limits) and D7.

## Seeds

`/goal` (recommended): `/goal All phases of implementations-plan/harden-security-fixes-1/plan.md are marked ✓, each backed by its validation gate reported passing in the transcript, with LESSONS_FILE=implementations-plan/harden-security-fixes-1/lessons/phase-N.md printed per phase; code_review is off and /code-review was not run; the Codex fix loop over the whole diff converged (a resumed pass reporting no new material finding, quoted); the PR exists on GitHub, opened after the loop (gh pr view output); the close-out's archive move is committed (git show --stat); bun run test and bun run lint exit 0.`

`/loop` (fallback): `/loop 15m Drive implementations-plan/harden-security-fixes-1 forward; never idle. Each firing: (1) read plan.md and lessons/, the source of truth. If the plan directory is gone, run git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/harden-security-fixes-1/plan.md: success means merged, so run agent-worktree done harden-security-fixes-1 --merged, report its output, clear this loop and stop; failure means delivered, so only watch the PR's checks. (2) Otherwise take the next phase not ✓, run its gate, mark ✓, log lessons/phase-N.md. (3) Settle a decision with Codex (run-codex.sh ... high read-only gpt-6.1-sol) and log it; a visible change waits for its owner ask. (4) After phase 10, run the Post-implementation section: the Codex loop, the PR, the close-out, the checks. Never merge. The same step failing 5 times: reassess with Codex.`
