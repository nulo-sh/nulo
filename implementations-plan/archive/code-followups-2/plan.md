---
plan: code-followups-2
tier: mid
status: completed
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 Explore agents (sonnet); dual audit (Codex gpt-6.1-sol high + Opus Plan); one final fresh Codex pass
base: origin/dev at f557e20 (recon read at 61060c0; #56 and #74 merged in between)
trunk: dev
issues: [85, 95, 102, 120, 121, 145, 150, 155, 169, 173, 175, 176, 177, 185, 187, 193, 202, 210]
---

## Outcome

- **Date**: 2026-10-09.
- **Status**: completed. Three PRs against `dev`, one per arc (D-orch-1: no stack), merged in order; this close-out is a fourth, docs-only PR.
- **Shipped**:
  - #237, Arc 1 (wallet services): entries 10, 37, 64, 65, 95, 102 and 132 whole; closed #85, #102, #120, #121, #145, #150 and #175. A selector/name mismatch is refused as a scope refusal (code `4100`, "Not allowed" in History and Home's Recent activity, owner-signed OA-2 option A); a profile deletion purges its JSON-broken account rows by key; two log lines redacted; one profile projection; one batch size; nine `z.nativeEnum` calls moved to `z.enum`.
  - #234, Arc 2 (extension pages, build and e2e harness): entries 26, 130, 135 and 152 whole, 125, 126, 172 and 186 in part; closed #95, #173, #177, #187 and #202. Submit latches on Recovery phrase and Change password; only `.vue` files are routes; auto-import declarations overwritten on each build; the in-run e2e teardown waits on and escalates the whole process group; `probeAnvil` checks the chain id; two losing race timers cleared.
  - #238, Arc 3 (CI, release scripts and docs): entries 134, 142, 148, 150 and 163 whole, 108 and 149 in part; closed #176 and #193. The dead salt left every workflow; `docker-ci-like.sh` installs Bun and Node from hash pins; one shared workflow-command escaper; a static guard against workflow references in code; retired gotchas routed into the `e2e-testing` and `aztec-update` skills and `COMPOSITION-TESTS.md`.
- **Open items**: #155, #169, #185, #210, #239, GHSA-6cj6-wp78-52mc.
  - #155: the Node-side progress-stall watchdog and per-fork memory cap (entry 108).
  - #169: `resolve-ports` (never this lane's); a group whose leader exited before teardown, and the persisted-lock reaper, both need ownership evidence; nothing proves `--slots-in-an-epoch 1` (entries 125, 126).
  - #185: CLAUDE.md's release-runbook half, wrangler's `routes` rule and the refusal of domain changes, held while #235 edits CLAUDE.md (entry 149).
  - #210: FormPopup's raw order, non-contiguous orders after a re-open and the per-owner reducer policies, each visible and so the owner's call (entry 186).
  - #239: CLAUDE.md's Bun-bump list does not name `docker-ci-like.sh`'s pins (found in Phase 3.2).
  - GHSA-6cj6-wp78-52mc: fixed by #238; publish it with the release that carries #238 (entry 142).
- **Dropped, rejected or superseded**:
  - Entry 34: parked (D2), since either available fix changes which dApp registrations succeed, an owner call. Tracked privately: GHSA-cwcc-mvf5-w7m9.
  - Entry 107: found partly resolved, nothing built. Tracked privately: GHSA-hwrf-v993-jrv9.
  - Entries 29 and 183: found resolved (§ Scope has the evidence).
  - Entry 152's development-only CSP source: not built. The HMR socket is not refused, because crxjs serves the Chrome dev popup under Chrome's baseline extension policy (D-arc2-1).
  - Entry 172's other bullets (`balances.store.ts`'s `withTimeout`, the test `sleep` copies): kept as today, as the entry says; #202 carried only the two race timers.
  - The 177 entries under § Not this lane: untouched, each with its reason there; governance-1 (#236) turned each into an issue, an advisory or a recorded disposition.
  - Deleting the `SPONSORED_FPC_SALT` repository secret: the claim did not hold. On 2026-10-09 no secret of that name exists (two repository secrets, the release App's; the environments hold only AMO's two; no organization secret is shared with the repository), so the workflows were passing an unset secret and nothing is left to delete.
  - § Delivery's four-layer `gh stack`: superseded by D-orch-1. The final cross-arc Codex pass was not run: Arcs 1 and 2 ran in parallel and share no file, and Arc 3 branched from `dev` after Arc 2 landed and merged Arc 1 before its PR opened.
  - § Close-out edits to follow-ups.md: superseded by D-orch-2 and by #236, which retired the file.
- **Seeds retired**: the `/goal` and `/loop` seeds below are no longer live. Do not run them.

# code-followups-2: prune the follow-ups, ship the small code ones

This lane covers the open entries of `follow-ups.md` (retired by governance-1 at `be4d044`; each entry is now a GitHub issue, see `archive/governance-1/plan.md`) that are code work with no
design decision, and no visible change beyond one the owner has already signed off. It has three jobs:

1. Prune what is already resolved.
2. Build the small entries in three stacked arcs, grouped by subsystem.
3. List the rest under "Not this lane", one reason each.

Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none).

**UI impact.** One surface changes, on a sign-off the owner gave on 2026-10-08. Everything else
changes nothing a person sees.

- **The selector-binding refusal (entry 10, Phase 1.5).** This is the refusal a dApp call gets when
  the function name it claims does not match the function its selector runs. The sign-off is
  `archive/security-fixes-1/OWNER-ASKS.md` § "Answers: owner sign-off, 2026-10-08": "**OA-2 (#13): A,
  classify the refusal as a scope refusal.**" The orchestrator relayed it from the owner's decision
  page. Option A's before and after, as that ask spelled them out, plus the one surface the ask
  listed but option A's text left implicit (the class change the option names):

  | Where | Before | After |
  |---|---|---|
  | What the dApp receives | "The wallet could not process the request.", no code | code `4100`, "This request is outside the permissions you gave this app.", `data.walletErrorCode: "SCOPE_VIOLATION"` |
  | Card subtitle, in History and in Home's Recent activity (one card component) | "Transaction failed" | "Not allowed" |
  | Journal detail label | "Stopped before broadcast" ("Your wallet caught this before reaching the network…") | "Not allowed" ("The app asked for more than you allowed. Nothing was sent.") |
  | Journal detail, developer-mode raw error (OA-2's surface 1) | message "Scope violation: call name does not match selector's function", `"name": "Error"` | the same message, `"name": "ScopeViolationError"` |

  The "before" images are security-fixes-1's `oa2-*-after-*` shots, which show today's tree. Its
  `oa2-*-before-*` shots show an older raw text that still named the functions and the address.
  Phase 1.5 produces the after-shots of these popup surfaces for the PR.
- **One log-level change with no screen, named so a reviewer can check it.** Phase 1.5 moves this
  refusal's two log lines from `error` to `debug`: the wallet's "Method X failed" line, through the
  existing `isExpectedRefusal` list (it already names `ScopeViolationError`, so `background.ts` is
  not edited), and `executeOperations`' "failed" line, through its own `debug` branch beside the
  Terms refusal's in `logOperationOutcome`. Logging a refusal at `debug` is the logging policy's rule
  for a refusal a dApp can repeat.
- **Log text that changes:**
  - Phase 1.1: the transfer ladder's debug reason becomes the fixed text `base fee fetch failed`.
  - Phase 1.1: the restore's registration warning drops the error message from its text and passes
    the error as a separate argument that the redactor reads. Its level stays `warn`.
- **Routes and the development build:**
  - Phase 2.2: 22 helper modules stop being route records. Nothing links to them.
  - Phase 2.4: changes the `bun run dev` build only, if its probe shows the dev server's live-reload
    (HMR) connection is refused. The production manifest's policy stays byte-identical, pinned by
    `manifest.test.ts`.

## Tier and budget

The orchestrator set the tier to `mid`. On the rubric, five of the six dimensions are low. The one
exception is the dApp-facing classification change (Phase 1.5). It is owner-signed, and its
mechanism, envelope and labels already exist for the same refusal raised by the grant check. No
storage shape, crypto or key material changes. The lane is wider than one feature, so it splits into
three arcs.

## Outcome & Quality Bar

**For whom:**

- the maintainer and the agents who read `follow-ups.md` at the start of every plan;
- the CI reader;
- the person holding funds, who must notice only the signed-off label change;
- the dApp developer, who gets a classified refusal where today they get an unclassified one.

**What excellent looks like.**

1. `follow-ups.md` is true at close-out:
   - every entry this lane resolved, or found resolved, is gone, with its evidence in this plan;
   - every partly built entry is rewritten to what is left;
   - every parked entry is untouched.
2. Each built entry lands with the smallest test that fails before the change and passes after it.
   Every never-happens assertion sits beside a success control, and no test is weakened to go green.
3. Entry 10 matches option A exactly, end to end: the dApp's envelope and the journal row's kind are
   asserted in a network e2e, and the after-shots are attached to the PR.
4. No file that an open PR (#55, #58, #75) or an in-flight lane (accessibility-1, type-roles) changes
   is touched, except the shared planning files at close-out.

**Good enough.**

- Entries 108, 125, 126, 149, 172 and 186 are partly built, and their entries are rewritten to the rest.
- Entry 132 leaves its ninth call (`dapp-session/spec.ts`, PR #58) unless #58 has merged when Arc 1
  starts.
- Entry 152 may end as evidence, not code: if the probe shows the HMR connection is not refused, the
  entry is deleted on that evidence.

## Scope

### Triage of the 202 entries

`follow-ups.md` held 202 entries at `f557e20` and 195 at `61060c0`; the brief's 175 did not hold.
Recon checked every entry against the tree and the merged PRs. The full table, with the recon verdict
per entry, is in [recon.md](recon.md) § Triage.

| Disposition | Count | Entries |
|---|---|---|
| Built whole, deleted at close-out | 16 | 10, 26, 37, 64, 65, 95, 102, 130, 132*, 134, 135, 142, 148, 150, 152†, 163 |
| Built in part, rewritten | 6 | 108, 125, 126, 149, 172, 186 |
| Resolved, deleted | 2 | 29, 183 |
| Partly resolved, rewritten | 1 | 107 |
| Kept, with a reason | 177 | § Not this lane (which also lists 107, so it has 178 lines) |

\* Whole only if PR #58 has merged when Arc 1 starts; otherwise it is rewritten to its one remaining
call.
† Deleted either way: by the fix, or on the probe's evidence that nothing is refused.

Entry numbers are positions at `f557e20`. PR #75 adds four entries and rewrites one, so if it lands
first the numbers shift. The close-out matches entries by their text.

**Delete at close-out (resolved), with the evidence:**

| # | Entry | Evidence at `f557e20` |
|---|---|---|
| 29 | A restored token with a receipt opens the first-receive prompt | `trustRestoredTokens` runs on restore: `composables/useFullBackupImport.ts:374`, `composables/full-backup-restore.ts:568-578`, `incoming-transfer/service.ts:678-701` |
| 183 | The import-contacts sheet pushes the EXISTING tag off the card edge | The tag is gone: `ImportContactsPopup.vue` groups rows under section labels ("Already saved", `:57`), and `git log -S"EXISTING"` on the file gives `90f4fb3` (#36), whose body says the `EXISTING` and `INVALID` tags are gone because the section says it |

**Rewrite at close-out:**

| # | Entry | What is left |
|---|---|---|
| 107 | First-party service methods still trust a caller's `profileId` | Drop the `TokenService.addToken` example. It already refuses a `profileId` that is not its fence's (`token/service.ts:289`, `:513`). The account service's public methods (`createAccount`, `getAccount`, …) are the example now. Deriving the profile in the background stays the owner's call |
| 125 | The e2e teardown escalates on its group leader's exit | Phase 2.3 makes the in-run teardown wait on and escalate by the whole group. Left: the persisted-lock reaper (`killOrphanByPid`, `reap.ts`) still skips a group whose leader is dead, because a recorded pid proves no ownership once the original group is gone; reaping it needs ownership evidence, as `tests/e2e/fixtures/browser/ownership.ts` takes from an environment marker |
| 172 | Async drift kept as today | Phase 2.5 clears the two losing race timers (`importPreflight.ts`, `importChainSync.ts`). Left: `balances.store.ts`'s `withTimeout` settling one hop before a race, and the test-infrastructure `sleep` copies. The `auth-guard.ts` / `Header.vue` bullet already clears through `.finally`, the idiom the two fixed sites now share |
| 186 | Popup stacking drift | Phase 2.5 stops a disposed `useIncomingTrustPrompts` from registering its config listener after both clients disconnected. Left: FormPopup's raw order, non-contiguous orders after a re-open, and the per-owner reducer policies, each visible |
| 108 | proverless-network-stabilization left three items | Drop the third item (Phase 3.1 removes the salt from every workflow). Add: the `SPONSORED_FPC_SALT` repository secret is now read by nothing, and deleting it is a repository-settings change for the owner. The first two items stay |
| 126 | `probeAnvil` accepts any string result | Phase 2.3 refuses an L1 whose chain id is not 31337. Left: no RPC proves `--slots-in-an-epoch 1` (anvil 1.4.1's `anvil_nodeInfo` does not report it), so adopting a running anvil still trusts that flag |
| 149 | Route four retired gotchas to their owners | Only the CLAUDE.md half is left: wrangler's `routes` rule, and an agent session's refusal of domain changes. CLAUDE.md is in accessibility-1's file map. The skill and COMPOSITION-TESTS parts ship in Phase 3.5 |
| 132 | (only if #58 has not merged) Nine `z.nativeEnum` calls | One call is left: `dapp-session/spec.ts`'s `AccessLevel`, in PR #58 at planning time |

### What this lane builds

| Arc | Phase | Entries | What |
|---|---|---|---|
| 1 wallet services | 1.1 | 65, 102 | Fixed-category base-fee reason; the restore warning logs its error as an argument, and its comment is corrected |
| 1 | 1.2 | 37, 64 | One profile-projection helper; one balance batch-size constant |
| 1 | 1.3 | 95 | A profile deletion purges its JSON-broken account rows by key |
| 1 | 1.4 | 132 | `z.nativeEnum` → `z.enum` (8 calls, or 9 if #58 has merged) |
| 1 | 1.5 | 10 | The selector-binding refusal becomes a `ScopeViolationError` on the code channel and in the journal (owner-signed) |
| 2 extension, build and e2e harness | 2.1 | 26 | Submit latches and an unmount fence on Recovery phrase and Change password; an idempotent secret countdown |
| 2 | 2.2 | 135, 130 | Route only `.vue` pages; overwrite the auto-import declarations and drop the two stale globals |
| 2 | 2.3 | 125 (part), 126 (part) | The in-run e2e teardown waits on and escalates by the whole process group; `probeAnvil` checks the chain id |
| 2 | 2.4 | 152 | Probe `bun run dev` under the extension pages' CSP; if HMR is refused, allow it in the development manifest only |
| 2 | 2.5 | 172 (part), 186 (part) | Clear two losing race timers; a disposed trust-prompt composable registers no listener |
| 3 CI, release scripts and docs | 3.1 | 108 (part) | Remove the dead `SPONSORED_FPC_SALT` from every workflow |
| 3 | 3.2 | 134 | `docker-ci-like.sh` installs Bun and Node by version and SHA-256 |
| 3 | 3.3 | 142 | One shared workflow-command escaper, used at every TypeScript site in `scripts/` |
| 3 | 3.4 | 163 | A static guard against workflow references in code; rewrite the six comments it finds |
| 3 | 3.5 | 148, 149 (part), 150 | Route the retired gotchas into the `e2e-testing` and `aztec-update` skills and COMPOSITION-TESTS.md |

### Not this lane

The brief names no open GitHub issue for this lane. Two issues are tied to parked entries: **#24**
(strict mode's recovery bearer, entry 115) and **#15** (dApp calls dispatched before the emoji
check; PR #75 adds an entry for it).

The list below has one line per kept entry, grouped as `follow-ups.md` groups them. The reasons use
four shorthands:

- **"Owner …"**: the entry changes a screen, or a behaviour a person would notice, or asks for a
  product decision.
- **"in PR #n"** or **"accessibility-1's"**: another open line of work owns the file.
- **"Design"**: the entry needs a choice between options that the entry does not make.
- **"Needs runs"**: the entry needs live network evidence that a code lane cannot make small.

**(top of the file)**

- 1. The gas link — External trigger: unleashed has no public mainnet bridge yet.
- 2. Unleashed publishes no privacy notice — Owner call in another repository.

**Aztec V6**

- 3. Fetch the default token list instead of building it in, so that adding a token needs no release — Owner-parked: the fetched token list.
- 4. A V6 mainnet seed and its fee policy, when a V6 mainnet exists — External trigger: no V6 mainnet yet.
- 5. An automated live-transaction smoke, if wanted — Owner call ("if wanted").
- 6. `presto-banners` 1.2.0 — presto-banners renders the onboarding banner, so a bump can change a screen.

**Grants and scopes**

- 7. Every other failure before a dApp send is claimed reads "Popup closed early" — Copy call; `background.ts` is in PR #58.
- 8. A dApp cannot widen a contract-classes grant — A product change for its own plan.
- 9. Repeated scope refusals pile up in Activity — Changes which Activity rows show.
- 11. A refused dApp call's activity record is titled by the name the dApp claimed — Owner UI: it changes what History shows for a refused call.
- 12. `requestCapabilities` is allowed as a batch leg and opens a connect window … — Owner decision: the entry asks whether to refuse it, and the batched call answering as a top-level one is pinned on purpose (`dispatcher.test.ts`).
- 13. The dApp-session writers read raw stored grants — `dapp-session/service.ts` is in PR #58; the owner declined self-healing grants for now.
- 14. The published schema patch takes any string for `grantPublicAuthwit`'s two addresses (owner … — Owner ask OA-5, open.
- 15. A schema-valid address can still throw at a `String()` coercion — Design: refusing it at the parse needs a walk whose scope is a choice. A blanket own-`toString` refusal also refuses a legitimate artifact with a storage field of that name, and the precise walk is not small. It also changes the error a dApp receives.

**Send amounts**

- 16. The unit switch, Max and Refresh quote are mouse-only — Accessibility wave.
- 17. A press on Max while the destination holds the focus is lost — Changes the page or the press: owner call.
- 18. In USD mode a long derived amount wraps the line under the field — Owner layout call.
- 19. At rest the USD field hides its tail — Owner layout call.
- 20. A wrapped review line indents its symbol 4 px — Cosmetic call.
- 21. The fiat notice can say the price moved when it did not — Copy call.

**Wallet safety**

- 22. The address-keyed fee maps outlive a deleted profile off the live path — Needs its own decision.
- 23. An Allow the watchdog displaced mid-un-hide leaves receipts hidden under `trusted` — Accepted residual with a BUG PIN.
- 24. A pin or a token-deletion cleanup racing a profile deletion can recreate its pinned-tokens … — Accepted residual; needs a fencing design.
- 25. Two of the token add's compensations delete by id without lock ownership — Needs its own decision (entry says so).
- 27. Two keyboard focus rings do not show — Accessibility wave.
- 28. Send's token card has no focus style of its own — Accessibility wave.
- 30. The first-receive trust prompt shows no explorer link — New UI.
- 31. A deleted default token returns after a full-backup restore on a fresh install — Backup-slice design or an accepted gap: owner call.
- 32. `AccountService` creation and import share no critical section — Design: one critical section across creation and import.
- 33. Creating a profile waits for activation with no identity check or deadline — A deadline needs a failure surface the owner has not chosen.
- 34. dApp contract registration checks the artifact against `currentContractClassId` — Owner call: either fix changes which dApp registrations succeed. The entry's model check (`current == original`) refuses every upgraded instance at registration; binding the original id alone accepts an upgraded contract registered without an artifact, or with its original one. Both are visible to a dApp.
- 35. `connect-src` allows plain HTTP to any host (owner ask OA-4, open) — Owner ask OA-4, open.
- 36. `style-src` keeps `'unsafe-inline'` — Design: CodeMirror generates its styles at run time, so dropping `'unsafe-inline'` needs another viewer or a nonce scheme.
- 38. A lock the worker cannot persist is silent — Owner UI: it needs a visible message.

**Amounts, sends and fees**

- 39. Six surfaces still read a token without a decimals getter in base units — Changes how an edge-case value is formatted; "when next touched".
- 40. A mint outside the standard shapes shows no amount — Feature for its own plan.
- 41. A listed token's mint figure rests on its method's name and arity — Feature for its own plan.
- 42. An unlisted token's mint shows no amount; looking it up is its own plan — Feature for its own plan.
- 43. The authwit popups keep the 60 s ceiling — Removes a visible false failure; what the popups show while waiting is the owner's.
- 44. A definitive "won't go through" — Design; needs an upstream field.
- 45. A checked dApp send can leave its public authwit out of the revoke index — The revoke list would show a new row.
- 46. A chain prune after inclusion is caught by no send path — Design with its own copy.
- 47. A failed card beside a settled row for the same send — Owner UI call.
- 48. A neutral snack style for "Send not confirmed" — Owner UI call.
- 49. The status colours' contrast in the light theme — Accessibility wave.
- 50. A node's refusal at the send line reads "Not confirmed yet" for 30 minutes — Copy and design.
- 51. A checked record shows no tx hash or explorer link — Owner UI call.
- 52. Home's error snack covers the row above the tab bar — Owner UI call.
- 53. The Revoke authorizations and authwit registry popups never check the sponsor — Needs an estimate or a probe in each popup: design.
- 54. A dApp's embedded sponsor payment is never checked — Owner UI decision.
- 55. The dApp window offers no way to get fee juice when nothing can pay — Owner UI call.
- 56. A Confirm before a sponsor-paid estimate returns skips the funding check — Accepted as today's behaviour.
- 57. A re-enabled Sponsored row reads "free" before it is checked again — Copy call.
- 58. The sponsor notice is not announced — Accessibility wave.
- 59. A hand-added sponsor that falls back to Nulo's names the payer by its row title — Copy call.
- 60. A failed first price fetch still ends Home's hero in "$0.00" — Owner decision.
- 61. Revisit the private-origin fee order when a funded sponsor ships on mainnet — External trigger: a funded mainnet sponsor.
- 62. An embedded fee payment with no `maxFeesPerGas` commits an unpadded cap — Design (FPC budget assertion).
- 63. The fee-estimate admission cap frees a slot while its simulation still runs — Design (offscreen ack).
- 66. Reopening the popup during a queued send shows a stage-less awaiting card first — Owner UI call; `RecentActivityView.vue` is accessibility-1's.

**Connecting a dApp**

- 67. The connect page's header names the active network, not the dApp's — Owner UI call.
- 68. The waiting connect window still says the dApp "wants to connect to your wallet" after … — Copy call.
- 69. The connect step bar's empty half barely shows — Accessibility wave.
- 70. A connect window whose wait fails closes with no message — Owner UI call.
- 71. The swap to the emoji check in the connect window is likely not announced to screen readers — Accessibility wave.
- 72. A dApp refused for want of a current Terms acceptance opens nothing in the wallet — Owner UI call.
- 73. A `sendTx` leg inside a dApp `batch` gets no queued journal record while it waits — Design; background.ts is in PR #58.
- 74. Ask upstream whether `@aztec/wallet-sdk` should refuse a discovery `requestId` that … — Upstream question.
- 75. A dApp that calls `executeUtility` on a function that is not a utility gets the … — Owner call: a typed refusal changes the error text a dApp receives.
- 76. Deleting one profile's dApp-session row tears down another profile's live channel on the … — `background.ts` and `session-revocation.ts` are in PR #58; PR #75 rewrites this entry.

**Layout**

- 77. Home's two view links are mouse-only — Accessibility wave.
- 78. From a token's page, History should open filtered to that token — Owner UI call.
- 79. The two view links fail contrast — Accessibility wave.
- 80. Screen readers hear History's and Settings' title twice — Accessibility wave; `settings/index.vue` is accessibility-1's.
- 81. Home's section header against the drawing — Cosmetic call.
- 82. Onboarding ignores the stored theme — A person would notice.
- 83. Paste a token address into the Holdings search to add it — Feature.
- 84. Two Settings hub additions wait on the owner — Owner: both wait on the owner's word.
- 85. Account State still lives under `advanced` — Design: the move needs a redirect per child and new e2e ids.

**Copy**

- 86. Add token shows the PXE store's developer errors verbatim — Copy call.
- 87. A password profile's unlock that fails for an unexpected reason shows nothing — Copy call.

**Incoming transfers**

- 88. New incoming public transfers wait on a from-zero history scan — Owner-parked: the tip-first scan.
- 89. A reorg that re-mines a surviving incoming transfer emits nothing — Owner call: emitting it changes what an open page shows.
- 90. Incoming note rows are never reconciled against the PXE — Design.
- 91. An opt-in "Privacy maxi" setting (deferred) — Owner feature.
- 92. Only transactions get explorer links — Owner UI call.
- 93. The incoming-transfer pollers call dRPC every 30 s per watched token, on the shared key — Product call.
- 94. `repository.setTrust`'s own await is unfenced on both arms — Design: fencing the write's own await means choosing delete-after-write or stand-down. A profile id can come back through a restore, so the balance queue's successor rule does not carry over, and four pinned scenario rows change.

**Backup and storage**

- 96. The migration engine has no watchdog on `up()`, an accepted audit residual — Decide before the first real migration: design.
- 97. An edited Local Network reads "InvalidChain" and drops out of full backups (the owner made … — Owner nice-to-have design.
- 98. Report the handshake-loss behaviours to aztec-packages — Upstream report.
- 99. Recovery for installs that already lost a third-party note — Owner call.
- 100. Nothing stops a second own window for the same flow — A person would notice (focus instead of a new window).
- 101. A contract class id does not commit to ABI metadata — Upstream: the class id does not cover ABI metadata; needs its own design.
- 103. A lock or a profile switch can break a contacts import — Owner sign-off: either shape changes what a person sees.

**Older plans' residuals**

- 104. account-switch-isolation's restructuring stages were not built — Design.
- 105. No network e2e proves two concurrent NO_FROM sends serialize and both confirm — Blocked: no NO_FROM-compatible private call.
- 106. Owner check — Owner check on a Mac.
- 107. First-party service methods still trust a caller's `profileId`, such as … — Owner call: deriving the profile in the background (rewritten, § Scope).
- 109. Onboarding has no "Grant access" step for Presto on Firefox — Owner UI call.
- 110. The Ready-handshake transport rework is parked, for its reach — Owner-parked: the Ready-handshake rework.
- 111. `ConfirmPopup`'s passkey confirmation is dead — ConfirmPopup.vue is in PR #55.
- 112. A passkey profile created in the page saves a second passkey when its confirmation fails … — A person would notice.
- 113. Owner checks on a Mac — Owner check on a Mac.

**Tests and e2e**

- 114. Test whether `withStaleAnchorRetry` retires the e2e's 5 s anchor sleep — Needs repeated retry-0 network runs: one green cannot prove a sleep safe.
- 115. The strict-mode opt-out restore has no e2e — Needs an e2e design for the restart; tied to #24.
- 116. `passkey-backup.test.ts`'s export case is skipped on CI and fails on a fast host — `passkey-backup.test.ts` is in PR #55.
- 117. The playground's multicall sends nonces the standard Token refuses (inferred from the … — Needs a live run to establish, then a playground change: not small.
- 118. No e2e shows a discovered authorization's transfer row — Needs a network that publishes the standard contracts.
- 119. No e2e shows a private transfer's row — A new playground control plus a private-balance e2e: not small.
- 120. CI builds no Storybook, so a change that breaks `bun run --cwd apps/extension … — Adds CI minutes to quality-status: owner call.
- 121. An earlier green copy of a required check stands while a later run of the same head works — Accepted window.
- 122. A PR run decides from its own event's snapshot, and runs can reach their concurrency group … — CI design: it changes how a required aggregator decides.
- 123. The e2e aggregators trust GitHub's fold of a shard matrix — Unverified report; CI design.
- 124. Two local worktrees can pick overlapping e2e ports — Design: a shared host port registry.
- 127. `network/store-captures.test.ts` is red on `dev` (opt-in, `STORE_CAPTURES=1`, Chrome only) — Opt-in suite; how the Send frame reads is the owner's call.
- 128. A smoke build still contacts live hosts — Needs a smoke run with egress logging to find what reaches the live hosts.

**Dependencies and supply chain**

- 129. `hoist = false` is still not set — Its own gate after a soak.
- 131. Retire vitest's interop stopgap — Waits on vitest 5.0.1 or later.
- 133. Five declined third-party-notices items wait on their triggers — External triggers.

**Release**

- 136. The store launch's owner steps are open — Owner steps.
- 137. S2 and S3 wait on the first release on the new flow — Waits on the first stable release on the new flow; repository settings.
- 138. The new release flow's live proofs — Waits on the first stable release on the new flow.
- 139. Nightly tags and releases are kept forever — Owner retention call; repository settings.
- 140. A store-match check — Supply-chain follow-up; design.
- 141. CodeQL alert 23 re-raises dismissed alert 1 (`actions/cache-poisoning/poisonable-step`, … — The owner dismisses it in Code scanning; repository settings.
- 143. The store's "security" capture now frames the Lock page — Owner: how the store capture frames the page.
- 144. Privacy § 5.3 still names Settings → Advanced — Owner and legal: a new privacy version at the release that carries it.

**Plans, docs and tooling**

- 145. The plans `.gitignore` catches only four transcript shapes — Owner call (entry says so).
- 146. No release step refuses a stable publish while a `«FILL»` placeholder survives in `legal/` — Release-process gate: owner call.
- 147. Every document log line, debug included, crosses to the worker as an RPC — Design: the client has no level to gate on, and a cached level goes stale on a toggle. A traffic cost, not a leak.
- 151. The extension's Vite and vitest configs warn under Vite's planned native config loader — A test-runtime config change: the soak matrix is its bar.

**Issues**

- 153. The fee-cap change's post-audit proposals, to re-check against the tree (the fee code has … — Design.
- 154. A resurrected late-mined authwit transaction leaves its registry row pending forever — Design; no site cited.
- 155. Accounts deployed under an older artifact than the wallet's aztec.js — Design; no site cited.

**ux-feedback: owner decisions**

- 156. The full-backup import's yellow warning reads at about 1.6:1 on the light theme … — Owner decision.
- 157. A Retry on the import's errors screen that fails again returns a pixel-identical screen, so … — Owner decision.
- 158. The import's error viewer lists networks by id, and onboarding's `View errors` notice says … — Owner decision.

**ux-feedback: technical**

- 159. vitest 4.1.10 never re-runs a fixture setup that failed — Waits on a vitest release.
- 160. A full backup's account-state still carries the contracts every PXE boot registers, once … — Backup-format design.
- 161. An import could also skip the profile's own account contracts and Nulo's protocol sponsors, … — Backup-import design.
- 162. A popup closed during the import's account-state tail loses its per-network outcome — Owner design.
- 164. The e2e tree does not type-check — 103 type errors to fix first: its own plan.

**harden-dedupe: robustness**

- 165. No CI lane proves in browser WASM, the default for every user without Presto — CI minutes: owner call.
- 166. An unknown `priorityLevel` from malformed internal popup RPC input — Owner lead: `operation-estimate-reuse.pins.test.ts:344` keeps the throw on purpose.
- 167. `safe_json_rpc_client` returns `undefined` for a null-like node result before schema … — Upstream code.
- 168. Account RPC params are not schema-validated — Not small: a params schema per account method, and its texts are copy.
- 169. The SDK `chainInfo` decoder folds non-canonical fields onto canonical composites — Changes which dApp sessions resolve.
- 170. An NBSP in an RPC URL passes Zod's trim, then fails the adapter as "RPC didn't respond", or … — A stricter URL check refuses input in Settings.
- 171. `TooManyPendingError` does not survive a port (a pinned omission) — Pinned omission: survival changes what a dApp receives (`-32005`).
- 173. Decode drift kept as today — Kept as today by its record's decision; aligning the decoders changes what the shipped decoder accepts.
- 174. The incoming arms differ in dedupe order, call counts and record timing — Design.

**harden-dedupe: deferred dedup**

- 175. Program-level deferrals, each with its reason — Deferrals, each with its reason.
- 176. Fee and reuse helpers that would add an await or move reads — Would add an await or move reads.
- 177. Row lifecycle — Design. Its cited names moved (`unsealImportedKey` is `unsealImportedSigningKeyV2`; `settleRegistryTx` is gone) and the reorder it describes is not located at `f557e20`; whoever picks it up re-locates it first.
- 178. Popup reducers the harness cannot stage — Test design: the harness cannot stage these reducers.
- 179. Visual shells left local — Visual shells: cosmetic.
- 180. Smaller residue — An accepted-complexity copy of upstream; narrowing `RestoreData` needs guards in its readers.

**harden-dedupe: owner UI and drift**

- 181. BalanceView's add has no id dedupe (`BalanceView.vue:236-240`) — Owner UI drift (section rule).
- 182. Enter at a failed full-backup import re-runs the restore while its button is disabled … — Owner UI drift.
- 184. Change password reveals current, new and repeat together from one flag — Owner UI drift.
- 185. Journal rows have two profile rules and three network rules across Home, TokensView and … — Owner UI drift.
- 187. Detail pages — Owner UI drift.
- 188. LogsViewer appends the first live log line to the last loaded line with no newline, because … — Owner UI drift (the log viewer's text).

**harden-dedupe: tests and CI**

- 189. The extension's test count was once nondeterministic, 8,797 against 8,798 across runs — A watch item: the entry itself says what to do if the count moves again.
- 190. A recurring Firefox network-lane flake — Needs runs to reproduce; flake-ledger row 4.

**harden-dedupe: behaviour-alignment**

- 191. Home's in-progress card shows "0" for an empty `amountRaw`, where finished cards show no … — Owner UI call.
- 192. Two more popups compare names untrimmed — A person would notice a duplicate now blocked.
- 193. NewSenderPopup's own shake ignores reduced motion — Accessibility wave.
- 194. "Disable animations" stops transitions, not keyframe animations — Accessibility wave.
- 195. Merge the skeleton shimmer twin in … — Cosmetic CSS: a visual check for no gain in behaviour.
- 196. At the 25-character name cap, the contact popups block a duplicate but show only "Maximum … — Design-system decision.

**harden-dedupe: same-token concurrent sends**

- 197. Confirm a queued send at once, then estimate and send it when unblocked (the owner's choice) — Owner-parked: queued same-token sends.
- 198. dApp sends are not ordered behind earlier sends until inclusion — Owner-parked family: send ordering.
- 199. Three send-ordering questions carry a working answer — Working answers for the owner; one already in code.
- 200. Send-ordering residuals that fail as before, never worse — Design.
- 201. The send chaos run's nightly jobs are advisory — Promote or drop after weeks: owner call.
- 202. A fee-method click right after a dApp send may not take — Product behaviour.

## Architecture & Implementation

Every change reuses a pattern the tree already has ([recon.md](recon.md) § Reuse map). Nothing adds a
layer, a dependency, a storage shape or a new message. Paths below are relative to
`apps/extension/src/wallet/services/` unless they start with `apps/`, `packages/`, `scripts/` or `.`.

### Arc 1: wallet services

- **1.1 Logs (65, 102).**
  - `execution/transfer-estimate-reuse.ts`: the base-fee catch returns the fixed
    `"base fee fetch failed"`, as the operation ladder's `feeReadFailed` does. Its soft miss stays.
    The transfer ladder deliberately swallows a bad multiplier where the operation ladder rethrows,
    so that behaviour is not copied. The now-unused `getErrorMessage` import goes.
  - `account-state/service.ts` `classifyRestoreFailure`: the warning becomes
    `` this.logWarn(`restore: registration failed on ${networkId}`, err) ``. `trim()` then projects
    the error, scrubbing URLs and capping the message. The returned `message` still feeds
    `restoreError` and `reg.unreachable`. The comment is corrected: the same per-item text reaches
    the import's error viewer.
- **1.2 One projection, one constant (37, 64).**
  - `profile/spec.ts` gains a pure `toProfileInfo(profile, recoveryMode)`. `ProfileService.getProfileInfo`,
    `profileIdentity` (the `false` case) and `SessionManager.toInfo` call it. The bodies are identical
    today, including `recoveryMode` being absent when false; the helper keeps that.
  - `token-balance/spec.ts` exports `BALANCE_BATCH_SIZE = 12` beside `MAX_SYNC_FAILURE_MESSAGE_LENGTH`.
    `balance-projector.ts` and `balance-job-queue.ts` import it; the two local constants go. One
    sentence says why it is shared: the queue's drain limit is the projector's chunk.
- **1.3 Broken account rows (95).**
  - `purge-rows.ts` `purgeMalformedRows` gains an optional final
    parameter, `attributeByKey?: (storageId: string) => boolean`. It is consulted only when the value
    is syntax-broken JSON or not an object. A key it attributes goes through the existing path:
    `onMatch`, then the `rawValue` re-read guard, then `delete`, then `onPurged`.
  - The other eight callers pass nothing and behave as today.
  - `account/service.ts`'s raw pass passes `(id) => parseAccountRowId(id)?.profileId === profileId`.
  - The doc comment's "accepted gap owned as a follow-up" sentence is replaced by what the parameter
    is for.
  - The parse-or-key decision goes in a small pure helper, so `purgeMalformedRows` stays under the
    cognitive-complexity budget (it scores about 10 today) with no suppression.
- **1.4 zod enums (132).** `z.nativeEnum(X)` → `z.enum(X)` at `account/spec.ts`, `fpc/spec.ts`,
  `network/spec.ts`, `operation-journal/spec.ts` (×2), `transaction/spec.ts` (×2) and
  `packages/aztec-runtime/src/pxe/schemas.ts`. `transaction/spec.ts`'s comment "(not nativeEnum)"
  becomes "(not an enum schema)". If #58 has merged when Arc 1 starts, `dapp-session/spec.ts` too.
- **1.5 Scope refusal (10).**
  - `execution/contract-resolver.ts`: `selectorBindingRefusal` returns
    `new ScopeViolationError(…)` with the same fixed text. "Method not found" stays a plain `Error`.
  - `execution/rpc-cancel.ts`: `ridesCodeChannel` adds `ScopeViolationError`. It meets the stated bar:
    the dApp contract is the owner-ratified 4100 envelope, and the constructor takes the message
    alone, so rebuilding it is lossless.
  - `execution/mark-failed-unless-cancelled.ts`: `markFailedUnlessCancelled`, the dApp send path's
    only caller, records a `ScopeViolationError` as `"scope_refused"`. The shared `failureKind` is not
    changed, because the first-party Send path (`transfer-executor.ts`) also uses it and its record
    must never read "The app asked for more than you allowed" (D21).
  - `execution/service.ts` `logOperationOutcome`: a second `debug` branch, beside the Terms
    refusal's, for `ScopeViolationError.CODE`, with its own fixed text (`refused: outside its
    grant`); the function's comment names both refusals (D22). Without it every refused call still
    writes one `error` line, and folding it into the Terms branch would log a false reason.
  - `packages/extension-messaging/src/errors.ts`: the `ScopeViolationError` doc comment says it is
    raised by the grant check **or** by the execution-time check that a call's selector runs the
    function its name claims. The current text says "before any window opens or anything runs",
    which stops being true.
  - `wallet-sdk/error-envelope.ts`: the comment on the `ScopeViolationError` branch says the grant
    "refused the call before execution". It becomes "the call is outside its grant", which holds for
    both checks.

### Arc 2: extension pages, build and e2e harness

- **2.1 Submit latches (26).**
  - `apps/extension/src/composables/useSecretCountdown.ts`: `start()` calls `clear()` first. A
    `disposed` flag set by the existing `onScopeDispose` makes a later `start()` arm nothing.
  - `popup/pages/settings/security/export/seed.vue`:
    - `handleUnlock` returns at once while a retrieve is in flight (a plain `let`, not bound to the
      template, so nothing renders differently);
    - each retrieve takes `isCurrent` from a `createRunFence()`, and `onBeforeUnmount` invalidates
      it;
    - a retrieve that resolves after the page left sets nothing and starts no countdown.
  - `popup/pages/settings/security/change-password.vue`: `handleChangePassword` returns while
    `isLoading`.
- **2.2 Routes and declarations (135, 130).**
  - `apps/extension/scripts/pages-options.ts` adds `extensions: ["vue"]`. Every page in the five
    scanned directories is a `.vue`, and the 22 helper `.ts` modules stop being routes. The test
    excludes stay, because they still guard a `.test.vue`, and the dev-watcher test plants one so it
    still exercises them.
  - `apps/extension/vite.config.ts` sets `dtsMode: "overwrite"` on `useAutoImport`. One `bun run build`
    regenerates `src/types/auto-imports.d.ts`; its two stale globals (`:280`, `:287` at `f557e20`)
    go. `.eslintrc-auto-import.json` holds neither. The CI step that fails on a diff under `src/types/` then catches a removed export too.
- **2.3 Process groups and the L1 probe (125 part, 126 part).**
  - `killProcessGroup` moves out of `global-setup.ts` into a new side-effect-free module,
    `apps/extension/tests/e2e/process-group.ts`, with an optional grace period (default 5 s) and a
    result that says whether it escalated. Importing `global-setup.ts` registers process signal
    handlers and creates a data directory, so a unit test cannot import it.
  - It waits until the group, not the leader, is gone (`process.kill(-pgid, 0)`), and sends the group
    `SIGKILL` if any member is left after the grace period. The leader-only `child.kill` stays as the
    fallback when the group signal throws.
  - This acts only on a child this run spawned and still holds. While any member of that group lives,
    POSIX keeps its ID from being reused, so the group signalled is the one the run created.
  - The persisted-lock reaper (`lockfile.ts` `killOrphanByPid`, `reap.ts`) is **not** changed. A pid
    recorded by an earlier run proves no ownership once its group is gone, and that ID can be reused
    by another agent's group whose leader has exited. Its "leader dead" gate stays, and entry 125 is
    rewritten to that half (D9).
  - `probeAnvil` moves to a second new side-effect-free module, `apps/extension/tests/e2e/anvil-probe.ts`.
    It also asks `eth_chainId` and accepts only `0x7a69` (31337, the chain id `ensureAnvil` spawns
    with), and it requires the `eth_blockNumber` result to be a hex quantity. A listener that fails
    the check is not adopted: the spawn then fails on the busy port, loudly.
- **2.4 Development CSP (152).**
  - First the probe:
    - claim port 8088 in `~/.agents/ports.md` (the dev server is fixed there with `strictPort`);
    - run `bun run dev` in its own process group;
    - load `dist/chrome` in the e2e Chrome and open the popup;
    - record, over CDP, the HMR WebSocket's creation and handshake (`Network.webSocketCreated`,
      `Network.webSocketHandshakeResponseReceived`) and every CSP violation reported to the console.

    A probe that saw no WebSocket attempt proves nothing and is rerun, not read as "not refused".
  - If the HMR socket is refused, `manifest/manifest.chrome.config.ts`'s existing
    `env.mode === "development"` branch also overrides `content_security_policy.extension_pages`
    with the production policy plus `ws://localhost:8088` in `connect-src`. That is the exact source
    the probe saw refused.
  - Firefox's dev script is a watch build with no HMR socket, so it needs nothing.
  - If the socket connects with no refusal, no code changes, and the entry is deleted on that
    evidence.
  - A refusal of anything other than the HMR socket is out of scope: stop and record it as a
    follow-up.
  - After the probe, rebuild `dist/chrome` with `bun run build:chrome`. A dev server leaves it wired
    to `localhost:8088`, which breaks a later e2e run.

- **2.5 Two invisible cleanups (172 part, 186 part).** The record that kept these allowed "an
  invisible, strictly safer fix … if it moved no pixel, copy, dApp wire code or persisted byte and
  only added a cleanup" (`archive/harden-dedupe/plan.md` § Decision).
  - `apps/extension/src/composables/importPreflight.ts` and `importChainSync.ts`: each race keeps its
    timer handle and clears it when the race settles (`.finally(() => clearTimeout(timer))`, the
    idiom `popup/auth-guard.ts` `withinDeadline` uses). The race results are unchanged; only an idle
    timer of up to 5 s or 30 s stops outliving its race. The backoff `sleep` is a plain wait and
    stays.
  - `apps/extension/src/composables/useIncomingTrustPrompts.ts`: `dispose()` sets a `disposed` flag,
    and `seedVisibility` registers nothing after it. A visibility seed that settles after the popup
    unmounted no longer adds a listener to a disconnected config client.

### Arc 3: CI, release scripts and docs

- **3.1 The dead salt (108 part).** Remove the `SPONSORED_FPC_SALT` secret declaration and its `env`
  export from `.github/workflows/_extension-network-e2e.yml`. Remove every
  `SPONSORED_FPC_SALT: ${{ secrets.SPONSORED_FPC_SALT }}` pass, 20 sites:
  - `pr-extension-network-e2e.yml` (4);
  - `pr-extension-network-e2e-firefox.yml` (4);
  - `nightly.yml` (10);
  - `extension-network-e2e-soak.yml` (1);
  - `release.yml` (1).

  A `secrets:` block left empty goes too. `behavior-gating.test.ts`'s comparison of the Firefox jobs'
  `secrets` with the PR pool's still holds, because both lose the key.
- **3.2 Pinned bootstrap (134).**
  - `apps/extension/scripts/e2e/docker-ci-like.pins.sha256` holds one line per artifact, keyed by
    tool and version on the model of `setup-aztec/installer-pins.sha256`: `bun/1.4.2/bun-linux-x64.zip`
    and `node/v24.16.0/node-v24.16.0-linux-x64.tar.xz`, each with its SHA-256. The script is run as
    `--platform=linux/amd64` and setup-aztec pins x86_64 only, so it pins x64 only and refuses any
    other architecture with a clear error.
  - `docker-ci-like.sh` always installs the pinned binaries into its own directories and puts them
    first on `PATH`. The `command -v bun` / `command -v node` short-cuts go, so a tool already in the
    image is never used. It downloads each asset, checks it against the pin (`sha256sum -c`), then
    extracts it. The `curl … | bash` line and the `NODE_VERSION` override go.
  - The hashes come from the publishers' `SHASUMS256.txt` (Bun's GitHub release; nodejs.org). The
    implementer checks each against `sha256sum` of the artifact itself.
  - `scripts/ci-cd/docker-ci-like-pins.test.ts`, on the model of `setup-aztec-pins.test.ts`, asserts:
    - no line pipes a download into a shell, and no line short-cuts on an ambient `bun` or `node`;
    - every fetched artifact has exactly one pin, and the version the script installs is the one in
      the pin's key;
    - the Bun pin's version equals `package.json#packageManager`, so a Bun bump that misses this site
      fails CI.
- **3.3 One escaper (142, tracked privately: GHSA-6cj6-wp78-52mc).**
  - `scripts/release/workflow-command.ts` exports the `command(name, data)` / `plain(text)` pair. The
    two copies in `publish-chrome-store-run.ts` and `audit-gate.ts` have the same bodies; audit-gate's
    `command` narrows `name` to `"error" | "warning"`, and the shared one takes `string`.
  - Every TypeScript script that prints a workflow command uses it. The entry names two scripts; the
    audits found eight more sites, all moved in this phase:
    - `attach-assets-run.ts`: `fail`, the `::warning::` asset line, the top-level catch;
    - `publish-firefox-amo-run.ts`: `fail`, and both `::add-mask::` lines. Every ordinary line that
      carries AMO text goes through `plain`, as the Chrome script's `say` does: the validation errors,
      and the `check ok`, `version ok` and `published` lines, which print AMO's `status`, `channel`
      and `fileStatus` strings;
    - `lock-version-run.ts`: `fail`, and the top-level catch, which prints GitHub GraphQL error text;
    - `auto-unstick-run.ts`: the flag warning;
    - `scripts/publish/check-digests.ts`: the failure lines;
    - `scripts/ci-cd/assert-canary-results.ts`: both error lines;
    - the two files that held the copies.
  - `audit-gate.ts` re-exports `command` and `plain` only if a caller outside the file uses them.
    Recon found only its test, whose escaping case moves to the shared module's test.
- **3.4 Workflow-reference guard (163).**
  - `scripts/ci-cd/workflow-refs.test.ts` reads the tracked text files under `apps/`, `packages/`,
    `infra/`, `scripts/`, `.github/` and `.githooks/` (`git ls-files`, JavaScript regexes: D-arc3-2),
    excluding `*.md`, `*.json`, `*.svg` and the guard's own file.
  - It refuses review or audit findings and rounds (`review finding`, `review CONFIRMED`,
    `audit round`, `per audit`), reviewer names with a review word, and the milestone shapes
    CLAUDE.md bans: `M4.10`, `A11.1`, `pre-A11`, `phase 4b`, `PR-2`, `Stage D`, `Arc N`.
  - A bare `phase N` (live runtime phases) and plan paths (allowed while they resolve) are not
    matched.
  - The test carries a planted positive sample and a clean control. The six hits found today are
    rewritten to say the invariant without the provenance.
- **3.5 Docs routing (148, 149 part, 150).** Entry text moves into its owner, each with its record
  link rewritten to a live doc or kept as an archive path:
  - `.claude/skills/e2e-testing/SKILL.md` takes 148's eight gotchas in their topical sections, and
    150's three items: the awaiting-card hydration race and price-fixture's budget as rows 47 and 48,
    and row 4's second symptom file added to row 4 without row 4's
    cause.
  - `.claude/skills/aztec-update/SKILL.md` takes "grep `node_modules` for an unknown contract address
    before theorizing".
  - `apps/extension/tests/COMPOSITION-TESTS.md` takes "`svc()`'s `as never` hides a stub's missing
    method from typecheck".

### File-level change map

| Phase | Files changed | Tests changed or added |
|---|---|---|
| 1.1 | `execution/transfer-estimate-reuse.ts`, `account-state/service.ts` | `execution/transfer-estimate-reuse.pins.test.ts` (3 pins), `account-state/service.test.ts` (new log case) |
| 1.2 | `profile/spec.ts`, `profile/service.ts`, `profile/session-manager.ts`, `token-balance/spec.ts`, `token-balance/balance-projector.ts`, `token-balance/balance-job-queue.ts` | `profile/spec.test.ts` (helper), `token-balance/balance-projector.test.ts` (label only) |
| 1.3 | `purge-rows.ts`, `account/service.ts` | `purge-rows.test.ts`, `account/service.test.ts` |
| 1.4 | `account/spec.ts`, `fpc/spec.ts`, `network/spec.ts`, `operation-journal/spec.ts`, `transaction/spec.ts`, `packages/aztec-runtime/src/pxe/schemas.ts` (+ `dapp-session/spec.ts` if #58 merged) | `network/spec.test.ts` (one enum row each way) |
| 1.5 | `execution/contract-resolver.ts`, `execution/rpc-cancel.ts`, `execution/mark-failed-unless-cancelled.ts`, `execution/service.ts` (`logOperationOutcome` only), `wallet-sdk/error-envelope.ts` (one comment), `packages/extension-messaging/src/errors.ts` (doc comment) | `contract-resolver.test.ts`, `rpc-cancel.test.ts`, `mark-failed-unless-cancelled.test.ts`, `wallet-sdk/error-envelope.test.ts`, `execution/service.composition.test.ts` (one log-level case, on its existing `logError` spy pattern), constructor flips in `fast-path.test.ts`, `authwit-discoverer.real.test.ts`, `service.authwit-binding.test.ts`, `view-executor.test.ts`, `tx-request-builder.pins.test.ts`; `apps/extension/tests/e2e/network/scope-refusal.test.ts` (new case) |
| 2.1 | `apps/extension/src/composables/useSecretCountdown.ts`, `apps/extension/src/popup/pages/settings/security/export/seed.vue`, `…/security/change-password.vue` | `useSecretCountdown.test.ts`, `seed.test.ts`, `change-password.test.ts` |
| 2.2 | `apps/extension/scripts/pages-options.ts`, `apps/extension/vite.config.ts`, `apps/extension/src/types/auto-imports.d.ts` (generated) | `apps/extension/scripts/pages-options.test.ts` (`legacy-routes.test.ts` must pass unchanged) |
| 2.3 | `apps/extension/tests/e2e/global-setup.ts`, `apps/extension/tests/e2e/process-group.ts` (new), `apps/extension/tests/e2e/anvil-probe.ts` (new) | `apps/extension/scripts/e2e/process-group.test.ts` (new), `apps/extension/scripts/e2e/anvil-probe.test.ts` (new) |
| 2.4 | `apps/extension/manifest/manifest.chrome.config.ts` (only if refused) | `apps/extension/src/manifest.test.ts` |
| 2.5 | `apps/extension/src/composables/importPreflight.ts`, `…/importChainSync.ts`, `…/useIncomingTrustPrompts.ts` | `importPreflight.test.ts`, `importChainSync.test.ts`, `apps/extension/src/popup/components/popups/PopupManager.test.ts` (the pinned-drift case flips) |
| 3.1 | the six workflow files above | `scripts/ci-cd/behavior-gating.test.ts` only if a pin names the secret |
| 3.2 | `apps/extension/scripts/e2e/docker-ci-like.sh`, `…/docker-ci-like.pins.sha256` (new) | `scripts/ci-cd/docker-ci-like-pins.test.ts` (new) |
| 3.3 | `scripts/release/workflow-command.ts` (new), `publish-chrome-store-run.ts`, `attach-assets-run.ts`, `publish-firefox-amo-run.ts`, `lock-version-run.ts`, `auto-unstick-run.ts`, `scripts/publish/check-digests.ts`, `scripts/ci-cd/assert-canary-results.ts`, `scripts/ci-cd/audit-gate.ts` | `scripts/release/workflow-command.test.ts` (new), `audit-gate.test.ts` (moved case), `attach-assets-run.test.ts`, `publish-firefox-amo-run.test.ts`, `lock-version-run.test.ts` |
| 3.4 | `apps/extension/scripts/e2e/agent.sh`, `apps/extension/src/composables/useFullBackupImport.test.ts`, `apps/extension/tests/e2e/global-setup-smoke.ts`, `apps/extension/tests/e2e/global-setup.ts`, `apps/extension/tests/e2e/network/tx-sendTx-multicall.test.ts` (comments only) | `scripts/ci-cd/workflow-refs.test.ts` (new) |
| 3.5 | `.claude/skills/e2e-testing/SKILL.md`, `.claude/skills/aztec-update/SKILL.md`, `apps/extension/tests/COMPOSITION-TESTS.md` | none |

**Overlap check** (recon.md § Overlap map):

- No file above is in PR #55, #58 or #75, or in accessibility-1's or type-roles' file maps.
- `useFullBackupImport.test.ts` (comment only) is not in #74's merged set or #75's own diff.
- `change-password.vue`, `auto-imports.d.ts` and `e2e-testing/SKILL.md` were in #56, which has
  merged.
- Two shared skill files are edited by no open PR at planning time: `e2e-testing/SKILL.md`, and the
  `aztec-update` skill, which an Aztec bump would edit. Phase 3.5 re-checks both
  (`gh pr list --state open`, then each PR's own diff) before editing. If one is taken, that part
  becomes a follow-up entry, as code-followups-1 did.

### Trade-offs and alternatives not taken

The decision ledger has the full set. In short:

- construct `ScopeViolationError` directly rather than widen `scopeViolation()`'s message union (D1);
- park 34 rather than choose, for the owner, which dApp registrations succeed (D2);
- park 15 rather than choose a walk scope (D3);
- an inline latch rather than a new helper (D4);
- `extensions: ["vue"]` rather than moving 22 helpers (D11);
- probe before changing the dev policy (D13);
- one pins file plus a drift test rather than a new Bun-bump sync site with no gate (D15);
- the in-run teardown only, rather than an orphan reaper that cannot prove ownership (D9).

### Competing outline

**Outline B: group by risk, not subsystem.**

- Arc A: the dApp-facing change (10), with its network e2e.
- Arc B: every invisible code change (Arc 1's rest, plus 26, 135 and 130).
- Arc C: tooling, CI and docs.

B isolates the owner-visible change in its own PR, with its screenshots alone. Two things stand
against it:

- The brief asks for subsystem grouping.
- A splits 10 away from the `execution/` files that 1.1 also touches, so two PRs edit one
  subsystem.

The adopted outline keeps B's strength: 1.5 is Arc 1's last phase, its after-shots are the only
screenshots in Arc 1's PR, and the PR body leads with them.

## Phases

Each phase lists its steps, then its validation gate. Run `bun run lint` and the touched tests after
each step. A phase gets its ✓ only when its gate passes. `<WT>` is the worktree root; `<SCRATCH>` is
`~/.cache/nulo-backlog/code-followups-2/`.

**Unit runs.**

- `cd <WT>/apps/extension && bun --bun vitest run <files>` for files under `apps/extension`.
- `bun run --cwd packages/<name> test` for a package's own suite.
- `bun test <files>` for `scripts/`.

**e2e rules for every gate:**

- Never run two e2e invocations at once in this worktree.
- **Network runs:** `cd <WT> && NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent <files>`.
  The Firefox twin is the same command with `NULO_E2E_BROWSER=firefox`.
- **Smoke runs** need an armed build made right before them, because an `e2e:agent` run rebuilds
  `dist/chrome` for its sandbox. Read the `e2e-testing` skill for the exact flag pairs, including the
  CSP-report pair that hardening-2 added. Then run
  `cd <WT>/apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 bun run test:e2e <files> --retry=0`.
- A red file gets one rerun of that file alone. A second red is breakage, not a flake.
- Every run's log goes under `<SCRATCH>/runlogs/`.

**Arc gate, after the arc's last phase:**

- `bun run audit:vue` exits 0.
- `bun run typecheck:all` exits 0.
- `bun run test:ci-gating` exits 0 for Arcs 2 and 3, and `bun run test:release` for Arc 3.
- `bun run lint:actions` exits 0 for Arc 3.
- Arc 1 also runs `execution/service.composition.test.ts`, the composition layer over the touched
  service graph (inside `audit:vue`, named so its result is read).

### Arc 1: wallet services

#### Phase 1.1: two log lines ✓

1. `transfer-estimate-reuse.ts`: return `"base fee fetch failed"` and drop the unused import.
2. `transfer-estimate-reuse.pins.test.ts`: the three base-fee pins expect `${REASON}base fee fetch failed`.
   Retitle them from "carries … own message" to "misses with a fixed reason". Add one assertion that
   a rejecting fee read whose message holds a URL logs no part of it. That is the never-happens
   case; the existing hit and miss rows are its controls.
3. `account-state/service.ts`: log the error as an argument; correct the comment.
4. `account-state/service.test.ts`: in the nested `restoreError` normalization block, spy `logWarn`
   (the file's existing pattern). Assert:
   - the call is `["restore: registration failed on <id>", err]`;
   - the text holds no part of the message;
   - `restoreError` is unchanged (the control).

**Gate:**

- the two test files pass;
- `apps/extension/src/utils/log-payload-ban.test.ts` passes;
- `git grep -n "base fee fetch failed:" apps/extension/src` returns nothing.

#### Phase 1.2: one projection, one constant ✓

1. `profile/spec.ts`: add `toProfileInfo`. Point `getProfileInfo`, `profileIdentity` and `toInfo` at it.
2. `profile/spec.test.ts`: two cases:
   - recovery mode true yields `recoveryMode: true`;
   - false yields an object with no `recoveryMode` key (`"recoveryMode" in info` is false). The
     second pins the absent-key shape today's callers rely on.
3. `token-balance/spec.ts`: export `BALANCE_BATCH_SIZE`; import it in both files; delete the locals.
4. `balance-projector.test.ts`: the "BATCH_SIZE = 12 regression" label names the shared constant.

**Gate:** `profile/` and `token-balance/` tests pass, including:

- `service.integration.test.ts`'s recovery-mode cases;
- `session-manager.test.ts`'s `onChange` case;
- the projector's 12 + 3 case;
- the queue's 12 + 12 + 6 case.

The e2e gate is a smoke run of `profile-rename.test.ts` and `auth-flows.test.ts` on Chrome.

#### Phase 1.3: broken account rows ✓

1. `purge-rows.ts`: add `attributeByKey`; reword the doc comment.
2. `account/service.ts`: pass the `parseAccountRowId` predicate.
3. `purge-rows.test.ts`: six cases.
   - A syntax-broken value whose key the callback attributes is deleted, and `onPurged` sees it.
   - A non-object value (`"42"`, `"null"`) whose key the callback attributes is deleted.
   - The same broken row is left when the callback returns false.
   - The guarded re-read still holds on the new branch: a callback-attributed broken row rewritten
     between the snapshot and the delete is kept, with its new bytes. The unchanged-row deletion
     above is its control. This copies the existing "guarded re-read" case.
   - The existing "leaves a JSON-syntax-broken row" case is kept for the no-callback path, and the
     existing `onMatch` ordering case is unchanged.
   - A valid row is still judged by value, never by key: a valid row whose key the callback would
     attribute but whose value does not match is left.
4. `account/service.test.ts`, in the raw-pass block: profile p1's broken row is deleted and p2's
   broken row is kept. Also assert that a broken row under a key `parseAccountRowId` cannot read is
   kept.

**Gate:**

- both files pass, and so does the rest of `account/`;
- smoke `security-reset.test.ts` and `passkey-retry.test.ts` (both delete a profile) pass on Chrome.

#### Phase 1.4: zod enums ✓

1. Swap the eight calls (nine if #58 has merged; check with `git log origin/dev --oneline -1 -- apps/extension/src/wallet/services/dapp-session/spec.ts`
   after merging `origin/dev` at the arc's start).
2. `network/spec.test.ts`: one row each way for `NodeStatusSchema` (a member passes, a non-member
   string fails).

**Gate:**

- `bun run typecheck:all` exits 0, because the `z.ZodType<NodeStatus>` annotation still holds;
- the unit suites of the six specs' services pass;
- `git grep -n "nativeEnum" -- apps packages ':!**/node_modules/**'` lists only the PR #58 call, or
  nothing.

#### Phase 1.5: the selector-binding refusal as a scope refusal ✓

1. The six source edits in § Architecture 1.5.
2. Unit and composition tests:
   - `contract-resolver.test.ts`'s refusal table expects `ScopeViolationError`, and so do the seven
     other binding-refusal constructor assertions (recon.md § 10); the "Method not found" assertions
     stay `Error`;
   - `mark-failed-unless-cancelled.test.ts`: `markFailedUnlessCancelled` records a
     `ScopeViolationError` as `scope_refused`. `failureKind(new ScopeViolationError(…), "transfer")`
     still returns `"transfer"`; that is the never-happens case for the Send path. The existing
     `DuplicateInitializationError` and `SessionEndedError` cases are the controls;
   - `rpc-cancel.test.ts` copies "a Terms refusal at the broadcast line keeps its code all the way to
     the dApp envelope" for the binding refusal (code 4100, `walletErrorCode: "SCOPE_VIOLATION"`).
     The existing "OTHER WalletError subclasses do NOT ride" case is the control;
   - `error-envelope.test.ts`'s real-chain table adds a row;
   - `service.composition.test.ts`: a refused binding writes no `executeOperations … failed` line at
     `error`, and one `refused: outside its grant` line at `debug`. A Terms refusal keeps its own text,
     and an unclassified failure still logs at `error`; those are the controls.
3. `tests/e2e/network/scope-refusal.test.ts`: one new case, on the model of the throwaway OA-2 shot
   spec in `~/.cache/nulo-backlog/security-fixes-1/_shot-oa2.test.ts`. The playground page's
   `TextEncoder.prototype.encode` is patched so the call claims `balance_of_public` while its
   selector stays the transfer's. The test then sends and approves, and asserts:
   - the dApp answer's code is 4100 with `walletErrorCode: "SCOPE_VIOLATION"`;
   - the send record's error kind is `scope_refused`. The test reads it inline through
     `chrome.storage.local`, because `SendRecordView` carries no error kind and no fixture changes;
   - the History card's `tx-terminal-subtitle` reads "Not allowed";
   - in developer mode, `journal-detail-error-raw` holds `"name":"ScopeViolationError"` and the
     unchanged message.

   It selects by testid only. No playground or fixture file changes.
4. After-shots: copy the shot spec into `apps/extension/tests/e2e/network/` as an untracked file. Run it
   with `OA2_PHASE=after NULO_E2E_SHOT_DIR=<SCRATCH>/shots`, then delete the copy before staging.
   `git status --porcelain` shows no `_shot` file. Its texts must equal § UI impact's table, all four
   rows. The PR shows security-fixes-1's `oa2-*-after-*` images as "before".

**Gate:**

- every unit file above passes;
- network `scope-refusal.test.ts` and `err-scope-and-cap.test.ts` pass on Chrome and on Firefox (the
  Firefox network lane is required on `dev`). If the `TextEncoder` patch does not take on Firefox,
  say so in `lessons/phase-1.md` and in the PR, and skip that one case on Firefox with the reason in
  the test. The other assertions are not weakened;
- the shot texts match § UI impact;
- the arc gate passes.

### Arc 2: extension pages, build and e2e harness

#### Phase 2.1: submit latches ✓

1. `useSecretCountdown.ts`: `start()` clears first, and does nothing after dispose.
2. `useSecretCountdown.test.ts`, with fake timers:
   - start twice leaves the same pending-timer count as one start (two: the close timeout and the
     tick interval, `vi.getTimerCount()`), and one `onClose` call after the deadline;
   - `disable()` after a double start leaves no pending close;
   - start after scope dispose arms nothing.
   The existing "start() sets deadline" case is the control.
3. `seed.vue`: the latch and the run fence, as in § Architecture 2.1.
4. `seed.test.ts`, with a deferred `exportMnemonic`:
   - two clicks call it once;
   - unmounting before it resolves sets no phrase and arms no timer;
   - its control, in the same deferred harness: resolving while mounted sets the phrase and leaves
     one countdown armed;
   - the existing "Enter on Retrieve retrieves once" stays green.
5. `change-password.vue`: return while `isLoading`.
6. `change-password.test.ts`: two same-tick submits (the button's click handler called twice) call
   `changeProfilePassword` once; one submit still calls it once.

**Gate:**

- the three files pass;
- smoke `keyboard-guards.test.ts` and `security.test.ts` pass on Chrome;
- the diff makes no change to either SFC's `<template>`, so nothing renders differently.

#### Phase 2.2: routes and declarations ✓

1. `pages-options.ts`: `extensions: ["vue"]`.
2. `pages-options.test.ts`: the case "the configured scan drops exactly the test modules the defaults
   would route" becomes "the configured scan routes exactly the `.vue` pages". Add a case that no
   generated route's component path ends in `.ts`. Keep the comparison an exact route set, not a
   count. The dev-watcher case plants `new-page.test.vue` instead of `new-page.test.ts`, so it still
   proves the dot-directory test globs; with `extensions: ["vue"]` a `.ts` file is never routed, and
   the case would pass without exercising them.
3. `legacy-routes.test.ts` passes unchanged. Every target it names is a `.vue` page.
4. `vite.config.ts`: `dtsMode: "overwrite"`. Then `bun run build` and commit the regenerated
   `src/types/` files. The diff removes `resolveRestoredActiveNetworkId` and `restoreNetworksStage`
   from `auto-imports.d.ts`, and nothing a source file uses.

**Gate:**

- `bun run typecheck:all` and `bun run build` exit 0;
- a second `bun run build` leaves `git diff --exit-code -- apps/extension/src/types/` clean;
- smoke `navigation.test.ts` and `settings-routes.test.ts` pass on Chrome.

#### Phase 2.3: process groups and the L1 probe ✓

1. Move `killProcessGroup` to `process-group.ts`; wait on and escalate by group; add the grace
   parameter and the escalation result. `global-setup.ts` imports it. `lockfile.ts` and `reap.ts`
   are not changed.
2. Move `probeAnvil` to `anvil-probe.ts` and add the chain-id and hex-quantity checks.
3. `apps/extension/scripts/e2e/process-group.test.ts` (POSIX, real processes, each group spawned
   detached by the test, so the test owns exactly the groups it signals):
   - **escalation:** the leader exits at once and its child ignores `SIGTERM`
     (`sh -c 'trap "" TERM; sleep 30 & exit 0'`). Await the leader's `exit` before reading its
     state, since a zombie still answers `kill(pid, 0)`. `killProcessGroup` with a 300 ms grace
     reports an escalation, and the group is gone within 2 s;
   - **control:** a group whose members all exit on `SIGTERM` ends with no escalation;
   - `afterEach` kills any group the test spawned that is still alive, by its recorded pgid only.
4. `apps/extension/scripts/e2e/anvil-probe.test.ts`: a fake JSON-RPC server on an ephemeral port
   answering `eth_chainId` `0x1` is refused, and the same server answering `0x7a69` is accepted
   (control). A non-hex `eth_blockNumber` result is refused. Neither test imports `global-setup.ts`.

**Gate:**

- both test files pass;
- network `incoming-transfers.test.ts` passes on Chrome and on Firefox, since the harness is a
  fixture;
- after each run, `pgrep -f "anvil --host 127.0.0.1 --port <port>"` for that run's port finds
  nothing;
- one smoke file passes on both browsers.

#### Phase 2.4: development CSP ✓

1. Probe, as in § Architecture 2.4: port 8088 claimed, `bun run --cwd apps/extension dev` in its own
   process group, the popup opened in the e2e Chrome profile, and the HMR WebSocket and console CSP
   violations recorded over CDP to `<SCRATCH>/runlogs/dev-csp.log`. Stop the group by its pgid.
2. If the log shows the HMR socket refused by `connect-src`:
   - add the development-only override, naming exactly the refused source;
   - `manifest.test.ts`: the development manifest's `connect-src` adds exactly that source;
   - the production manifests, both builds, still equal `EXTENSION_PAGES_CSP` (the existing pins).

   Rerun the probe.
3. If the log shows the socket connecting with no refusal, record that in `lessons/phase-2.md` and
   change nothing.
4. Rebuild `dist/chrome` with `bun run build:chrome` before any later e2e run.

**Gate:**

- the last probe log shows the HMR WebSocket's handshake completed and no CSP refusal of it;
- `manifest.test.ts` passes;
- `bun run build:chrome`'s `dist/chrome/manifest.json` policy is byte-equal to the production
  string;
- the arc gate passes.

#### Phase 2.5: two invisible cleanups ✓

1. `importPreflight.ts` and `importChainSync.ts`: clear each race's timer when the race settles.
2. `importPreflight.test.ts` and `importChainSync.test.ts`, with their existing fake timers: after a
   probe or restore that wins its race, `vi.getTimerCount()` is 0. The controls are the existing
   hanging-probe and hanging-restore cases, which must still end at their deadlines with the same
   records.
3. `useIncomingTrustPrompts.ts`: the `disposed` flag.
4. `PopupManager.test.ts`: the case "an unmount before the seed settles still registers the config
   listener afterwards (pinned drift)" becomes "… registers nothing afterwards": no `config.add`
   after the disconnects, and no handler left. Its control is the existing mounted case, where the
   seed still registers exactly one listener.

**Gate:**

- the three test files pass;
- smoke `import-paths.test.ts` and `onboarding-import.test.ts` pass on Chrome;
- the arc gate passes.

### Arc 3: CI, release scripts and docs

#### Phase 3.1: the dead salt ✓

1. Remove the declaration, the env export and the 20 caller passes. Drop any `secrets:` block left
   empty.

**Gate:**

- `git grep -n SPONSORED_FPC_SALT -- .github` returns nothing;
- `git grep -n SPONSORED_FPC_SALT -- apps packages` lists only the two local `0n` constants and
  their uses, and `git grep -n "env.SPONSORED_FPC_SALT\|env\[.SPONSORED_FPC_SALT" -- apps packages scripts`
  returns nothing;
- `bun run lint:actions` and `bun run test:ci-gating` exit 0.

actionlint parses every edited workflow. The PR's own network lanes, Chrome and Firefox, run
`_extension-network-e2e.yml` without the secret. `nightly.yml`, `release.yml` and the soak workflow
are not dispatched from a feature branch.

#### Phase 3.2: pinned bootstrap ✓

1. Fetch the two artifacts and both `SHASUMS256.txt` files into `<SCRATCH>/pins/`, in a new empty
   directory. Check each hash against the publisher's list and against `sha256sum` of the artifact.
   Write the pins file.
2. Rewrite the script's Bun and Node block: refuse a non-x64 machine, download, `sha256sum -c`
   against the pin, extract into the script's own directories, prepend them to `PATH`.
3. `docker-ci-like-pins.test.ts`, with its assertions. Its never-happens controls are planted lines
   in an in-memory copy: a `curl … | bash` line, a `command -v bun` short-cut, and a version that
   differs from its pin's key. Each must fail the test.

**Gate:**

- the test passes;
- `shellcheck apps/extension/scripts/e2e/docker-ci-like.sh` is clean;
- one `ubuntu:24.04` container run of the script's bootstrap groups (stopped before the suite)
  installs Bun 1.4.2 and Node v24.16.0;
- the same run in an image that already has another `bun` on `PATH` still uses the pinned one;
- the same run with one pin altered exits non-zero before anything is extracted.

#### Phase 3.3: one escaper ✓

1. Create `workflow-command.ts` from the two copies, and use it at every site in § Architecture 3.3.
2. `workflow-command.test.ts`:
   - data holding `%`, CR and LF round-trips through the runner's unescape;
   - `##[` in data or in a plain line is neutralized to `## [`, for both `command` and `plain` (the
     existing `audit-gate.test.ts` assertion, moved here, unchanged);
   - a newline cannot start a second `::` command;
   - `plain` folds line breaks.
3. `attach-assets-run.test.ts`, `publish-firefox-amo-run.test.ts` and `lock-version-run.test.ts`: a
   `fail` reason or a validation error holding a line break and `##[` prints as one escaped line. In
   the AMO test, so does an add-on `status` holding the same text on the `check ok` line. The existing failure and normal-status cases are the controls.

**Gate:**

- `bun run test:release` and `bun run test:ci-gating` exit 0;
- ``git grep -nE '`::(error|warning|notice|add-mask)::' -- 'scripts/*.ts' 'scripts/**/*.ts' ':!*.test.ts' ':!scripts/release/workflow-command.ts'``
  returns nothing.

#### Phase 3.4: workflow-reference guard ✓

1. Rewrite the six comments to the invariant alone, without the provenance:
   - `agent.sh:38`: keep why there is no signal trap, drop "(review CONFIRMED x5)";
   - `global-setup-smoke.ts:36`, `global-setup.ts:727` and `:892`: drop the parentheticals;
   - `tx-sendTx-multicall.test.ts:27`: "Per-test retry is 0: the suite's honest-retry gate";
   - `useFullBackupImport.test.ts:2101`: drop "(review finding, both lenses)".
2. Add `workflow-refs.test.ts`, with a planted positive per pattern family and a clean sample of
   allowed text (`phase 1`, a plan path, "reviewer sign-off in the PR description").

**Gate:**

- the guard passes on the tree;
- each planted sample fails it;
- `bun run test:ci-gating` exits 0;
- network `incoming-transfers.test.ts` passes on Chrome and on Firefox, retry 0, through the edited
  `agent.sh` and `global-setup.ts`. This is Arc 3's local e2e: the workflow edits themselves run
  only in CI.

#### Phase 3.5: docs routing ✓

1. Re-check that no open PR edits the two skill files or COMPOSITION-TESTS.md (each PR's own diff).
2. Route 148, 150, and 149's two parts that are not CLAUDE.md's (the `aztec-update` skill line and
   the COMPOSITION-TESTS.md line), keeping each record link (archive paths resolve). Use
   one sentence per gotcha, in the section that owns its topic.

**Gate:**

- `bun run check:plans` exits 0;
- every routed item is findable by its key phrase with `git grep`;
- the arc gate passes.

## Security & Adversarial Considerations

**Threat model.** Two changes meet a boundary an attacker controls:

- 10 sits on the dApp RPC path. A hostile page chooses the call name and the selector.
- 95 sits on the profile-deletion path over attacker-shapeable stored rows, since an imported backup
  writes rows.

The rest touch logs, popup pages, the build, the e2e harness, CI plumbing and docs. For those, the
surface this lane could widen is the CI gate itself, and the shipped bundle or manifest.

- **10, the scope refusal.**
  - The class change adds no information for the dApp: the 4100 envelope's message is a constant,
    and the internal message names only the policy (`call name`, `artifact name`), never a request
    value.
  - It does give the dApp one new fact: this refusal, which used to look like any other failure,
    is now distinguishable. A page could use that to learn that its selector did not run the
    function it named. But it built that call itself, so the refusal tells it nothing it did not
    already know.
  - The code-channel allowlist widens by one class. The comment's bar holds: the dApp contract is
    ratified (owner sign-off), and the rebuild is lossless (message-only constructor). A blanket
    `WalletError` pass-through stays refused.
  - The log level drops from `error` to `debug` for this refusal, at both lines that log it
    (`isExpectedRefusal`, `logOperationOutcome`). A page spamming mismatched windowless calls
    (`simulateTx`, `executeUtility`, an auto-approved send) no longer fills the always-on
    `warn`/`error` buffer that the user's log export carries. A windowed send's fee estimate and
    authorization preview still log their failure at `error` from the execute window
    (`popup/windows/execute/index.vue`), unchanged: once per failed estimate or preview, each needing
    a window the person opened.
  - The `scope_refused` kind is recorded on the dApp send path only. A first-party Send can never be
    labelled "The app asked for more than you allowed", and a unit test pins that.
- **34, the class id: parked.** Both available fixes change which dApp registrations succeed, so the
  entry waits for the owner (D2).
- **95, the purge by key.** Deletion widens: a row whose value cannot be parsed is now deleted when
  its key names the profile being deleted. The guard is the key parse.
  - `parseAccountRowId` must return this profile's id; an unreadable key deletes nothing.
  - Another profile's broken row is kept, and a valid row is still judged by its value.
  - The never-happens assertions (p2's row kept, an unreadable key kept) sit beside the success
    control (p1's row deleted).
  - The existing `rawValue` re-read guard still runs before the delete, so a row rewritten between
    the scan and the delete is not removed.
- **Logs (65, 102).** Both reduce reach:
  - a node's error text leaves a debug line;
  - a restore error moves from an opaque string into an argument that `trim()` scrubs and caps.

  `log-payload-ban.test.ts` stays green. No new value is logged.
- **26, the latches.** These prevent a second `exportMnemonic` call (a second decrypt of the
  recovery phrase) and a stray timer that navigates away from whatever page the user is on. The
  phrase is never set on a page that has left. No new surface.
- **135, routes.** Removing 22 route records shrinks the set of URLs that resolve to a module. No
  helper was a page.
- **152, CSP.** The only widening in the lane: one exact `ws://localhost:<port>` source, in the
  development manifest only.
  - Store, release and e2e builds are production mode (no script outside the two `dev` scripts
    passes `--mode development`).
  - `manifest.test.ts` pins both production policies byte-for-byte.
  - The probe-first rule means nothing changes unless a refusal is seen.
- **125, process groups.** The change acts only on a child the running setup spawned and holds.
  While any member of its group lives, POSIX keeps the group ID from being reused, so the group
  signalled is the one the run created. The persisted-lock reaper is not widened: it would reach a
  reused ID's group, which no recorded pid can tell apart (the reasoning
  `tests/e2e/fixtures/browser/ownership.ts` already records). The unit test signals only the groups
  it spawned.
- **126, the probe.** Stricter: a non-31337 listener on our port is no longer adopted as our L1.
- **172 and 186, the cleanups.** Each only removes something: an idle timer after its race settled,
  and a listener a disposed composable would add to a disconnected client. Race results, records
  and the mounted listener are unchanged, and each test pairs the removal with that control.
- **108, the salt.** It removes a secret from 20 workflow call sites and one reusable workflow. That
  is least privilege, with no reader lost.
- **134, the bootstrap.** It replaces a pipe-to-shell and an unchecked tarball with hash-pinned
  artifacts. The drift test stops a silent Bun bump from leaving a stale pin. Hashes are
  cross-checked against the publisher's list and the artifact itself.
- **142, the escaper.** Tracked privately: GHSA-6cj6-wp78-52mc.
- **163, the guard.** It is a new gate. It can only fail a PR, never pass one that would fail today.
  - The risk is false positives. The vocabulary is narrow, and a clean control sample pins what it
    must allow.
- **What the lane could hide:** a test weakened to go green. The Codex fix loop is asked directly:
  "which assertion is weaker than at base?"

**Least privilege.** Workflow permissions do not change. One secret leaves the workflow plumbing. No
repository setting changes: deleting the now-unread repository secret is the owner's.

**Cryptography.** None touched.

**Input validation.** 126 tightens a harness check. 15, the coercion walk, and 34, the class-id
binding, are parked (D3, D2).

**Supply chain.** No dependency is added, removed or bumped. The 7-day gate and the frozen lockfile
are untouched. 134 adds hash pins.

**Domain risks:**

- Frontend: no new `v-html`, link or message listener.
- Smart contracts: none touched.
- dApp RPC: 10 above.

## Assumptions

### Facts

- F1. At `f557e20`, `follow-ups.md` holds 202 entries. #55, #58 and #75 are the open PRs, and their
  own diffs are as in recon.md § Overlap map.
- F2. `ScopeViolationError`'s constructor takes the message alone, and `REBUILT_AS` already rebuilds
  it from `SCOPE_VIOLATION`. `toWalletResponseError` maps it to the 4100 envelope.
  `queuedFailureKind` already maps it to `scope_refused`. `isExpectedRefusal` in `background.ts`
  already lists it.
- F3. The owner's OA-2 answer is recorded in `archive/security-fixes-1/OWNER-ASKS.md` § "Answers:
  owner sign-off, 2026-10-08". security-fixes-1's shots of the OA-2 surfaces are in its scratch
  directory; its `oa2-*-after-*` set shows today's tree.
- F4. `logOperationOutcome` (`execution/service.ts`) logs every classified failure at `error` except
  a Terms refusal, which it logs at `debug`.
- F5. zod 4.4.3's `nativeEnum` and `enum` build the same `ZodEnum`. R3 ran both over eight inputs and
  got identical results and issues.
- F6. The 22 helper `.ts` files are not pages: every page in the five scanned directories is a
  `.vue`.
- F7. `_build-extension.yml` fails on a diff under `apps/extension/src/types/` after the build.
- F8. Anvil 1.4.1 answers `eth_chainId` with `0x7a69`, and `anvil_nodeInfo` does not report
  slots-in-an-epoch.
- F9. Nothing reads `process.env.SPONSORED_FPC_SALT`.
- F10. The two existing escapers in `publish-chrome-store-run.ts` and `audit-gate.ts` have identical
  bodies; audit-gate's `command` narrows its `name` type.
- F11. The workflow-reference vocabulary finds six hits, all comments (recon.md § 163).

### Inferences

- I1. Under CSP3 an `http:` source does not match a `ws:` URL, so the dev server's HMR socket is
  likely refused. Phase 2.4 proves or disproves it before any change. **Not tested, and moot**
  (D-arc2-1): on Chrome the dev popup is served by crxjs's service worker and runs under Chrome's
  baseline extension policy, which has no `connect-src`, so the manifest's `connect-src` never
  meets the HMR socket.
- I2. PR #58 may merge before Arc 1 starts. Phase 1.4 checks and adapts.
- I3. PR #75 may land before the close-out. The close-out matches entries by text.

### Asks

None go to the owner (OWNER-ASKS.md). These are the working assumptions an audit should attack:

- A1. The OA-2 sign-off covers Phase 1.5 as § UI impact states, including the developer-mode raw
  block's error name. That is OA-2's surface 1, and option A names the class change ("not only a
  change of error class"). It is the relayed answer to an ask that spelled out option A's before and
  after; the record has no verbatim owner note for it.
- A2. (Withdrawn after round 1. It claimed that refusing an upgraded contract at registration would
  go unnoticed; both audits showed the change is visible to a dApp, so entry 34 is parked, D2.)
- A3. A development-only CSP source is build tooling, not a product change.
- A4. Removing the salt from workflow plumbing is CI code. The repository secret's deletion is a
  settings change and stays the owner's.

## Decision ledger

| # | Decision | Why | Alternatives rejected |
|---|---|---|---|
| D1 | 10: construct `ScopeViolationError` directly with the existing fixed text; extend `ridesCodeChannel`; record `scope_refused` on the dApp send path; correct two comments | Option A needs the code channel and the journal kind, not only a class change, as the entry says. The class, envelope, rebuild and labels all exist | Widening `scopeViolation()`'s message union: it is not exported from `wallet-bridge` and serves the grant check |
| D2 | Park 34 (round 1: Codex blocking, Opus material) | Binding the original id alone accepts an upgraded contract registered without an artifact, or with its original one, where today's lookup by the current id usually fails. The entry's model check (`current == original`, as `assertWireArtifactClassId` does) refuses every upgraded instance at registration. Either way, which registrations succeed changes for a dApp: an owner call | Building the original-id binding (first draft); building the model check without a sign-off |
| D3 | Park 15 | The fix is a walk over every argument, and its scope is a choice. A blanket own-`toString` refusal misfires on a legitimate artifact field so named; the precise walk (raw and parsed trees in step) is not small; and it changes a dApp's envelope | Fixing ~30 coercion sites: large, and still a choice |
| D4 | 26: an inline in-flight flag plus `createRunFence`, not bound to the template; `useSecretCountdown.start()` idempotent and inert after dispose | No visible change; reuses the fence the tree already has | A shared submit-latch helper (one more abstraction for three sites); `:disabled` binding (a visible flash) |
| D5 | 37: `toProfileInfo` in `profile/spec.ts` | `spec.ts` already exports runtime helpers, and both callers import it | A method on the service: the session manager would need the service |
| D6 | 64: `BALANCE_BATCH_SIZE` in `token-balance/spec.ts` | The file's own precedent (`MAX_SYNC_FAILURE_MESSAGE_LENGTH`, "single owner") | A constants module (none exists in the directory) |
| D7 | 95: an optional key-attribution callback, consulted only for unparseable values | Keeps the eight value-attributed callers unchanged; the key alone attributes only for the account store | Parsing the key inside `purgeMalformedRows` (couples the generic purge to one store) |
| D8 | 132: eight calls now, the ninth only if #58 has merged | `dapp-session/spec.ts` is #58's file | Waiting for #58 for all nine |
| D9 | 125: wait on and escalate by group in the in-run teardown only; rewrite the orphan-reaper half (round 1: both audits) | The teardown holds the child it spawned, so the group is provably its own. A persisted pid proves nothing once its group is gone, and a reused ID's group with a dead leader would be signalled | Group reaping from the lock (first draft: wider than today); recording process identity in the lock (its own design) |
| D10 | 126: build the chain-id half; rewrite the slots half | No RPC exposes slots-in-an-epoch (F8). Inferring it from `finalized` vs `latest` is ambiguous on a fresh chain and would mutate state to test | Mining blocks in the probe |
| D11 | 135: `extensions: ["vue"]` | One line; every page is `.vue` (F6) | Moving 22 helpers (22 import rewrites, churn in files other lanes touch) |
| D12 | 130: `dtsMode: "overwrite"` and regenerate | Makes the CI freshness check see removals (F7) | Hand-deleting the two lines (the next removal goes stale again) |
| D13 | 152: probe first; a dev-only override in `manifest.chrome.config.ts` naming the exact refused source | The entry's own instruction; the file already branches on development mode | Adding `ws:` to the shared policy (widens production) |
| D14 | 108: remove the secret from every workflow; leave the repository secret to the owner | No reader (F9); deleting a repository secret is a settings change | Keeping it "in case": nothing reads it |
| D15 | 134: a version-keyed pins file beside the script, x64 only, always-installed pinned tools, and a drift test tied to `packageManager` | A hash pin moves with the version, so the keys and the test keep a bump honest; an ambient tool must never bypass the pins | Deriving the version at run time with no hash; keeping the `command -v` short-cuts; arm64 pins nobody runs |
| D16 | 142: `scripts/release/workflow-command.ts`, used at every TypeScript workflow-command site in `scripts/` (twelve, eight beyond the entry's four) | Release scripts are the main users; `scripts/ci-cd` already imports from `../release/` (`audit-gate.test.ts`, `release-integrity.test.ts`). The eight more sites are the same bug, found by the audits | A new `scripts/lib/` directory for one module; fixing only the entry's four (the gate grep would still fail) |
| D17 | 163: a narrow vocabulary over tracked code and config, no allowlist, the six hits rewritten | The entry asks for a guard; a narrow list keeps false positives near zero, and the clean control pins what stays allowed | A broad `review` / `audit` word ban (refuses live process text) |
| D18 | 149: ship the skill and COMPOSITION-TESTS parts; park the CLAUDE.md half | CLAUDE.md is in accessibility-1's file map | Editing CLAUDE.md (a conflict with an in-flight lane) |
| D19 | Build 172's first bullet, rewrite the rest (final Codex pass) | Its record allowed an invisible cleanup as its own change; clearing a losing timer moves no pixel, copy, wire code or byte | Parking it as the record's continuing decision (first draft: misread the record) |
| D20 | Group by subsystem, with 1.5 last in Arc 1 | The brief's grouping; 1.5's screenshots lead Arc 1's PR | Outline B (§ Competing outline) |
| D21 | 10: map `ScopeViolationError` to `scope_refused` in `markFailedUnlessCancelled`, not in the shared `failureKind` (Opus round 1) | `failureKind` also labels first-party Send records (`transfer-executor.ts`), which must never read "The app asked for more than you allowed" | Changing `failureKind` and accepting the Send label |
| D22 | 10: log the refusal at `debug` in `logOperationOutcome` too (Opus round 1) | Without it every refused call still writes an `error` line; a refusal a dApp can repeat belongs at `debug` (logging policy), as the Terms refusal already does | Leaving the `error` line (the plan's first claim was wrong) |
| D23 | Build 186's late-listener bullet, rewrite the rest (final Codex pass) | A listener added to a disconnected client after dispose is invisible; the same record's cleanup rule covers it, and the pinned-drift test flips with a mounted control | Parking the whole entry as owner UI drift (only its other three bullets are visible) |
| D-orch-1 | No stack: each arc opens its own PR against `dev` (`gh pr create --base dev`), title per § Delivery; Arcs 2 and 3 merge `dev` in after the arc before them lands; the close-out is a fourth PR after the last arc merges (orchestrator, at approval) | Arcs 1 and 2 run in parallel worktrees, and the orchestrator merges in order | `gh stack` with one layer per arc (§ Delivery as planned) |
| D-arc2-1 | 152: no code change; the entry closes on the probe's evidence (`lessons/phase-2.md` § 2.4) | The HMR socket completed its `101` handshake with no refusal, and § Architecture 2.4 says to change nothing in that case. A `fetch("data:")` control showed why: the service-worker-served dev popup runs under Chrome's baseline extension policy only, so a development-only `connect-src` source would change nothing (the production control refused the same fetch under the manifest policy) | The development-only override (a no-op on the pages it targets) |
| D-arc2-2 | 26: the seed page's unmount case asserts the late mnemonic's `join` is never called, beside the timer count | The countdown's own dispose guard already arms nothing after unmount, so a timer count alone passes without the page's fence; only a page that sets the phrase calls `join` | Reading the phrase from the DOM (the page is gone) |
| D-arc2-3 | 125: signal only a group whose leader is alive at teardown's entry (a group whose leader already exited gets no signal at all, where base sent SIGTERM); report `stopped`, and keep the lock and the node's data directory when a group may survive (Arc 2 audit rounds 1 and 2: Codex C1, C2, R2-1; Opus 2) | From entry on, some member holds the group id, so it cannot pass to another run's group; once the leader has exited before teardown nothing proves the group never emptied, which § Architecture 2.3's "while any member lives" did not cover, and the lock reaper already refuses such a group (D9). The lock is a survivor's only record | A per-spawn ownership marker read from `/proc` (Linux-only, and more than the entry needs); escalating every group (signals a reused id); refusing escalation once the leader dies during the grace wait (R2-1's second half: it would undo the entry, and reuse in that window needs the cyclic pid cursor to wrap back to the id within one 100 ms poll) |
| D-orch-2 | No edit to `follow-ups.md`, ever, the close-out included: each PR body lists the entries its arc closes with their governance ledger ids, and a partly built entry's remainder goes into the arc's section of the Outcome draft (orchestrator, at approval) | The file is being retired by the governance-1 lane, which turns every entry into an issue or a recorded disposition | § Close-out edits to follow-ups.md as planned |
| D-arc3-1 | 142 is tracked privately (GHSA-6cj6-wp78-52mc, filed by the governance lane, #236): the arc's commits, test names, lessons and PR body describe the change only, and this plan's and recon's text that described the weakness is replaced by that pointer | `SECURITY.md` § How findings are tracked: until the advisory is published its finding appears in no committed plan, PR body or test name | Keeping the approved text (it predates the rule, and an archived plan's copy was already rewritten by #236) |
| D-arc3-2 | 163: the guard reads the tracked files in JavaScript (`git ls-files`, then one regex per family) rather than `git grep -E`; its vocabulary adds `R<n>` and `round <n>` with a review word, which found a seventh comment (`coordinator.default-deriver.test.ts`, "The R1 audits'") | `git grep -E` has no portable `\b` (POSIX ERE leaves it to the platform's regex library), and the milestone shapes need word boundaries and case; a round number beside "audits" is the same provenance as "audit round" | `git grep -P` (needs a PCRE build); the plan's six-hit vocabulary (misses the seventh) |

## Audit verdicts

Both legs got the same packet: the adversarial and security ask, the assumption attack, the
implementation critique, and the reuse map. Paths below are repo-relative.

### Round 1: Codex (gpt-6.1-sol, high, read-only), `reject (blocking: Phase 1.5 assumes an unapproved behaviour change is unnoticeable; its upgrade-refusal rationale is incorrect)`

| # | Finding | Verdict |
|---|---|---|
| C1 | Blocking. Entry 34's change is visible to a dApp, and the plan's "refused at registration" claim is wrong: binding the original id still accepts an upgraded instance whose artifact matches the original | **Accepted.** 34 parked (D2); A2 withdrawn |
| C2 | `register-contract-void-conformance.test.ts`'s fixture carries only `currentContractClassId` | Moot: 34 parked |
| C3 | Group reaping from a persisted lock can signal a reused ID's group whose leader exited: wider than today | **Accepted.** Only the in-run teardown changes; 125 is rewritten to the reaper half (D9) |
| C4 | The test never exercises `killProcessGroup`, and a cooperative child proves no escalation | **Accepted.** Extracted to `process-group.ts`; tested with a `SIGTERM`-ignoring child and a normal-exit control |
| C5 | Zero console refusals can mean the HMR client never loaded; the registry cannot move the fixed port 8088 | **Accepted.** The probe claims 8088, records the WebSocket over CDP, and passes only on a completed handshake |
| C6 | The `##[` round-trip test contradicts the escaper, which neutralizes `##[` on purpose | **Accepted.** Round-trip covers `%`, CR and LF; the `##[` neutralization assertion moves unchanged |
| C7 | The `command -v` short-cuts let an ambient Bun or Node bypass the pins | **Accepted.** Pinned tools always installed and first on `PATH`; the test refuses a short-cut; an ambient-tool run is in the gate |
| C8 | No test covers the new branch's re-read guard or a non-object value | **Accepted.** Two cases added to Phase 1.3 |
| C9 | Arc 3 has no local e2e | **Accepted.** `incoming-transfers.test.ts` on both browsers after Phase 3.4, through the edited harness files |
| C10 | Minor: a template gate the existing `isLoading` binding fails; `vi.getTimerCount()` counts two timers; the salt grep cannot list only two lines; `error-envelope.ts`'s comment goes stale | **Accepted**, all four |

Checked and holds (Codex): A1 and OA-2's texts; the 202-entry arithmetic; deletions 29 and 183; no
overlap with #55, #58, #75 or accessibility-1; F5 to F7, F9 to F11; titles and lengths.

### Round 1: Opus (Plan agent), `conditional approve (conditions: findings 1 to 6 fixed before Arc 1 starts)`

| # | Finding | Verdict |
|---|---|---|
| O1 | `logOperationOutcome` still logs the refusal at `error`, so the security claim fails; `error-envelope.ts`'s comment goes stale | **Accepted** (D22). A composition test pins the level |
| O2 | The UI table misses the developer-mode raw block's `name` change (OA-2's surface 1); the "before" images are security-fixes-1's `after` set | **Accepted.** Row added and asserted in the e2e; A1 states the coverage |
| O3 | Binding the original id accepts an upgraded contract registered without an artifact; the entry's model is the stricter check | **Accepted** as a reason to park (D2). Opus's fix, the strict check, still changes which registrations succeed: an owner call |
| O4 | Orphan reaping by group is wider than today; the tree's `ownership.ts` already rejects that reasoning | **Accepted** (D9), with the same fix as C3 |
| O5 | The test's control signals an arbitrary pid on a shared host; a zombie answers `kill(pid, 0)` | **Accepted.** The reaper test is gone; the teardown test signals only its own groups and awaits the leader's exit |
| O6 | Eight more workflow-command sites; the gate grep cannot pass; `command`'s type differs | **Accepted** (D16). All twelve sites are in the change map; the gate grep is rewritten; F10 corrected |
| O7 | `failureKind` is shared with the first-party Send path | **Accepted** (D21) |
| O8 | `SendRecordView` has no error kind; the `TextEncoder` patch is unproven on Firefox | **Accepted.** The test reads the kind inline; a Firefox miss is recorded, never weakened |
| O9 | The dev-watcher test goes vacuous under `extensions: ["vue"]`; the change map misstates two files | **Accepted.** The test plants `.test.vue`; the map is corrected |
| O10 | No success control for the unmount case | **Accepted** |
| O11 | Pin keys carry no version; arm64 pins are dead | **Accepted** (D15) |
| O12 | The salt gate's grep cannot pass | **Accepted** (same as C10) |
| O13 | Port 8088 is fixed; a non-HMR refusal has no path; `bun run dev` leaves `dist/chrome` dev-wired | **Accepted.** The probe claims 8088, stops on any other refusal, and rebuilds `dist/chrome` |
| O14 | The new purge branches can push `purgeMalformedRows` past the complexity budget | **Accepted.** The decision goes in a pure helper |
| O15 | Triage-text slips (107 listed twice, 189's reason, 177's stale names, 150's row count) and no composition test named | **Accepted.** All corrected; `service.composition.test.ts` is in Arc 1's gate |

Checked and holds (Opus): F1 and the overlap map against each PR's own diff; F2; the eight
constructor flips; OA-2's relay; 1.1 to 1.4's claims; F6 to F9, F11; deletions 29 and 183; the 107
evidence; titles; no kept reason names a merged PR; the production CSP is unaffected.

### Final fresh Codex pass (gpt-6.1-sol, high, read-only), `conditional approve (conditions: move the remaining workflow-command sites onto the escaper and correct the parking of small, invisible cleanup subitems)`

| # | Finding | Verdict |
|---|---|---|
| F1 | AMO's ordinary log lines that carry API strings (`status`, `channel`, `fileStatus`) belong on `plain` too | **Accepted.** Every AMO line carrying API text goes through `plain`; tested beside a normal-status control |
| F2 | 172's first bullet and 186's late-listener bullet are invisible cleanups the record allowed; D19 misread it | **Accepted** (D19 revised, D23). Phase 2.5 builds both; both entries are rewritten to the rest |
| F3 | Adding the scope refusal to the Terms debug branch would log "terms not accepted" for it | **Accepted** (D22 revised): its own branch and fixed text, asserted |
| F4 | recon.md's reuse map still says to change `failureKind` and to bind the original class id | **Accepted.** Both rows corrected |
| F5 | Phase 3.5 says "149's three parts" | **Accepted.** It names the two non-CLAUDE.md destinations |

**Confirmation round** (same session, resumed with the revision): `approve`. One minor finding:
§ UI impact still said the refusal used the Terms refusal's branch. **Accepted**, reworded to its own
branch.

The driver also found and fixed, before this pass returned, two rows its own revision script had
written into the wrong table (§ What this lane builds and § File-level change map).

**Driver's own fix before the round-1 results:** `probeAnvil` moved out of `global-setup.ts`, whose
import registers process handlers and creates a data directory.

### Arc 1 fix loop

Diff: `origin/dev...HEAD -- apps packages` on `worktree-code-followups-2`.

**Round 1: Codex (gpt-6.1-sol, high, read-only), `approve with nits`.**

| # | Finding | Verdict |
|---|---|---|
| A1-C1 | Minor. Home's Recent activity card renders the same terminal-card subtitle, so it also reads "Not allowed"; § UI impact named History only | **Accepted.** Option A's "the subtitle 'Not allowed'" covers both lists; the table names both, and the e2e reads Home's card before History's (`ba12c4e`) |
| A1-C2 | Minor. `token-balance/spec.ts`: "one drain must fill exactly one chunk" is false (the queue drains per account, the projector chunks per chain) | **Accepted.** The comment states the bound that holds (`ba12c4e`) |
| A1-C3 | Minor. `account-state/service.ts`'s rewritten doc comment narrates | **Accepted.** Cut to its contract (`ba12c4e`) |

Checked and holds (Codex): no edited assertion weaker than at base; canonical account keys; the six
binding sites run in the service worker; classification survives aggregation, rebuild and envelope;
the first-party Send keeps its kind; both refusal log sites at `debug`.

**Round 1: Opus (general-purpose), `approve with nits`.**

| # | Finding | Verdict |
|---|---|---|
| A1-O1 | Material. `packages/wallet-bridge/README.md`, the dApp-facing contract, says a `SCOPE_VIOLATION` comes before any window and is fixed by a wider manifest; a selector mismatch is refused at execution and no manifest fixes it | **Accepted.** One paragraph added (`721fe5c`) |
| A1-O2 | Minor. `wallet-core/src/jobs/types.ts`'s producers list names only wallet-sdk for `scope_refused` | **Accepted** (`721fe5c`) |
| A1-O3 | Minor. § Security claims a spamming page no longer fills the `error` buffer; a windowed send's fee estimate and authorization preview still `console.error` from the execute window | **Accepted.** The claim is narrowed to windowless calls; the window's lines are pre-existing and need an opened window |

Checked and holds (Opus): nothing relied on the refusal being a plain `Error` (the one
`instanceof WalletError` branch, the port rebuild, batch propagation, the fast path's fallback);
revoke-authwits and registry-toggle also use `markFailedUnlessCancelled` but build calls by name and
never reach the binding check; the raw view gains only the `name`; the purge-by-key widening trusts
nothing new from values; no assertion weaker than at base.

**Round 2: Codex (same session, resumed with the fixes), `approve with nits`, "no new material
finding".** One minor: the narrowed § Security sentence bounded the window's log lines as "once per
window", but a fee-settings change in one window re-runs the estimate, and each failure logs.
**Accepted**, reworded. The loop converged: every round-1 fix held, and no regression was found in
the arc diff.

### Arc 2 round 1: Codex (gpt-6.1-sol, high, read-only), `approve with fixes`; Opus (general-purpose), `approve with fixes`

| # | Finding | Verdict |
|---|---|---|
| C1 / O2 | `killProcessGroup` can signal, and now SIGKILL, a reused group id when the leader and every member exited before teardown; the test's cleanup kills ids it proved gone | **Accepted** (D-arc2-3): only a group whose leader was alive at entry is escalated; the cleanup signals only a group still alive |
| C2 | The final wait's result is dropped, so teardown deletes the data directory and clears the lock while a member survives | **Accepted** (D-arc2-3): `stopped` is returned; teardown keeps the lock and the node's data directory for the next run's reap |
| C3 / O1 | The inline-script control does not separate the manifest policy from Chrome's baseline, so "`http:` admits `ws:`" is unproven | **Accepted.** A `fetch("data:")` control showed the dev popup runs under the baseline only; the claim is narrowed, the no-change decision stands (D-arc2-1, I1) |
| O3 | `pages-options.test.ts` no longer reds when the plain `**/*.test.*` glob is deleted | **Accepted.** The watcher case runs under a dot-directory and a plain one; deleting the glob reds the plain case |
| O4 | Three comments name their callers; "fails loudly" holds only under `E2E_REQUIRE_SETUP=1` | **Accepted.** Restated as invariants; the post-SIGKILL comment went with the `stopped` result |

### Arc 2 round 2: Codex (resumed), `approve with fixes`

| # | Finding | Verdict |
|---|---|---|
| R2-1 | A group whose leader exited before teardown still gets SIGTERM, possibly on a reused id; `leaderAliveOnEntry` does not prove ownership across the grace wait; the test cleanup cannot tell a replacement group | **Accepted in part** (D-arc2-3): an exited leader's group gets no signal; the cleanup signals only groups no case proved gone. **Rejected:** refusing escalation once the leader dies during the wait, which would undo entry 125 itself; reuse there needs the pid cursor to wrap back to the id within one 100 ms poll |
| R2-2 | The stubborn-member cases race the shells' trap installation | **Accepted.** Each case waits for its member's `ready` after the traps are set; the leaderless case uses a member that dies on SIGTERM, so its survival shows nothing was sent |
| R2-3 | The lock comment overstates what the next run's reap does safely | **Accepted.** Reworded to a best-effort record; the reaper's unconditional data removal is in entry 125's remainder |

### Arc 2 round 3: Codex (resumed), `approve with fixes — no new material finding`

| # | Finding | Verdict |
|---|---|---|
| R3-1 | Minor: `killProcessGroup`'s doc comment still claims a member holds the group id from entry on, stronger than the accepted residual risk | **Accepted.** It now says an unreaped leader pins the id for the first signal and escalation assumes no reuse between two polls |

Round 3 verified every round-2 fix and found nothing new; the loop converged.

Arc 2 round 1, checked and holds (both): every real route is still scanned; the overwrite mode keeps every
declaration a template uses; the seed latch releases in `finally`; the race results and records
are unchanged; no template, copy or selector changed; the budgets hold.

### Arc 3 round 1: Codex (gpt-6.1-sol, high, read-only), `approve with fixes`; Opus (general-purpose), `approve with fixes`

| # | Finding | Verdict |
|---|---|---|
| C1 | Material: `command("add-mask", …)` rewrote `##[`, so the runner masked a different string from the secret | **Accepted.** A mask's data is kept byte for byte (a `::` line parses before the legacy form is sought); every other command still neutralises `##[`; an exact round-trip case reds at the previous head |
| C2 | The pin test's Bun controls hardcode `1.4.2`/`1.4.3`, so a correct Bun bump reds them | **Accepted.** They derive the script's `BUN_VERSION` and use the next patch |
| C3 | The pin test checks that `sha256sum -c --strict` is present, not that its failure stops the script | **Accepted.** The check must end its statement with no `\|\|`, condition or assignment around it, under `set -euo pipefail`; `\|\| true`, `; true` and errexit-off controls |
| C4 | The Playwright note states the record's "best fit" as the cause and drops "at the time of the spike" | **Accepted.** Both qualifiers restored |
| O1 | Material: the download regex misses `if curl`, `while curl`, `! curl`, so an unpinned tarball in a condition passes | **Accepted.** The command-position alternation takes `!`, `else`, `if`, `elif`, `while`, `until`; an `if curl` control |
| O2 | `lock-version-run`'s version half proves nothing: `packageVersion` refuses with a fixed reason | **Accepted.** The case keeps the branch half and its title says so |
| O3 | Flake-ledger row 4's Firefox sentence cites a record that does not hold it | **Accepted.** It cites issue #185, where the sighting is recorded |
| O4 | Rows 47 and 48 cite the lessons logs for numbers that live in the archived `plan.md`; "1 in 100 CI runs" overstates "one rerun in 100 network-lane runs" | **Accepted.** Both cite `plan.md` too; row 47 says network-lane runs |
| O5 | The guard's scope leaves out `infra/`, which holds production code | **Accepted.** `infra` added; no hits there today |
| O6 | A parenthetical in § Architecture 3.3 went beyond describing the change (`SECURITY.md` § How findings are tracked) | **Accepted.** Removed |
| O7 | A rewritten comment in `tx-sendTx-multicall.test.ts` still names an unarchived plan path | **Accepted.** It names the `archive/` path |

Also tightened: the guard refuses a dotted plan-phase number (`Phase 3.2`), with a planted sample; no
hits in the tree.

### Arc 3 round 2: Codex (resumed), `approve — no new material finding`

Round 2 verified every round-1 fix: a mask's decoded value is exact and the runner's command echo
prints `***`; the ignored-checksum mutations are refused and a correctly re-pinned Bun bump passes;
the dropped version half leaves the meaningful assertions. It noted, without asking for a change,
that the pin test is syntax-sensitive: a future `sha256sum -c --strict --quiet` or a quoted
`"if curl …"` would need the guard adjusted. The loop converged.

Arc 3 round 1, checked and holds (both): every caller lost the salt pass and nothing reads it; every
workflow-command site under `scripts/` goes through `command`; the moved audit-gate case is unweakened;
both pins equal the publishers' `SHASUMS256.txt`; verification precedes extraction and the pinned
tools lead `PATH`, with `npm`, `node-gyp` headers and the cache volume still resolving; the other
routed lines match their records.

## Post-implementation

The implementing session runs these steps from this file. `code_review` is `off`, so no `/code-review`
step exists.

1. **Per-arc Codex audit at each arc boundary**, before `gh stack add` opens the next arc.
   - Write a prompt file under `~/.cache/nulo-backlog/code-followups-2/`, then run
     `env -u CODEX_ACCOUNT ~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <WT> high read-only gpt-6.1-sol`.
     `<WT>` is this worktree, on the default `~/.codex` login.
   - On a quota or 401 error, retry once with `CODEX_ACCOUNT=alejo-icloud`. If that fails too, log
     the failed consult in `lessons/phase-N.md` and continue on your own judgment within scope.
   - The prompt carries the arc's diff (`git diff <arc-base>..HEAD`), this plan and its decision
     ledger, and the arc map ("this is arc N of 3; later arcs add X").
   - It also carries an explicit adversarial ask: what could break in CI or in the wallet; which
     assertion is weaker than at base; what are we trusting that we should not.
   - It ends with the two rules below, verbatim.
2. **Fix loop.**
   - Verify each finding against the code first. Apply the accepted fixes and commit them.
   - Log the round in `lessons/phase-N.md`: the consult, the verdict, what was accepted, and what was
     rejected with reasons.
   - Resume the same session with `resume-codex.sh <session-id> <followup-file> <codex-dir> high` and
     the fix diff.
   - Stop when a round has no new material finding. **Hard stop at three rounds:** if the third round
     still finds material issues, stop and report it to the orchestrator.
3. **Final cross-arc pass**, after all three arcs are green and looped: a fresh Codex session over
   `git diff f557e20..HEAD`. It asks for cross-arc issues: seams, duplication across arcs, and drift
   from this plan. The same rules and the same loop apply.
4. **Delivery**, per the Delivery section: the first time any PR opens.
5. **Close-out**, as the stack's docs-only top layer:
   1. Merge `origin/dev` into the close-out branch first, as a merge commit, never a rebase of a
      pushed branch. Read what changed in `index.md`, `lessons.md` and `follow-ups.md`: another lane
      may have deleted or added entries. Never a union merge.
   2. Write `## Outcome` directly after the front matter: Date, Status, Shipped (PR numbers), Open
      items, and the line "Seeds retired: the /goal and /loop seeds below are no longer live".
   3. Edit `follow-ups.md` per § Close-out edits to follow-ups.md.
   4. Promote generalizable gotchas to `implementations-plan/lessons.md`: 8 KiB budget, deduplicate,
      retire what an entry supersedes, date tool versions.
   5. Delete `STATUS.md` and the "Live progress" link to it at the top of this file.
   6. In its own commit, `git mv implementations-plan/code-followups-2 implementations-plan/archive/code-followups-2`.
      Repair the relative links the extra level breaks (`../follow-ups.md` becomes
      `../../follow-ups.md`). Move the index line to `archive/index.md`.
   7. Report and stop. Merging is the orchestrator's call.
6. **Teardown after the merge.**
   - When
     `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/code-followups-2/plan.md`
     succeeds, run `agent-worktree done code-followups-2 --merged`. This step needs no approval.
   - If it refuses, relay its output and stop; never force.
   - A `/loop` session checks this on every firing. A `/goal` session arms one background wait after
     its wrap-up report:
     `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/code-followups-2/plan.md; do sleep 300; done`.

**No-over-engineering rule** (verbatim in every post-implementation Codex prompt): *"Report bugs and
small, targeted improvements only. Do not propose speculative abstractions, extra configuration
surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and
is clear, leave it alone."*

**Comment-quality rule** (verbatim in every post-implementation Codex prompt): *"Audit the comments for
value per character. Flag any comment that narrates what the code visibly does, restates its line,
references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and
flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are
permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and
exact."*

### Close-out edits to follow-ups.md

**Superseded by D-orch-2:** nothing below is applied to `follow-ups.md`. It is the record of what
each entry's disposition is; the PR bodies and § Outcome draft carry it instead.

Numbers are positions at `f557e20`. Match by text, since other lanes edit the file.

- **Delete:**
  - 29 and 183 (evidence in § Scope);
  - each built entry whose phase landed whole: 10, 26, 37, 64, 65, 95, 102, 130, 134, 135, 142,
    148, 150, 163;
  - 132 if all nine calls were converted;
  - 152 either way (fixed, or the probe found no refusal; the evidence goes in the Outcome).
- **Rewrite** to the part that is left: 107, 108, 125, 126, 149, 172, 186, and 132 if one call is
  left (the table in § Scope).
- **Add:** the entries in § Follow-ups found during planning.
- **Keep** every other entry as it is. Moved citations in kept entries (recon.md § Moved citations)
  are not rewritten, so the shared file's diff stays small.

## Delivery

**Superseded in part by D-orch-1 (no stack: one PR per arc against `dev`) and D-orch-2 (no
`follow-ups.md` edits; entries closed are listed in each PR body).** The titles below still hold.

One `gh stack`, one PR per arc. PRs open only after each arc's loop and the cross-arc pass converge.
No PR carries `Closes #n`: this lane closes follow-ups entries, not issues.

| Layer | Branch | Phases | Stacks on | `/code-review` | PR title (≤ 93 chars) |
|---|---|---|---|---|---|
| 1 | `worktree-code-followups-2` | 1.1-1.5 | `dev` | off | `fix(wallet): scope-refuse a selector mismatch, purge broken account rows, redact log lines` |
| 2 | `code-followups-2-extension` | 2.1-2.5 | layer 1 | off | `fix(extension): latch the secret pages, route only vue pages, reap e2e groups, allow dev hmr` |
| 3 | `code-followups-2-ci` | 3.1-3.5 | layer 2 | off | `ci: drop the dead fpc salt, pin docker bootstrap, escape workflow commands, guard comments` |
| 4 | `code-followups-2-close-out` | close-out | layer 3 | off | `docs(plans): close code-followups-2` |

**Title rules:**

- Lengths are 90, 92, 90 and 35 characters. Each plus ` (#NNN)` stays at or under 100.
- If Phase 2.4 changes nothing, layer 2's title drops ", allow dev hmr".
- Titles are lower-case on purpose, because commitlint's `subject-case` is `lower-case`.

**Mechanics:**

1. `gh stack init --adopt worktree-code-followups-2 --base dev`.
2. At each arc boundary, after its loop converges, `gh stack add <next-branch>`.
3. In Delivery: `gh stack sync`, then `gh stack submit --auto`, then `gh pr edit` each body. A body
   says:
   - what changed and why;
   - which follow-ups entries it closes;
   - the validation runs and their outcomes;
   - the overlaps named in § File-level change map.

   Arc 1's body leads with § UI impact's table, the owner's sign-off quote and the after-shots.
4. Open each PR without labels. Add `e2e:extension-network` or `e2e:extension-smoke` afterwards only
   where the path filter would skip a suite the arc needs. Arc 3's workflow and script changes may
   not match the network filter on their own.
5. Add the close-out layer, then `gh stack submit --auto` again.
6. Watch with `gh pr checks <n> --watch`.

Never merge; never `--admin`.

## Outcome per arc

Each arc's record as it landed; § Outcome is the summary.

### Arc 1

- Base moved: `origin/dev` at `79bbd7b` merged in (PR #58 has merged, so Phase 1.4 converts all nine calls and entry 132 closes whole); later `b55d88f` (#76) merged before the PR opened.
- Closed whole: 10, 37, 64, 65, 95, 102, 132 (issues #85, #102, #120, #121, #145, #150, #175). Nothing is left in part.
- Deviations: § UI impact gained Home's Recent activity card, which shares History's card component (Codex A1-C1; the e2e asserts it and the PR shows it). `packages/wallet-bridge/README.md` and `packages/wallet-core/src/jobs/types.ts` were edited beyond the file map, docs only (Opus A1-O1, A1-O2).

### Arc 2: extension pages, build and e2e harness

- **Closed whole:** 26 (submit latches and the seed page's unmount fence; the countdown's `start()`
  replaces an earlier countdown and arms nothing after dispose), 135 (only `.vue` files are routes),
  130 (`dtsMode: "overwrite"`; the two stale globals are gone), 152 (no change: the HMR socket is
  not refused, because the Chrome dev popup is served by crxjs's service worker and runs under
  Chrome's baseline extension policy, not the manifest's, D-arc2-1).
- **Closed in part; what is left:**
  - 125: the in-run teardown now waits on the whole process group and escalates it, for a group
    whose leader is alive as teardown begins; a group that may survive keeps the lock and its data
    directory (D-arc2-3). Left: a group whose leader exited before teardown is not signalled at
    all (base sent it SIGTERM), and the persisted-lock reaper (`killOrphanByPid`, `reap.ts`) still
    skips a group whose leader is dead and removes the data directory without waiting, because
    once the leader is gone nothing proves the group never emptied and its id was not reused;
    stopping such a group needs ownership evidence, as `tests/e2e/fixtures/browser/ownership.ts`
    takes from an environment marker.
  - 126: `probeAnvil` refuses an L1 whose chain id is not 31337 or whose block number is not a hex
    quantity. Left: no RPC proves `--slots-in-an-epoch 1` (anvil 1.4.1's `anvil_nodeInfo` does not
    report it), so adopting a running anvil still trusts that flag.
  - 172: the import preflight's and chain registration's races clear their losing timer. Left:
    `balances.store.ts`'s `withTimeout` settling one hop before a race, and the test-infrastructure
    `sleep` copies.
  - 186: a disposed `useIncomingTrustPrompts` registers no config listener after its clients
    disconnected. Left: FormPopup's raw order, non-contiguous orders after a re-open, and the
    per-owner reducer policies, each visible.
- **Found on the way:**
  - The old in-run teardown read only `child.exitCode`, which stays null for a leader killed by a
    signal, so every spawned group waited the full grace period and was then sent SIGKILL
    (`lessons/phase-2.md` § 2.3).
  - On Chrome, `bun run dev` never runs the popup under the manifest's CSP (crxjs's
    service-worker-served pages carry only Chrome's baseline extension policy), so a CSP
    regression shows only in production-mode builds: the e2e builds and their CSP recorder. A
    candidate issue for governance; nothing in this lane depends on it.

### Arc 3: CI, release scripts and docs

- **Closed whole:** 134 (`docker-ci-like.sh` installs Bun and Node only from its x64 hash pins,
  always, first on `PATH`; a test ties the Bun pin to `package.json#packageManager`), 142 (tracked
  privately: GHSA-6cj6-wp78-52mc; D-arc3-1), 148 and 150 (the eight gotchas, flake-ledger rows 47
  and 48, and row 4's Firefox symptom files, without row 4's cause), 163 (the static guard, and the
  seven comments it found rewritten; D-arc3-2).
- **Closed in part; what is left:**
  - 108: the network e2e workflows no longer pass `SPONSORED_FPC_SALT`. Left: the entry's first two
    items (two concurrent sends from one spend source cannot both land; no Node-side progress stall
    watchdog or fork memory cap), and the repository secret itself, which nothing reads now:
    deleting it is a repository-settings change for the owner.
  - 149: the `aztec-update` skill and `COMPOSITION-TESTS.md` lines shipped. Left: CLAUDE.md's
    release runbook half (wrangler's `routes` rule, an agent session's refusal of domain changes);
    CLAUDE.md is in PR #235's diff (D18).
- **Also recorded:** the folded sighting in #185 (`waitForExecuteApprovable … feeMethod:null` in
  `tx-sendTx-multicall` and `authwit-consume-smoke` on Firefox) now sits on flake-ledger row 4 as
  its own symptom, without row 4's cause, which is all its issue section asks.
- **Deviations:** the gate grep of Phase 3.3 matches one doc comment (`resolve-tag.ts:33`) that
  prints nothing; the Firefox store script routes every ordinary line through `plain`, not only the
  four named; `test:release` ran with a scratch `zip` on `PATH` (this host has none; CI's runners
  do). Evidence: `lessons/phase-3.md`.
- **Found on the way:** after #236 retired `follow-ups.md`, this plan's link to it failed
  `check:plans` on `dev` (report mode on push); fixed here. Open, needs an issue: CLAUDE.md's
  Bun-bump list does not name `docker-ci-like.sh`'s pins (the drift test fails a bump that misses
  them, but the runbook should list the site).

## Seeds

Recommended: `/goal`, because its completion is visible in the transcript. Use exactly one per
session.

```
/goal All phases in implementations-plan/code-followups-2/plan.md are marked ✓, each backed by its validation gate reported passing in the transcript; for each phase LESSONS_FILE=implementations-plan/code-followups-2/lessons/phase-N.md is printed; /code-review was NOT run (code_review is off); the Codex fix loop converged for each of the three arcs at its boundary and for the final cross-arc pass, each shown by a resumed gpt-6.1-sol pass reporting no new material finding, quoted in the transcript (or stopped at its third round and reported); Phase 1.5's after-shot texts match the plan's UI-impact table, quoted in the transcript; the four-layer gh stack exists on GitHub (gh stack view output in the transcript), opened only after the loops converged, with the close-out layer's archive-move commit shown by git show --stat; bun run test, bun run test:all and bun run lint all exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/code-followups-2 forward. Never idle. Each firing: (1) read plan.md and lessons/ from the stack's top layer; if the plan path is gone and `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/code-followups-2/plan.md` succeeds, run `agent-worktree done code-followups-2 --merged`, report its output, clear this loop and stop; if it fails, babysit the PRs only. (2) Waiting on CI is fine; confirm it progresses. (3) No task in hand: take the next pending step; run lint and the touched tests after each edit; commit; push only after the loops converge. (4) Stuck: consult Codex (gpt-6.1-sol, high) and log the verdict in lessons/phase-N.md; never cross a hard limit. (5) Same step failed 3 times: stop and reassess with Codex. (6) Phase gate green: paste it, mark ✓, print LESSONS_FILE; at an arc boundary run the Codex loop (hard stop at three rounds), then gh stack add. (7) All ✓: final cross-arc pass, Delivery, close-out, gh pr checks --watch, wrap-up report, stop.
```

## Follow-ups found during planning

Filed at close-out:

- **CLAUDE.md's Bun-bump list does not name `docker-ci-like.sh`'s pins** (Phase 3.2): #239. The
  drift test fails a Bun bump that misses them, but the runbook should list the site beside the
  others.
- **The `SPONSORED_FPC_SALT` repository secret is read by nothing** after Phase 3.1: did not hold.
  No secret of that name exists (§ Outcome), so there is nothing for the owner to delete.
- **On Chrome, `bun run dev` never runs the popup under the manifest's CSP** (Phase 2.4): knowledge,
  not work, so it went to `lessons.md`, not an issue.
