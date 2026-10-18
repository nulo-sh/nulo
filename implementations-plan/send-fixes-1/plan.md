---
plan: send-fixes-1
tier: light
status: completed (the arc's PR carries this record)
issues: "#498 #710 (arc 1 closes); #112 no arc (OA-1); P42-05 C (no issue, the PR body is its record)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet); one Codex audit (gpt-6.1-sol, high) with its resume; one Opus Plan leg
base: origin/dev at 24c68cb4
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-18.
- **Status:** closed by the merge into `dev` of the PR that carries this record, which closes #498 and #710.
- **Shipped:** the re-ask sheet's button reads "Send" and the re-asked fee stays on the line above (P42-05 C); start finishes on a custom network whose node does not answer, the chip reads inactive and the account waits for the node, while a node that answers another L1 still stops start (#498); a password profile exports a paused reset's imported accounts as account files, the paused screen leads with EXPORT IMPORTED ACCOUNTS, and the notice and Delete chain's sentence end "Export them first." (#710). Pictures: `screenshots/before/`, `screenshots/after/`.
- **Owner asks:** OA-1 (#112) open; nothing built, and #112 carries a comment naming the ask.
- **Known limits:** #808 (K1), #809 (K2), #807 (K3).
- **Open items:** #112 (OA-1, `owner-decision`).
- **Dropped:** none. One deviation: the export page lists held accounts whenever the profile has a paused reset, not only on the active network ([lessons/phase-3.md](lessons/phase-3.md)).
- **Lessons:** none promoted, `lessons.md` being at its budget; the one new gotcha, that the `network-reset` e2e seed leaves imported keys unopenable, is on `seedStaleNetwork`'s doc.
- **Seeds retired:** the `/goal` and `/loop` seeds below.

# send-fixes-1: start on a dead custom node, a paused reset's account files, the re-ask button

One arc, one PR against `dev`, not stacked (D-orch-1). It closes #498 and #710 and ships P42-05 C. #112 has no arc: OA-1, the one ask, on a surface the arc does not touch. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). The signed P38-05 D drawing: [light](screenshots/record/p38-paused-d-light.png), [dark](screenshots/record/p38-paused-d-dark.png).

## Issue claims that did not hold

- **#112.** The lane brief asks for a refusal at send to end the row at once. The owner's latest signed pick on the issue is page 15, OA-6, **A**: "nothing is built for #112, which stays open". Its premise still holds at `24c68cb4`: the default Testnet endpoint is dRPC's load balancer (`network-endpoints.ts:2`), so a refusal can follow an upstream that took the send, and "won't go through" would invite a double payment ([recon.md § #112](recon.md#112)). The panel may not overrule a signed pick: OA-1, and nothing ships for #112.
- **#710.** "The wallet refuses every key export" is loose: the single-account export is not refused (`account/service.ts:631`); it fails after the purge because the rows are gone. "Needs a design for the export's own screen; the owner decides on the next decision page" is answered: P38-05 = D signed drawing `p38-paused-d-*`, which leads the paused screen with EXPORT IMPORTED ACCOUNTS, ends the notice and the Delete chain sentence with "Export them first.", and the export is the settings flow's own page.
- **#498.** Holds. Also: the network-switch run fires at start and fails the same way, unhandled (`network-switch.ts:68`); the probe is the retrying client, so a silent node outlasts the popup's 60 s deadline and a catch alone cannot finish start. And on a silent node the chip's dot never reaches "inactive": `syncNetworkStatus` writes "sync", awaits the retrying `getNodeStatus`, and has no catch when the 60 s deadline rejects, so "sync" stays (`app.store.ts:515-525`).
- **Brief vs record (#498).** "Popup start never waits on a node" cannot hold beside P20-08's "A node that answers with a different L1 identity still stops start in every option": knowing the answer means waiting for it. The plan keeps the owner's record and bounds the wait to one 5 s read per account load (D1); the orchestrator is told, since the gloss is its own.

## Outcome & Quality Bar

For a person whose custom node is down, whose reset is stuck, or who is asked again for a queued send's fee. Excellent: (1) start always reaches Home on a custom network whose node does not answer, after at most two 5 s reads (none on a refused node), with the chip one tap from Settings → Networks; a node that answers another L1 still stops start; (2) a stuck reset's imported accounts leave as the same password-protected account files the settings flow writes, and nothing new is stored; (3) the re-ask sheet's button can never clip. Good enough: no copy beyond the signed drawing; #112 untouched.

## Assumptions

- **F1** `initAccount` awaits `ensureDefaultAccount`, whose only node call is `resolveVerifiedL1ChainId`'s probe, inside the per-tuple lock (`account/service.ts:271-285, 342`). A chain holding only imported accounts probes too (they are not default candidates).
- **F2** `probeIdentityOnce(rpcUrl, kind, timeoutMs)` is one never-retried read whose request dies at `timeoutMs` (`network/service.ts:953-960`); the reset uses it at 5 s.
- **F3** `REBUILT_AS` is the registry a typed error needs to cross the port; an unnamed code arrives as a base `WalletError` (`errors.ts:586-635`).
- **F4** With no account on the active network, `headerAccountState` is `"loading"` and the chip reads `appStore.networkStatus` (`header-account.ts:17-20`, `Header.vue:211-238`); both need `isLogined`.
- **F5** A journal's imported entry holds `newAddress` and its key sealed under `(toChainId, newAddress)` with the profile DEK; the journal holds `l1ChainId` (`stale-network/types.ts:48-82`).
- **F6** `exportImportedKeysDek(profileId, password)` authenticates by a full unseal (`InvalidPasswordError` on a wrong password), then opens the DEK, session-independent; passkey profiles are refused (`profile/service.ts:1907-1925`).
- **F7** The paused takeover yields to `/security/export/` routes (`stale-takeover.ts` `YIELDING`).
- **F8** `syncNetworkStatus` is the popup's only `getNodeStatus` caller; the worker's account-state service calls it too (`account-state/service.ts:108,241`). `getNodeStatus` already maps every probe failure to `Inactive` (`network/service.ts:816-829`); only the popup's RPC deadline escapes it.
- **F9** `resolveVerifiedL1ChainId` also serves `createAccount` (`account/service.ts:256`) and the reset's capture (`verifyCustomL1`, `network-reset/service.ts:489-495`); both get the bounded read.
- **I1** Two account loads race at start (`initAccount` and the switch run) and serialize in the per-tuple lock, so start waits at most about two 5 s reads on a silent node, with no retry delay on a refused one. The bound is the adapter's single-attempt abort (`fetch.pins.test.ts`); the service test pins the 5 s argument; the refused-port e2e proves only the shell.
- **F10** The signed drawing `p38-paused-d-*` (P38-05 = D) shows: the notice ending "Export them first.", EXPORT IMPORTED ACCOUNTS as the filled lead button, TRY AGAIN and SWITCH NETWORK outlined below it, and the Delete chain sentence ending "Export them first.". backup-restore-1 shipped it without the button and the two "Export them first." (its plan's Outcome: "Dropped: P38-05's export-first button, which waits for … #710").
- **A1** The singular forms follow the shipped pattern: "Export it first." for one account (the drawing shows only the plural).

## Architecture & Implementation

- **P42-05.** `SendReviewSheet.vue` `submitLabel`: a re-ask reads "Send". The fee line keeps "Fee is now {now}, above the {cap} you accepted."
- **#498 (D1).** New `NodeUnreachableError` (`CODE = "NODE_UNREACHABLE"`, in `REBUILT_AS`, message "Failed to fetch node info"). `IDENTITY_PROBE_MS = 5_000` moves to `network/spec.ts`, and the reset's `RESET_NODE_PROBE_MS` becomes that constant (one bound for "one identity read of the person's own node"). `resolveVerifiedL1ChainId` reads the custom node's identity through `probeIdentityOnce(primary.rpcUrl, kind, IDENTITY_PROBE_MS)` and turns its failure, a transport-rule refusal included, into that error; the mismatch stays a plain `Error`. `initAccount` and `loadAccounts` catch only that type, narrowly around `ensureDefaultAccount`, set the network's status to `Inactive` behind the existing network-id fence (the failed read is the evidence; a later status read still overwrites it), then run their tail as on success: re-read the accounts, `setupActiveAccount` (which clears an active account the list no longer holds, `app.store.ts:490`), sync. The store's `syncNetworkStatus` also treats a rejected status read as `Inactive`, as the service already treats a failed probe, behind the same fence, so the dot never stays "sync" after a lost read. `addNetwork`, `addEndpoint` and `getNodeStatus` keep `_probeChainIdentity`.
- **#710 (D2, D3).** `AccountService.exportResetHeldAccount(profileId, address, password, encrypt)`: reads the profile's journal, finds the imported entry whose `newAddress` is `address` and that has a key (`done` or not), opens the DEK with `exportImportedKeysDek(profileId, password)`, whose full unseal is the password check (F6), unseals under `(journal.toChainId, newAddress)`, and refuses with `ImportedAccountUnusableError` unless the key derives `newAddress` under this build (D3). It then writes the file through the serialize/encrypt tail `exportAccount` uses (one private helper; no copy). Nothing is written; the key and DEK are wiped as `exportAccount` does. The journal view's `reset` gains `heldImported: { name, address }[]`. For a password profile with held accounts, the paused screen follows the signed drawing (F10): `pausedImported` ends "Export them first." ("Export it first." for one), EXPORT IMPORTED ACCOUNTS (`stale-network-export`, to `/popup/settings/security/export/account`) leads in the primary style, and TRY AGAIN, with its starting guard and repeat-Enter refusal, moves to the outlined style above SWITCH NETWORK (`Content` gains an optional third action; the guard follows the action, not the slot). `deleteChainImported` gains the same last sentence when the profile has a password. A passkey profile, which has no account-file export (`account.vue:36-39`), keeps today's screen and sentence. The export page lists the held accounts while the profile has a paused reset, whichever network is active (the drawing asks for the export in Delete chain, which only a network that is not the active one offers), maps them with `type: AccountType.Imported` so the page's "This file is its only backup" line shows, and one local helper routes both Create and Protect to the new method for them. The typed error's conversion logs nothing above `debug`: `probeIdentityOnce` runs on the silent client, and a dead node must not write an error line per popup open.
- **#112.** Nothing (OA-1).

### Decision ledger

- **D1** Bounded single-attempt identity read + one typed error, caught at start and in the switch run, and a failed status read shown as the inactive state it is (chosen) vs a catch alone (a silent node still hits the 60 s deadline: B fails) vs never probing at start and creating the account off the start path (a mismatching node would no longer stop start, against P20-08's record; the start call would also queue behind the switch run's probe in the per-tuple lock) vs a short popup-side deadline (leaves the worker probing and the lock held). The 5 s is the bound the reset already uses for the same read, now one constant, not a new number. Two other callers move with it (F9): Add account on a custom network and the reset's capture check now fail after one 5 s read instead of retrying, both interactive reads of the person's own node. The dot keeps the retrying `getNodeStatus`: moving it to the bounded `probeNodeStatus` would turn every node slower than 5 s inactive on every network, a change nobody signed. The reset's `ERR_NODE_UNREACHABLE` prefix stays: converting it is outside the lane.
- **D2** A new explicit method (chosen; both legs) vs a journal fallback inside `exportAccount` (a missing row would silently read another store; the chain id the page holds is the old or new chain, depending on where the run stopped).
- **D3** Refuse unless the key derives the journal's `newAddress` (chosen, Codex 5): the picker, the file name and the file then name one address, as `exportAccount` and the reset's own re-creation require. Exporting under the address a later build derives would hand the person another identity silently. That case needs an address-regime rotation shipped while a reset is paused; this build binds the last regime and none is planned, so it is known limit K1 (filed closed at close-out; reopens when a rotation off Mainnet is planned).

### Known limits (filed closed at close-out)

- **K1** A paused account whose key derives another address under a later build is refused (D3). Reopens when an address-regime rotation off Mainnet is planned.
- **K2** A passkey profile cannot export a paused reset's imported accounts: it has no password, as Settings' own account export (`account.vue:36-39`). Reopens on a user report or a passkey-gated account export.
- **K3** A reset that paused before its purge can name, in the notice and Delete chain's sentence, an imported account whose key did not open; "Export them first." then covers an account nothing can export. Fixing it is a copy change. Reopens on a user report.

## Security & Adversarial Considerations

- **Threat model.** The new method returns spendable key material. Attacker: script in a compromised popup context (the same capability `exportAccount` already faces). Boundary: the password, checked service-side by the DEK open's full unseal (the KDF is the only throttle, as for `exportAccount`); the journal is per profile, keyed by profile id. Under storage tampering the AEAD authenticates only the key and its `(toChainId, newAddress)`; the journal's other fields, `l1ChainId` and `name` among them, are untrusted metadata, so a tampered `l1ChainId` can make a misleading or unusable file but never opens a key without the password. No authenticated journal format is added for it.
- **Logging.** No log names the key, the password, the address or the body; failures log a fixed category (logging-policy skill).
- **Fail closed.** No journal, no matching entry, no key, a wrong password: each refuses. A running reset does not matter: the method only reads.
- **#498.** The identity check stays fail-closed: a mismatch still refuses and still stops start; only an unreachable node is tolerated, and no account is created without the check.
- **Least privilege, crypto, supply chain.** No new dependency, permission or workflow; the existing AEAD and envelope code only; `bun.lock` unchanged.

## UI impact

- **P42-05** (re-ask sheet): before "SEND FOR ~0.000296 FJ ($0.002)", after "SEND". Owner, decision page 42, P42-05, option C: "The button reads SEND; the fee shows only on the line above it."
- **#498** (popup start): before, "The wallet could not finish starting up." with RETRY; after, Home with the account skeleton and the chip, whose dot reads "inactive" when start finishes; start waits at most one bounded read per account load (D1). Owner, page 20, #498, option B: "Open on that network without an account: start finishes; the Header shows the network chip with its existing inactive dot so the person can switch network or open Settings → Networks; the account area shows its loading state. Uses only states that exist."
- **#710** (paused takeover, Delete chain, export page): the paused screen and the Delete chain sentence become the signed drawing `p38-paused-d-*` for a password profile (F10); the export page's picker lists the held accounts. Record: P38-05 = D, "C now, B as a follow-up plan"; the lane brief's budget, "a new row on the takeover". At 360×600 the box's tail and the note sit below the fold in the screen's existing scroll area, as #720 already shipped them; the pictures show both scroll positions.
- Pictures before and after at 360 px, dark and light, in the PR.

## Phases

Fast gate `F`: `bun run lint && bun run typecheck:all && bun run test` (each exits 0). Smoke: `cd apps/extension && bun run test:e2e -- tests/e2e/<file>.test.ts --retry=0`. Network: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<file>.test.ts` at retry 0. Host rule first: load1 < 150. A phase is ✓ only when its gate passes; each logs to `lessons/phase-N.md`.

1. **P42-05.** Change: `SendReviewSheet.vue`, `SendReviewSheet.test.ts:274-284`, `tests/e2e/network/same-token-concurrent-sends.test.ts:732`. Test: the re-ask button reads "Send" and still emits `send`; "Queue send" and "Send now" unchanged (controls). Gate: `F` + `same-token-concurrent-sends.test.ts` (network, Chrome).
2. **#498.** Change: `packages/extension-messaging/src/errors.ts` (+`errors.test.ts` row), `network/spec.ts`, `network/service.ts`, `network-reset/spec.ts` (the constant), `useProfileBootstrap.ts`, `network-switch.ts`, `stores/app.store.ts`, their tests, new `tests/e2e/start-dead-custom-node.test.ts`. Tests: service, an unreachable node and a refused URL each throw `NodeUnreachableError` through one single-attempt read whose bound is `IDENTITY_PROBE_MS`, and a matching L1 resolves (control) while a mismatch stays a plain `Error` (control). Bootstrap: that error leaves start resolving with `isLogined` true, the list re-read, an earlier profile's active account cleared, and an imported-only chain's row loaded; any other error still rejects (control). Switch run, from network A with an account to an empty B: the error leaves `accounts` B's and no A account active, and the tail runs; a successful switch is the control; another error still rejects. Store: a rejected status read leaves "inactive", not "sync", and a read for a superseded network writes nothing (control). With a status read still pending, start resolves with the dot already "inactive"; a successful identity read leaves it "sync" (control). E2E (smoke, Chrome and Firefox): `addNetwork` seeds an active custom network on `DEAD_NODE` with no account; after unlock, `network-button` settles on `data-status="inactive"`, `header-account-loading` shows, and the chip opens Networks. It proves the real shell's start, which `app.vue` has no harness for; est. 25 s per browser, red on `dev`. Gate: `F` + the new e2e on Chrome and Firefox + `endpoint-refused-recovery.test.ts` (network).
3. **#710.** Change: `account/service.ts`, `account/spec.ts`, `account/client.ts`, `network-reset/service.ts`, `network-reset/spec.ts`, `StaleNetworkTakeover.vue`, `stale-network/copy.ts`, `settings/networks/[id].vue` (passes the profile type to the sentence), `export/account.vue`, their tests. Tests: service, a purged journal's entry exports a plain file and a protected one, both decoding to a key that derives the entry's `newAddress` (control), with storage unchanged after; a wrong password, an unknown address, an entry with no key, no journal, and a key that derives another address (fixture) each refuse. View: `heldImported` lists keyed imported entries, `done` included, and no derived or unmovable one. Takeover: on a paused view with a held account for a password profile, EXPORT IMPORTED ACCOUNTS leads and routes to the export page, the notice ends "Export them first.", and TRY AGAIN keeps its starting guard in its new slot; a passkey profile and an empty list keep today's screen (controls). Delete chain: the sentence ends "Export them first." for a password profile only. Page: with a paused reset the picker lists the held accounts, Create then Protect both call the new method, and the imported-account line shows; a live account still calls `exportAccount` (control). Gate: `F` + `stale-network.test.ts` (smoke) + `STALE_NETWORK_CAPTURES=1` captures run for the pictures.
4. **Arc gate.** `bun run audit:vue`, `bun run test:all`, the whole smoke suite at retry 0 on Chrome and Firefox (wall-clock before and after), `bun run check:plans`.

## Delivery

- Branch `send-fixes-1-a1` off `origin/dev` carrying the plan commit. PR: `fix(wallet): start on a dead custom node, export a paused reset's accounts, re-ask send` (88 chars). Body: `Closes #498`, `Closes #710`; P42-05 C quoted by id and text; the UI impact quotes; pictures; validation runs; smoke wall-clock per browser. No label at creation.
- The close-out (Outcome, a comment on #112 naming OA-1, `STATUS.md` deleted, the `git mv` into `archive/` in its own commit) is the PR's last commits. `code_review: off`.

## Post-implementation

Steps 2-5 of [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `24c68cb4`: reviewer `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus review (`general-purpose`) beside round 1; one loop over the arc's diff from `dev` after phase 4; hard stop at three rounds. The orchestrator merges. Teardown: `agent-worktree done send-fixes-1 --merged` once `implementations-plan/archive/send-fixes-1/plan.md` is on `dev`.

## Audit verdicts

**Implementation round 2 (Codex resume, 2026-10-18).** `approve`: "No new findings. Verified the profile-switch scrub and delayed-response guard, chain-0 refusal, latest-status-read fence, and comment fixes. No regressions found." The loop converged.

**Implementation round 1 (2026-10-18).** Codex (gpt-6.1-sol, high): `conditional approve (with conditions: fix the held-account picker's profile scoping)`. Opus review (`general-purpose`): `approve`, three low findings and four comment nits. Adopted: the export page drops another profile's held rows and its flow on a profile switch (C1); a chain-0 answer stays a refusal, not "unreachable" (O1); only the latest status read writes the dot (O2); the comments C2, C3, O4-O7. Accepted as known limit K3 (O3): its fix is a copy change.

**Round 3 (Codex resume, 2026-10-18).** `approve`: the condition is met, no regression, nothing adds persistence, a timer, a protocol or a lifecycle.

**Round 2 (Codex resume, 2026-10-18).** `conditional approve (with conditions: show Inactive when unreachable-node startup finishes)`. It verified every round-1 fix and disposition, the signed drawing included. Adopted: the caught error sets the status to `Inactive` behind the fence, with a pending-status-read test and a success control.

**Round 1 (2026-10-18).** Codex (gpt-6.1-sol, high): `reject (with blocking findings: #498 contradicts "never waits on a node" and does not deliver the inactive dot)`. Opus Plan leg: `conditional approve (with conditions: fix findings 1 to 4)`. C = Codex, O = Opus; every claim was checked against the tree ([lessons/phase-0.md](lessons/phase-0.md)).

- **Adopted.** The brief-vs-record conflict is written down, and the Outcome says two 5 s reads (C1, O3). A rejected status read reads "inactive" (C2, O2). The catch wraps only `ensureDefaultAccount` and the tail runs, so an earlier account is cleared and an imported-only chain loads (C3, O1). Protect goes through the same helper, and held rows carry `type: Imported` (C4, O4). D3 refuses a key that derives another address, with K1 (C5; it supersedes O6's derived-address test, which became the refusal fixture). The AEAD's reach is stated (C6). I1 is rewritten and the bound is pinned at the service layer (C7). The other callers are named (O5, C1). The pictures show the scroll (O7). K2 for passkey profiles (O8). No error log per popup open (O9). One password check, the DEK open's (O10).
- **Rejected, with reason.** The bounded `probeNodeStatus` for the dot (C2, O2 option 1): it would turn every node slower than 5 s inactive on every network, which nobody signed; the rejected read becoming "inactive" is the same state the service already gives a failed probe. An owner ask for the 5 s bound (C1, O3): the owner's record decides start (option B, the mismatch rule); the bound is how it is met, and the "never waits" gloss is the orchestrator's, told in the report. Leaving phase 1's network e2e to CI (O): the lane's rules run every touched e2e file locally. Owner asks for the button's words and the Delete chain sentence (the draft's OA-2, OA-3): the signed drawing `p38-paused-d-*` fixes both (F10).

## Seeds

Recommended: `/goal`. Use exactly one per session.

```
/goal implementations-plan/send-fixes-1/plan.md phases 1-4 are ✓, each backed by its gate's output in the transcript; LESSONS_FILE=implementations-plan/send-fixes-1/lessons/phase-N.md printed per phase; code_review is off and /code-review was not run; the Codex loop converged (a resumed pass with no new material finding, quoted); the PR exists against dev, opened after that loop; bun run test and bun run lint exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/send-fixes-1 forward per its plan.md: reality check (plan, lessons, git status, the PR's checks), the next pending phase with its gate, Codex for decisions (gpt-6.1-sol, high), the loop before any PR, stop at 5 failures on one step, never merge.
```
