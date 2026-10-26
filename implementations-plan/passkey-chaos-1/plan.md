---
plan: passkey-chaos-1
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 67cae683b
trunk: dev
status: approved (orchestrator, 2026-10-25); C1 in progress
issues: none (tests the change of #1127, closed by passkey-unlock-1)
post_implementation_hardening: not scheduled
---

# passkey-chaos-1: chaos-test the passkey change and every profile flow around it

A test-only lane. It builds a seeded, model-based chaos harness that drives the real extension on Chrome and Firefox, an agent session launcher for exploratory chaos, and the scenarios for passkey-unlock-1's new flows; then it runs the campaign that gates passkey-unlock-1's close and the release that carries it. Five arcs, one PR each against `dev`, not stacked (the orchestrator's D-orch-1):

- **C1, harness:** the model, planner, oracles and faults; today's profile flows on both browsers at smoke level, the dApp and held-restore flows at network level; a recorded baseline on today's `dev`.
- **C2, launcher:** the agent session launcher, the charters, the triage protocol and a pilot of three agents.
- **C3, A2's flows:** after passkey-unlock-1's A2 merges.
- **C4, A3's flows:** after A3 merges.
- **C5, campaign:** on A3's merged head, per the owner's exit criteria; triage, the report's material, close-out.

Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Charters and triage: [CHARTERS.md](CHARTERS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are relative to `apps/extension/tests/e2e/` unless they start with `apps/`, `packages/`, `scripts/`, `src/` (= `apps/extension/src/`) or `.claude/`.

## What the brief assumed that did not hold

- **"Locked" is not "no session row".** A passkey profile's row survives a background restart with no session behind it (`src/wallet/services/profile/session-manager.ts:584-589`); the session oracle reads three things apart (D3).
- **App console errors never reach Puppeteer.** `console.*` goes to the log ring, persisted as `nulo:logs` only in developer mode (`src/wallet/logger/store.ts:110-116`); the error oracle drains `log-viewer.getLogs` (D5).
- **Smoke cleanup is an exact-path match, not a prefix** (`sandbox-ownership.ts:199-201`); the e2e-testing skill's hazard line and the README's ownership table say otherwise, and C1 corrects both.
- **No fault exists for an assertion without a PRF result, or for another profile's credential;** `withholdCreatePrf` covers a create only. C1 adds both.
- **A dApp exists only at network level** (the playground); "a dApp calling while locked" runs in the network file (D10).
- **No 0.31.0 passkey profile can be made today;** passkey-unlock-1's A2 adds that case (its D10). The pre-update start state lands in C3.
- **A helper may not ask which browser** (`apps/extension/scripts/e2e/browser-seam.test.ts`), so the model takes capabilities the spec reads from the driver.
- **The testnet pass cannot run through the harness:** its egress guard refuses every outside host by design; OA-C2 offers a manual pass.

## Outcome & Quality Bar

- **For whom:** the owner deciding whether passkey-unlock-1 may close and 1.1.0 may ship; the implementer who turns a finding into a fix; the next maintainer who replays a red seed.
- **Excellent:**
  1. A red run names the broken property, the step, the evidence and the exact command that replays it; a minimal action list reproduces it on the same commit.
  2. Every oracle has a control: a fixture that breaks its property and the checker's unit test that sees it break (never-happens paired with a success control).
  3. A green run means something measurable: the coverage line counts each action family and transition per run, and the campaign report sums them per browser.
  4. Harness artifacts never pass as findings: browser constraints (Chrome's per-page authenticator, Firefox's event page) are in the model, not in an allowlist.
- **Good enough:** no automatic shrinking; no coverage-guided planning; the agent launcher speaks only `data-testid` and a small verb set.

## Assumptions

**Facts** (verified at `67cae683b`):
- F1. `network/send-chaos.test.ts:39-48` holds a file-local mulberry32 `prng`; `fixtures/chaos-seed.ts` holds `chaosSeed`; a seed is armed by `NULO_E2E_CHAOS=1`, read from `NULO_E2E_CHAOS_SEED`, logged, never retried (CI.md § the chaos seeds).
- F2. `launchExtension` (`fixtures/extension.ts:97-146`) runs only inside Vitest (`inject`, `expect.getState()`); `freshExtensionPerTest` gives a browser with no profile; `ctx.close()` fails on a CSP violation or an undeclared outside host.
- F3. Chrome's virtual authenticator lives on one page, Firefox's for the session (`fixtures/browser/index.ts:87`, `credentialOutlivesPage`); PRF state cannot be copied (`PRF-NON-PORTABLE.md`); detaching a Chrome page's DevTools session clears its authenticators (#837).
- F4. Strict security mode is device-wide and on by default (`src/wallet/config/config.ts:31`). Turning it on drops a persisted bearer at once, asynchronously; turning it off takes effect at the next unlock (`src/wallet/services/profile/session-manager.ts:493-538,757-768`). A passkey session row survives a restart with no session behind it (`:584-589`).
- F5. Profile rows are `nulo:core:profiles@<id>`, plain JSON; the session is `nulo:core:session` in `storage.session`. `STORED_SHAPES` (`src/wallet/storage/stored-shapes.ts:221`) registers every `nulo:` key family in `storage.local`, the raw tombstone and restore-pending markers included; `STORES` (`stores.ts:183`) lists only the entity and value stores. E2E already imports both (`update-replay.test.ts:34`, `default-network-arrival-update.test.ts:29`).
- F6. `openPopup` and `openOnboarding` reset `ctx.pageErrors` and `ctx.consoleErrors` (`fixtures/wallet-pages.ts:62-63,176-177`); `log-viewer` serves `getLogs(count, fromId)` (`src/wallet/services/log-viewer/spec.ts`).
- F7. `apps/extension/vitest.config.ts:37-42` runs `scripts/**/*.test.ts` in the unit suite; `tests/e2e/**` is excluded.
- F8. The restore gate is built into proverless network builds only (`.claude/skills/e2e-testing/SKILL.md` § 3); the network config's watchdog stops a run after 600 s with no progress (`STALL_MS`, `apps/extension/tests/e2e/run-limits.ts:6`).
- F9. `src/wallet/utils/passkey-ceremony.ts:138-140` refuses an assertion with no PRF result (`PasskeyPrfError`).
- F10. The log ring holds 1,000 entries (10,000 in debug mode) and overwrites the oldest (`src/wallet/logger/store.ts:31`, `src/wallet/logger/utils.ts:25-30`); a phrase's entropy comes from `getEntropy` in `@nulo/wallet-core/utils` (`packages/wallet-core/src/utils/mnemonic.ts:2116`).

**Inferences** (each verified in the phase named; a failure stops the phase and is logged):
- I1. Every flow but the dApp calls and held restores runs at smoke level (C1.2).
- I2. A request held on a non-anchor page acknowledges before any authenticator is reached (C1.2, both browsers).
- I3. `callService(page, "log-viewer", "getLogs", …)` returns warn and error entries in any mode (C1.2).
- I4. Both browsers' authenticators answer an assertion whose `allowCredentials` names another of their credentials (C1.2).
- I5. A2's 0.31.0 passkey case yields a start state the chaos run can continue from (C3).
- I6. A discovery request's answer names its credential, so the run binds the profile to the credential returned, never to an assumed order (C4).

**Asks:** OWNER-ASKS.md, OA-C1 to OA-C6. The working assumption is each ask's recommendation. C1 to C4 depend on none of them; C5 waits for OA-C1, C2, C3, C5 and C6; OA-C4 is a separate CI change after C5.

## Decision ledger

The owner, 2026-10-25:
> "Please, do test a LOT this. … Let's really chaos test this, even spawning alens of agents taht load the extension and chaos test around it. going to unleashed, or just locally. Please."
> "let's think the UX / UI of this whole change arc, so we can approve, implement it, fix our tests, re-test it, chaos-test it, etc."
> "I won't release 1.0.0 until we've fixed this correctly. I am in no-hurry. I want to do things right and safe."

| # | Decision | Rejected | Why |
|---|---|---|---|
| D1 | A seed plans the whole run before the browser starts: `plan(seed, start, caps)` simulates the model over symbolic identities (`P1`, `K1`, `F1`), bound to real ids at run time. `caps` comes from the spec, read from the driver's facts (`credentialOutlivesPage`, and a new fact, `stopsBackgroundUnderOpenPage`); helpers never ask which browser (`apps/extension/scripts/e2e/browser-seam.test.ts:200-263`) | online planning from observed state; Outline B; a `browser` argument | a plan computed from the seed alone replays; observed values only bind names; a browser difference lives on `BrowserDriver` (FIREFOX.md § The one rule) (Codex design 1, round 1 #7; Opus 1) |
| D2 | Every oracle is a pure checker over a snapshot plus a thin collector; checkers are unit-tested on fixtures that break each property | assertions written inline in drivers | a checker that cannot fail is a false green; controls make each one fail on purpose (Codex design, "oracle controls") |
| D3 | The session oracle reads the stored row (with whether it holds a bearer), the service's active session and each open page's lock state, and asserts their relation per method, strict mode and bearer; the model tracks the bearer apart from the toggle (F4), and the strict driver waits for the bearer to go; after a lock a protected call is refused | "locked ⇒ no row"; a model with the toggle only | false for a passkey row after a restart, and for a bearer minted before strict was turned on (F4) |
| D4 | Each action declares a write contract over the profile-owned key families `STORED_SHAPES` registers, tombstones, restore-pending markers and UI flags included: `none`, `profile(P)`, `create(P)`, `delete(P)` (checked after the purge barrier), `device`. Families the background writes on its timers are checked for ownership only; C1.1 splits the registry into the two groups, with a reason per family | a whole-storage diff; searching keys for an id; `STORES`; one contract for every family | timers write values; a sealed row names its owner inside the envelope, not the key; `STORES` misses the raw markers and flags; a timer's write during a rename is not the rename's (Codex design 4, round 1 #2; Opus 2, 3) |
| D5 | Errors: an append-only collector over every extension page the run opens, plus `log-viewer.getLogs` drained after each action at every level (O4 fails on error lines and counts warn lines; O7 scans all), each error outside an allowlist whose entries carry a pattern, a source and a reason; log ids must run on without a gap inside one background's life: a background restart, or a ring that overwrote entries before the drain (F10), makes that step's O4 and O7 incomplete, and an incomplete step is never reported green | `nulo:logs`; `ctx` arrays | the ring persists only in developer mode; the arrays reset on every popup open (F6); an Info line can carry a secret (round 1 #4) |
| D6 | Leak scans run after every action over `storage.local`, `storage.session`, the drained logs and every captured file (decoded first) for every secret the run knows in each encoding it can take: passwords; phrases as words, their entropy in hex and base64; imported signing keys. Structural checks are separate: secret slots are frames; an export's ciphertext is scanned raw and its decrypted body checked apart. `prfSalt` is expected in a passkey row and forbidden everywhere else. Limit: a write overwritten between two snapshots is not seen | a checkpoint-only scan; proving "opens with the passkey alone" in e2e | a transient leak overwritten later passes a checkpoint; the crypto property is passkey-unlock-1's unit tests' (its excellent 2) |
| D7 | A finding replays by seed on the same commit, or by an explicit hand-trimmed action list (`NULO_E2E_CHAOS_ACTIONS=<file>`, validated by the model); every run writes a replay record | automatic shrinking | manual trimming with precondition checks is enough until a campaign shows otherwise (Codex design 10) |
| D8 | The agent session is a Vitest file plus a file command queue, started by a script that isolates it. A session keeps no model: it runs the checks that need none (O1's relation, O2's field sets, O4, O5, O7 over the session's needles, D18); `do` actions only drive. An agent writes the outcome it expected beside each finding | a bun launcher with `launchExtension` decoupled from Vitest; a loopback HTTP control port; a model updated by raw commands | one launch path keeps the egress, CSP and error guards; #837 is solved by keeping one process attached, not by a transport; raw clicks cannot update a model, and learning it from the wallet would bless what it tests (Codex design 11, round 1 #5) |
| D9 | One arm flag (`NULO_E2E_CHAOS=1`) and one seed variable for every chaos file | a flag per file | CI selects chaos files by path; a second flag adds surface for no case |
| D10 | The dApp family and held restores run in a network file, in C1 | a smoke stand-in dApp | the playground is the only dApp (CLAUDE.md § The wallet repo); the restore gate is network-armed (F8) |
| D11 | Chrome runs passkey ceremonies on the anchor page only; abandoning a ceremony is a request held on another page, acknowledged, then that page closed; a lost credential is never simulated by closing the anchor | closing the anchor; copying credentials | F3: closing the anchor deletes every credential, a harness artifact |
| D12 | `prng` moves into `fixtures/chaos-seed.ts`; a known-answer test pins its first outputs for send-chaos's two CI seeds | a second copy | same seeds keep the same actions (CI.md rotation rule) |
| D13 | New passkey faults (`withholdGetPrf`, `answerWithCredential`) are appended to `fixtures/passkey.ts` | a chaos-local fault module | the passkey faults stay in one module; an appended hunk rebases cleanly over A2's edits |
| D14 | Charters and the triage protocol live in this plan's folder; the launcher's contract and the replay commands live in `tests/e2e/README.md` § Chaos runs | all in the plan | code outlives the plan; a campaign's charters do not |
| D15 | Arcs C1 to C5 as above; C3 and C4 each start after their passkey-unlock-1 arc merges | one arc after A3; a stack | the harness must work on `dev` between A2 and A3, and each arc stays reviewable |
| D16 | Accessibility: none; no product file changes. A driver that needs a missing `data-testid` adds it (not a UI change) | | CLAUDE.md § testid preservation |
| D17 | A race's `expect` returns a set of allowed outcomes with one successor state, or ends in a lock; every `expect` clause names its source | one outcome per race; an unsourced model | a precomputed plan must continue from whichever allowed outcome happened; an unsourced clause is how a model drifts to match a bug (Opus 5, 6) |
| D18 | The leak needles in an agent session are the values filled into secret fields (password, repeat password, file password, recovery phrase), found by their testids; no `secret` verb and no openability check in sessions | a `secret` verb; every long `fill` value | an agent forgets to register; a profile name is stored in plaintext by design and would be a false leak (Opus 10; final pass 1) |
| D19 | Outline B, narrow, joins C4 as phase C4.2 (orchestrator, 2026-10-25): after passkey-unlock-1's A3 merges, a seeded sequence test drives the profile service graph in-process under `tests/COMPOSITION-TESTS.md`'s rules, reusing `helpers/profile-chaos/model.ts`, with a fixed seed set in the unit suite under a stated time budget and an armed long mode for the campaign | Outline B as the main layer; leaving it out with a reopening condition | the owner asked for this change to be tested much harder than usual ("Please, do test a LOT this."); the cheapest volume is in-process; the objection that A2 and A3 rewrite the service API no longer holds once A3 has merged (Codex, round 1). Replaces the reopening condition in § Review verdicts |
| D20 | C1's testing bar, on top of each gate (orchestrator, 2026-10-25): `profile-chaos-model.test.ts` passes 30 consecutive runs at retry 0; every oracle's break fixture is shown failing in the gate's output, not only asserted; the baseline table records every seed's coverage line | the gates alone | the owner's "Please, do test a LOT this." |
| D21 | An action is `{ name, family, weight, invalid(world, params, caps), params, expect }` in `model.ts`; `drive` lives in `drivers.ts`, one per action keyed by name and type-checked complete. `invalid` returns the reason a replay list is refused at that step. `World` holds no pages: a driver opens and closes any extra page within its action. `Caps` names capabilities (`ceremonyOffAnchor`, `restartUnderOpenPage`), which the spec maps from the driver's facts | the § The model shape, with `enabled` and `drive` on the action and `pages` in `World` | `model.ts` imports nothing from Puppeteer, so C4.2 runs the same catalog in process; a refused list names its step and why (Codex, C1 design consult); `scripts/e2e/browser-seam.test.ts` refuses a helper that names a driver flag |
| D22 | A held restore starts locked, on a password backup no live profile's phrase matches. Held at `service-restore` it meets a lock or a restart; at `account-state`, a lock, a restart or a delete of the restored profile from a second window. A restart before finalize rolls the profile back (`apps/extension/src/composables/full-backup-restore.ts:1037`); any other pairing keeps it, a delete removes it; the run then locks, so every pairing has one successor | lock and restart only; deleting another profile | delete is reachable only once finalize has opened the restored profile (`useFullBackupImport.ts:483`); a successor learnt from the run would let the model follow the wallet (Codex, C1 design consult) |
| D23 | Delete has a second path, from the lock screen through Forgot password, which deletes the lock screen's profile with no session open | Settings only | the reset page needs no session (`apps/extension/src/popup/pages/settings/security/reset.vue:5`) and `ForgotPasswordPopup` routes to it (Codex, C1 design consult) |
| D24 | O4's allowlist is scoped by what a step ends on purpose (`endsOf`: the session, the background), not by family: a strict toggle, a double unlock and a second window's unlock end nothing. A violation's message names the error's class; its text goes only to the local record, masked. A planned restart's step stays incomplete for O4 and O7 (D5 holds), so a run that draws one reports `incomplete` at best | allowing the disconnect across whole families; a restart window counted green after a drain right before the stop | a family-wide entry hid disconnects in steps that close no port; a logger write between the drain and the stop is never seen, and the store persists on a debounce (`apps/extension/src/wallet/logger/store.ts:115-127`) (Codex, C1 design consult) |
| D25 | The smoke spec's only node is the guarded launch's stand-in, which refuses every call, so the wallet logs an error for each refused node call (network, PXE, FPC discovery). One allowlist entry accepts an error log carrying the stand-in's own refusal text, at any step, only on a run with no node (`allowedFor(caps)`); the coverage line counts every accepted error per source. The run's log check starts after the lines already present when it starts, and step 0 reads those lines for errors and leaks | a stand-in that answers node calls; no O4 on the smoke spec; a continuity check from id 0 | the stand-in cannot answer as a node, and a hang only moves the failure into the settle bounds; dropping O4 loses every other error; the ring is cleared when the background's config loads (`apps/extension/src/wallet/logger/store.ts:150-153`), so the first ids are gone before any step (seed 1, first Chrome run) |
| D26 | A filed product finding the runs keep meeting is a known finding (`KNOWN_FINDINGS`: its issue, the error text, the entry kinds). Its O4 violation is recorded with the issue, keeps the seed red and the spec failing, and does not stop the run, so the steps after it are still checked; the coverage line counts it per issue. Only an error line can be known: every state oracle still stops the run. An entry goes when its issue's fix merges | stopping every seed at its first instance; an allowlist entry | #1131 recurs at nearly every delete without a node, so every smoke seed stopped at its first delete and left the rest of its plan unchecked (seeds 1 to 5); an allowlist entry would count such a seed green |
| D27 | The virtual authenticator's credential storage is a driver fact, `residentCredentialSlots` (Chrome 3, Firefox unbounded), mapped to the model's `credentialSlots`: a passkey create is drawn only while the run has minted fewer credentials than that, a deleted profile's counted, since a delete leaves its credential on the authenticator | removing a deleted profile's credential over CDP; letting the create run and expecting a refusal | Chrome refused the fourth passkey create of a run at once with `NotAllowedError` (a four-create replay, and seed 3 step 22), and CDP's `addVirtualAuthenticator` takes no storage size; removing credentials would test an authenticator no user has, and a refusal there says nothing about the wallet |
| D28 | A page error reading exactly `Error: Client disconnected` is accepted at any step, cited to the popup's handler that prevents every disconnect rejection and logs it at debug (`apps/extension/src/wallet/logger/console-forwarding.ts:19`); this replaces D24's scoping for that one text. An error-level log line carrying a disconnect still fails the run, as #1132 does | scoping it to steps that end a session or the background (D24); a third scope for steps that open another profile | Firefox meets it after a create, a password change and an account add: the network watcher re-runs, the new run disconnects the account client a superseded run awaits (`apps/extension/src/popup/app.vue:250`), and the superseded run's rejection is never awaited. Both browsers' captures report a rejection the page prevented (a probe on each), and the suite's fixtures already drop it everywhere (`apps/extension/tests/e2e/fixtures/page-errors.ts`) |
| D29 | A page error is recorded as one text on both browsers, `<class>: <message>` (`pageErrorText`) | matching each browser's spelling in every pattern | Puppeteer's CDP path moves the class into the error's name, or keeps `Uncaught (in promise) <class>: ` when the event carries no value; its BiDi path builds the error from Firefox's text, class included, so an exact pattern matched one browser only and D24's disconnect entry never matched on Firefox |
| D30 | With a session open, O1 fails the anchor on the two routes the popup leaves for Home once a profile is active (`/popup/auth`, `/popup/register`), pinned to the wallet's `AUTH_ENTRY_ROUTES`; a second window's unlock waits for the anchor to leave them | every route a locked page may show | the popup deliberately leaves an import, legal or onboarding page where it stands (`apps/extension/src/popup/should-advance-to-general.ts:3`): after a refused import, Firefox seed 1 kept the anchor on Import while a second window unlocked |
| D31 | The stand-in's refusal is accepted on every run, network ones included; this replaces D25's "only on a run with no node" | scoping it by `caps.network` | both global setups guard their launches (`egressGuard`, `apps/extension/tests/e2e/global-setup.ts:224`), so on the network spec a call to a node outside the run meets the stand-in too, as a profile's default network does before the run moves it to Local Network |
| D32 | On the network spec, every profile a step opens for the first time is moved to Local Network before its checks (`NetworkRun.placeOpened`), as a person would before connecting the playground | a build flag seeding Local Network as the default; leaving each profile on its default network | a flag would test a wallet no user has; the playground serves the sandbox's chain only, so a dApp step on another network tests nothing |
| D33 | A restore keeps the backed-up profile's id, so the ref that restored it may take over a deleted ref's binding (`bindProfile`'s `deleted`); a live ref's id still refuses, and a ref already bound to another id still refuses | unbinding a ref at its delete; refusing every reused id | unbinding would let a later step read a deleted profile as live; refusing turned every restore of a deleted profile's backup red (a backup exported, its profile deleted, then restored) |
| D34 | O7 reads an opened file's body against what that file carries by design (`carriedBy`): an account file its own key, a full backup its phrase and the keys of its profile's imported account files; every other secret in the body still fails | exempting every secret in an opened body | a backup carries its own entropy by design, and a body-wide exemption would hide another profile's secret inside it |
| D35 | A restart settles on Register when no profile is left, and, with a session open, on any page showing the account selector, Settings included; a delete settles on the lock screen while a profile remains, else on Register, and O1 alone judges the session rows | a lock screen after every restart; a delete settle that requires no session row | an empty wallet shows Register after a restart, and an open session keeps the page where it stood; a settle that required no row read #1134 as a timeout instead of its O1 violation |
| D36 | A held restore asserts the gate still holds before and after the competing step; a release read around it is a harness fault, never a pass | trusting the hold for the step's duration | the gate releases itself after its safety timeout, so a slow competing step could meet a restore no longer held and still report the race as run |
| D37 | #1133 covers the bootstrap's `Profile locked` refusal as well as `Wallet locked`, met from a second window that locks while its own bootstrap runs | a separate issue per refusal text | both texts come from the one bootstrap core, whichever call the lock meets first (`network.getOrInitNetworks()` or `getActiveNetwork()`); a repeated second-window list met `Wallet locked` in 3 of 8 locks |
| D38 | A seed with no violation whose only gap is a planned restart's log window passes the spec, and its verdict, record and baseline row say `incomplete`, never green; the background's lines are drained right before the planned stop, so only what it logs between that read and the stop goes unread | failing every such seed | most seeds draw a restart, and no run can read a stopped background's last lines: failing them would make the gate red for a limit, not a finding (both reviewers, round 1) |
| D39 | The passkey's output is not a needle in C1; it joins the needle set in C3 | capturing it in every page's `credentials` wrappers now | D6 names C1's needles; the capture needs a preload wrapper on every extension page on both browsers, and C3 reworks the ceremony paths it would watch (round 1, Opus #7) |
| D40 | Every run turns on debug mode before its first step, so O7 reads every level and the ring holds 10,000 lines | alternating seeds; the default level | at the default level the logger drops debug lines at the source, so D5's "every level" was false (round 1, Opus #5) |
| D41 | The runner learns each live password profile's phrase through the wallet's own export (`exportMnemonic`, a read) at the first step it is live, and searches every line drained so far, and every held file, again for each needle it learns later | a phrase becoming a needle only at a planned reveal | a phrase logged at create, or carried by a file exported earlier, was never searched for (round 1, both reviewers) |
| D42 | A known finding names its producer: a log line its source and its message's start; a page error counts only beside the popup forwarder's line for the same rejection in the same step; the stand-in's allowance covers an entry only when every message it carries is the refusal, and never an unhandled rejection or a failed restore | text-only patterns | a new defect with a filed one's text would have been filed under the old issue, and a compound entry or an unhandled rejection carrying the refusal would have passed (round 1, both reviewers) |
| D43 | The import run logs one debug line where it ends, `[full-backup] restore run ended` with its stage and status, and the held restore waits for it after the gate opens, then refuses a session the restore left on any profile but the restored one, before its cleanup lock | the listed profiles and the session holding still for 5 s | a lock routes the import page away while the run goes on, so no page state marks its end; a run that never ended read as quiet, and the cleanup lock hid a session on the wrong profile (round 3, Codex) |

**Outline B** (both audits see it): a composition-level stateful test over the real profile service graph (fake `chrome.storage`, fake PRF bytes, no browser) as the main seeded layer, thousands of sequences per run in the unit suite, with only a thin e2e chaos layer and the agents on top. Disputed in round 1; the orchestrator's D19 adds it, narrow, as C4.2.

## Architecture & Implementation

### Shape

```
tests/e2e/fixtures/chaos-seed.ts          chaosSeed, prng (moved)
tests/e2e/fixtures/browser/{index,chrome,firefox}.ts   + driver fact stopsBackgroundUnderOpenPage
tests/e2e/helpers/profile-chaos/
  model.ts      World, the action catalog, plan(), coverage; imports nothing from Puppeteer or Vitest
  checkers.ts   pure oracle checkers over a Snapshot; same import rule
  collect.ts    Snapshot collectors: storage, session readings, logs, files, pages, background origin
  drivers.ts    one driver per action, testids only, each ending at a named settle state
  run.ts        runPlan(ctx, plan, caps): bind, drive, collect, check, record, stop at the first failure
tests/e2e/profile-chaos.test.ts            smoke spec; builds caps from the driver's facts
tests/e2e/network/profile-chaos.test.ts    network spec: dApp family, held restores (@requires-proverless + stamp check)
tests/e2e/chaos-session.test.ts            agent session (C2)
apps/extension/scripts/e2e/chaos-session.ts             session start | cmd | stop | seeded (C2)
apps/extension/scripts/e2e/profile-chaos-model.test.ts  planner, model, checkers and their controls
```

### The model

`World` = `{ device: { strict }, profiles: { ref, name, method, password?, credentials: refs, phrase: known|unknown, derived: n, imported: sentinel refs, retired }[], selected, session: locked|open(ref, bearer), pages: { anchor, extras }, files: { ref, kind, from, password?, mutation? }[] }`. An action is `{ name, family, enabled(world, caps), params(rng, world), drive(run, params), expect(world, params) → { outcomes, next, writes, settle } }`; `outcomes` is one of `committed`, `refused`, `cancelled`, `committed-then-locked`, or for a race a set whose members share one successor state (or the race ends in a lock that makes them share one). Every clause of `expect` names its source: a FLOWS.md step, a passkey-unlock-1 decision, an owner answer on #1127, or today's code at a file and line. A change that turns a red seed green by editing `expect` names that source in its PR. The contracts:
- A credential opens a profile only when it is registered for that profile; from C4 one credential may be registered for several profiles, each opening with its own salt. "Another profile's credential" means one not registered for the target.
- A retired profile (C3) is listed, refused on every path A2's matrix names, deletable; `verifyAll` expects its refusal.
- A phrase import's derived addresses equal the source profile's; an imported account comes back only with a full backup; after any action that reseals (password or method change, restore) the imported sentinel's account file exports with the signing key it was imported with.
- Strict mode is device-wide: turning it on drops the open session's bearer at once (the driver waits until the stored row holds none); turning it off gives a bearer only at the next unlock (F4).
- From C4, the owner's answers on #1127: a restore opens the unlock choice on the backup's method, a phrase import on Passkey; passkey profiles follow Strict mode; a method change is refused before it commits (no write), or commits and may then ask for a fresh unlock.
- Capabilities, not browsers (`caps` from the spec, D1): where a credential lives on one page (Chrome), every ceremony runs on the anchor, and the steps that run on another surface or end the anchor (an onboarding passkey create, Restore again's own window, any window the wallet opens, onboarding's "Open wallet", an extension reload, an in-place update) are drawn only where the credential outlives its page; where the background will not stop under an open page (Firefox), every extension page closes first and the restart-under-a-held-page schedules are not drawn.

**C1 catalog (today's flows):** create password or passkey (register; later profile from the lock screen; an impatient variant presses submit twice), lock, unlock (right or wrong password; passkey approved, refused, without a PRF result, answered with another profile's credential), switch, reveal phrase (password), import phrase (P3), add a derived account, full backup export (password), import or restore (right or wrong password, truncated, one byte flipped, a file of another profile), account file export and import (the imported-account sentinel), change password, rename, delete, toggle strict, background restart, a second window that locks or unlocks, abandon a ceremony, `verifyAll`. **Races** (named schedules; each competing step waits for the hold's acknowledgement): lock while an unlock's passkey request is held; unlock from two pages at once; restart while a passkey request is held (where `caps` allows). **Network file:** a dApp's `requestCapabilities` while locked, then unlock; a dApp call while an unlock is held; a restore held at `service-restore` or `account-state`, then lock, delete or restart (restart where `caps` allows, as `network/backup-restore-sw-restart.test.ts` is Chrome-only). The restore gate releases itself after 20 s (`src/e2e/chrome-storage-restore-gate.ts:22`), so the run reads `held` right before and right after the competing step and fails the step as a harness fault when it was released.

**Planning:** each run starts from a named start state (`empty` in C1; `pre-update` from C3), draws 24 actions with weights per family, then `verifyAll`. The plan, its symbolic bindings and its outcomes are printed before the browser starts. `NULO_E2E_CHAOS_RUNS=n` registers n tests at collection (seeds seed, seed+1, …), each with its own `freshExtensionPerTest` launch, `retry: 0` and a timeout set from C1.2's measured time per seed; a count that selects no test fails, and each test drops its snapshots when it ends. Each run prints a coverage line: completed actions per family, completed transitions (action pairs), schedules, and warn log lines per source.

### Oracles

| # | Property | Checker | When |
|---|---|---|---|
| O1 | P5 session | the stored row and whether it holds a bearer, `profile.getActiveProfile`, and each page's lock state agree with the model (D3); after a lock a protected call is refused | every action |
| O2 | P4, P5 rows | `getProfiles` and raw rows match the model: names, methods, the field set each method's schema allows | every action |
| O3 | P5 writes | action-owned families (D4) before and after match the action's write contract; background-owned families (balances, incoming, transactions, seed markers) are checked for ownership only: no write for a profile that is locked out, deleted or retired | every action |
| O4 | P6 errors | page errors, console errors and error-level log lines outside the allowlist (D5); warn lines are counted, not failed | every action |
| O5 | P6 pending | the driver's settle state within its bound; on a miss: screenshot and the visible loading testids | every action |
| O6 | P1, P3, P5 | `verifyAll`: each profile refuses a wrong secret with no write and opens with its own; derived addresses and the imported sentinel as recorded; ends with the model's selection, locked | drawn, and last |
| O7 | P2 | every known secret in every encoding, and `prfSalt` outside profile rows: absent from storage, logs (all levels) and files; secret slots are frames; password profiles' exports open only with their file password and refuse another (passkey profiles' from C3) (D6) | every action |

The collector attaches to every extension target as it appears (`targetcreated`), windows the wallet opens included. Storage scans run in the page, with the run's secrets passed in, so storage contents never leave the browser. After each action the collector reads the background's `performance.timeOrigin`; a change the plan did not cause stops the run as an unplanned restart, not as an O1 failure. Generated secrets are unique per run, so a match is never chance. A failure prints the seed, the step, the action and the property's id, and the path of the run's local evidence file; the evidence itself (screenshot, excerpts with secrets masked) stays in that file.

### Finding → reproduction

Each run writes its replay record to `apps/extension/.e2e-state/profile-chaos/<browser>-<seed>-<launch time>.json`, or to its session directory when the launcher started it: commit, build stamps, browser and version, flags, start state, plan, bindings, hold order, the failed step and its evidence. Replay by seed on that commit, or by a trimmed list (D7). Triage follows CHARTERS.md § Triage, which classes a finding private or public before any evidence leaves that file; a finding's regression test lands with its fix, in the cheapest layer that reproduces it.

### The agent session (C2)

`chaos-session.ts start --browser <b> --charter <id>` makes a directory unique to the launch, `~/.cache/nulo-chaos/<charter>-<time>-<random>/`, prints it, copies the armed dist to `<dir>/ext` (the smoke setup refuses an unarmed one), and spawns `bun run test:e2e -- tests/e2e/chaos-session.test.ts --retry=0` detached in its own process group with `EXTENSION_PATH=<dir>/ext NULO_E2E_CHAOS_SESSION=<dir>`. The test launches, opens the anchor with its authenticator, and serves `<dir>/q/<n>.cmd.json` → `<n>.res.json`: written by rename, ordered, one at a time, validated, each with a deadline; hold commands return before they settle. Verbs: `snapshot` (route, and every testid on the page with its text and state), `click`, `fill`, `press`, `open`, `close` (Chrome refuses the anchor), `screenshot`, `pick-file`, `downloads` (the three file verbs read and write inside `<dir>` only), `passkey refuse|hold|release|no-prf|other`, `bg-restart`, `do <catalog action>`, `oracle`, `end`. A value filled into a secret field joins the leak scan's needles (D18). The session keeps no model (D8): after every command it runs the model-free checks into `<dir>/findings.jsonl`; `<dir>/actions.jsonl` logs commands, page ids, results and files. The test's timeout is the session's deadline (60 minutes by default) plus the teardown's bound. A command past its own deadline ends the session: it is recorded as incomplete and the launch tears down, so a late click can never land after the next command. `stop` writes `end`, waits a bounded time, kills the group, then sweeps the session's own browser (`chromePattern(<dir>/ext)`, `tests/e2e/sandbox-ownership.ts:199`; the launch's ownership markers on Firefox). `seeded --seed <s> --runs <n>` runs `profile-chaos.test.ts` in the same isolation, so a campaign runs seeds in parallel.

### File-level change map

- **C1:** `fixtures/chaos-seed.ts` (+`prng`), `network/send-chaos.test.ts` (imports it), `fixtures/browser/{index,chrome,firefox}.ts` (+`stopsBackgroundUnderOpenPage`), `fixtures/passkey.ts` (+`withholdGetPrf`, +`answerWithCredential`, appended), `helpers/profile-chaos/*` (new), `profile-chaos.test.ts`, `network/profile-chaos.test.ts` (new), `apps/extension/scripts/e2e/chaos-seed.test.ts` (+KAT), `apps/extension/scripts/e2e/profile-chaos-model.test.ts` (new), `tests/e2e/README.md` (§ Chaos runs; the ownership table's cleanup row matches `chromePattern`), `.claude/skills/e2e-testing/SKILL.md` (the hazard line says exact path, not prefix; a short § on profile chaos), CI.md (one line: the profile chaos files run only when armed).
- **C2:** `chaos-session.test.ts`, `apps/extension/scripts/e2e/chaos-session.ts` and its unit test (command validation, queue order, deadlines, paths kept inside the session), `tests/e2e/README.md` (§ Chaos runs: the session contract), CHARTERS.md (pilot results).
- **C3:** `helpers/profile-chaos/{model,drivers,collect}.ts`, the start state `pre-update` over A2's 0.31.0 case, the unit tests.
- **C4:** the same three modules and tests.
- **C5:** this plan (campaign results), CHARTERS.md, close-out files.

### Trade-offs not taken

- Online planning: adapts to what the wallet did, but a seed would no longer name a run.
- A whole-storage diff per action: noisy under timers; per-action contracts over the registered families say what may change.
- Outline B: see the audit verdicts.

## Security & Adversarial Considerations

- **Threat model:** the harness handles synthetic secrets only; a finding that looks exploitable goes to a private draft advisory before any issue, PR, test name or report names it, and the published report carries only a count until the advisory is published (CLAUDE.md § Where open work lives).
- **False greens:** a checker without a failing control, a model edited to match the wallet, a released hold read as held, an allowlist that grows: each is closed above (D2, the model's sources, the hold reads, D5's reasons per entry).
- **Hostile inputs at the trust boundary:** truncated, bit-flipped and foreign backup and account files, another profile's credential, an assertion without PRF results, double submits, closes and restarts mid-flow.
- **Isolation:** every launch stays behind the egress guard: HTTP, HTTPS and WebSocket to an outside host are refused, except bb.js's CRS hosts and loopback, which go direct; UDP and WebRTC are not covered (`tests/e2e/README.md` § Egress guard). The guard routes the browser, not the agent's shell. Sessions own their directory, process group and browser; the command queue is a directory under the user's cache, not a port.
- **Agents:** the fleet spawns agents with `gh` and `git push` denied and no GitHub token in their environment, with writes confined to their session directory; agents never read the dist copy or `src` (CHARTERS.md). Charter text is not the boundary; the fleet's permissions are. Agents never file issues or push; triage files findings. Page text an agent reads is untrusted input, as dApp strings are.
- **Evidence:** raw evidence stays in the run's local file or session directory and is never committed; console output names only the seed, step, action and property (OA-C4 keeps a CI log to the same); every copied excerpt masks the run's secrets.
- **Wording:** no committed text, commit, PR, issue or test name says why the passkey design changed, names an advisory, or says who could obtain a passkey's output; properties only.
- **Secrets:** no session or log reads the Testnet endpoint constant; the testnet pass (OA-C2) runs outside the harness on a build that holds it and never prints it.
- **Supply chain / least privilege:** no dependency, permission, manifest or workflow change.

## Phases and gates

Fast layers: `bun run lint`, `bun run typecheck:all`, `bun run test`. Smoke runs first build the armed dist (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<browser>`) and run with `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`. Chaos runs set `NULO_E2E_CHAOS=1` and `--retry=0`. Each command finishes under 7,200 s; a larger seed count is split into several commands. A gate passes at exit 0 with every named file green at retry 0.

**C1.1** `prng` move, the driver fact, model, planner, checkers, controls. Gate: fast layers; `bun run test:all`; `profile-chaos-model.test.ts` proves: the same seed gives the same plan; every action respects its preconditions over 1,000 seeds; a list that breaks one is refused; each checker passes its success fixture and fails each break fixture (strict turned on and off, and a log-id gap, among them); the `prng` KAT for both CI seeds.

**C1.2** collectors, drivers, faults, the smoke spec on Chrome; verify I1 to I4; measure the time per seed and, over the runs, how often a launch's close fails after a background restart (a nonzero rate is a harness fix with its evidence, never an allowlist entry or a lower weight). Gate: fast layers; `bun run test:e2e -- tests/e2e/profile-chaos.test.ts --retry=0` with `NULO_E2E_CHAOS_SEED=1 NULO_E2E_CHAOS_RUNS=5`; `passkey-paths`, `passkey-retry` and `passkey-backup` green unedited on both browsers (the appended faults and the driver fact).

**C1.3** Firefox, the network spec, the baseline. Gate: the smoke spec on both browsers, 20 seeds each (`NULO_E2E_CHAOS_SEED=1001`, in commands of `NULO_E2E_CHAOS_RUNS` sized from C1.2); `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_PROVERLESS=1 bun run e2e:agent tests/e2e/network/profile-chaos.test.ts` with 5 seeds, on both browsers; `bun run test:ci-gating`. No seed is red for a harness reason; a red seed is a product finding, triaged and filed with its reproduction. The baseline table (seed, outcome: green or red-filed, time, coverage, finding) goes into this plan.

**C2.1** the session test, the script, its unit test. Gate: fast layers; one session per browser driven by the script through every verb and stopped, leaving no process (`pgrep` by the session path and markers) and its findings and actions files complete; two sessions at once from this worktree do not touch each other's browser.

**C2.2** pilot: three agents, 30 minutes each (CHARTERS.md § Pilot), through `chaos-session.ts`. First, a probe shows that the agents' tool configuration (CHARTERS.md § Fleet permissions) refuses `gh`, `git push`, a read under `apps/extension/src` or the dist copy, and a write outside the session directory; if it cannot be shown, C2.2 stops, since agents without that confinement need the owner's approval. Gate: each green pilot's actions replay through the launcher to the same end; a red one is triaged, and its replay result recorded; the verb set changes only where the pilot shows a need.

**C3.1** A2's flows: the phrase stage at passkey create, reveal with passkey, the mandatory file password, the old backup refused, the `pre-update` start state (retired rows listed, refused per A2's matrix, deletable, never half-opened), P2's export checks and P3 for passkey profiles. Gate: fast layers; the model test; 20 seeds per browser; the `pre-update` start with 5 seeds per browser (artifact run, `NULO_E2E_UPDATE_FROM=v0.31.0`).

**C4.1** A3's flows: the unlock choice after phrase import and restore, the unlock method page both ways, one passkey for several profiles, passkey and strict mode, the passkey account file. Gate: as C3.1, with I6 verified.

**C4.2** (D19) a seeded sequence test over the profile service graph in-process, under `tests/COMPOSITION-TESTS.md`, reusing `model.ts`'s catalog and `plan()`: a fixed seed set in the unit suite under a stated time budget, and an armed long mode for the campaign. Gate: fast layers; the fixed set inside its budget; the long mode's seed count per OA-C3.

**C5.1** the campaign on A3's merged head per OA-C3; the fleet per OA-C1 (the orchestrator spawns it); the testnet pass if OA-C2 says so, before C5's acceptance. Gate: OA-C3's criteria met, every finding triaged and filed; the coverage and findings tables in this plan.

If A2 merges before C1's PR, C1 absorbs C3.1 and runs its gates on `dev` with A2; a baseline red in a path A2 replaced is recorded, not filed, unless it reproduces after A2.

## UI impact

None. No product file changes; a missing `data-testid` is added only where a driver needs one, which is not a UI change.

## Delivery

| Arc | Phases | Base | PR title (≤ 93) | code_review |
|---|---|---|---|---|
| C1 | C1.1-C1.3 | `dev` | `test(e2e): seeded profile chaos with model oracles on chrome and firefox` | off |
| C2 | C2.1-C2.2 | `dev` after C1 | `test(e2e): agent chaos sessions over an isolated, instrumented wallet` | off |
| C3 | C3.1 | `dev` after C2 and A2 | `test(e2e): profile chaos covers the recovery phrase of passkey profiles` | off |
| C4 | C4.1-C4.2 | `dev` after C3 and A3 | `test(e2e): profile chaos covers unlock method changes and shared passkeys` | off |
| C5 | C5.1, close-out | `dev` after C4 | `test(e2e): profile chaos campaign results and close-out` | off |

- No PR closes an issue (`Closes` none); C5's body links #1127 and every finding's issue.
- Each PR opens without labels after its gates and its Codex loop. The armed files add a skipped test to each suite: the PR states each browser's suite wall-clock before and after.
- Serial. C3 and C4 wait for passkey-unlock-1's merges; C2 can run while A1 and A2 are in flight. Files both lanes touch: `fixtures/passkey.ts` (this lane appends; A2 rewrites create and retry), `helpers/backup-export.ts`, `helpers/import-drivers.ts`, `helpers/backup-seal.ts`, `fixtures/update/*`, `update-replay.test.ts` (this lane reads them). Rebase rule: merge `origin/dev` before each arc's gates; on a conflict in `fixtures/passkey.ts` keep both sides, A2's semantics win, the appended faults move below.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `67cae683b`, with these specifics:
- Review loop per arc, before its PR: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; the prompt carries the arc's diff from `dev`, this plan and ledger, the arc map ("arc N of 5; later arcs add A2's and A3's flows, then the campaign"), the adversarial ask, the two verbatim rules and the wording rule. Hard stop at three rounds. After C5's loop, one fresh session over the net diff from `67cae683b` with the cross-arc ask.
- `/code-review`: off.
- Close-out as C5's final commits: merge `origin/dev`, read `index.md` and `lessons.md`; Outcome; lessons promotion (likely: the error ring persists only in developer mode; a passkey session row outlives a restart); known limits filed closed; `STATUS.md` deleted; `git mv` into `archive/` in its own commit; `bun run check:plans` green.
- Teardown after C5 merges: `agent-worktree done passkey-chaos-1 --merged --trunk dev`. A `/loop` session checks each firing; a `/goal` session arms one background wait after its report.

## Review verdicts

Each finding was checked against the tree before its disposition; detail in lessons/phase-0.md.

- **Codex, final fresh pass:** conditional approve. Conditions, all accepted: secret fields, not every long input, give the needles (D18); the fleet's confinement proven by a probe before the pilot (C2.2, CHARTERS.md); a timed-out command ends its session; replay records named per browser and launch; log-id gaps make a step incomplete (D5, F10); CH10 out of the fleet; the entropy step's real home (F10). It sided with Opus on Outline B. Rejected: none.
- **Codex, harness design (consult, before the plan):** sound direction; eleven findings, all accepted (D1 to D8, D11).
- **Codex, round 1:** reject. Accepted: F4 and the bearer (D3, the model's strict clause); `STORED_SHAPES` for the census (F5, D4); the egress guard's real limits and the shell it does not confine (Security); every log level for the leak scan and every encoding (D5, D6); no model in agent sessions (D8); one test per seed, completed transitions counted, red-filed apart from green (Planning, C1.3); capability-specific schedules and no assumed discovery order (D1, I6); the A2 and A3 contracts (the model); privacy class first and a directory per launch (CHARTERS.md § Triage, the session); the testnet pass placed inside C5 and kept manual (OA-C2). Rejected: moving OA-C6 (report format) and the fleet's model choice to the orchestrator: the lane brief names the report format as an owner ask, and the agents' model is the fleet's main cost.
- **Opus, round 1:** conditional approve. Accepted: the driver fact and import rule (D1, Shape); the registry and the two family groups (D4); strict both ways with controls (C1.1); race outcome sets and sourced clauses (D17); the hold reads and the proverless marker (catalog, Shape); the anchor's surfaces (the model's capabilities clause); the restart close-failure rate (C1.2); the fleet's permissions and needles from `fill` (CHARTERS.md, D18); OA-C2's manual pass; pinned timeouts, split commands and OA-C3's cost (Planning, gates, OA-C3); warn counted not failed, `targetcreated`, in-page scans, unplanned restarts (Oracles); CI output kept to ids (OA-C4); A2 landing before C1 (gates). Cuts accepted: the send-chaos network replay, the launcher's own armed-dist check, the `secret` verb, a replay requirement on red pilots. Rejected: moving OA-C6 and the model choice, as above.
- **Codex, C1 design consult (before the drivers):** fix the gaps first; twelve findings, all verified against the tree and accepted (D21 to D24; detail in lessons/phase-1.md). Rejected: none; my proposal to count a planned restart's window green was withdrawn.
- **C1 implementation, Codex round 1:** 12 findings (10 must-fix). Accepted and fixed: O6 against a deleted source; the races' and the abandon's settles on the attempt's own end; the dApp ask's locked-queue proof; the held restore's competing result; files and logs searched again for later needles; O2's masked name; known findings bound to their producer; carried secrets excepted by value; four narrating comments. Declined: failing a seed for a planned restart's log window (D38).
- **C1 implementation, Opus round 1 (beside Codex round 1):** 10 must-fix, 6 consider; overlapping Codex on seven. Accepted and fixed, beyond Codex's: a silent pick or decrypt read as a refusal; debug mode on (D40); phrases learnt at their first step (D41); unplanned restarts between steps; O5 details masked on the early path; the abandon as D11 writes it; the stand-in allowance refusing unhandled rejections and failed restores (D42). Declined: the passkey output as a C1 needle (D39); mapping a held restore's stage to its outcome, since the model's outcome and O2 already refuse a kept profile the model rolled back.
- **C1 implementation, Codex round 2:** 8 must-fix, 1 consider, all accepted and fixed: phrase-read, pre-stop-drain and mid-check restart gaps never exempt; a reveal contradicting a learnt phrase fails; the abandon's page must close; the attempt-end predicate needs an idle submit; the allowance walks every carried string; one forwarded line per known page error; the deleted-source test made sharp.
- **C1 implementation, Codex round 3 (the last):** 2 must-fix, both accepted and fixed without a fourth round: the held restore's end is the run's own line, not a quiet window (D43), and a session on a profile the restore did not keep fails before the cleanup lock. The round-2 fixes held.
- **Outline B:** disputed in planning (Codex for a narrow seeded sequence test over `src/wallet/services/profile/service.integration.test.ts`'s graph, Opus against, on the upkeep of a second driver set over a service API A2 and A3 rewrite). Settled by the orchestrator's D19: added, narrow, as C4.2 once A3 has merged.

## Seeds (draft; finalized after approval)

```
/goal Arc <N> of implementations-plan/passkey-chaos-1/plan.md is done: every phase of the arc marked ✓ with its validation gate reported passing in the transcript, LESSONS_FILE=implementations-plan/passkey-chaos-1/lessons/phase-<N>.md printed, the Codex loop converged (a resumed pass with no new material point quoted), the arc's PR open against dev with its checks green, `bun run test` and `bun run lint` exit 0.
```

```
/loop 15m Drive arc <N> of implementations-plan/passkey-chaos-1 forward per its plan.md: reality check (plan, lessons, git status, the PR's checks), next pending phase, fast layers after each edit, the gate before ✓, the Codex loop at the arc boundary, then the PR. Decide with Codex, never wait; never merge; stop after three failures on one step.
```
