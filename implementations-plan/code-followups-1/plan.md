---
plan: code-followups-1
tier: mid
status: planning, awaiting approval
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 Explore agents (sonnet); dual audit (Codex gpt-6.1-sol high + Opus Plan); one final fresh Codex pass
base: origin/dev at a6c2fb5 (recon read at 86a89c5; #60's merge changes only network/spec.ts among this plan's files)
trunk: dev
issues: none (follow-ups.md entries; no GitHub issue)
---

# code-followups-1 — prune the follow-ups, ship the small code ones, settle the boot-line "flake"

The open entries of [`follow-ups.md`](../follow-ups.md) that are code work with no visible change and
no design decision, plus one CI reliability item. Three jobs: prune what is already resolved, build the
small entries in three stacked arcs, and list the rest under "Not this lane" with one reason each.
Nothing here changes what a person sees.

Recon: [recon.md](recon.md). Live progress: [STATUS.md](STATUS.md). Owner asks:
[OWNER-ASKS.md](OWNER-ASKS.md) (none).

**UI impact: none.** No wallet screen, copy, layout or value format changes. One invisible change,
named so a reviewer can check it: the History page's root (`activity-feed-root`) gains a
`data-incoming-loaded="true"` attribute once its first incoming read lands (Phase 4). Nothing renders
it. Everything Arc 3 deletes never rendered: an unopened popup and its two store fields, an unread CSS
variable, an unread row field, a form field with no input and an unused schema. The playground is not
touched.

## Tier and budget

`mid`, set by the orchestrator. Rubric: all six dimensions are low. Every change is local, reversible,
test-or-tooling heavy, and touches no storage shape, crypto or trust boundary. The lane is wider than
one feature, so it splits into three arcs inside this plan.

## Outcome & Quality Bar

**For whom.** The maintainer and the agents who read `follow-ups.md` at the start of every plan; the
CI reader who meets a red network lane; the person holding funds, who must notice nothing.

**What excellent looks like.**

1. `follow-ups.md` is true at close-out: every entry this lane resolved or found resolved is gone, with
   its evidence in this plan; every parked entry is still there, untouched unless this plan rewrites it.
2. The network-lane "flake" is explained with evidence a reader can rerun (a run id, a grep, a probe
   log), and the one real race behind the only rerun is closed in the test, with a deterministic
   component test for the hydration order it waits through.
3. Each built entry lands with the smallest test that fails before it and passes after; every
   never-happens assertion sits beside a success control; no test is weakened to go green.
4. No file that an open PR (#55, #56, #58, #61) or an in-flight lane changes is touched, except where
   this plan names the overlap and the reason.

**Good enough.** The parked entries stay parked; this lane does not reword the parked prose beyond the
entries it rewrites. A flake seen once in about 100 runs cannot be proven gone by greens alone; the
claim rests on the mechanism, the probe and the component test, and says so.

## Scope

### Triage of the 188 entries

Recon checked every entry against the tree at `86a89c5` and the merged PRs the brief named (#6, #9,
#10, #36, #41, #48, #50, #51, #52, #54, #57). The full table, with evidence per entry, is in
[recon.md](recon.md) § Triage. Counts: **14 build**, **9 delete**, **7 rewrite**, **158 keep**.

**Delete at close-out (resolved), with the evidence:**

| # | Entry | Evidence at `86a89c5` |
|---|---|---|
| 115 | `packages/resolve-asset` still tests on Node | CLAUDE.md § Working in this repo records its plain `vitest run` as a Node exception, the entry's second option |
| 120 | The home-path guard runs only as a local hook | `scripts/ci-cd/no-local-paths.test.ts` runs in `test:ci-gating` (`bun test scripts/ci-cd/`) (#57) |
| 122 | The auto-unstick switch's next stage is due | The in-code default flipped: `parseAutoUnstickFlag` reads unset or empty as on (`scripts/release/auto-unstick-run.ts:66-71`) (#57) |
| 123 | Attest the release zips | `release.yml:473-477`, `:535`: the zips are attested before publish (#50) |
| 125 | The Chrome preflight lets a `STAGED` revision through | `scripts/release/publish-chrome-store.ts:106` refuses `STAGED` with its own reason (#57) |
| 127 | commitlint accepts a subject CLAUDE.md forbids | `.commitlintrc.json:4`: `"subject-case": [2, "always", "lower-case"]` (#57) |
| 101 | The `sim-methods` case for `executeUtility` never exercises a successful call | A successful `executeUtility` under the same accounts-cap session is asserted elsewhere, through the playground's register-then-read controls (`pg-btn-phase-register`, `pg-btn-phase-balance`): `stale-anchor-recovery.test.ts:166-187` on `dappConnectedExtensionWithAccountsCap`, and `connect-locked-queue.test.ts:51-57`. The `sim-methods` case is a silence check, and its button is the no-capability probe `err-scope-and-cap` needs |
| 132 | Lint and type-check the root `scripts/` tree | `biome.json` includes `scripts/**`; `typecheck:all` runs `typecheck:scripts` (`tsc -p scripts/tsconfig.json`) (#57) |
| 177 | Contacts import keeps outer spaces in staged names | `utils/contact-import-rows.ts:39` stages names with `sanitizeContactName`; both name maps key by `contactNameKey` (`:56`, `:79`) (#41) |

Entries 120, 122, 123, 125, 127 and 132 are also on supply-chain-release's close-out list. Whichever
close-out lands second finds them gone and skips them.

**Rewrite at close-out (partly resolved or moved):**

| # | Entry | What is left |
|---|---|---|
| 63 | Playground executeUtility + typed "not a utility function" refusal | The typed refusal only: it changes the error text a dApp receives (owner). The button stays: two suites use it as a call that fails, and a working utility call already has its controls (entry 101) |
| 75 | A reorg that re-mines a surviving incoming transfer emits nothing | `onIncomingTransferUpdated` is now declared but still never emitted; emitting it changes what an open received page shows (owner) |
| 130 | Route the retired e2e gotchas into the e2e-testing skill | The certifying-greens item is already in the skill; the rest is docs routing, and that skill file is edited by PR #56 and hardening-2 |
| 156 | `TooManyPendingError` does not survive a port | Survival only: it changes what a dApp receives (`-32005`). Phase 7 corrects `operation-result.ts`'s comment, which still calls one class the sole code-channel failure where `rpc-cancel.ts:94-100` sends six |
| 163 | Popup reducers the harness cannot stage, plus two removals and a key swap | Phase 7 removes `SelectNetworksPopup` and `--displace`; the reducers and `useContactImportExport.ts`'s keys (PR #56) stay |
| 175 | A recurring Firefox network-lane flake | Drop the port-collision attribution: the boot line prints on every green shard (Arc 1). The `feeMethod:null` failures stay open, pointing at the e2e-testing skill's flake-ledger row 4 |
| 165 | Smaller residue | Phase 7 removes `EditNetworkPopup`'s URL field and the unused `NetworkInfoSchema`, and uses `accountScopeKey` in restore; the `Buffer` encoders (an accepted-complexity copy of upstream) and `RestoreData` (narrowing it means guards in its readers) stay |

### What this lane builds

| Arc | Phase | Entries | What |
|---|---|---|---|
| 1 CI reliability | 1 | 175 (part) | Say where `Address already in use (os error 98)` comes from, in the setup's own log |
| 1 | 2 | (the one rerun) | Close the awaiting-card hydration race in `same-token-concurrent-sends` |
| 1 | 3 | 147 | Rerun Firefox prover-ON `imported-account-execution`; route the result |
| 2 tests and tooling | 4 | 98, 100, 10 | A History load signal instead of a 3 s sleep; price-fixture's budget; `shotSend` waits for the flip's transitions |
| 2 | 5 | 97, 102, 119, 133, 144, 146 | Skill wording, Storybook config, pages watcher exclude, landing config import, two test timeouts |
| 2 | 6 | 106, 174 | The real hash + decoder + `callSurface` node test; measure the test-count drift |
| 3 wallet code hygiene | 7 | 103, 163 part, 165 part, 156 part | Drop `isMinting`, `SelectNetworksPopup` and its store fields, `--displace`, the URL field, `NetworkInfoSchema`; use `accountScopeKey`; correct one comment |
| 3 | 8 | 149 | Stop the legacy boot sweep from deleting bb.js's CRS cache |

Two of these may end as evidence instead of code: 147 (Phase 3, by its routing) and 174 (Phase 6, by
its stop rule). Then the close-out rewrites the entry with what was learned instead of deleting it.

### Not this lane

Open GitHub issues this lane leaves alone, named because the brief lists them: **#24** (strict mode
needs a recovery bearer for service-worker restarts; entry 99 below is tied to it) and **#15** (dApp
calls dispatched before the emoji check). No follow-ups entry names #15.

One line per kept entry, grouped as `follow-ups.md` groups them. "Owner …" means the entry changes a
screen or a behaviour a person would notice, or asks for a product decision; "in PR #n" or
"hardening-2's" means another open line of work owns the file.

**Top of the file (no section)**

- 1. The gas link — External trigger: unleashed has no public mainnet bridge yet.
- 2. Unleashed publishes no privacy notice — Owner call in another repository.

**Aztec V6**

- 3. Fetch the default token list instead of building it in — Owner-parked: the fetched token list.
- 4. A V6 mainnet seed and its fee policy — External trigger: no V6 mainnet yet.
- 5. An automated live-transaction smoke — Owner call ("if wanted").
- 6. `presto-banners` 1.2.0 — presto-banners renders the onboarding banner, so a bump can change a screen.

**Grants and scopes**

- 7. Every other failure before a dApp send is claimed reads "Popup closed early" — Copy call; background.ts is in PR #58.
- 8. A dApp cannot widen a contract-classes grant — Product change for its own plan; dispatcher is hardening-2's.
- 9. Repeated scope refusals pile up in Activity — Changes which Activity rows show.

**Send amounts**

- 11. The unit switch, Max and Refresh quote are mouse-only — Accessibility wave.
- 12. A press on Max while the destination holds the focus is lost — Changes the page or the press: owner call.
- 13. In USD mode a long derived amount wraps the line under the field — Owner layout call.
- 14. At rest the USD field hides its tail — Owner layout call.
- 15. A wrapped review line indents its symbol 4 px — Cosmetic call.
- 16. The fiat notice can say the price moved when it did not — Copy call.

**Wallet safety**

- 17. The address-keyed fee maps outlive a deleted profile off the live path — Needs its own decision; reset.vue is in PR #56.
- 18. An Allow the watchdog displaced mid-un-hide leaves receipts hidden under `trusted` — Accepted residual with a BUG PIN.
- 19. A pin or a token-deletion cleanup racing a profile deletion can recreate its pinned-tokens key — Accepted residual; needs a fencing design.
- 20. Two of the token add's compensations delete by id without lock ownership — Needs its own decision (entry says so).
- 21. Recovery phrase and Change password have no submit latch — Changes what a double-click does; change-password.vue is in PR #56.
- 22. Two keyboard focus rings do not show — Accessibility wave.
- 23. Send's token card has no focus style of its own — Accessibility wave.
- 24. A restored token with a receipt opens the first-receive prompt — A person would notice the prompt no longer asking.
- 25. The first-receive trust prompt shows no explorer link — New UI.
- 26. A deleted default token returns after a full-backup restore on a fresh install — Backup-slice design or an accepted gap: owner call.
- 27. `AccountService` has no chain-scoped critical section — Design: a new critical section, not a small change.
- 28. Creating a profile waits for activation with no identity check or deadline — A deadline needs a failure surface the owner has not chosen.

**Amounts, sends and fees**

- 29. Six surfaces still read a token without a decimals getter in base units — Changes how an edge-case value is formatted; "when next touched".
- 30. A mint outside the standard shapes shows no amount — Feature for its own plan.
- 31. A listed token's mint figure rests on its method's name and arity — Feature for its own plan.
- 32. An unlisted token's mint shows no amount — Feature for its own plan.
- 33. The authwit popups keep the 60 s ceiling — Removes a visible false failure; what the popups show while waiting is the owner's.
- 34. A definitive "won't go through" — Design; needs an upstream field.
- 35. A checked dApp send can leave its public authwit out of the revoke index — The revoke list would show a new row.
- 36. A chain prune after inclusion is caught by no send path — Design with its own copy.
- 37. A failed card beside a settled row for the same send — Owner UI call.
- 38. A neutral snack style for "Send not confirmed" — Owner UI call.
- 39. The status colours' contrast in the light theme — Accessibility wave.
- 40. A node's refusal at the send line reads "Not confirmed yet" for 30 minutes — Copy and design.
- 41. A checked record shows no tx hash or explorer link — Owner UI call.
- 42. Home's error snack covers the row above the tab bar — Owner UI call.
- 43. The Revoke authorizations and authwit registry popups never check the sponsor — Needs an estimate or a probe in each popup: design.
- 44. A dApp's embedded sponsor payment is never checked — Owner UI decision.
- 45. The dApp window offers no way to get fee juice when nothing can pay — Owner UI call.
- 46. A Confirm before a sponsor-paid estimate returns skips the funding check — Accepted as today's behaviour.
- 47. A re-enabled Sponsored row reads "free" before it is checked again — Copy call.
- 48. The sponsor notice is not announced — Accessibility wave.
- 49. A hand-added sponsor that falls back to Nulo's names the payer by its row title — Copy call.
- 50. Owner decision: a failed first price fetch still ends Home's hero in "$0.00"… — Owner decision.
- 51. Revisit the private-origin fee order when a funded sponsor ships on mainnet — External trigger: a funded mainnet sponsor.
- 52. An embedded fee payment with no `maxFeesPerGas` commits an unpadded cap — Design (FPC budget assertion).
- 53. The fee-estimate admission cap frees a slot while its simulation still runs — Design (offscreen ack).
- 54. Two `BATCH_SIZE = 12` constants size the batched balance views — balance-job-queue.ts is hardening-2's.

**Connecting a dApp**

- 55. The connect page's header names the active network, not the dApp's — Owner UI call.
- 56. The waiting connect window still says the dApp "wants to connect to your wallet" after Allow — Copy call.
- 57. The connect step bar's empty half barely shows — Accessibility wave.
- 58. A connect window whose wait fails closes with no message — Owner UI call.
- 59. The swap to the emoji check in the connect window is likely not announced to screen readers — Accessibility wave.
- 60. A dApp refused for want of a current Terms acceptance opens nothing in the wallet — Owner UI call.
- 61. A `sendTx` leg inside a dApp `batch` gets no queued journal record while it waits — Design; background.ts is in PR #58.
- 62. Ask upstream whether `@aztec/wallet-sdk` should refuse a discovery… — Upstream question.
- 64. Deleting one profile's dApp-session row tears down another profile's live channel on the… — background.ts and session-revocation.ts are in PR #58.

**Layout**

- 65. Home's two view links are mouse-only — Accessibility wave.
- 66. From a token's page, History should open filtered to that token — Owner UI call.
- 67. The two view links fail contrast — Accessibility wave.
- 68. Screen readers hear History's and Settings' title twice — Accessibility wave; settings/index.vue is in PR #56.
- 69. Home's section header against the drawing — Cosmetic call.
- 70. Onboarding ignores the stored theme — A person would notice.
- 71. Paste a token address into the Holdings search to add it — Feature.

**Copy**

- 72. Add token shows the PXE store's developer errors verbatim — Copy call.
- 73. A password profile's unlock that fails for an unexpected reason shows nothing — Copy call.

**Incoming transfers**

- 74. New incoming public transfers wait on a from-zero history scan — Owner-parked: the tip-first scan.
- 76. Incoming note rows are never reconciled against the PXE — Design.
- 77. An opt-in "Privacy maxi" setting — Owner feature.
- 78. Only transactions get explorer links — Owner UI call.
- 79. The incoming-transfer pollers call dRPC every 30 s per watched token, on the shared key — Product call.

**Backup and storage**

- 80. A profile deletion leaves a JSON-broken account row at its canonical key — purge-rows.ts is hardening-2's.
- 81. The migration engine has no watchdog on `up()` — Decide before the first real migration; migration engine is hardening-2's.
- 82. An edited Local Network reads "InvalidChain" and drops out of full backups — Owner nice-to-have design.
- 83. Report the handshake-loss behaviours to aztec-packages — Upstream report.
- 84. Recovery for installs that already lost a third-party note — Owner call.
- 85. Nothing stops a second own window for the same flow — A person would notice (focus instead of a new window).

**Older plans' residuals**

- 86. account-switch-isolation's restructuring stages were not built — Design.
- 87. No network e2e proves two concurrent NO_FROM sends serialize and both confirm — Blocked: no NO_FROM-compatible private call.
- 88. Owner check: does the Queued card switch macOS Spaces? — Owner check on a Mac.
- 89. First-party service methods still trust a caller's `profileId` — Owner call.
- 90. proverless-network-stabilization left three items — Design; the salt sits in workflows hardening-2 edits.
- 91. Onboarding has no "Grant access" step for Presto on Firefox — Owner UI call.
- 92. The Ready-handshake transport rework is parked — Owner-parked: the Ready-handshake rework.
- 93. `ConfirmPopup`'s passkey confirmation is dead — ConfirmPopup.vue is in PR #55.
- 94. A passkey profile created in the page saves a second passkey when its… — A person would notice.
- 95. Owner checks on a Mac: does Firefox's toolbar panel survive the file picker,… — Owner check on a Mac.

**Tests and e2e**

- 96. Test whether `withStaleAnchorRetry` retires the e2e's 5 s anchor sleep — helpers.ts, selfpay-phase and store-captures are in PR #56.
- 99. The strict-mode opt-out restore has no e2e — sw-resilience and settings pages are in PR #56; tied to #24.
- 104. `passkey-backup.test.ts`'s export case is skipped on CI and fails on a fast host — passkey-backup.test.ts is in PRs #55 and #56.
- 105. The playground's multicall sends nonces the standard Token refuses — Needs a live run to establish, then a playground change: not small.
- 107. No e2e shows a discovered authorization's transfer row — Needs a network that publishes the standard contracts.
- 108. No e2e shows a private transfer's row — A new playground control plus a private-balance e2e: not small.
- 109. CI builds no Storybook — Adds CI minutes to quality-status: owner call.
- 110. An earlier green copy of a required check stands while a later run of the same head works — Accepted window.
- 111. A PR run decides from its own event's snapshot, and runs can reach their… — CI design; the lane workflows are hardening-2's.
- 112. The e2e aggregators trust GitHub's fold of a shard matrix — Unverified report; the aggregators sit in workflows hardening-2 edits.

**Dependencies and supply chain**

- 113. `hoist = false` is still not set — Its own gate after a soak.
- 114. Two auto-import globals outlive their exports — auto-imports.d.ts is in PR #56 (stale names now at :277 and :284).
- 116. Retire vitest's interop stopgap — Waits on vitest 5.0.1 or later.
- 117. Nine `z.nativeEnum` calls use an API zod 4.4.3 deprecates — dapp-session/spec.ts is in PR #58, and the nine calls move together.
- 118. Five declined third-party-notices items wait on their triggers — External triggers.

**Release**

- 121. The store launch's owner steps are open — Owner steps.
- 124. A store-match check — Supply-chain follow-up; design.

**Plans, docs and tooling**

- 126. The plans `.gitignore` catches only four transcript shapes — Owner call (entry says so).
- 128. No release step refuses a stable publish while a `«FILL»` placeholder survives in `legal/` — Release-process gate: owner call.
- 129. Every document log line, debug included, crosses to the worker as an RPC — Design (client-side level gating).
- 131. Route four retired gotchas to their owners — Docs routing, not code; CLAUDE.md is in PR #56.

**Issues**

- 134. The fee-cap change's post-audit proposals, to re-check against the tree — Design.
- 135. A resurrected late-mined authwit transaction leaves its registry row pending forever — Design; no site cited.
- 136. Accounts deployed under an older artifact than the wallet's aztec.js — Design; no site cited.

**ux-feedback: owner decisions**

- 137. The full-backup import's yellow warning reads at about 1.6:1 on the light theme… — Owner decision.
- 138. A Retry on the import's errors screen that fails again returns a… — Owner decision.
- 139. The import's error viewer lists networks by id, and onboarding's `View errors`… — Owner decision.

**ux-feedback: technical**

- 140. vitest 4.1.10 never re-runs a fixture setup that failed: a retry of a… — Waits on a vitest release.
- 141. A full backup's account-state still carries the contracts every PXE boot… — Backup-format design.
- 142. An import could also skip the profile's own account contracts and Nulo's… — Backup-import design.
- 143. A popup closed during the import's account-state tail loses its per-network… — Owner design; profile service is hardening-2's.
- 145. A static guard against workflow references in code. Nothing yet refuses a new… — A new gate that needs an allowlist for the existing archived-plan citations: design.
- 148. The e2e tree does not type-check: no type gate reads `tests/e2e/**` (only… — 103 errors to fix first; fixtures/extension.ts is hardening-2's.

**harden-dedupe: robustness**

- 150. No CI lane proves in browser WASM — CI minutes: owner call.
- 151. An unknown `priorityLevel` from malformed internal popup RPC input — Owner lead: `operation-estimate-reuse.pins.test.ts:344` keeps the throw on purpose.
- 152. `safe_json_rpc_client` returns `undefined` for a null-like node result before schema parsing — Upstream code.
- 153. Account RPC params are not schema-validated — Not small: a params schema per account method, and its texts are copy.
- 154. The SDK `chainInfo` decoder folds non-canonical fields onto canonical composites — Changes which dApp sessions resolve.
- 155. An NBSP in an RPC URL — A stricter URL check refuses input in Settings.
- 157. Async drift kept as today — Kept as today.
- 158. Decode drift kept as today — Kept as today.
- 159. The incoming arms differ in dedupe order, call counts and record timing — Design.

**harden-dedupe: deferred dedup**

- 160. Program-level deferrals — Deferrals, each with its reason.
- 161. Fee and reuse helpers that would add an await or move reads — Would add an await or move reads.
- 162. Row lifecycle — Design (the cited names are not found; code moved).
- 164. Visual shells left local — Visual shells: cosmetic.

**harden-dedupe: owner UI and drift**

- 166. BalanceView's add has no id dedupe — Owner UI drift (section rule).
- 167. Enter at a failed full-backup import re-runs the restore while its button is disabled — Owner UI drift.
- 168. The import-contacts sheet pushes the EXISTING tag off the card edge — Owner UI drift.
- 169. Change password reveals current, new and repeat together — Owner UI drift; PRs #55 and #56.
- 170. Journal rows have two profile rules and three network rules — Owner UI drift.
- 171. Popup stacking drift — Owner UI drift.
- 172. Detail pages — Owner UI drift.
- 173. LogsViewer appends the first live log line to the last loaded line — Owner UI drift (the log viewer's text).

**harden-dedupe: behaviour-alignment**

- 176. Home's in-progress card shows "0" for an empty `amountRaw` — Owner UI call.
- 178. Two more popups compare names untrimmed — A person would notice a duplicate now blocked.
- 179. NewSenderPopup's own shake ignores reduced motion — Accessibility wave.
- 180. "Disable animations" stops transitions, not keyframe animations — Accessibility wave.
- 181. Merge the skeleton shimmer twin — Cosmetic CSS: a visual check for no gain in behaviour.
- 182. At the 25-character name cap, the contact popups block a duplicate but show only "Maximum… — Design-system decision.

**harden-dedupe: same-token concurrent sends**

- 183. Confirm a queued send at once, then estimate and send it when unblocked — Owner-parked: queued same-token sends.
- 184. dApp sends are not ordered behind earlier sends until inclusion — Owner-parked family: send ordering.
- 185. Three send-ordering questions carry a working answer — Working answers for the owner; one already in code.
- 186. Send-ordering residuals that fail as before, never worse — Design.
- 187. The send chaos run's nightly jobs are advisory — Promote or drop after weeks: owner call.
- 188. A fee-method click right after a dApp send may not take — Product behaviour.

## Architecture & Implementation

### Arc 1 — the boot line and the one real rerun (CI reliability)

**The briefed claim did not hold.** `[aztec-node] Error: Address already in use (os error 98)` is not a
port collision and causes no failure:

- It prints on every shard of a fully green run: 8 of 8 jobs in run 37855435855 (Chrome network lane),
  each about 50 ms after `[e2e-setup] Starting local Aztec network`. It also prints in the green
  sibling shards of the one rerun.
- Its source is the Aztec CLI wrapper. `global-setup.ts` starts its own anvil (`ensureAnvil`,
  `--host 127.0.0.1 --port $ANVIL_PORT --chain-id 31337 --slots-in-an-epoch 1`), waits until it
  answers, then spawns `<AZTEC_ROOT>/node_modules/.bin/aztec start --local-network …` with
  `ETHEREUM_HOSTS=$ANVIL_URL` and `ANVIL_PORT=$ANVIL_PORT`. That entry is
  `@aztec-labs/aztec/scripts/aztec.sh` (6.0.0-rc.1); its `start --local-network` case runs
  `anvil --silent --port "$ANVIL_PORT" &` unconditionally before `exec node …`. The second anvil (Rust:
  "os error 98" is Rust's `io::Error` format) loses the bind and exits; the node uses the setup's
  anvil through `ETHEREUM_HOSTS`. `createLocalNetwork` spawns no anvil itself.
- `.claude/skills/e2e-testing/SKILL.md` §4 already calls the line cosmetic.
- The real boot-time `Address already in use` (the node's own `.listen()`, a Node `EADDRINUSE`) was the
  old "sticky boot flake"; `scripts/e2e/resolve-ports.ts` fixed it by drawing ports from a static
  window below the ephemeral floor, and a boot failure still gets one bounded retry (exit 86).
- Since this repository's CI started (2026-10-06), the Chrome and Firefox network lanes have 50 runs
  each and one rerun: run 37790178426, attempt 1, job "heavy / concurrent-confirm". Its failure is
  `expected null to be 'queued'` in `same-token-concurrent-sends.test.ts:320`, then a cascade.
- The Firefox `waitForExecuteApprovable: … feeMethod:null` symptom has no occurrence in the current
  history. It stays with flake-ledger row 4 (open).

**Phase 1 — say what the line is, where it prints.** Codex picked "docs only" over bypassing the
wrapper (A) and over rewriting the vendor line (B); see the decision ledger. This plan keeps the vendor
line untouched and adds one sentence from the setup itself, because the skill's explanation
did not stop two misattributions (harden-dedupe's, and this lane's brief):

- `spawnAztecNode` logs once, right after the spawn:
  `[e2e-setup] the aztec CLI wrapper also starts an anvil on :<ANVIL_PORT>; its bind error at boot is expected`. It does not repeat the vendor's
  text, so a count of the vendor line (this plan's own evidence method, and the e2e-testing skill's
  log forensics) stays a count of the vendor line.
- A one-line comment at `ANVIL_PORT: String(ANVIL_PORT)` in the node's env: the wrapper starts its own
  anvil on `$ANVIL_PORT` (8545 when unset); pointing it at the setup's port makes it exit instead of
  running a second, unowned L1.

**Phase 2 — close the hydration race in the test.** Mechanism, read in the code:

- `RecentActivityView.vue`'s `onMounted` awaits `loadExecutingTaskSnapshot()` before
  `resnapshotJournal()`. Until the journal snapshot lands, an active UI-transfer task shows as the
  orphan-task card (`hasOrphanExecutingTask`), and a pending tx record can show the bare fallback card
  (`showFallbackAwaiting`). Neither passes a `stage`, so `TransactionAwaitingCard` omits `data-stage`.
- `readAwaitingCard` (`same-token-concurrent-sends.test.ts`) waits for ANY `tx-awaiting-card`, then
  reads the first card's `data-stage`. Right after `reopen`, the first card can be the stage-less one:
  `null`. The sibling test that passes waits on the journal row first (`expectStageHeld`).
- The second failure in that job (`waitForFreshBalanceRow` in `expectLedger`) is inferred to be a
  cascade: the failed test never cancelled or settled its second send, `afterEach` released mining, so
  the next test's ledger was off.

Change: replace `readAwaitingCard` with `waitForAwaitingCard(page, stage)`, a Node-side bounded loop
(one short `page.evaluate` per 250 ms, the shape of `waitForTransferStage`) that reads every
`tx-awaiting-card` and returns only when exactly one exists, its `data-stage` equals `stage`, and its
cancel control is present. Any sample that holds more than one card throws at once, as the base's
immediate `count: 1` did: only a sole stage-less card is waited through. Two budgets: up to 30 s for
the first card to appear (today's `waitForSelector` budget), then 10 s from that moment for the full
condition. On either timeout it throws with the last snapshot of every card (stage, subtitle, cancel
present), so a duplicate, a card that never gets its stage, or hydration slowed past 10 s still
fails, with evidence. The failing case also waits on the journal row first, as its sibling does. Both
call sites keep their assertions on the returned snapshot.

Deterministic evidence, committed: a `RecentActivityView.test.ts` case that holds `getOperations`,
seeds an active UI-transfer task, and checks that the view shows one stage-less card; then it resolves
the journal snapshot with that send's queued record and checks that exactly one card remains, with
stage `queued` (never two cards for one send: the never-happens half, beside the success control of
the stage arriving). It passes at base too: it characterizes today's order, which is what the e2e wait
now tolerates, and it is the test an owner decision to hold the card until its stage is known would
change (§ Follow-ups found during planning).

Live evidence, uncommitted: a throwaway probe that records every awaiting-card snapshot for 3 s after
`reopen` in the failing scenario logs how often a stage-less card comes first. Then the two
"two windows" cases run at retry 0 five times per browser, and the whole file once per browser.
Per Codex, those greens cannot prove a ~1 % flake gone; the claim rests on the mechanism, the
component test and the probe, and the plan says so.

**Phase 3 — recheck entry 147 (Firefox prover-ON `imported-account-execution`).** The entry read an
overrun of `sendTransfer`'s 300 s wait as the popup's old 60 s `executeTransfer` deadline; that deadline
is now 60 minutes (`execution/client.ts:11`), and flake-ledger row 42's `network/transfers` has since
passed on Firefox without Presto. This phase reruns the file once on Firefox, prover-ON, with WASM
proving, and times its three `sendTransfer` calls (`imported-account-execution.test.ts:69`, `:102`,
`:174`). The 300 s bound is `sendTransfer`'s wait for the "Transaction submitted" toast
(`fixtures/helpers.ts:1199`), not the whole helper; the existing log times neither, so a temporary,
never-staged copy of the file records a timestamp before and after each call. It writes no code.
Outcome routing: every call submits inside its 300 s toast wait → entry 147 is deleted at close-out
with the three durations; a toast wait that times out with no protocol error → a WASM proving-time
line goes into the `aztec-update` skill, beside its note that a local `e2e:agent` falls back to
in-browser WASM (`SKILL.md:126`), and entry 147 is deleted; any other failure → recorded, and the
close-out rewrites entry 147 with it. Nothing is fixed here.

### Arc 2 — tests and tooling

**Phase 4 — signals instead of sleeps, honest budgets.**

- *98, the History load signal.* `useIncomingTransfers` (`composables/useIncomingTransfers.ts`) returns
  a new `loaded: Ref<boolean>`: false at start, set true only where `readRows` assigns rows for the
  current scope (after its stale checks), and set false again by the synchronous scope-switch reset.
  `refresh` on a scope that is not ready never sets it. `activity.vue` binds
  `:data-incoming-loaded="incomingLoaded ? 'true' : undefined"` on `activity-feed-root`, beside
  `data-active-account`. `network/incoming-transfers.test.ts` replaces its 3 s sleep with
  `page.waitForSelector('[data-testid="activity-feed-root"][data-incoming-loaded="true"]', { timeout: 30_000 })`
  and keeps the zero-card assertion. A hung or rejected read now fails the wait instead of passing
  vacuously after 3 s, which is what the test's own comment claimed it caught. `RecentActivityView`
  uses the same composable and ignores the new field.
- *100, price-fixture's budget.* `network/price-fixture.test.ts` raises its test timeout from
  `120_000` to `300_000`, the budget `fee-methods.test.ts:85` already gives the same
  `feeJuiceImportedExtension` fixture, whose L1 bridge runs inside the test's budget (105.8 s on
  Chrome, 88.6 s on Firefox, one timeout on a loaded host). The close-out adds the flake-ledger row the
  entry asks for.
- *10, `shotSend`.* After the theme flip and before the second screenshot, `shotSend`
  (`fixtures/send-page.ts`) waits for every `CSSTransition` from `document.getAnimations()` to finish,
  bounded at 1 s and never throwing, the same catch-and-continue shape as its existing "popup still
  entering" wait. Only `CSSTransition`s count, so an infinite spinner animation cannot stall it. Capture
  is opt-in (`NULO_E2E_SHOT_DIR`), so no gate changes.

**Phase 5 — tooling and config.**

- *97, the two skills.* `.claude/skills/aztec-update/SKILL.md:206-208` says 3-4 concurrent shards are
  safe because `agent.sh` allocates its own ports. Reword it to what the evidence supports and the
  e2e-testing skill already says (`SKILL.md:65-67`): proverless shards side by side only from separate
  checkouts, never two `e2e:agent` runs in one worktree (both global setups `pkill` the Chrome that
  loaded that worktree's `dist`; `agent.sh` cleans per checkout).
- *102, Storybook.* `.storybook/main.ts`'s unplugin-vue-components instance (`:83`) gets
  `dirs: ["src/components"]` (resolved against the Vite root, `apps/extension`) instead of
  `["../src/components"]`. `.storybook/preview.ts`'s `ensureChromeStub` stops returning early when
  `chrome` exists (Chromium defines it on every page) and fills only the missing `runtime` and
  `storage` members, leaving any present member alone.
- *119, the pages watcher.* `scripts/pages-options.ts`' `exclude` adds `"**/.*/**/*.test.*"` and
  `"**/.*/**/*.spec.*"`: vite-plugin-pages 0.33.3's watcher matches with micromatch and no `dot`, so
  under `.claude/worktrees/<slug>/` the existing globs never match a new test file. The header
  comment gains one sentence saying why. `scripts/pages-options.test.ts` adds a case that drives
  `PageContext.setupWatcher` with a fake watcher (`node:events`) on a context whose root sits under a
  dot-directory: an added `*.test.ts` in a pages dir never becomes a route, and an added `*.vue` beside
  it does (the success control). No new dependency.
- *133, the landing config.* `apps/landing/vite.config.ts` imports `./scripts/headers.ts`, and
  `apps/landing/tsconfig.json` sets `allowImportingTsExtensions: true` (it already has `noEmit`).
  `scripts/headers.ts` imports nothing, so the native loader needs nothing else.
- *144, test-soak.* The five `runFixture` cases in `scripts/ci-cd/test-soak/cli.test.ts` without a
  budget get `90_000`: above `runFixture`'s own 60 s, so the tool's timeout, the thing under test,
  always fires first. `hang` keeps its `30_000`.
- *146, `src/e2e/config.test.ts`.* Each case re-imports `./config` after `vi.stubEnv`, so the import
  cannot move to a hook. Both `describe` blocks get `{ timeout: 30_000 }` with a one-sentence comment
  (each case pays a fresh module import, which has exceeded 5 s under a full parallel run). The
  assertions are unchanged.

**Phase 6 — one missing test, one measurement.**

- *106.* New `apps/extension/src/popup/windows/execute/call-surface.real.test.ts`
  (`// @vitest-environment node`; poseidon2 throws under jsdom). It encodes a real aztec-standards
  Token transfer with `encodeArguments`, hashes its selector with `FunctionSelector.fromNameAndParameters`,
  decodes it with `decodeCallForDisplay` over a lookup that returns the real artifact, and feeds the
  result to `callSurface(ctx, call, decoded, true)`: the vocabulary transfer surface (success control).
  Then two that must fall to the decoded rows. First, a relabeled artifact whose transfer's amount is
  `u64`, with the call built from that artifact (its own selector, an amount that fits `u64`): it
  decodes, and only the vocabulary's selector check refuses it. Reusing the real call's selector there
  would miss the lookup and test the raw path instead. Second, the real call with
  `tokenKnown = false`, the lookalike-address case. It is not a `*.composition.test.ts`: that layer stays bb-free.
- *174.* Measure before fixing: five `vitest list --json` runs and three full runs with the JSON
  reporter of the extension's unit project, at one commit, then diff the test ids. If one comes and
  goes, fix its registration when the fix is one file (a stable name or a deterministic `each` table),
  with the diff as the proof. **Stop rule:** if every list agrees, or the fix is wider than one file,
  record the measurement in `lessons/phase-6.md` and the close-out rewrites entry 174 with it. The
  measurement scripts stay under `~/.cache/nulo-backlog/code-followups-1/`, uncommitted.

### Arc 3 — wallet code hygiene

**Phase 7 — dead fields, a dead popup, a duplicated key.** Each removal was proven unreachable by a
repo-wide search (recon.md § Candidate deep-dives).

- *103.* `TokensView.vue` drops `isMinting` from its row mapping (`:200`); `TokenCard.test.ts:60` drops
  the field from its fixture. `tasks` stays: `isUpdating` reads it.
- *163, part.* Delete `popup/components/popups/SelectNetworksPopup.vue` and its import and mount in
  `PopupManager.vue` (`:26`, `:90`); nothing opens `select_network`. `stores/cache.store.ts` drops
  `proposedNetworks` and `selectedNetwork` (`:24-25`, `:48-49`), which only that popup reads or
  writes. `components/Popup/PopupCard.vue`
  drops `'--displace': displaceIdx - 1` from its inline style (`:36`); no CSS reads the variable, and
  the `.displace` class (`translateY(15px)`) stays.
- *165, part.* `EditNetworkPopup.vue` drops the vestigial `url` form field, `urlTerm`, the `url` key in
  `rebase`, and the `findPrimaryEndpoint` import that only fed it. Its save calls only
  `renameNetwork`, so nothing it writes changes. `EditNetworkPopup.test.ts` (its "dangling
  `primaryEndpointId`" case, `:1-3`, `:57`) then proves only that the form fills with the network's
  name; retitle it and its header to that. `composables/full-backup-restore.ts` replaces its four
  `${chainId}:${address}` keys (`:368`, `:392`, `:401`, and the balance re-link's `:456`, which the
  doc at `:340-342` says must match the set) with `accountScopeKey` (`account/spec.ts:55`, the same
  template), imported beside the names it already takes from that module. Where an operand
  is not typed `string` the call keeps today's coercion; no guard is added. If the typecheck refuses a
  site, that site stays as it is and `lessons/phase-7.md` says why. `wallet/services/network/spec.ts`
  drops `NetworkInfoSchema` (`:182`): nothing imports it (searched `apps/` and `packages/`).
- *156, part.* `packages/wallet-bridge/src/operation-result.ts:12-18` says `DuplicateInitializationError`
  is the sole failure carried on `code`; `apps/extension/src/wallet/services/execution/rpc-cancel.ts:94-100`
  sends six classes. The comment is corrected to the rule (a class rides the code channel when its
  dApp discrimination is ratified and its message-only reconstruction is lossless) without listing
  the classes. No code changes.

**Phase 8 — keep bb.js's CRS cache.** `packages/aztec-runtime/src/pxe/service.ts`: the legacy
IndexedDB sweep stops deleting `keyval-store`. Remove `LEGACY_SWEEP_KEYVAL`, `findKeyvalStore`, the
commit-time re-list guard and the final delete; `sweepLegacyIndexedDbs` keeps deleting every rc.2-era
`pxe/*` database in today's order with today's skip-on-blocked policy, and loses the `dbs` parameter
and the splice bookkeeping that only fed the guard. `KEYVAL_STORE` goes too; its doc moves to the one
comment that names it (the profile erase, `:770`). The doc comments that say "plus bb.js's CRS cache"
lose that clause. Pre-production, no user holds an rc.2-era database, and a kept CRS cache only saves a
download.

### File-level change map

| Arc | File | Change |
|---|---|---|
| 1 | `apps/extension/tests/e2e/global-setup.ts` | one log line after `spawnAztecNode`'s spawn; one comment at `ANVIL_PORT` |
| 1 | `apps/extension/tests/e2e/network/same-token-concurrent-sends.test.ts` | `waitForAwaitingCard` replaces `readAwaitingCard`; the failing case waits on the journal row first |
| 1 | `apps/extension/src/popup/components/modules/general/RecentActivityView.test.ts` | the hydration-order case |
| 1 | `.claude/skills/aztec-update/SKILL.md` | only if Phase 3 overruns: the WASM proving-time line |
| 2 | `apps/extension/src/composables/useIncomingTransfers.ts` (+ `.test.ts`) | `loaded` |
| 2 | `apps/extension/src/popup/pages/activity.vue` (+ `activity.test.ts`) | `data-incoming-loaded` |
| 2 | `apps/extension/tests/e2e/network/incoming-transfers.test.ts` | wait on the attribute, not 3 s |
| 2 | `apps/extension/tests/e2e/network/price-fixture.test.ts` | `300_000` |
| 2 | `apps/extension/tests/e2e/fixtures/send-page.ts` | `shotSend` waits for the flip's transitions |
| 2 | `.claude/skills/aztec-update/SKILL.md` | concurrent-runs wording |
| 2 | `apps/extension/.storybook/main.ts`, `apps/extension/.storybook/preview.ts` | `dirs`; chrome stub fill |
| 2 | `apps/extension/scripts/pages-options.ts` (+ `.test.ts`) | dot-dir globs; watcher case |
| 2 | `apps/landing/vite.config.ts`, `apps/landing/tsconfig.json` | `.ts` import |
| 2 | `scripts/ci-cd/test-soak/cli.test.ts` | five per-test timeouts |
| 2 | `apps/extension/src/e2e/config.test.ts` | two describe timeouts |
| 2 | `apps/extension/src/popup/windows/execute/call-surface.real.test.ts` (new) | entry 106 |
| 2 | one test file, only if Phase 6 finds the drifting test | its registration |
| 3 | `apps/extension/src/popup/components/modules/general/TokensView.vue`, `TokenCard.test.ts` | `isMinting` |
| 3 | `apps/extension/src/popup/components/popups/SelectNetworksPopup.vue` (deleted), `PopupManager.vue`, `apps/extension/src/stores/cache.store.ts` | dead popup and its two store fields |
| 3 | `apps/extension/src/components/Popup/PopupCard.vue` | `--displace` |
| 3 | `apps/extension/src/popup/components/popups/EditNetworkPopup.vue` (+ `.test.ts`) | URL field; the test's title |
| 3 | `packages/wallet-bridge/src/operation-result.ts` | one comment |
| 3 | `apps/extension/src/composables/full-backup-restore.ts` | `accountScopeKey` |
| 3 | `apps/extension/src/wallet/services/network/spec.ts` | unused `NetworkInfoSchema` removed |
| 3 | `packages/aztec-runtime/src/pxe/service.ts`, `service-sweep.test.ts`, `service-idb-delete.test.ts` | keyval reclaim removed |
| close-out | `implementations-plan/{follow-ups.md,lessons.md,index.md,archive/index.md}`, `.claude/skills/e2e-testing/SKILL.md` | see Post-implementation |

**Overlap check.** No code, test or config file above is changed by an open PR (#55, #56, #58, #61)
or by the hardening-2, security-ui-1, type-roles or supply-chain-release worktrees at planning time
(recon.md § Overlap map; #60 merged as `a6c2fb5`). Named overlaps, all documents:

- `implementations-plan/index.md` (#55, #61), `follow-ups.md`, `lessons.md` and `archive/index.md`
  (#56, #61). The repo's planning standard makes these the three files parallel worktrees share, and
  this lane's brief requires editing them: the index line now, the prune at close-out. Edits stay
  line-level on entries this lane owns or resolved, after merging `origin/dev` and reading what other
  lanes changed; no reformat, no re-sort, no union merge; each PR body names the overlap.
- `.claude/skills/e2e-testing/SKILL.md` (#56, hardening-2): not a shared planning file, so it is
  edited only if no open PR changes it at close-out (§ Close-out edits to the skills).

hardening-2's plan runs `price-fixture` and `sim-methods` in its gates without editing them. The
implementer rechecks with `gh pr list --state open` and each PR's files before each arc starts; a code
file that has gained an open PR by then is dropped from the arc and its entry stays.

### Trade-offs and alternatives not taken

See the decision ledger. Short form: explain the boot line rather than bypass or rewrite the vendor
wrapper (D1); a bounded predicate over every awaiting card rather than a selector wait (D2); a `loaded`
flag set by the read itself rather than a `finally` in the page (D3); a matching budget for
price-fixture rather than a fixture-level timeout vitest does not have (D4); describe-level timeouts
for `config.test.ts` rather than parameterized cases (D5); measure 174 before touching anything (D6).

## Phases

Each phase lists its steps, then its validation gate. Run `bun run lint` and the touched tests after
each step. A phase gets its ✓ only when its gate passes. `<WT>` is the worktree root; `<SCRATCH>` is
`~/.cache/nulo-backlog/code-followups-1/`.

**e2e rules for every gate.** Never run two e2e invocations at once in this worktree. Network runs:
`cd <WT> && NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent <files>`; a
file marked `@requires-proverless` (`same-token-concurrent-sends`) runs in its own invocation with
`NULO_E2E_PROVERLESS=1`. Firefox twin: the same with `NULO_E2E_BROWSER=firefox`. Smoke runs need an
armed build made right before them (an `e2e:agent` run rebuilds `dist/chrome` for its sandbox):
`cd <WT>/apps/extension && VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 bun run build:chrome`,
then `NULO_E2E_MIGRATION_FIXTURE=1 bun run test:e2e <files> --retry=0`. If hardening-2 has landed on
the branch's base by then, add its `VITE_NULO_E2E_CSP_REPORT=1` / `NULO_E2E_CSP_REPORT=1` pair as the
e2e-testing skill then says. A red file gets one rerun of that file alone; a second red is breakage,
not a flake. Every run's log goes under `<SCRATCH>/runlogs/`.

### Arc 1 — CI reliability

#### Phase 1 — the boot line, explained where it prints ✓

1. In `spawnAztecNode` (`tests/e2e/global-setup.ts`), right after the spawn, log once:
   `[e2e-setup] the aztec CLI wrapper also starts an anvil on :<ANVIL_PORT>; its bind error at boot is expected`.
2. Comment the `ANVIL_PORT: String(ANVIL_PORT)` env line (`:546`) in one sentence: the wrapper starts
   its own anvil on `$ANVIL_PORT` (8545 when unset); pointing it at this setup's port makes that anvil
   exit instead of running a second L1 nobody owns.

**Gate.** `bun run lint` passes. One network run of `tests/e2e/network/incoming-transfers.test.ts` on
Chrome is green; its log shows the new line exactly once, after `Starting local Aztec network`, and
the count of `os error 98` lines is unchanged (one).

#### Phase 2 — the awaiting-card hydration race ✓

1. In `same-token-concurrent-sends.test.ts`, replace `readAwaitingCard` with
   `waitForAwaitingCard(page, stage)` as described in Arc 1: a Node-side loop, one `page.evaluate` per
   250 ms, returning the snapshot `{ count, stage, subtitle, focus, cancel }` only when exactly one
   `tx-awaiting-card` exists, its `data-stage` equals `stage` and its `tx-awaiting-cancel` control is
   present; a sample with two or more cards throws at once; 30 s for a first card, then 10 s for the
   condition; each failure throws with the last snapshot of every card. If the probe (step 4) shows a
   two-card moment in the live scenario, stop and report it: it is either a UI bug for the owner or a
   reason to revisit this rule, never a reason to loosen it quietly.
2. Both call sites use it. The sibling case keeps `expectStageHeld(…, "queued", 5_000)` and its
   `toEqual({ count: 1, stage: "queued", subtitle: "Queued...", focus: false, cancel: true })` on
   the returned snapshot. The failing case (`:320`) first waits for its journal row with `waitForTransferStage`
   (accepting every later stage, so a send that moved on is read, not missed) and asserts it
   reads `queued`, then calls `waitForAwaitingCard(burst.page, "queued")`, then clicks
   `tx-awaiting-cancel`.
3. In `RecentActivityView.test.ts`, add the hydration-order case. The suite mounts shallow
   (`mountView`), so it reads the stubbed cards' props, not the DOM: hold `getOperations`, seed an
   active UI-transfer task, mount; exactly one `TransactionAwaitingCard` renders and its `stage` prop
   is null (the orphan card). Resolve the snapshot with that send's queued record; exactly one card
   remains, with `stage` `"queued"`. Two cards for one send never render at any step (the
   never-happens half; the stage arriving is its success control). That a null `stage` omits
   `data-stage` is already pinned by `TransactionAwaitingCard`'s own test.
4. Probe, never staged: a copy of the failing case at `tests/e2e/network/_probe-awaiting.test.ts`
   (the network config only collects `tests/e2e/network/**`; keep the `@requires-proverless` marker)
   that, after each `reopen`, records every awaiting-card snapshot every 100 ms for 3 s, run once
   against the BASE helper. It also calls the new helper with a stage that never occurs, which must
   throw with a snapshot (the "never completes" control). Its log goes to `<SCRATCH>/runlogs/`; the
   file is deleted before any commit (`git status` shows it gone).

**Gate.** `bun run --cwd apps/extension test -- RecentActivityView` green with the new case. The probe
log is in `lessons/phase-2.md`: how many reopens showed a stage-less card first (one or more confirms
the mechanism live; zero is recorded as "not observed", and the fix then rests on the code reading and
the component test). Then, with `NULO_E2E_PROVERLESS=1` at retry 0, one at a time: five runs of
`tests/e2e/network/same-token-concurrent-sends.test.ts -t "two windows"` (the two changed cases) and
one run of the whole file, on Chrome and again on Firefox, all green. `lessons/phase-2.md` states the
limit: these greens cannot certify a flake seen once in about 100 runs.

#### Phase 3 — entry 147 rechecked ✓

1. Confirm nothing listens on this build's Presto endpoint (`127.0.0.1:59833` and `:59834`,
   `src/presto/config.ts`; `ss -ltn`), so the run proves in-browser (WASM), and after the run confirm
   its log shows no Presto proving phase. Another agent's `presto-server` on another port is left
   alone.
2. Copy the file to `tests/e2e/network/_probe-imported-timing.test.ts` (never staged; deleted after)
   with a timestamped log line before and after each of its three `sendTransfer` calls, and run that
   copy as a `NULO_E2E_BROWSER=firefox` network run, prover-ON. Record each call's duration and
   whether a "Transaction submitted" toast wait timed out.
3. Route the result per Arc 1 § Phase 3.

**Gate.** The run finished (green or red); `lessons/phase-3.md` holds the three durations, the outcome
and where it was routed; `git status` shows the probe copy gone. A red run that is not a toast-wait
overrun is recorded, not fixed.

### Arc 2 — tests and tooling

#### Phase 4 — signals instead of sleeps, honest budgets ✓

1. *98.* `useIncomingTransfers` returns `loaded`; `useIncomingTransfers.test.ts` adds: `loaded` is
   false while the first read is held and true once it resolves (success control); stays false when
   the scope is not ready, and when a read for a superseded scope resolves (never-happens); returns to
   false on a scope switch. `activity.vue` binds `data-incoming-loaded`; `activity.test.ts` adds: the
   attribute is absent while `getIncomingTransfers` is held and reads `true` after it resolves.
   `incoming-transfers.test.ts` waits on the attribute instead of sleeping 3 s.
2. *100.* `price-fixture.test.ts`: `{ timeout: 300_000 }`.
3. *10.* `shotSend`: the bounded wait for the flip's `CSSTransition`s.

**Gate.** `bun run lint`, `bun run typecheck:all` and
`bun run --cwd apps/extension test -- useIncomingTransfers activity` pass. One network invocation on
Chrome with `NULO_E2E_SHOT_DIR=<SCRATCH>/shots` of `incoming-transfers`, `price-fixture` and
`tx-transfer-row` is green. The flipped captures in `<SCRATCH>/shots` (`transfer-row-send-*.png`) show
the sheet and its buttons in the flipped theme's final colours, not a blend. The same invocation under
`NULO_E2E_BROWSER=firefox` is green (a fixture changed).

#### Phase 5 — tooling and config ✓

1. *97.* Reword `aztec-update/SKILL.md:206-208`.
2. *102.* `.storybook/main.ts` `dirs`; `.storybook/preview.ts` fills missing `chrome` members.
3. *119.* `pages-options.ts` dot-dir globs, its header sentence, and the watcher case in
   `pages-options.test.ts`.
4. *133.* `vite.config.ts` imports `./scripts/headers.ts`; `tsconfig.json` sets
   `allowImportingTsExtensions`.
5. *144.* Five per-test `90_000` budgets in `test-soak/cli.test.ts`.
6. *146.* Two describe-level `{ timeout: 30_000 }` in `src/e2e/config.test.ts`.

**Gate.** `bun run lint`, `bun run typecheck:all`, `bun run test:ci-gating` and
`bun run --cwd apps/extension test -- pages-options e2e/config` pass; the new watcher case fails
against the old `exclude` (checked once by reverting it locally). `bun run --cwd apps/extension build-storybook`
exits 0; a throwaway Puppeteer pass over every story in the static build (the script lives under
`<SCRATCH>/storybook-probe/` and loads Puppeteer with
`createRequire("<WT>/apps/extension/package.json")("puppeteer")`, since an import resolves from the
script's own location and only `apps/extension` declares it)
counts Vue "Failed to resolve component" warnings and uncaught errors before and after the change:
after, no component from `src/components` is unresolved, no `chrome.runtime`/`chrome.storage`
TypeError is thrown, and no error message appears that was not there before (compared by message,
not by count; both lists in `lessons/phase-5.md`). `bun run --cwd apps/landing build` exits 0 with no native-config-loader
warning, `bun run --cwd apps/landing typecheck` passes, and a throwaway
`bun x vite build --configLoader native` in `apps/landing` succeeds.

#### Phase 6 — the real decoder test, the test-count measurement ✓

1. *106.* `call-surface.real.test.ts` with the three cases in Arc 2.
2. *174.* The measurement, then the fix or the record, per its stop rule.

**Gate.** `bun run --cwd apps/extension test -- call-surface.real` passes, and the relabeled case's
decode is `kind: "decoded"` (asserted, so it cannot pass through the raw path); with `corroborates`
forced true in a throwaway edit, the relabeled case fails (reverted). The 174 measurement (run count,
the diff of ids, the outcome) is in `lessons/phase-6.md`. Arc 2 boundary: `bun run test:all`,
`bun run test:ci-gating`, `bun run lint` and `bun run typecheck:all` pass, and the full Chrome smoke
suite passes.

### Arc 3 — wallet code hygiene

#### Phase 7 — dead fields, a dead popup, a duplicated key

1. *103.* `TokensView.vue` drops `isMinting`; `TokenCard.test.ts` drops it from its fixture.
2. *163, part.* Delete `SelectNetworksPopup.vue`, its import and its mount in `PopupManager.vue`, and
   its two `cache.store.ts` fields; drop `--displace` from `PopupCard.vue`.
3. *165, part.* `EditNetworkPopup.vue` drops the URL field and the import it alone used, and its test
   is retitled; `full-backup-restore.ts` uses `accountScopeKey` at all four sites; `network/spec.ts`
   drops `NetworkInfoSchema`.
4. *156, part.* Correct the `code` comment in `operation-result.ts`.

**Gate.** `bun run lint`, `bun run typecheck:all` and `bun run test` pass.
`git grep -n -E 'SelectNetworksPopup|select_network|proposedNetworks|selectedNetwork|isMinting|--displace|NetworkInfoSchema' -- apps/extension/src`
and `git grep -n -E 'urlTerm|findPrimaryEndpoint' -- apps/extension/src/popup/components/popups/EditNetworkPopup.vue`
print nothing (other URL popups keep their own `urlTerm`), and
`git grep -n -F '}:${' -- apps/extension/src/composables/full-backup-restore.ts` finds
only the doc comment at `:341` (no hand-built account key left).
`bun run --cwd apps/extension build` exits 0 and leaves `src/types/*.d.ts` unchanged;
if it changes `auto-imports.d.ts` (PR #56's file), stop and report instead of committing it. The full
Chrome smoke suite passes (every popup mounts through `PopupManager` and `PopupCard`), and one Chrome
network run of `tests/e2e/network/store-captures.test.ts`, the one e2e that submits Edit network
(`edit-network-submit`), is green.

#### Phase 8 — keep bb.js's CRS cache

1. Remove the `keyval-store` reclaim from `pxe/service.ts` as described in Arc 3.
2. Tests: in `service-idb-delete.test.ts`, the first case becomes "deletes every legacy DB last-first
   and never `keyval-store`" (its call log ends at the last `pxe/*` delete: the deletes are the success
   control, the absent `delete:keyval-store` the never-happens half); the blocked-legacy case keeps its
   warning and loses its re-list expectation; the four store-only cases (`:208`, `:217`, `:223`, `:233`)
   go; the await-shape case keeps only its first-delete tick. In `service-sweep.test.ts`, the
   new-DB-after-snapshot case becomes "keyval-store survives the sweep that deletes the last legacy
   DB", and the header loses its keyval clause. `service.test.ts:262` and `crs-cache.sources.test.ts`
   stay as they are.

**Gate.** `bun run --cwd packages/aztec-runtime test` passes and `git grep -n -E 'LEGACY_SWEEP_KEYVAL|findKeyvalStore' -- packages`
prints nothing. Arc 3 boundary: `bun run test:all`, `bun run lint` and `bun run typecheck:all` pass,
the full Chrome smoke suite passes again, and one Chrome network run of
`tests/e2e/network/opfs-storage.test.ts` is green. That run is a boot smoke only: a fresh e2e profile
holds no legacy `pxe/*` database, so the changed branch never runs there; the unit tests are the
evidence.

## Security & Adversarial Considerations

**Threat model.** No change here meets a trust boundary that an attacker controls: no dApp RPC, no
backup parsing, no storage shape, no crypto, no manifest, no workflow permission. The attack surface
this lane could widen is the CI gate itself (a weakened test lets a regression through) and the
shipped bundle (dead code removed wrongly, or test-only code added to it).

- **A weakened gate.** Every changed wait in Arc 1 and Arc 2 stays at least as strict as before: the
  new awaiting-card reader still fails on a missing stage, on two cards for one send, and on a missing
  cancel control; it only stops reading a transient card. The incoming-transfers wait replaces a
  fixed sleep with a signal and keeps the zero-card assertion. No test gains a retry, no budget grows
  without a measured reason, and no assertion is dropped. The Codex fix loop is asked to attack this
  directly ("which assertion is now weaker than at base?").
- **The `data-incoming-loaded` attribute** ships in the production bundle. It carries a boolean only,
  never a count, an address or an amount, so it leaks nothing a page script could not already infer
  from the rendered list (extension pages are not reachable by web pages). It follows the existing
  `data-active-account` pattern on the same element.
- **Dead-code removal.** Each removal is proven unreachable by a repo-wide search recorded in
  recon.md (`select_network` has no opener; `isMinting` and `--displace` have no reader; the
  EditNetworkPopup `url` field is never rendered). The typecheck and the full unit suite are the
  control. Dropping the legacy `keyval-store` reclaim removes a deletion path, never adds one: the
  profile-erase rule that `keyval-store` is never a profile's to delete stays pinned
  (`service.test.ts` "never keyval-store, even as the last profile").
- **Test-only surfaces.** `shotSend` runs only with `NULO_E2E_SHOT_DIR`; the Storybook stub exists
  only in Storybook; the pages `exclude` globs only remove files from routing, never add one, and the
  new watcher test proves a test module never becomes a route.
- **Logs.** The new setup line names a port number only. No product log line changes.
- **What the boot-line work could hide.** Explaining the vendor line must not teach a reader to ignore
  a real collision. The new line names the wrapper and the port, does not repeat the vendor's text,
  and leaves the vendor's own line untouched; a real boot failure still ends in exit 86 and one bounded retry. The
  Firefox `feeMethod:null` symptom stays open in the flake ledger instead of being declared solved.

**Least privilege.** No workflow, token, permission or secret changes. No repository setting changes.

**Cryptography.** None touched.

**Input validation.** None changed. The two hardening entries that would change a boundary
(`priorityLevel` validation, `TooManyPendingError` survival) are parked: one is an owner lead its pins
keep on purpose, the other changes what a dApp receives.

**Supply chain.** No dependency is added, removed or bumped (`presto-banners` 1.2.0 is parked: it
renders UI). The 7-day gate and the frozen lockfile are untouched.

**Domain risks.** Frontend: no new `v-html`, no new link, no new message listener. Smart contracts:
none touched.

## Assumptions

### Facts

- F1. The Aztec CLI entry the setup spawns is `@aztec-labs/aztec/scripts/aztec.sh` (6.0.0-rc.1); its
  `start --local-network` case runs `anvil --silent --port "$ANVIL_PORT" &` unconditionally, with
  `ANVIL_PORT=${ANVIL_PORT:-8545}`, then `exec node …/dest/bin/index.js start`.
  `dest/local-network/local-network.js` spawns no anvil.
- F2. `global-setup.ts` waits for its own anvil to answer (`ensureAnvil`) before `spawnAztecNode`, and
  passes `ETHEREUM_HOSTS=$ANVIL_URL` and `ANVIL_PORT=$ANVIL_PORT` to the node (`:546`).
- F3. The line prints on all 8 jobs of the green run 37855435855.
- F4. Since 2026-10-06 the two network lanes have 50 runs each and one rerun (run 37790178426,
  attempt 1, "heavy / concurrent-confirm": `expected null to be 'queued'` at
  `same-token-concurrent-sends.test.ts:320`, then `waitForFreshBalanceRow`).
- F5. `RecentActivityView.vue`'s `onMounted` awaits the executing-task snapshot before the journal
  snapshot (`:710-735`); the orphan-task and fallback cards pass no `stage`, and
  `TransactionAwaitingCard` then omits `data-stage`.
- F6. `useIncomingTransfers.refresh` returns without reading when its scope is not ready; `readRows`
  drops a stale result before assigning.
- F7. `feeJuiceImportedExtension` gets 300 s in `fee-methods.test.ts:85` and 120 s in
  `price-fixture.test.ts:26`.
- F8. The wallet's `executeUtility` path never registers the target contract, and the PXE refuses an
  unregistered one (`view-executor.ts:342-374`; `@aztec-labs/pxe`'s `contract_function_simulator.js:178-181`).
  The playground's phase section registers first (`phase.ts:170-182`, `:230-237`).
- F9. `stale-anchor-recovery.test.ts:166-187` (on `dappConnectedExtensionWithAccountsCap`) and
  `connect-locked-queue.test.ts:51-57` assert an `ok` `executeUtility` of `balance_of_private` through
  those controls; `err-scope-and-cap.test.ts` drives the simulation button with no capability and
  expects an error.
- F10. vite-plugin-pages 0.33.3's watcher filters with `micromatch.isMatch(path, exclude)` and no `dot`
  (`isTarget`); the initial scan does not go through it.
- F11. `accountScopeKey(chainId, address)` returns `` `${chainId}:${address}` `` (`account/spec.ts:55`).
- F12. `EditNetworkPopup`'s save calls only `appStore.renameNetwork`; the `url` field has no input.
- F13. The legacy sweep deletes `keyval-store` only after every boot-snapshot `pxe/*` database is gone
  and a fresh listing shows none; the profile erase never deletes it (`service.test.ts:262`).
- F14. No code, test or config file of this plan is in the file list of PR #55, #56, #58 or #61, or
  changed in the hardening-2, security-ui-1, type-roles or supply-chain-release worktrees at planning
  time (#60 merged as `a6c2fb5` on 2026-10-09). The shared documents are: `implementations-plan/index.md`
  (#55, #61), `follow-ups.md`, `lessons.md` and `archive/index.md` (#56, #61), and
  `.claude/skills/e2e-testing/SKILL.md` (#56, hardening-2).

### Inferences

- I1. The routine `os error 98` line is the wrapper's second anvil losing its bind to the setup's
  anvil; it explains no failure. Moderate-to-high confidence (Codex consult 1 agrees; a probe that
  answered could still be another process, since `probeAnvil` checks only that a string comes back).
- I2. The one Chrome rerun was the awaiting-card hydration race; its second failure a cascade (the
  failed case never cancelled or settled its second send). Moderate confidence; Phase 2's probe tests
  it.
- I3. Withdrawn: the plan no longer changes the playground (D8).
- I4. `src/e2e/config.test.ts`'s timeouts come from load, not from the import's own cost
  (`config.ts` imports nothing). Moderate confidence.
- I5. No user holds an rc.2-era IndexedDB, so dropping the reclaim changes nothing a person sees.
  High confidence (pre-production, CLAUDE.md § Persisted-storage shape changes).

### Asks

None. Every entry that would change a screen, a dApp-facing error or a product behaviour is parked
under "Not this lane", not asked ([OWNER-ASKS.md](OWNER-ASKS.md)).

## Decision ledger

- **D1, the boot line: explain it, leave the vendor alone.** Options: (A) bypass the wrapper and spawn
  `node …/index.js start` directly; (B) rewrite the vendor line in the stderr handler; (C) docs only.
  Codex (consult 1) chose C: A brings vendor-environment drift (the wrapper also exports the node's
  polling intervals) and a wrapper-parsing gate only to remove expected noise; B asserts an ownership
  the handler has not verified, and stderr arrives in chunks, not lines. This plan takes C plus one
  startup line in the setup's own log and a comment at `ANVIL_PORT`, because the skill's
  existing "cosmetic" note did not stop two misattributions (harden-dedupe's and this lane's brief).
- **D2, the awaiting-card wait: one bounded predicate over every card.** A `waitForSelector('[data-stage]')`
  then a separate read of the first card keeps wait and read apart and can still read the wrong card.
  The predicate requires exactly one card, the stage, and the cancel control, and throws with a
  snapshot. Codex (consult 1) proposed it.
- **D3, the History signal: the composable's read sets it.** A `finally` in `activity.vue`'s
  `onMounted` would set "loaded" after a rejected journal read that skipped the incoming read, so the
  zero-card assertion would pass vacuously. Setting it where `readRows` assigns rows means the
  attribute is true only after a real read for the current scope.
- **D4, price-fixture: match the budget the same fixture already has.** vitest has no fixture-level
  timeout; a test-scoped fixture runs inside the test's budget. 300 s is `fee-methods`' value for the
  same fixture.
- **D5, `config.test.ts`: describe-level budgets.** Parameterized cases or nested hooks would move the
  import but keep its cost, and the import must follow each case's `vi.stubEnv`. The assertions stay.
- **D6, the test-count drift: measure first.** No registration that varies by run was found by
  reading; a measurement decides whether there is anything to fix.
- **D7, parked over asked.** The brief's owner boundary: entries that change a screen or a behaviour a
  person would notice are parked with their reason, not turned into owner asks.
- **D8, no playground change; entry 101 closes on existing tests.** The draft pointed the simulation
  button at `balance_of_private` and made `sim-methods` assert `ok`. Both audits showed it would fail:
  the wallet's utility path never registers the token and the PXE refuses an unregistered contract
  (F8). The success it wanted is already asserted under the same fixture through the phase section's
  register-then-read controls (F9). Codex also read the button relabel as a visible change; with the
  change dropped that question does not arise.
- **D9, the awaiting-card budgets: 30 s to appear, then 10 s.** Opus asked for about 5 s after the
  first card so a slow-hydration regression still fails; base read the first card at once, which is the
  flake itself. 10 s is two background reads under a loaded CI runner with margin, and still fails a
  hydration that stalls.
- **D10, shared documents.** Codex asked to defer every edit to a file an open PR also changes. Kept
  for the e2e-testing skill (edited only if no open PR changes it at close-out). Not for
  `index.md`, `follow-ups.md`, `lessons.md` and `archive/index.md`: the planning standard names them the
  files parallel worktrees share, and the brief requires this lane to edit them (the index line now,
  the prune at close-out). Their edits stay line-level, after a merge of `origin/dev`, and each PR
  names the overlap.
- **D11, parked prose stays as it is.** Opus found entry 162's names moved. Rewriting every kept entry
  with moved facts would turn a prune into a rewrite of a file three open PRs edit; the moves are
  recorded in recon.md § Moved citations instead.
- **D12, entry 151 stays parked.** #60 merged during the audit and freed its files, but
  `operation-estimate-reuse.pins.test.ts:344` keeps the unknown-priority throw on purpose ("an owner
  lead, not absorbed").
- **D13, base moved to `a6c2fb5`.** The worktree was fast-forwarded to `origin/dev` before the plan
  commit, so line references and gates run on the tree that ships; #60 changed only
  `network/spec.ts` among this plan's files.
- **D14, the awaiting-card wait settles any staged card on sight (implementation).** The plan's
  helper waited up to 10 s through any non-matching card and returned `{ count, … }`. Codex and Opus
  (arc 1, round 1) showed that tolerated a card first rendered at the wrong stage, which the base read
  failed. Now only a sole stage-less card is waited through: a staged card returns if it is at `stage`
  with its cancel control and throws otherwise, each sample's deadline is checked before it can
  return, and `count` (always 1 on return) is dropped. The cancel case's journal pre-check is
  `waitForTransferStage(…, ["queued"], 5_000)`, which throws with the row if the send moved on, instead
  of a hand-copied list of every stage that could drift from the journal schema.
- **D15, the setup line names `scripts/aztec.sh` (implementation).** The file already calls `bin/aztec`
  "the wrapper" (the PATH prepender this spawn bypasses), so the plan's "the aztec CLI wrapper" was
  ambiguous in a CI log. The line reads `the aztec CLI (scripts/aztec.sh) also starts an anvil on
  :<port>; its bind error at boot is expected`; it still does not repeat the vendor's text.

## Audit verdicts

### Codex (gpt-6.1-sol, high, read-only) — `reject (blocking: prohibited file overlaps and a visible playground change; three validation steps cannot pass as written)`

Accepted:

- Shared-document overlaps were unnamed (#55, #56, #61 on the planning files; #56 on the e2e-testing
  skill): now named in § File-level change map and F14; the skill edit is conditional (D10).
- The Phase 2 `toEqual` would fail on the new `cancel` field: `cancel: true` added. The component test
  must not assume a real DOM under the suite's shallow mount: it reads the cards' props.
- The relabeled-artifact case reused the real selector, so it tested the raw path: the call is now
  built from the relabeled artifact, and the gate asserts it decodes.
- The `urlTerm` grep would hit three live URL popups: scoped to `EditNetworkPopup.vue`.
- Entry 175 is not resolved by refuting its cause: moved from delete to rewrite.
- Phase 3 must not require an empty host: it checks this build's Presto ports and the run's log.
- Close-out deleted `STATUS.md` but kept its link: the link goes with it.
- The Storybook gate compared error counts: it compares messages now.
- The boot line arrives about 50 ms after the setup's start line, not 6 s: corrected.
- I3 was unlikely (the token is never registered): resolved by D8.

Rejected: deferring the curated planning files until their PRs land (D10). The playground relabel as a
blocking visible change is moot after D8.

### Opus (Plan agent) — `conditional approve (conditions: rework Phase 4's 101/63 item around the playground's existing register-then-read utility call, or close 101 on the tests that already cover it; convert the fourth ${chainId}:${address} site at full-backup-restore.ts:456)`

Opus read a working copy that already carried part of the Codex round. Accepted:

- 101 closes on `stale-anchor-recovery` and `connect-locked-queue`; 63 keeps only the typed refusal
  (D8).
- The fourth restore key (`:456`) converts too.
- `cache.store.ts`'s two fields die with `SelectNetworksPopup`; `EditNetworkPopup.test.ts`'s
  dangling-endpoint case is retitled to what it then proves.
- The awaiting-card wait gets a second, shorter budget (D9, 10 s rather than the suggested 5 s), and
  the component test is named a characterization.
- The e2e probe sits temporarily under `tests/e2e/network/` (the only place the network config
  collects) and is never staged; the Storybook script runs from `apps/extension`.
- The new setup line no longer repeats the vendor's text, so counts of the vendor line stay true.
- `opfs-storage` is a boot smoke for Phase 8, not evidence.
- Entry 156's comment drift is fixed in Phase 7; 156 narrows to survival.
- Base moved to `a6c2fb5` (D13).
- Phase 2's gate runs the two changed cases five times per browser plus the whole file once.

Rejected: rewriting entry 162 in place (D11; recorded in recon.md).

### Final Codex pass (fresh session, gpt-6.1-sol, high, read-only)

Session `01a11e19-57b1-75a1-8e9c-38ef928ace19`. Verdict: `conditional approve (conditions: preserve
duplicate-card failures, fix Storybook probe resolution, make Phase 3 timing measurable)`. It
confirmed the triage adds up (14 + 9 + 7 + 158 = 188), no code or config overlap with #55, #56, #58 or
#61, the owner boundary, and D10-D12 on the merits.

All accepted and applied:

- A sample with two or more awaiting cards throws at once, as the base's immediate `count: 1` did;
  only a sole stage-less card is waited through. A live two-card moment in the probe is a stop.
- The Storybook probe loads Puppeteer through `createRequire` anchored at `apps/extension`.
- Phase 3 times its three `sendTransfer` calls with a never-staged probe copy, and routes on the
  "Transaction submitted" toast wait, which is what the 300 s bounds.
- Stale text: the open-PR list, the Phase 4 headings, the conditional-line wording, the cross-arc diff
  base, recon's restore-key list; the `/loop` seed reassesses after three failures, not five.

The conditions are met in this text; no further round was run.

### Arc 1 — Codex fix loop (gpt-6.1-sol, high, read-only) and Opus review

- **Round 1** (session `01a11e40-4180-74c0-99da-e5b7a033bc03`): `findings`. Accepted: (1) the wait
  tolerated a wrong non-null stage until it became `queued`, weaker than base: a staged card now
  settles on sight (D14); (2) success was checked before the deadline, so a first card seen after 30 s
  could pass: each sample's start is checked against the live deadline first; (3) the `ANVIL_PORT`
  comment's "a second L1 nobody owns" was wrong (the wrapper's anvil sits in the setup-owned process
  group): reworded. Opus review alongside: `findings`, the same material point plus nits, all
  accepted: drop the constant `count`; the component test's comment named its consumer (rewritten as
  a characterization); the log line names `scripts/aztec.sh` (D15); the hand-copied stage list goes
  (D14).
- **Round 2** (resumed): `findings`, one new: the sample timestamp was taken before `page.evaluate`,
  so a slow read could pass after the deadline. Accepted: it is taken after the read.
- **Round 3** (resumed): `clean`.

## Post-implementation

The implementing session runs these steps from this file. `code_review` is `off`, so no `/code-review`
step exists.

1. **Per-arc Codex audit, at each arc boundary**, before `gh stack add` opens the next arc. Write a
   prompt file under `~/.cache/nulo-backlog/code-followups-1/`, then run
   `env -u CODEX_ACCOUNT ~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <WT> high read-only gpt-6.1-sol`
   (`<WT>` is this worktree; the default `~/.codex` login; on a quota or 401 error retry once with
   `CODEX_ACCOUNT=alejo-icloud`, and if that fails too, log the failed consult in `lessons/phase-N.md`
   and continue on your own judgment within scope). The prompt carries the arc's diff
   (`git diff <arc-base>..HEAD`), this plan and its decision ledger, the arc map ("this is arc N of 3;
   later arcs add X"), an explicit adversarial ask (what could break in CI or in the wallet; what are
   we trusting that we should not), and the two rules below, verbatim.
2. **Fix loop.** Verify each finding against the code first. Apply the accepted fixes and commit them.
   Log the round (consult, verdict, accepted, rejected with reasons) in `lessons/phase-N.md`. Resume
   the same session with `resume-codex.sh <session-id> <followup-file> <codex-dir> high` and the fix
   diff. Stop when a round has no new material finding. After three rounds that still find material
   issues, stop and report it to the orchestrator.
3. **Final cross-arc pass**, after all three arcs are green and looped: a fresh Codex session over
   `git diff a6c2fb5..HEAD`, asking for cross-arc issues (seams, duplication across arcs, drift from
   this plan), with the same rules. Same loop.
4. **Delivery**, per the Delivery section: the first time any PR opens.
5. **Close-out**, as the stack's docs-only top layer:
   1. Merge `origin/dev` into the close-out branch first (a merge commit, never a rebase of a pushed
      branch). Read what changed in `index.md`, `lessons.md` and `follow-ups.md`; another lane may have
      deleted or added entries. Never a union merge.
   2. Write `## Outcome` directly after the front matter: Date, Status, Shipped (PR numbers), Open
      items, and the line "Seeds retired: the /goal and /loop seeds below are no longer live".
   3. Edit `follow-ups.md`: delete every entry in § Close-out edits to follow-ups.md marked *delete*;
      rewrite every entry marked *rewrite* to the part that is left, with the corrected locations;
      add the entries in § Follow-ups found during planning. Delete nothing marked *keep*.
   4. Route the flake knowledge per § Close-out edits to the skills: into the `e2e-testing` skill only
      if no open PR then changes that file; otherwise into one follow-ups entry.
   5. Promote generalizable gotchas to `implementations-plan/lessons.md` (8 KiB budget, dedupe, retire
      what an entry supersedes, date tool versions). Candidate: "A routine vendor log line is not a
      cause: grep a green run for it before blaming it" if it is not already covered.
   6. Delete `STATUS.md` and the "Live progress" link to it at the top of this file.
   7. In its own commit: `git mv implementations-plan/code-followups-1 implementations-plan/archive/code-followups-1`;
      repair the relative links the extra level breaks (`../follow-ups.md` becomes `../../follow-ups.md`);
      move the index line to `archive/index.md`.
   8. Report and stop. Merging is the orchestrator's call.
6. **Teardown after the merge.** When
   `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/code-followups-1/plan.md`
   succeeds, run `agent-worktree done code-followups-1 --merged`. This step needs no approval. If it
   refuses, relay its output and stop; never force. A `/loop` session checks this on every firing; a
   `/goal` session arms one background wait after its wrap-up report:
   `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/code-followups-1/plan.md; do sleep 300; done`.

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

Line numbers are at `86a89c5`; match by text, since other lanes edit the file.

- **Delete:** 101, 115, 120, 122, 123, 125, 127, 132, 177 (evidence in § Scope), and each built entry
  whose phase landed whole: 10, 97, 98, 100, 102, 103, 106, 119, 133, 144, 146, 149; 147 per its
  outcome; 174 only if Phase 6 found and fixed the test.
- **Rewrite** to the part that is left: 63, 75, 130, 156, 163, 165, 175 (the table in § Scope); 147
  and 174 when their routing or stop rule leaves them open, with the evidence.
- **Add:** the entries in § Follow-ups found during planning.
- **Keep** every other entry as it is. Where recon found that a kept entry's line numbers moved
  (recon.md § Moved citations), the close-out does not rewrite it: the shared file's diff stays small.

### Close-out edits to the skills

- `e2e-testing/SKILL.md` §5 flake ledger, at the next free row numbers (45 is the last at planning):
  the awaiting-card hydration race (`expected null to be 'queued'` at
  `same-token-concurrent-sends.test.ts`, cause, fix, evidence run ids); price-fixture's budget (entry
  100's timeout, the fix). Row 4 gains the second symptom file named by entry 175
  (`authwit-consume-smoke`, Firefox) without assigning it row 4's cause.
- **Only if no open PR changes `e2e-testing/SKILL.md` at close-out** (PR #56 and hardening-2 both
  edit it at planning time). Otherwise those three edits go into one new follow-ups entry ("route
  into the e2e-testing flake ledger", pointing at this plan's archived lessons), entry 100 is
  rewritten to its ledger half instead of deleted, and the skill file is not touched.
- `aztec-update/SKILL.md`: Phase 5's wording ships in Arc 2; Phase 3's line, if any, ships in Arc 1.

## Delivery

One `gh stack`, one PR per arc, PRs opened only after each arc's loop and the cross-arc pass converge.
No PR carries `Closes #n`: this lane closes follow-ups entries, not issues.

| Layer | Branch | Phases | Stacks on | `/code-review` | PR title (≤ 93 chars) |
|---|---|---|---|---|---|
| 1 | `worktree-code-followups-1` | 1-3 | `dev` | off | `test(e2e): read the awaiting card once it has its stage; explain the aztec boot bind line` |
| 2 | `code-followups-1-tests` | 4-6 | layer 1 | off | `test: wait on load signals not sleeps, add the real decoder test, fix timeouts and configs` |
| 3 | `code-followups-1-hygiene` | 7-8 | layer 2 | off | `refactor: drop a dead popup and unread fields, keep the crs cache on the legacy boot sweep` |
| 4 | `code-followups-1-close-out` | close-out | layer 3 | off | `docs(plans): close code-followups-1` |

Titles are lower-case on purpose: commitlint's `subject-case` is `lower-case`, so no camelCase
identifier goes in a title. Mechanics: `gh stack init --adopt worktree-code-followups-1 --base dev`; at
each arc boundary, after its loop converges, `gh stack add <next-branch>`; in Delivery, `gh stack sync`,
then `gh stack submit --auto`, then `gh pr edit` each body (what changed and why, which follow-ups
entries it closes, the validation run and its outcomes, the overlaps named in § File-level change map).
Open each PR without labels; add `e2e:extension-network` or `e2e:extension-smoke` afterwards only where
the path filter would skip a suite the arc needs (Arc 2's `scripts/` and config changes may not
match the network filter on their own). Then the close-out layer and `gh stack submit --auto` again.
Watch with `gh pr checks <n> --watch`. Never merge; never `--admin`.

## Seeds

Recommended: `/goal` (completion is visible in the transcript). Use exactly one per session.

```
/goal All phases in implementations-plan/code-followups-1/plan.md are marked ✓, each backed by its validation gate reported passing in the transcript; for each phase LESSONS_FILE=implementations-plan/code-followups-1/lessons/phase-N.md is printed; /code-review was NOT run (code_review is off); the Codex fix loop converged for each of the three arcs at its boundary and for the final cross-arc pass, each shown by a resumed gpt-6.1-sol pass reporting no new material finding, quoted in the transcript; the four-layer gh stack exists on GitHub (gh stack view output in the transcript), opened only after the loops converged, with the close-out layer's archive-move commit shown by git show --stat; bun run test, bun run test:all and bun run lint all exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/code-followups-1 forward. Never idle. Each firing: (1) read plan.md and lessons/ from the stack's top layer; if the plan path is gone and `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/code-followups-1/plan.md` succeeds, run `agent-worktree done code-followups-1 --merged`, report its output, clear this loop and stop; if it fails, babysit the PRs only. (2) Waiting on CI is fine; confirm it progresses. (3) No task in hand: take the next pending step; run lint and the touched tests after each edit; commit; push. (4) Stuck: consult Codex (gpt-6.1-sol, high) and log the verdict in lessons/phase-N.md; never cross a hard limit. (5) Same step failed 3 times: stop and reassess with Codex. (6) Phase gate green: paste it, mark ✓, print LESSONS_FILE; at an arc boundary run the Codex loop, then gh stack add. (7) All ✓: final cross-arc pass, Delivery, close-out, gh pr checks --watch, wrap-up report, stop.
```

## Follow-ups found during planning

To move into `implementations-plan/follow-ups.md` at close-out unless resolved:

- `apps/extension/scripts/e2e/resolve-ports.ts` bind-tests and releases its ports before the build and
  keeps no shared host registry, so two local worktrees can pick overlapping ports. Not evidenced in
  any failure; CI shards run on separate runners.
- The e2e teardown escalates on its group leader's exit; a descendant that outlives the leader can
  escape the escalation and later orphan reaping.
- `global-setup.ts`'s `probeAnvil` accepts any string `eth_blockNumber` result, so it proves neither
  that the answering L1 is the setup's own anvil nor that it runs with `--slots-in-an-epoch 1`.
- On reopening the popup during a queued send, Home's activity shows a stage-less awaiting card until
  the journal snapshot lands (`RecentActivityView.vue` loads the executing-task snapshot first).
  Whether the view should hold the card until it knows the stage is a UI call for the owner.
- (Found in Arc 2.) `apps/extension`'s `vitest.config.ts`, `vite.shared.ts` and the root
  `vitest.base.ts` warn on every run that Vite's planned native config loader refuses them ("ESM
  syntax in a file loaded as CommonJS"): the extension's `package.json` declares no `"type"`. The
  landing's twin (entry 133) is fixed; this one needs its own change and soak.
