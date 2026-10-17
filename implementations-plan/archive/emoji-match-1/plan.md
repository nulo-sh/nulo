---
plan: emoji-match-1
tier: light
status: delivered as a draft PR held for OA-1 and OA-2 (2026-10-17)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 Explore agents (sonnet) plus the driver's read; one plan; Codex gpt-6.1-sol high audit plus an Opus Plan leg, then one resumed Codex verification
post_implementation_hardening: not scheduled
base: origin/dev at aa2cfcac
trunk: dev
issues: [587]
---

# emoji-match-1: the emoji check on every connection (#587, P28-04 = A)

## Outcome

- **Date:** 2026-10-17.
- **Status:** delivered as one draft PR against `dev`, `feat(dapp): show the emoji check on every connection, remembered apps too`, held as a draft until the owner answers OA-1 and OA-2 (`OWNER-ASKS.md`; decision page 31, P31-03 and P31-04); the merge that lands it closes this plan.
- **Shipped:** the emoji check on every connection, remembered apps too (#587, P28-04 = A): `handleSessionEstablished` shows it for every establishment and releases no hold; every verify admission reserves a window slot (`needsWindow` removed, D4); both "Skip this check next time" rows and `setTrustedVerification` removed (OA-1 A); They don't match unchanged (OA-2 A); `trustedVerification` kept in the schema, inert (D2); `session-reconnect.test.ts` reshaped into one scenario (D5). Screenshots in `screenshots/`.
- **Dropped, rejected, superseded:** keeping `needsWindow` (Opus, D4): rejected. An sdk change (D6): out of scope, filed as #605. Closing a stale check window, or freeing a remembered reconnect's slot when its tab goes before key exchange: new lifecycle state, not taken (#606). No lesson promoted: `lessons.md` is at its budget, and the one candidate (a harness caps a background command below the full local network suite's length) is session tooling, kept in `lessons/phase-3.md`.
- **Known limits:** #606.
- **Open items:** #605 (`blocked:external`); OA-1 and OA-2 with the owner.
- **Seeds retired:** the `/goal` and `/loop` seeds below.

The owner signed P28-04 = A on 2026-10-16: "Show the match on every connection: the verification window opens with the grid, 'They match' and 'Reject', and remembering skips only the capability consent that follows." One arc, one PR against `dev`, `Closes #587`.

## Outcome & Quality Bar

- **For whom:** a person reconnecting an app they connected before, and the app's page, which draws its own grid.
- **Excellent:** (1) every new channel shows the wallet's grid and the app's calls wait for They match; no stored flag can skip it; (2) a remembered app still skips the connect window and any capability consent its stored grants cover; (3) no screen promises a skip the wallet no longer does.

## Assumptions

**Facts** (recon.md has the traces):
1. The sdk's `confirm()` is local to the page and resolves at once; no protocol message carries a wallet-side answer. A wallet `DISCONNECT` that arrives before the page's `confirm()` is dropped (recon § 1). A is wallet-side only.
2. A remembered app is a `DappSession` row for `(origin, chainId, profile)`. Its reconnect skips the connect window (`background.ts:923-926`); the check is skipped only when the row carries `trustedVerification === true` (`session-established.ts:186`, `background.ts:924, 1055`), set by "Skip this check next time" in the check and in Settings.
3. Covered capability consent is skipped for every remembered row, flag or not (`dispatcher.ts:718`; e2e `connect-locked-queue.test.ts`).
4. They don't match deletes the pair's rows and ends its channels (`dapp-session/service.ts:408-430`); P2-09 signed "They don't match ends the session as today".
5. The MAC covers every key of the parsed row (`mac-storage.ts:85-105`, `integrity.ts:31-47`), so dropping the field from `DappSessionSchema` would delete every row carrying it.
6. A reconnect's check opens standalone with `isReconnect=true` (no `connect-step-bar`, "Reconnected"), as for an untrusted row today (`session-established.ts:191`, `verify/index.vue:213, 220`).

**Inferences:** #587's "remembered" is this switch, the only control that skips the check (unverified: OA-1 asks the owner, who filed #587). Formerly trusted origins now meet the window cap, 2 per origin, before the 3 tokens.

**Claims of the brief that did not hold:** the ingress is `apps/extension/src/wallet/services/wallet-sdk/background.ts`; the check is `popup/windows/verify/`, not the connect window (`popup/windows/discover/`); the skip is a visible switch, so the window changes (OA-1); "Reject leaves the remembered record untouched" contradicts P2-09 (OA-2); the page does not always get the disconnect (Fact 1).

**Asks:** OA-1 and OA-2 in `OWNER-ASKS.md`. None silent.

## Architecture & Implementation

The wallet already shows the check on an untrusted reconnect. The fix deletes the one branch that skips it, so every remembered row reconnects as an untrusted one does today, and removes the controls, the RPC and the admission mode that served the branch. Nothing new is built.

- **Flow after the change:** discovery for a remembered, served pair → `autoApproveExistingSession` admits with a token and a window slot → key exchange → `handleSessionEstablished` stamps the profile, opens the standalone check, keeps the hold → They match: `confirmVerification(urlHash)` releases the hold; They don't match: `refuseVerification`.
- **Interfaces:** `SessionEstablishedDeps` loses `hold`, and its row type loses `trustedVerification` so this path cannot read it again; `autoApproveExistingSession` loses `trusted`; `AdmissionRequest` loses `needsWindow` and every admission reserves a slot (D4); `setTrustedVerification` leaves `Methods`, the service and the client (an internal popup-to-worker RPC). `DappSession.trustedVerification` stays, inert (D2).

## Security & Adversarial Considerations

- **Threat:** something that intercepts the channel between an honest page and the wallet (another extension or a frame speaking the discovery protocol). A trusted row gave it a channel the person never saw; now every channel shows the wallet's grid and its calls wait. A compromised page or injected script can draw a grid that matches its own channel, so against those A adds a window, not a check.
- **Reload loops:** remembered reconnects take window slots, bounded as untrusted rows are today (3 tokens, 1 per 20 s; 2 slots per origin, 8 global; queue 4; `background.admission.test.ts:164`, `session-reconnect-flood.test.ts`).
- **Open checks:** a check window outlives its session and keeps its slot until closed (`verify-admission.ts:160-167`). A stale check's They don't match forgets the app and ends the live channel; four remembered origins with open checks fill the global cap. Existing for untrusted rows; filed as one closed `known-limit` at close-out (no code: eviction would be a new window lifecycle).
- **Lock:** an unanswered check at a lock ends its session (DH-2 = A), now for formerly trusted origins too.
- **Stored state:** the flag is inert, so a tampered row gains nothing; one internal RPC fewer. No crypto, dependency or permission change.

## UI impact

- **The check on a remembered reconnect** (P28-04 A, signed): it now opens for a row with "Skip this check next time" on; the screen is the untrusted reconnect's. The PR attaches light and dark shots of the second connection.
- **"Skip this check next time"** in the check and in Settings → Connected apps → the app: removed; the PR stays a draft until OA-1 and OA-2 are answered. Settings keeps "Connection check", the grid and its caption.

## Phases

### Phase 1: the sdk side ✓ (done at planning)
Recon § 1 records the trace. **Gate:** recon.md § 1 exists; its conclusions are Facts 1 and the OA-1 note on the page.

### Phase 2: the check on every connection (wallet side) ✓
- `wallet-sdk/session-established.ts`: show the check whenever establishment passes its gates; delete `needsVerification`, the `else deps.hold.release()` branch, the `hold` dep and `trustedVerification` from the row type (`:52`); fix the comments at `:84-91`, `:202-203`.
- `wallet-sdk/background.ts`: `autoApproveExistingSession(discovery, chainId, deps)`; stop passing `hold` to establishment; fix `:1046-1048`.
- `wallet-sdk/verify-admission.ts` (separate commit): drop `needsWindow`. At `:250, 259, 320, 370` only the `req.needsWindow &&` condition goes: the duplicate-id, capacity and live-id checks run for every request. `:326`'s reservation-free return goes, so `consume`, `AdmissionRun` and `admitAsync` return a `WindowReservation`; so do `approveAdmitted` (`background.ts:996`), `persistAndApprove` (`:1269`) and `admitted?.attach` (`:1183`). `reservation(id)` stays optional, as do establishment's missing-slot throw and its `releaseIfUnstarted` (termination can still leave no slot). Fix `:2-3`. The token tests in `verify-admission.test.ts` free their slots with `releaseIfUnstarted`, which refunds no token.
- `verification-hold.ts:6-7, 34`: a hold is released only by They match.
- `test-services.ts`: `remembered: true` replaces `{ trusted }`; fix the head comment.
- Tests: `session-established.test.ts`: fold "a row carrying the flag shows the check and keeps its calls held" into `:667`'s table; delete `:178`, `:677`, and the `release`-spy table `:682-704`; drop `hold` from `makeDeps`. `background.connect-window.test.ts`: fold `:807` into `:786` as a `test.each` over the flag (calls wait, then run after They match); in `:711-743` drop the sibling-trust line and the `r3` tail and retitle; drop `remember`'s `trusted` (`:749, 1259, 1282`). `background.admission.test.ts`: delete the trusted `describe` (`:143`), fix the header; re-check `:376`. `background.refusal-teardown.test.ts:61` sends a discovery first (`background.reset-wait.test.ts:24-33` pattern); `transport`, `reset-wait`, `unserved-chain` take `remembered: true`; retitle `unserved-chain.test.ts:295`; fix `transport.test.ts:64`.
- **Gate:** `bun run lint && bun run typecheck:all && bun run test && bun run test:all` exit 0. Pass: the folded flag case is red on the base copy of `session-established.ts` and green after; no complexity suppression added.

### Phase 3: the controls, the e2e and the docs (PR held for OA-1) ✓
- `verify/index.vue`: drop `alwaysTrust`, the switch row and `.skip_title_size`. `DappSessionVerification.vue`, `[id].vue`: drop the switch row, `isTrusted`, `toggleTrust`; keep the grid and caption under `connected-app-verification`. `dapp-session/{service,client,spec}.ts`: drop `setTrustedVerification`; one comment on the kept field ("read by nothing; kept because the row MAC covers it").
- Component tests, `verify/index.window.test.ts`: a `test.each` over `isReconnect` "false" and "true", wire-shaped (`verificationHash` 64 lower-case hex): the grid from the URL's hash and both controls render, and no `verify-always-trust-toggle` exists (never-happens beside the grid); They match reports the URL's hash then closes; They don't match refuses the row's own pair then closes. Delete `:205`; drop the switch clicks at `:283`, `:330` (keep their refusal and latch assertions) and the no-trust assertions at `:232`, `:287`, `:343`; drop the stub at `index.test.ts:37`.
- e2e: `session-reconnect.test.ts` becomes one scenario: connect, disconnect, reload, reconnect; `recordCreatedWindows` sees exactly one window on the reconnect, the check, with `isReconnect=true` and no `connect-step-bar`. It proves the remembered path end to end in a browser, which a unit test cannot; estimate: about half of today's file, one case removed. `fixtures/popups.ts` loses `alwaysTrust` (fix `:220-230`); `connect-verify-mismatch.test.ts:81` waits on the grid block; `connect-one-window.test.ts` drops `TRUST`.
- Docs: `ARCHITECTURE.md:181`; e2e comments per recon § Docs, plus `verify-hold.test.ts:20`, `session-reconnect-flood.test.ts:12`.
- **Gate:** Phase 2's commands plus `bun run audit:vue`; at load1 < 150, retry 0, Chrome then `NULO_E2E_BROWSER=firefox`: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/{session-reconnect,connect-verify-mismatch,connect-one-window,session-reconnect-flood,verify-hold,connect-locked-queue}.test.ts`. Pass: all green on both; `session-reconnect.test.ts` duration, base and after, per browser.

## Decision ledger

- **D1 (OA-1, owner's):** remove both switches; the PR stays a draft until the owner answers. Codex and Opus agree; P28-04 never names the Settings surface, so only the owner can lift the draft.
- **D2:** keep `trustedVerification` in the schema and type, inert (Fact 5). Both agree.
- **D3 (OA-2):** keep the deletion on They don't match (P2-09); the code ships as today, and the PR leaves draft only on the owner's OA-2 answer. Both agree it is the owner's.
- **D4:** remove `needsWindow`. Codex: a mode no production caller uses, kept for tests, is generality nobody asked for. Opus dissented: a behaviour-free refactor of a security state machine, and `background.admission.test.ts:177` proves the rate with windows. Taken: the gate's invariant becomes "every admission reserves a slot", and a separate commit keeps it reviewable.
- **D5:** no new e2e file; `session-reconnect.test.ts` is the brief's scenario; covered consent across a reconnect is `connect-locked-queue.test.ts`'s and `dispatcher.test.ts:2245`'s. A row with the flag cannot be made through the UI after Phase 3, so the unit and callback tests prove it. Both agree; Opus's window-recorder proof taken over a target snapshot.
- **D6:** no sdk change. The missing wallet-side signal is P14-05's record (decision page 14, `archive/dapp-dispatch-hold/plan.md` § Outcome); A widens it to every remembered reconnect. The dropped early `DISCONNECT` is filed `blocked:external` at close-out.

## Audit verdicts

| Leg | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex r1 (01a14606) | conditional approve | Fact 2 wording; refusal-teardown needs admission; missed switch clicks `:283, :330`, stubs, `:52` row type, hold docs, `:295` title; open-window availability documented, no machinery; the page-side disconnect qualified and filed; D4 remove; D3 to the owner (OA-2) | none |
| Codex r2 (resumed) | conditional approve; D4 removal stands (`releaseIfUnstarted` is production behaviour and refunds no token) | D4 map completed (`consume`, `approveAdmitted`, `persistAndApprove`, `attach`; checks kept, only `:326` goes); OA-1's lost-disconnect wording (the call can wait up to the sdk's 300 s heartbeat); OA-2 gates ready | none |
| Codex r3 (resumed) | approve: all three conditions met, no regression | none | none |
| Impl Codex r1 (01a14639) | approve | `approveVerify`'s comment claimed a closed check proves the calls were released (a stale check closes with no hold) | none |
| Impl Codex r2 (resumed 01a14639) | approve: fixes verified, no new material finding; the known-limit disposition holds (availability only, no check bypass, cap never exceeded) | none | none |
| Impl Opus review | approve | stale comments (`fixtures/send.ts:8`, `popups.ts`), history wording in two test titles and `test-services.ts`; a remembered reconnect's slot outlives a tab torn down before key exchange (about 65 s) and a slow wallet pick loses it: plausible, pre-existing for untrusted rows, folded into the close-out known limit (a fix needs per-tab admission state) | none |
| Opus r1 | conditional approve | no orchestrator sign-off clause in OA-1; "Reject" label and D3 to the owner; refusal-teardown pattern; `:711-743` r3 queues at the cap; drop the release-spy table, fold `:807` into `:786`, drop `remember`'s flag; comment sites; stale-window known limit; ask whether the switch was on; Security claim narrowed; evidence lines; suite wall-clock per the e2e skill | D4 keep (above) |

## Delivery

- Single arc, single PR: `feat(dapp): show the emoji check on every connection, remembered apps too` (75 characters). Body: what changed and why, P28-04 quoted, the gates with outcomes, each browser's network suite wall-clock before and after (`.claude/skills/e2e-testing/SKILL.md` § Runtime budget), light and dark shots of the second connection and of Settings → Connected apps → the app, `Closes #587`. Opened as a draft; marked ready only once the owner has answered OA-1 and OA-2 (OA-2's answer may be "as today").
- Phases 2 and 3 share files, so they run serially; no lanes.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at aa2cfcac. Specific to this plan:
- Step 1 is absent (`code_review: off`).
- Step 2, once over the net diff from aa2cfcac after Phase 3 is green: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; hard stop at three rounds; rounds logged in `lessons/phase-3.md`.
- Step 3: `gh pr create --draft`, then `gh pr checks <n> --watch`; add `e2e:extension-network` only if the path filter skipped the network lane.
- Step 4: close-out as the PR's final commits. File first, after a dedupe search: one `blocked:external` issue (the sdk drops a wallet `DISCONNECT` that arrives before the page's `confirm()`) and one closed `known-limit` (open check windows: slots, a stale check's refusal as OA-2 left it, the global cap), each with its trigger and reopening condition; the upstream issue links the sdk lines in recon § 1. `Known limits:` and `Open items:` name them.
- Step 5: slug `emoji-match-1`, trunk `dev`; `agent-worktree done emoji-match-1 --merged` once `git cat-file -e FETCH_HEAD:implementations-plan/archive/emoji-match-1/plan.md` succeeds.

## Seeds

```
/goal Phases 2 and 3 of implementations-plan/emoji-match-1/plan.md marked ✓, each backed by its gate passing in the transcript; LESSONS_FILE printed per phase; the Codex loop converged on the net diff (a resumed pass with no new material finding, quoted); a draft PR closing #587 exists (gh pr view), with the close-out's archive-move commit shown; bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/emoji-match-1 forward per its plan.md and the README § Post-implementation standard at aa2cfcac: reality check (plan.md, lessons/, git status, PR checks); next pending step; fast gates after each edit; e2e only at load1 < 150; decide with Codex, never wait; the PR stays a draft until OA-1 and OA-2 are answered; never merge.
```
