---
plan: consent-display-1
tier: mid
status: arc 1 merged (#712); arc 2 in review (its PR against dev); arc 3 not started
issues: "none: no public issue exists for this lane's items, so no PR closes one"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet) plus the driver's read; two-reviewer plan review (Codex gpt-6.1-sol high, Opus Plan leg); a final fresh Codex pass
base: origin/dev at 2c0df3b9
trunk: dev
post_implementation_hardening: not scheduled
---

# consent-display-1: what the consent windows say about a dApp, a fee and a token

Three picks the owner signed on decision page 38 (P38-02 = B, P38-03 = A, P38-07 = B), plus three changes to how a dApp's token add and a registered token's call are read and stored. Three arcs, each one PR against `dev`, not stacked. Recon: [recon.md](recon.md) (reuse map, claims checked, collision map). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are relative to `apps/extension/src` unless they start with `apps/`, `packages/` or `implementations-plan/`.

| Arc | Ships | Released when |
|---|---|---|
| 1 | Discovery admits secure origins only (the half of P38-02 B that adds nothing to a screen) | now: no running lane edits its files, and no owner ask concerns discovery |
| 2 | Token names and symbols cleaned wherever a row or an import record is written; a dApp's token add stores the details its window showed, or nothing, with the owner's answer to OA-1 | OA-1 is answered (the orchestrator may release it on OA-1's "what ships now") |
| 3 | The full origin, wrapped (P38-02 B); "About" (P38-03 A); the strip's caveat (P38-07 B); the label mark on a registered token's call | fees-display-1 has merged (it edits `OperationCard.vue`, `send.vue`, `popup/windows/fee/index.vue`) |

## Outcome & Quality Bar

**For whom.** A person deciding in a 400 px approval window from three things the wallet vouches for: who asks (the identity line), what the call does (the call rows) and what it costs (the fee row). Also a person reading the privacy strip on the Send page.

**What excellent looks like.**
1. The identity line names the exact principal a grant is keyed by: scheme, host and a non-default port, every character on screen at 400 px, wrapping, never cut (component test, light and dark screenshots of each window).
2. A token row that a dApp's add writes holds the name, symbol and decimals its window showed, from a contract of the class the window read, or no row is written. Under OA-1's "what ships now" this holds for every add whose window showed details; under A or B it holds for every add (one test per refused difference).
3. Every stored token name and symbol, and every token-import record's title, is free of control, format and bidirectional characters, on every path that writes one; a normal value is stored unchanged.
4. The words say what the wallet does: "About" where a fee may rise unasked; a caveat only where the token's class is outside the validated set; a mark only where a token call's parameter names do not fit the standard roles.

**Good enough.** No new e2e scenario: a cheaper layer proves each behaviour, and existing network specs run the real-browser paths. The Send review sheet stays as it is (OA-3).

## Assumptions

**Facts**
- F1. The identity line is `new URL(url).hostname` (`composables/useDappHostname.ts:13-21`) in a span with `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` (`components/composite/DappIdentityBlock.vue`); six windows pass it.
- F2. A session is keyed by the full origin: `DappMetadata.url = discovery.origin`, which upstream derives as `new URL(sender.tab.url).origin` from the top frame, then calls `onPendingDiscovery` synchronously after recording the pending entry.
- F3. `handleDiscovery` (`wallet/services/wallet-sdk/background.ts`) reads no scheme. `handler.rejectDiscovery` deletes the pending entry and answers the page nothing.
- F4. `isLoopbackHost` (`packages/wallet-core/src/utils/rpc-url.ts`) admits `localhost` and `127.0.0.1`. The e2e playground runs at `http://localhost:<claimed port>/` (`apps/extension/scripts/e2e/resolve-ports.ts:271`; fallback `:5174`).
- F5. A `register_token` approval delta carries nothing (`popup/windows/execute/index.vue:421-430`). The commit re-parses the interface; `persistToken`'s `live` arm reads the metadata again inside the token lock and backfills the import record's title with the raw symbol (`execution/service.ts` `executeRegisterToken`; `token/service.ts` `addMetadata`).
- F6. `previewTokenMetadata(networkId, account, address, expectedClassId?)` refuses another class with `PinMismatchError`, comparing the exact `toString()` spelling (`token/service.ts` `parseTokenInterface`).
- F7. Confirm ignores `tokenMetadataError` (`index.vue` `confirm-disabled`; the button reads "Confirm", `index.vue:620`).
- F8. `buildToken`, `restoreRow` and the import record's title store name and symbol as given; the seeder bounds name to 1-80 and symbol to 32 (`token/seeder.ts:34-36`); seeded names are chain reads (a list's `displayName` is never persisted, `token/default-tokens.ts`).
- F9. `TokenImportRow.vue:43` prints a failed add's error message: an error thrown inside `persistToken` reaches the screen, one thrown before `addTokenAuthorized` reaches the dApp only.
- F10. "Fee up to" appears on one dApp-window row, the app-set fee row (`OperationCard.vue:372,376`); `feeRiseAsks` (10 %) has one caller, the dApp send executor.
- F11. `BUNDLED_TOKEN_CLASS_IDS` lists the token classes with metadata slots (`packages/token-list/src/class-ids.ts`); the wallet seeds only list entries of those classes (`readTokenList` → `selectEntries`), though wallet-mode parsing accepts any class (`parse.ts:113`). The artifact catalog also compiles in the aztec Token (`packages/aztec-runtime/src/pxe/artifact-catalog.ts`, key `token`).
- F12. A restored row keeps the backup's `classId` (`restoreRow`); the restore refresh replaces it from the chain, and keeps the backup's values when its read fails or is late (`token/service.ts` `refreshRestoredToken`).
- F13. On a registered token, a call that fails `corroborates` renders as plain decoded rows with no notice (`popup/windows/execute/call-surface.ts:119-128`, `CallArguments.vue:91-118`). The class id does not commit to parameter names, nor to `nonDispatchPublicFunctions`, which the decoder still searches by selector.
- F14. Service ports admit only the wallet's own extension pages (`isTrustedInternalSender`, `packages/extension-messaging/src/background/service.ts:46`); `approveInteraction` is reached only through them.

**Inferences** (to challenge)
- I1. "Except localhost" means the wallet's existing loopback rule, `isLoopbackHost`: `localhost` and `127.0.0.1` admitted; `[::1]` and `*.localhost` refused like any other plain-http host. That helper excludes `[::1]` for a CSP reason that does not apply here; `dapp-origin.test.ts` pins the admitted set, so a change to the helper fails it, and the PR names both refusals.
- I2. The validated set is `BUNDLED_TOKEN_CLASS_IDS`: the token classes whose artifact the wallet ships and whose sends it validates (metadata slots, list gating, a pin test). The catalog's aztec Token is compiled in for decoding, but no listed token uses it and no test validates its sends, so it shows the caveat (OA-4).
- I3. The popup is the wallet's own page (F14) and sends the values its own preview returned, the ones its card printed: the plan rests on that popup code being correct. The worker checks their shape and compares them with its own read, so values that match no chain read are refused.
- I4. Comparing inside `addMetadata` leaves `advanceAdd`'s deletion, liveness and lock-ownership fences unchanged, and a resumed attempt reuses the read it already compared.
- I5. Cleaning changes no normal value: a name or symbol with no control, format or bidirectional character and no variation selector, within the bounds, is stored as read. A chain read decodes from one field of at most 32 bytes (`token/functions/descriptors.ts:50`), so the 80/32 bounds cut only backup rows.

**Asks** (each in [OWNER-ASKS.md](OWNER-ASKS.md) with what ships now; arc 1 depends on none)
- A1 (OA-1). A dApp token add whose preview failed (disable Confirm, refuse at commit, or keep), and the failed-add row's message when the details changed. Gates arc 2's release.
- A2 (OA-2). The label mark's words. Ships in arc 3 as drafted; signed in its PR.
- A3 (OA-3). The caveat in the Send review sheet too. Ships: no.
- A4 (OA-4). The validated set's members: the bundled set only, or also the aztec Token. Ships: the bundled set only.
- A5 (OA-5). A restored token holds no class until its refresh reads one, so it shows the caveat and its past mints show no amount until then. Ships: as described, in arc 3, for sign-off in its PR.

## Architecture & Implementation

### Arc 1: discovery admits secure origins only (P38-02 B, D4)

New `wallet/services/wallet-sdk/dapp-origin.ts`: `isSecureDappOrigin(origin: string): boolean`, true for an `https:` origin or an `http:` origin whose host `isLoopbackHost` admits; false for every other value, among them a value that does not parse, the opaque `"null"`, upstream's `"unknown"` and every other scheme. `handleDiscovery`'s first statement refuses the rest (`handler.rejectDiscovery(requestId)`, a `debug` line with the request id and never the origin), before the chain decode, the reset wait, the locked queue and the session lookup: the queue would otherwise hold it to unlock, and the lookup could answer it from a stored session. Upstream calls the hook synchronously after recording the pending entry and a key exchange needs an approved entry (F2), so nothing earlier acts on a refused origin.

### Arc 2: token text cleaned at every write (D3)

`buildToken` (every add and the restore refresh), `restoreRow` (backup rows) and the token-import record's title (at creation for the seeded arm, at the backfill for the live arm) pass name and symbol through `sanitizeWireString` with the seeder's bounds (80, 32). The comparison below runs on raw values before this; the stored form is what the card printed, except that the card cuts a name at 64.

### Arc 2: a dApp's token add stores what its window showed (D1, D2)

Invariant: a row that a dApp's `registerToken` writes holds the name, symbol and decimals its approval window showed, read from a contract of the class the window read, or no row is written. A window that showed the read failure follows OA-1.

- **Popup** (`popup/windows/execute/index.vue`). `prefetchTokenMetadata` keeps `meta.interface.classId` beside the three values. `approve()` puts `tokenMetadata: { name, symbol, decimals, classId }` (raw, as the preview returned them) on a `register_token` op's delta; a failed preview puts nothing.
- **Delta and envelope** (`dapp-interaction/approval-delta.ts`, `execution/models/index.ts`). Both gain `tokenMetadata?: ShownTokenMetadata`; the delta's header names the shown figures beside the minted ids, as `feeCeiling` already is. `approveInteraction` (`dapp-interaction/service.ts`) refuses a malformed one before the claim, as it refuses a malformed `feeCeiling`: name and symbol strings of at most 256 UTF-16 units, decimals a non-negative safe integer, `classId` matching `^0x[0-9a-f]{64}$`. `executeAndResolve` copies it into the envelope.
- **Commit** (`execution/service.ts`). `dispatchOperation` passes `approval` to `executeRegisterToken`, which parses as today with its task and, given `tokenMetadata`, the pin `shown.classId` (`PinMismatchError` before any import record), then hands the three values to `addTokenAuthorized(..., expected)`. The getter-presence check stays. Without `tokenMetadata`: OA-1's answer (A or B: refuse before any import record; C: today's path).
- **Persist** (`token/service.ts`). The `live` arm gains `expected?: TokenMetadata`. `addMetadata` compares its in-lock read with it exactly and throws on a difference, so the import record fails as a failed read does today; the stored row is that same read. A resumed attempt reuses the compared read. An existing row (an idempotent re-add, or one another add wrote first) returns as today with no compare, since this request writes nothing. Progress stages and today's failed-read row are unchanged.
- **The failed row's message** on a difference is new copy: drafted "Token details changed after you approved them.", carried in OA-1. It holds no token text.
- **Under OA-1 = A**, `confirm-disabled` also holds while any `register_token` op has a `tokenMetadataError`. Under A or B the worker refuses a popup-approved `register_token` without `tokenMetadata`.

### Arc 3: the identity line shows the full origin (P38-02 B, D5)

- `composables/useDappHostname.ts` becomes `useDappOrigin.ts`: `{ origin, isSuspicious }`. `origin` is `new URL(url).origin` (scheme, host, a non-default port); a value that does not parse, or the opaque `"null"`, is returned as stored. `isSuspicious` reads the hostname as today; `HOSTNAME_WARNING` stays.
- `DappIdentityBlock.vue` derives the line from `dapp.url` itself; the `hostname` and `hostnameSuspicious` props go, and five windows drop their composable call (`verify` keeps it for its announcement). `.dapp_hostname` keeps `type--data-lead`, drops `overflow`, `text-overflow` and `white-space`, and wraps (`overflow-wrap: anywhere; min-width: 0`). The `*-hostname` testids stay.

### Arc 3: "About" on the app-set fee row (P38-03 A)

In `popup/components/modules/send/AppFeeLine.vue` (fees-display-1's home for the row; `OperationCard.vue:372,376` if that lane did not land), the loaded and estimating rows say "About" where they say "Fee up to"; the priority clause, the figure grammar fees-display-1 set and the 10 % rule are unchanged.

### Arc 3: the strip's caveat (P38-07 B, D6)

- `components/composite/send/publish-facts.ts` gains `TOKEN_CAVEAT` and `isValidatedTokenClass(classId?: string)`, lower-cased membership in `BUNDLED_TOKEN_CLASS_IDS` (I2, OA-4). `popup/pages/send.vue` renders `<Text variant="body" color="secondary" data-testid="send-token-caveat">` under `<PublishStrip>` when the strip shows and the active token's class is not validated, a row without a class included. Draft, for sign-off in the PR: "Nulo can't check this token's contract. What a send publishes depends on its code." The strip's words and label are unchanged.
- `restoreRow` stores a restored row without `classId`; the restore refresh supplies it from the chain (F12). A restored token therefore carries the caveat, and its mints read no amount (as an upgraded contract's do, `utils/tx-amount.ts:30`), until a refresh succeeds; a failed refresh leaves the row without a class, never with the backup's.

### Arc 3: the label mark (D7, D8)

- `callSurface`: on a registered token whose decoded function is a vocabulary name at its arity, or whose call carries a vocabulary selector, a failed `corroborates` returns `{ kind: "decoded", fn, params, labels: "unchecked" }` in place of plain decoded rows.
- `UnreadableArgsNotice.vue` becomes `ArgsNotice.vue` (props `title`, `body`, `testid`), used by the raw branch, `SendTxSummary.vue` and the new mark; `${prefix}-unverified-warning` stays on the raw notice; the mark is `${prefix}-labels-warning`, above the decoded rows. Draft words (OA-2): title "Labels from the contract"; body "These names come from the contract, not from Nulo. Check the addresses and amount before approving."

## Security & Adversarial Considerations

- **Boundaries.** A page is untrusted: its origin comes from the browser, its strings do not. A token contract is untrusted: its getters may return anything at any block, and a registered artifact's parameter names are not fixed by its class. A backup file is untrusted input. The popup is the wallet's own page (F14).
- **Invariants this plan establishes**, each with its test: the consent windows name the full origin a grant is keyed by; only `https:` origins and loopback `http:` origins reach a window; a dApp's token add stores what its window showed, or nothing; every stored name and symbol, and import title, is clean; the strip carries a caveat unless the token's class, as read from the chain, is validated; a registered token's call whose parameter names do not fit the standard roles carries a mark.
- **What stays as it is**: the strip's words for a token outside the set (pick B); a failed preview under OA-1's "what ships now"; a non-token contract's call shows its own parameter names with no mark (D7); the wallet's own Add-token popup keeps its read at commit (the person typed the address; D1); the restore refresh rewrites a restored row's name, symbol and class from the chain with no window, by design, and a failed refresh keeps the backup's name and symbol.
- **Input validation**: the delta's new field is checked before the claim; `sanitizeWireString` at every token write; Vue interpolation only, no `v-html`.
- **Logging**: the discovery refusal logs at `debug` with the request id and never the origin; the commit refusal message carries no token text.
- **Supply chain and crypto**: no dependency added; no cryptography touched.

## UI impact

- **Arc 1**: a page on a plain-http origin other than localhost gets no wallet answer to discovery, so no window opens (signed: P38-02 = B).
- **Arc 2**: token names, symbols and import titles lose control, format and bidirectional characters (a normal value renders unchanged); a dApp's token add whose details changed after approval ends as a failed import row with the message OA-1 carries; under OA-1 = A, Confirm is disabled while a token's details are unread. These ship as the owner answers OA-1.
- **Identity line** in the discover, capabilities, execute, fee, verify and network-unavailable windows. Before: the hostname, one line, cut with "…". After: the full origin, wrapped, never cut (drawings `p38-identity-b-*`). Signed: P38-02 = B, "A, plus discovery refuses origins that are not secure, except localhost."
- **The execute window's app-set fee row.** Before: "Fee up to X". After: "About X" (drawing `p38-feelabel-a-*`). Signed: P38-03 = A, "Keep the 10 % tolerance; cards that print a wallet-estimated fee say About X instead of Fee up to X."
- **Send's footer**, a token whose class is outside the validated set: one caveat line under the strip (drawing `p38-strip-b-*`). Signed: P38-07 = B, "Keep the labels and add one caveat line under the strip for non-bundled tokens.", with the owner's note that the caveat follows the validated class ids. The sentence is drafted above and signed in the PR.
- **A restored token before its refresh succeeds** (OA-5): the caveat shows on Send, and its past mints show no amount on Activity's card (`TransactionCard.vue:46`) and the transaction page (`popup/pages/tx/[id].vue:86`), as a row added before classes were recorded does today.
- **The execute window's call rows**: the label mark (in the lane's signed budget); its words are OA-2, signed in the PR.
- Arc 3's PR body carries light and dark screenshots of each surface, before and after.

## Phases

Fast layers in every phase gate: `bun run lint`, `bun run typecheck:all`, `bun run test`; each arc's last gate adds `bun run test:all`. A gate passes when every command exits 0 and each named test is in the run. E2E runs only at load1 < 150 (`/proc/loadavg`), from the worktree root through `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent <files>` (network) or `cd apps/extension && bun run test:e2e -- <files> --retry=0` (smoke), on Chrome. No Firefox twin: no arc touches fixtures, focus, windows or user activation.

### Arc 1, phase 1: discovery admits secure origins only
- Change map: `wallet/services/wallet-sdk/dapp-origin.ts` (new), `background.ts` (`handleDiscovery`).
- Tests: `dapp-origin.test.ts`: admitted `https://a.example`, `https://a.example:8443`, `http://localhost:5174`, `http://127.0.0.1:8080`; refused, one each, `http://a.example`, `http://10.0.0.2`, `http://[::1]:3000`, `"null"`, `"unknown"`, `file:///x`, `chrome-extension://abc`, `"not a url"`. A `background.*.test.ts` case on the `initWalletSdkHandler` harness: a plain-http remote discovery is rejected with nothing queued (locked), with no window (unlocked), and with no auto-approval when a session is stored under that origin; an `https:` control opens the window.
- Gate: the fast layers, `bun run test:all`, then network `tests/e2e/network/register-token.test.ts` (the playground on `http://localhost` still connects).
- **Done** (70057899, e44ed3d2): gate green, STATUS.md; the code deviation is D10.

### Arc 2, phase 2: token text cleaned at every write
- Change map: `wallet/services/token/service.ts` (`buildToken`, `restoreRow`, the import title at creation and backfill).
- Tests: `token/service.metadata.test.ts` or `service.test.ts`: a read symbol `"USD\u202eC\u200d\u0007"` and a name carrying U+202E are stored clean, and the import record's title is clean; a plain name and symbol are stored unchanged (control); `restore()` of a row carrying the same symbol stores it clean.
- Gate: the fast layers.
- **Done** (ebdf337c): gate green, STATUS.md.

### Arc 2, phase 3: a dApp's token add binds to the shown details
- Change map: `dapp-interaction/approval-delta.ts`, `dapp-interaction/service.ts`, `execution/models/index.ts`, `execution/service.ts`, `token/service.ts`, `popup/windows/execute/index.vue`.
- Tests: `execution/register-token.test.ts`: the parse carries the pin and `addTokenAuthorized` the expected values (control); a class change refuses with `PinMismatchError` and `addTokenAuthorized` is never called; no `tokenMetadata` follows OA-1's answer. `token/service.test.ts`: with `expected`, a matching read is stored (control), and one difference each in name, symbol and decimals fails the import record with nothing stored; the existing idempotency and watchdog cases, given `expected`, show a resumed matching attempt writing once without a second read, a mismatched one writing nothing, and another add's same-contract row left unchanged. `dapp-interaction/service.approval-binding.test.ts`: one refusal per malformed field class, before the claim; a well-formed one reaches the envelope. `popup/windows/execute/index.test.ts`: the approve delta carries the preview's four values; none after a failed preview (under A: Confirm disabled, beside an enabled control).
- Gate: the fast layers, `bun run test:all`, then network `tests/e2e/network/register-token.test.ts`.
- **Done** (ce8cc3d7; review fixes 13eb2fa3, 473a2867): gate green, plus network `type-roles-windows.test.ts`, which approves a registerToken window; the deviations are D11 to D14.

### Arc 3, phase 4: the identity line shows the full origin
- Change map: `composables/useDappHostname.ts` → `useDappOrigin.ts` (+ test), `DappIdentityBlock.vue` (+ test), the six windows and their tests, `src/types/*.d.ts` (regenerated).
- Tests: four same-host origins (`https`, `https:8443`, `http`, `http:8080`) give four strings; the IDN flag unchanged; a 65-character origin renders whole, and `.dapp_hostname` computes `overflow-wrap: anywhere` with no `text-overflow: ellipsis` and no `white-space: nowrap` (the `WRAPS` idiom of `OperationCard.long-strings.test.ts`).
- Gate: the fast layers.

### Arc 3, phase 5: "About" on the app-set fee row
- Change map: `AppFeeLine.vue` and its test (or `OperationCard.vue`, `OperationCard.fee.test.ts`), `apps/extension/tests/e2e/network/fee-sponsor-funding.test.ts` (its regex).
- Tests: the loaded and the estimating rows read "About"; neither contains "Fee up to".
- Gate: the fast layers.

### Arc 3, phase 6: the strip's caveat
- Change map: `components/composite/send/publish-facts.ts` (+ test), `popup/pages/send.vue`, `popup/pages/send.integration.test.ts`, `token/service.ts` (`restoreRow`).
- Tests: `isValidatedTokenClass`: the bundled id, and the same id upper-cased, are in; another id and an absent one are out. Page: a token of another class shows `send-token-caveat` with the sentence; a validated token shows none (control); a blocked transfer shows none. `restore()` stores no `classId`; a failed and a late refresh leave none (the caveat shows; `txAmount` gives no mint amount), and a successful refresh writes the chain's (control).
- Gate: the fast layers.

### Arc 3, phase 7: the label mark
- Change map: `popup/windows/execute/call-surface.ts` (+ `call-surface.test.ts`), `CallArguments.vue`, `UnreadableArgsNotice.vue` → `ArgsNotice.vue`, `SendTxSummary.vue`, their tests.
- Tests: on a registered token, `transfer_private_to_private` decoded as `(to, from, amount, _nonce)` is marked; a call carrying `transfer_private_to_private`'s selector whose decode names another function (`claim_x`) is marked; the corroborating order reads as a transfer (control); the same rows on an unregistered contract, and a non-vocabulary function on a token, are not marked. `CallArguments` renders `${prefix}-labels-warning` above marked rows only, from a wire-shaped fixture (`0x` + 64 hex fields).
- Gate: the fast layers, `bun run test:all`, then network `register-token.test.ts connect-unserved-chain.test.ts fee-sponsor-funding.test.ts` (under `tests/e2e/network/`) and smoke `send-fee-privacy.test.ts send-keyboard.test.ts`.

## Delivery

- One PR per arc against `dev`, no stack (D-orch-1). Arc 1 ships from `worktree-consent-display-1`, which carries this plan. Arcs 2 and 3 branch as `consent-display-1-arc<N>` from `origin/dev` at their release and merge `origin/dev` again before their PR.
- Titles (under 93 characters, lower-case for commitlint's `subject-case`), none closing an issue: arc 1 `fix(wallet-sdk): discovery admits only secure dapp origins and localhost`; arc 2 `fix(tokens): a dapp token add stores the details its window showed; clean token text`; arc 3 `feat(consent): full dapp origin, "About" on app fees, token caveat, label mark`. Bodies describe each change and its invariant; arcs 1 and 3 quote their picks by id and text; arc 2's carries OA-1's answer and message; arc 3's carries the screenshots, the two drafted sentences and OA-5's displays for sign-off.
- Open each PR without labels; add `e2e:extension-network` or `e2e:extension-smoke` afterwards only where the path filter skips a suite the arc ran.
- The close-out (README § Post-implementation standard, step 4) is the final commits of the last arc to open; it waits until the other arcs have merged.
- Parallelism: the arcs share `token/service.ts` (different functions) and nothing else; each later arc merges `dev` first. No lanes.

## Post-implementation

The steps are `implementations-plan/README.md` § Post-implementation standard, read at 2c0df3b9. Specific to this plan:

- Step 1 is absent (`code_review: off`).
- Step 2 runs per arc: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` over the arc's diff against its base, with this plan and the arc map ("arc N of 3; the arcs are independent PRs"); resume with `resume-codex.sh`; hard stop at three rounds, then surface. One Opus review (`Agent`, `model: "opus"`, `general-purpose`) runs beside round 1.
- Cross-arc pass: before the last arc's PR, one fresh Codex session reads the merged arcs' diffs and the last arc's diff for seams.
- Log each round in `lessons/phase-N.md` and in the plan review record below.
- Teardown (step 5): `agent-worktree done consent-display-1 --merged` once `implementations-plan/archive/consent-display-1/plan.md` is on `origin/dev`.

## Decision ledger

Outline B (not committed) proposed a worker snapshot by id with a 120 s life, cleaning at the decode, a refusal in the content-message wrapper plus narrowed manifest matches, a worker-computed `vouched` flag over every catalog token class, a mark on every decoded call of a token outside the set, and one arc.

| # | Question | Codex | Opus | Decision and reason |
|---|---|---|---|---|
| D1 | How a token add binds to its window | plan: pinned re-read, exact compare | plan: B's snapshot refuses a slow window or a worker restart | **Plan.** The shown values carry no authority, only the expected side of a compare against the worker's own read; B adds expiry, consumption and restart obligations. |
| D2 | Where the compare runs | before the import record | before, but that drops today's failed-read row and the parse's progress stage | **Inside the persist lock** (the `live` arm with `expected`). The stored row is still the compared read, today's failure row and stages stay, and the one new visible element, the mismatch message, goes to OA-1. |
| D3 | Where text is cleaned | row construction plus import titles | same; decode-level cleaning would loosen the seeder's exact symbol check | **Row construction, `restoreRow` and both import-title writes.** A schema transform would make reads lossy. |
| D4 | Where discovery refuses | top of `handleDiscovery`; upstream calls it synchronously | same; the wrapper tests another value (`"null"` when sandboxed); the manifest is pinned | **Top of `handleDiscovery`**, reusing `isLoopbackHost`. |
| D5 | Identity line plumbing | block derives; rename | same | **The block derives from `dapp.url`; `useDappOrigin`.** |
| D6 | The validated set | a static set with trustworthy class provenance | the bundled set only | **`BUNDLED_TOKEN_CLASS_IDS`; restored rows hold no class until the chain supplies it.** Membership is OA-4. |
| D7 | The mark's trigger | vocabulary name or selector, failed corroboration | same (a 4-byte selector collision is about 2^32 hashes) | **Name or selector, on a registered token.** B's broader triggers mark honest calls. |
| D8 | Arcs | two; the refusal may move to arc 1; an ask on a surface arc 1 touches blocks its release | refusal into arc 1; ask OA-1 first | **Three arcs.** Arc 1 is the refusal alone: no ask concerns discovery. Arc 2 holds all token ingestion, since the cleaning shares the import row with OA-1's message, and waits for OA-1 so it is built once. |
| D9 | The mark's words | name the interface; cover mints | "Don't rely on these names. Check the addresses and amount" | **Draft adopted from both**; the owner decides (OA-2). |
| D10 | Arc 1: where the refusal sits in code (tree deviation) | | | **`handleDiscovery` is the origin gate; its former body is `handleSecureDiscovery`.** The refusal as the first statement of the old body scored 16 against the cognitive budget of 15, and a suppression is barred. Both callers, the SDK callback and the unlock drain, still enter through the gate. `background.transport.test.ts`'s no-origin case now asserts the refusal at discovery on the real SDK handler, plus a plain-http tab; the key-exchange wrapper's `"unknown"` clause is kept and now unreachable. |
| D11 | Arc 2: OA-1 and delivery (tree deviation) | | | **OA-1 = A** (P42-08: "Confirm disabled while the details are unread; Reject is the only exit."); the changed-details message ships as drafted. The branch is `consent-display-1-a2` off `origin/dev` c8a423f2, as the orchestrator named it; the plan's two doc commits were already in #712's squash. |
| D12 | Arc 2: which commits must carry shown details | | | **Every dApp-origin `register_token`**, not only those with an envelope: a dApp's add is always confirmed, so the two sets are one today, and keying on the origin fails closed if that changes. The refusal ("Token details were not shown for approval") precedes the parse and any import record, so only the dApp sees it. `ShownTokenMetadata` and its check live beside the delta in `approval-delta.ts`; the envelope imports the type. |
| D13 | Arc 2: the window's guard (tree deviation) | | | **One computed, `tokenMetadataUnread`, is loading or a failed preview**, read by `approve()` and `confirm-disabled`. `approve()` was at the cognitive budget (15), and a second operand made it 16; extracting the delta builder did not help, since Biome scores the closure apart. |
| D14 | Arc 2: compare before the title | | | **The compare runs before the title backfill**, so a refused add's import row shows the address and the message, never the read nobody approved. The cleaning tests live in `token/service.test.ts`. |

## Plan review record

- **Codex round 1** (gpt-6.1-sol, high, session 01a14b4b): reject. Accepted, all eight: OA-1 left the token invariant open while arc 1 touched its window (→ D8, the narrowed invariant); a backup could keep a validated class on a row whose refresh fails (→ `restoreRow` drops the class); import titles kept raw symbols (→ D3); F11, I2 and I5 overstated (→ corrected; OA-4); I3 cited the wrong boundary (→ F14); the selector arm (→ D7); e2e commands lacked `NULO_E2E_RETRY=0`, and `test:all` runs once per arc; committed wording (→ neutral terms).
- **Opus Plan leg, round 1**: conditional approve. Accepted: the selector arm, the import titles, the narrowed invariant and OA-1 first, the `approval-delta.ts` header, the decimals bound (a safe integer), the restore notes, the wording, F11 and I5, I1's stated reason, the stored-session refusal test, the "Confirm" label. Its point that a compare before the import record changes two visible things is met by D2. Its draft words joined OA-2.
- **Final fresh Codex pass, round 1** (session 01a14b5f): reject. Accepted: OA-1 named the import row whose titles arc 1 cleaned (→ D8: the cleaning moved to arc 2, arc 1 is the refusal alone); the restored mint amount needed an ask (→ OA-5, UI impact, failed and late refresh tests); the idempotent and resumed exits of D2 needed tests (→ phase 3); the two drafts of the mark's words differed (→ one text); F4, I3 and I5 wording. Not taken: removing this record and the ledger's reviewer columns. The lane's wording rule bars naming the outside review, its items and the weakness; the repository's standard requires each accepted and rejected point with its reason in `plan.md`, and this record describes plan decisions only.
- **Final fresh Codex pass, round 2** (resumed): **approve**. It verified the re-cut arc 1, OA-5, the D2 exits, the single text and the reworded facts, and withdrew the wording point: no committed sentence names the outside review or describes its path.

### Arc 1 implementation review

- **Codex round 1** (gpt-6.1-sol, high, session 01a14b75) on 70057899: reject, no production bypass. Taken: the refusal asserted synchronously, the queue spied with a queued `https:` control, the reset wait, Terms, network read, notice and window spied; `vi.stubGlobal` in place of two test-only `biome-ignore` lines. Held: the wrapper's `"unknown"` clause; numeric IPv4 forms normalize to this machine.
- **Codex round 2** (resumed) on e44ed3d2: **approve**; no new material issue across the arc; the `"unknown"` clause kept.
- **Opus review** of 70057899: approve. Taken: an `https:` stored-session control; the orphaned flow doc block deleted. Not taken: removing the `"unknown"` clause (pre-existing, redundant, outside the arc).

### Arc 2 implementation review

- **Codex round 1** (gpt-6.1-sol, high, session 01a15024) on ce8cc3d7: approve. Taken: the pin comment claimed an upgrade is refused, but a PXE-held instance reports its original class (`hydratePreimage`), so it now says an interface of another class refuses; the window's doc block cut to its invariant, the computed's restating comment removed. Not taken: rewording the failed preview's "Verify the contract address before approving." (copy; OA-1 A keeps the warning): OA-6.
- **Opus review** of ce8cc3d7 and 13eb2fa3: approve. Taken: the window's guard keys on a card with no details, which covers a read in flight and a failed one; the pin test's stub refuses only a pinned parse of another class; the hidden characters in the cleaning cases written as escapes; `packages/wallet-bridge/README.md` states the commit's contract. Not taken: a released add whose read matched can title its import record with that read and then succeed against another add's same-contract row; it needs a five-minute storage stall, and a succeeded `token_import` record renders nowhere (Home drops it, the activity feed excludes the kind).

## Seeds

Orchestrator-owned: no ELI5; the seeds are not run.

```
/goal Arc <N> of implementations-plan/consent-display-1/plan.md: its phase gates green in STATUS.md, the Codex loop converged (a resumed pass with no new material issue quoted), the arc's PR open against dev, `bun run test:all` and `bun run lint` exit 0 in the transcript.
```

```
/loop 15m Drive arc <N> of implementations-plan/consent-display-1: read plan.md and STATUS.md; run the next unticked step and its gate; consult Codex on any decision; never change what a person sees beyond the UI impact lines; stop after the PR's checks report.
```
