---
plan: chaos-3
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 17f35c504
trunk: dev
status: approved (final Codex pass, 2026-10-27); arc 1 implementing
issues: "#1157 (arc 1, its first phase), #1189 (arc 2's record)"
post_implementation_hardening: not scheduled
---

# chaos-3: the profile chaos model's passkey flows, then the fleet wave

A test-only lane. Arc 1 teaches the seeded profile chaos model the flows the passkey change's third arc added: the unlock choice after a phrase import or a restore, the Unlock method page every way, one passkey for several profiles, and a passkey profile's account file. Arc 2 plans a fleet wave of agents and runs only on the orchestrator's resume. The Testnet pass is the owner's: its checklist lives on #1189, and nothing in this lane touches Testnet or a funded account.

Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Arc 2's charters: [CHARTERS.md](CHARTERS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are relative to `apps/extension/` unless they start with `implementations-plan/` or `.claude/`; `E/` is `tests/e2e/`, `PC/` is `tests/e2e/helpers/profile-chaos/`.

## What did not hold

- **#1157, "passkey profiles under strict mode" are not driven.** They are: since the archived chaos plan's D59 a session of either method takes a bearer outside strict mode (`PC/model.ts:422`), `toggleStrict` and `restartedWorld` apply to both (`:1032-1053`). What is new is strict mode meeting a method change and a shared credential, which the existing actions reach once the new ones exist.
- **#1157's deferral.** The owner deferred it past 1.1.0 (#1127, 2026-10-26); 1.1.0 was tagged on 2026-10-27, so the condition holds.
- **#1189, "still needs a full-size fleet wave".** The owner decided on 2026-10-26 (comment on #1189) that wave 2 counts as the full-size wave and that the criterion closes when the wave-2 table lands in the archived plan; it landed in #1205 (`e3d3682ae`). The Testnet pass stands by the owner's own manual pass. #1189's "Done when" allows "the owner accepts less by name", which the owner did. So no wave is needed for #1189; arc 2 is a re-check wave, run only if the orchestrator wants one (D13).
- **#1157's "Possible fix" phase 2** (the in-process sequence test) is outside this lane's brief; part of its value already exists (`src/wallet/services/profile/service.passkey-unlock.test.ts:836-873` draws method changes over two profiles on one credential). Arc 1 leaves it on #1157 (D12).

## Outcome & Quality Bar

- **For whom:** the maintainer who meets a red seed and replays it; the owner, who wants the passkey flows tested hard ("Please, do test a LOT this.", #1127).
- **Excellent:**
  1. A seed that draws a passkey import, a restore under a passkey, a method change or a shared credential replays by its seed on either browser, and a red names the step, the property and the replay command.
  2. The run binds every passkey profile to the credential the authenticator's answer names, and O2 fails a row that names another; every new oracle clause has a break fixture that fails in the model test.
  3. The model plans no step the authenticator cannot serve (Chrome's three slots, a credential a refused import left), so a red is never the harness's.
- **Good enough:** the in-process sequence test and #1157's scenario list beyond one race stay on #1157; no change to the agent launcher in arc 1.

## Assumptions

**Facts** (at `17f35c504`):
- F1. Every phrase import and restore driver chooses Password (`PC/drivers.ts:411`, `PC/backups.ts:196`); README § Passkey profiles says the four flows are not modelled (`E/README.md:264`).
- F2. A phrase import and a restore run the passkey card before the duplicate check, so a declined warning leaves a new credential on the authenticator (`src/composables/useProfileImportFlow.ts:196-201`, `src/composables/useFullBackupImport.ts:444`; closed known limit #1151).
- F3. "Use a passkey I already have" is a discovery `get` with no `allowCredentials` at a fresh salt (`src/wallet/utils/passkey-ceremony.ts:65-74`), offered on Create (`register-passkey-reuse`), phrase import (`import-seed-passkey-reuse`) and restore (`import-full-backup-passkey-reuse`); the Unlock method page offers none (recon).
- F4. `answerWithCredential` narrows the next `get` to one credential on either browser (`E/fixtures/passkey.ts:204-220`).
- F5. A method change refuses before its one row write with the row's bytes kept, then reopens the session in place, with a bearer only outside strict mode (`src/wallet/services/profile/service.ts:1389-1534`, `session-manager.ts:299`); a failure after the write closes the session and sends the page to the lock screen (`service.ts:1529`, `unlock-method.vue:161-165`).
- F6. Salts are unique across rows (`service.ts:2085-2090`); a lock-screen unlock names the row's credential (`passkey-ceremony.ts:61-63`).
- F7. A passkey account file asks the passkey, then a file password of 8 or more characters, and writes no storage (`src/popup/pages/settings/security/export/account.vue:197-252`, `src/wallet/services/account/service.ts:107-111,677-722`).
- F8. `verifyAll`'s wrong passkey answers with any other live profile's credential (`PC/verify.ts:33`), which opens a profile that shares it. O6 pairs profiles that share a credential as siblings that must derive the same accounts (`PC/checkers.ts:853`), though each create draws its own phrase (`service.ts:910`); and it expects no imported account on a passkey profile (`PC/checkers.ts:877`).
- F9. #1178 (open, S4): the refusals of Unlock method, the account file, Full Backup, a passkey restore and the reuse create log at error.
- F10. Wave 2 left four launcher defects with evidence: every Chrome session ended on a capture of a page without focus (D78), Firefox waited on a discovery over several credentials, a create on a full Chrome authenticator and a ceremony on a non-anchor Chrome page were silent (`implementations-plan/archive/passkey-chaos-1/lessons/phase-C5.md` § Wave 2).

**Inferences** (each checked in the phase named; a failure stops the phase and is logged):
- I1. A discovery narrowed to one credential answers at once on Firefox even when the authenticator holds several, and the page's answer names that credential's id (1.2, both browsers).
- I2. In an extension tab, the import, restore, account file and Unlock method pages run their passkey card in the page on both browsers (1.2): they move to their own window only where the surface closes on focus loss (`unlock-method.vue:255`).
- I3. The new actions add no error line beyond #1178's; any other is a finding (1.3).

**Asks:** none for the owner (no surface changes). For the orchestrator (OWNER-ASKS.md): whether #1189 closes now by the owner's decision, and whether arc 2 runs (D13); whether #1178's fix lands before 1.3 (D10); arc 1 changes what the launcher's `do` draws.

## Decision ledger

The owner: "Please, do test a LOT this." (#1127). The orchestrator's lane brief sets the arcs, 30 seeds per browser and README § Chaos runs.

| # | Decision | Rejected | Why |
|---|---|---|---|
| D1 | A credential is a planned symbol. A reuse first checks the wallet's own request (no credential named, the PRF input present) and fails the step otherwise; only then does it narrow the request to the planned credential, as a person picks it in the browser's chooser (`pickDiscovered`). A step's ceremonies are checked as a sequence its action names: Unlock method's passkey → new passkey is a `get` by the current credential, then a `create` by the new one, then any confirming `get` by the new one; a step that mints or reuses must show its sequence, each answer naming its planned credential, every PRF output kept; the run binds a new credential, and checks a reused one, by the answer's `rawId` in the wallet's base64, taken before any drain or navigation, never by the row and never by the authenticator's order. A wrong credential stays the separate `answerWithCredential` fault | letting the authenticator pick and learning the binding; narrowing without reading the request | a plan computed from the seed must know which profiles share a credential; Firefox waits on its chooser with several credentials and Chrome's pick diverges replays (F10); reading the row trusts the write under test; an unconditional rewrite would repair a request that named credentials (Codex 3) |
| D2 | The authenticator holds `K1` to `K(next.credential − 1)`: only a mint takes a credential number (a create, a passkey import or restore, kept or declined (F2), a method change's new passkey), a reuse takes none, and `invalid` refuses a fresh credential that is not the next one. `credentialSlots` bounds that count | counting profiles' credentials; a `World.minted` list | a declined import's credential and a changed profile's old one still fill a Chrome slot (archived D27); a list would restate the counter (Opus 7) |
| D3 | The unlock choice is a parameter of the existing actions: `createPasskey.credential` and `onboardingCreate.credential` may name a minted credential (the reuse links `register-passkey-reuse`, `onboarding-passkey-reuse`); `importPhrase` and `importBackup` take `method` with `password` or `credential`, as `onboardingCreate` already does; a passkey whose credential is minted is a reuse | one new action per method and path | one flow keeps one driver for its name, duplicate and settle; coverage stays per flow |
| D4 | One new action, `changeUnlockMethod`: password → passkey (current password right or wrong), passkey → new passkey (current passkey approved or refused), passkey → password (approved, refused, or another profile's credential). The new passkey's create always approves | refusal variants on the create | a refused create mints nothing and is the existing create's refusal |
| D5 | One race, `raceLockDuringMethodChange`: the current passkey's prompt held, another window locks; the prompt ends with the page, the row is unchanged | #1157's other races | it reuses the reveal race's mechanism (`holdNextGet`, `lockFromAnotherWindow`); the rest need timing a page cannot hold or are in-process (D12) |
| D6 | `exportAccountFile` serves passkey profiles: approved, refused, another credential, or a short file password; the file opens with its file password only. `verifyAll` re-exports a passkey profile's imported accounts with its passkey and a fresh file password, and O6 expects the imported accounts under either method | password profiles only | a method change keeps the imported-keys key (F5); only a re-export after one proves it; O6's password-only rule (F8) would refuse an honest re-export (Codex 2) |
| D7 | O2 adds one clause: a passkey row's `credentialId` equals its credential's binding. Two rows on one `prfSalt` stay O7's: `learnSalts` gives each salt one home (`PC/run.ts:167-178`), and its break fixture exists (`scripts/e2e/profile-chaos-model.test.ts:1512`) | binding from the row; a second salt clause in O2 | a wrong id would pass a row-learnt binding; a salt clause would duplicate O7 (Opus 5) |
| D8 | `verifyAll`'s wrong passkey, and the model's `other` variants, use a minted credential other than the target's current one, a replaced or declined one included; O6's siblings are profiles sharing a phrase, never a credential | any other live profile's | F8: a shared credential opens its target, and two profiles on one credential hold two phrases; a replaced credential is the one a regression would still accept (Codex 1, 5) |
| D9 | Strict mode gets no new action | a strict variant of each new action | the existing toggle and restart meet the new state; F5 states the bearer |
| D10 | `KNOWN_FINDINGS` gets each #1178 error line a run meets, its pattern exact. Of the drawn variants only Unlock method's `other` answer reaches one (`unlock-method.vue:173`, after `service.ts:501-502`); a wrong password, a refused prompt and the account file's refusals at Confirm log none. If #1178's fix merges first, no entry | lower weights for the refusals; an allowlist entry; entries for lines no run meets | the archived D26: a filed finding the runs keep meeting stays red and named, never green (Opus 6) |
| D11 | Seeds 7001 to 7030 (smoke), 7101 to 7105 (`pre-update`), 7201 to 7205 (network) | reusing the campaign's 5001+ | the catalog change redraws every seed; new numbers keep the archived tables true |
| D12 | Arc 1's PR says "Part of #1157"; the close-out comments on #1157 with what shipped and that phase 2 and the scenario list stay | closing #1157 and filing phase 2 anew | the common brief: an issue whose fix is left out gets a comment and stays open; no twin |
| D13 | Arc 2 is planned in full and runs only on the orchestrator's resume. It is a re-check wave on arc 1's head after the S3 fixes, not #1189's acceptance (§ What did not hold) | running it now; dropping it | the lane brief; its cost (12 agent-hours, a host-wide event) is the orchestrator's call |
| D14 | Accessibility: none; no product file changes. A driver that needs a missing testid adds it, which is not a UI change | | CLAUDE.md § testid preservation |
| D15 | CH6 leaves the fleet: a session starts from `empty` (`E/helpers/chaos-session/serve.ts:653`), so no agent can reach a profile made before the update; the `pre-update` seeds cover it | a `pre-update` session start | a start with its own replay contract is a launcher feature for one charter (Codex 7) |

## Architecture & Implementation

**Shape.** The catalog stays one module (`PC/model.ts`, no Puppeteer), one driver per action (`PC/drivers.ts`), pure checkers (`PC/checkers.ts`) fed by thin collectors (`PC/collect.ts`, `PC/prf-capture.ts`). No code in the launcher, the specs or `fixtures/**` changes; the launcher's `do` runs the new catalog through the same drivers, so each passkey driver installs the capture itself (`capturePrf` is idempotent) and needs nothing `PC/run.ts` sets up.

**Model** (`PC/model.ts`):
- `mintedCredentials(w) = w.next.credential - 1` (D2); a credential is minted when its number is below `next.credential`. `startWorld("pre-update")` mints none (the retired row's credential left with the release's page).
- `importPhrase` and `importBackup` gain `method?: Method` and `credential?: CredentialRef` beside `password?` (exactly one, by method, as `onboardingCreate`); an absent `method` is `password`, so an action list recorded before this arc keeps its meaning in the model and the drivers. `invalid` refuses a fresh credential with no free slot or not next in order, and a reused one not yet minted.
- `createPasskey`, `onboardingCreate`, `importPhrase`, `importBackup` as D3. A passkey import or restore gives a passkey profile on the backup's phrase, derived count and imports; a declined duplicate still mints a fresh credential (F2).
- `changeUnlockMethod: { to: "passkey" | "new-passkey" | "password"; credential?: CredentialRef; password?: SecretRef; current: "right" | "wrong" | "approve" | "refuse" | "other"; other?: CredentialRef }`. Committed: method, credential or password replaced; phrase, derived and imported kept; session open on the same profile, bearer `!strict`; writes `profile(P)`; sources at `service.ts:1389,1457,1512`. Refused or cancelled: unchanged, no write.
- `raceLockDuringMethodChange: {}`: drawn on an open passkey profile; outcome `cancelled`, the world locked, no profile write.
- `exportAccountFile` for a passkey profile: `password: SecretRef` (the file password) and `variant?: "short" | "refuse" | "other"`; the file's `method` is `passkey`, its password the file password.
- `otherCredentials(w, target)`: minted credentials that differ from the target's current one (D8).
- `endsOf`: the race ends the session; `changeUnlockMethod` ends nothing.
- Weights: each new action and variant is drawn within 1,000 seeds on each caps set (the model test holds this).

**Drivers.** `importPhrase` and `fillRestore` (`PC/backups.ts`) keep the Passkey tab, or switch to it for a password backup, then press the submit or the reuse link (after narrowing, D1). `createPasskey` and `onboardingCreate` press their reuse link for a reuse. New `PC/unlock-method.ts` holds `changeUnlockMethod` and the race (`unlock-method-*` testids, recon). `exportAccount` (`PC/accounts-io.ts`) branches on the method, reusing the shared `E/helpers/account-io.ts`: its navigation and row pick move into an exported `openAccountExport`, which `exportAccountBody` calls before its unchanged password stages, and the chaos passkey branch calls before its own: `account-file-confirm-passkey-btn`, the faults as the reveal applies them, the file password, `account-file-save-btn`; the short password reads the disabled Save, as `refusesShortPassword` does for Full Backup. Every passkey step binds or checks its credentials through one helper beside the capture, `answeredCredentials(s, page, expected)`, where `expected` is the step's sequence of `{ kind, credential }`; it replaces `learnCredential`.

**Collectors and checkers.** `PC/prf-capture.ts` keeps each answer's `{ kind, id }` (`rawId` in the wallet's base64) and, for a `get`, how many credentials the wallet's request named, beside its PRF output, drained by the same calls; `pickDiscovered(page, id)` lives beside it. `readProfiles` adds each row's `credentialId`. `Bindings` gains `credentials` (moved from `RunState`), so O2 reads it. `checkProfiles` adds D7's clause; O6's `siblings` and `checkSentinels` follow D8 and D6. `PC/verify.ts`: D8 and D6's re-export. `KNOWN_FINDINGS`: #1178 (D10).

**Flow of one reuse step:** the planner draws `importPhrase` with `method: "passkey", credential: "K1"` (minted) → the driver opens Import, fills the phrase, arms `pickDiscovered` with `K1`'s bound id, presses `import-seed-passkey-reuse` → the shim reads the wallet's request (no credential named, PRF input present) and narrows it → settles on Home or a refusal → takes the page's answers: each must name `K1`'s id, else the step fails → O2 reads the new row: `credentialId` equals `K1`'s binding; O7 finds its new salt only in its own row.

**File-level change map.** `PC/model.ts`, `PC/drivers.ts`, `PC/backups.ts`, `PC/accounts-io.ts`, `PC/unlock-method.ts` (new), `PC/network-drivers.ts` (its `importBackup` params), `PC/prf-capture.ts`, `PC/collect.ts`, `PC/checkers.ts`, `PC/state.ts`, `PC/verify.ts`, `E/helpers/account-io.ts`, `scripts/e2e/profile-chaos-model.test.ts`, `E/README.md` § Chaos runs. The `e2e-testing` skill names no modelled flow, so it does not change. Arc 2: `scripts/e2e/chaos-session.ts`, `E/helpers/chaos-session/{faults,serve}.ts` and their unit tests, `implementations-plan/chaos-3/CHARTERS.md`.

**Trade-offs not taken.** Outline B (both audits saw it): new actions per method (`importPhrasePasskey`, `restorePasskey`, `createPasskeyReuse`, `exportPasskeyAccountFile`), credentials learnt from the row, no O2 clause, no race. Smaller model diff; but it splits each flow's driver and coverage, binds by the write under test (D1, D7) and leaves #1157's first race out. Also not taken: the in-process sequence test (D12); a launcher change in arc 1.

## Security & Adversarial Considerations

- **Threat model:** the harness handles synthetic secrets only. A finding that looks exploitable goes to a private draft advisory before any issue, PR, test name or report names it; the plan and reports then carry a count only (CLAUDE.md § Where open work lives).
- **Trust boundaries exercised:** another profile's credential at every passkey step, a short file password, corrupted and foreign files (existing variants), a discovery narrowed to any credential the authenticator holds, a lock during a held prompt.
- **Leaks:** each file password joins the needles (`secretFor`); a passkey account file is opened with its file password and refused another (O7); `prfSalt` stays allowed only in its own row, a changed row's new salt included (`learnSalts`); credential ids are identifiers, not needles.
- **Least privilege, supply chain, crypto:** no new dependency or primitive; no workflow or permission change; CI does not arm these files. Arc 2's agents are bounded by their tool configuration only (CHARTERS.md § Fleet permissions), checked by its probe before the wave.
- **Evidence and wording:** raw evidence stays in the run's record directory; console lines name the seed, step, action and property only. No committed text says why the passkey design changed or who could obtain a passkey's output; properties only.

## Phases and gates

**Arc 1 (the model).**

**1.1 ✗ The model and its test.** Change `PC/model.ts` as § Model says. Add to the model test: a clause test per new action (committed, refused, cancelled; the minted count; the session and bearer under strict on and off); every new action and variant drawn within 1,000 seeds on Chrome, Firefox and network caps; no plan mints past `credentialSlots`, a declined passkey import counted; a reuse mints none; `other` never names the target's credential; every new source a citation whose fragment holds.
Add O6 fixtures: two profiles on one credential with two phrases pass; a passkey profile's honest re-export passes, a missing or changed one fails. Add two replay controls: a phrase import and a backup import listed without `method` plan as password imports.
Gate: `bun run lint`, `bun run typecheck:all`; `cd apps/extension && for i in $(seq 30); do bun --bun vitest run scripts/e2e/profile-chaos-model.test.ts --retry=0 || exit 1; done` exits 0 after 30 runs. Layers: lint, typecheck, unit.

**1.2 ✗ Drivers, collectors, checkers.** Write the drivers, `answeredCredentials`, the capture, the O2 clauses, D8, D6's re-export and #1178's entries. Add break fixtures: a row naming another credential fails O2, a missing binding fails it too, and the honest row passes. Run single seeds on the armed smoke dist; read each new action's step in the record. Check I1 and I2 on both browsers. Write six hand lists (`NULO_E2E_CHAOS_ACTIONS`) under `~/.cache/nulo-backlog/chaos-3/` and record each in `lessons/phase-1.md`: (a) three passkey profiles, a reuse of the second's credential at import, `verifyAll`; (b) a passkey phrase import declined at the duplicate warning, then creates up to the slot bound; (c) an account file imported into a password profile, a change to a passkey, `verifyAll` (the re-export); (d) strict off, a passkey to new passkey change, a restart, a lock, the replaced credential refused, the new one opening; (e) each `changeUnlockMethod` variant and the race; (f) each passkey account file variant, the file imported into a password profile. In one launcher session per browser (`chaos-session.ts start`), with explicit parameters: `do createPasskey` P1 on K1, P2 reusing K1, P3 on K2; `do lock`; `do unlockPasskey` P2 with `other` K2, refused; `do unlockPasskey` P2 approved, opened; then `oracle`: every command dispatched, each outcome as named, no `incomplete` line.
Gate: fast layers; the model test; `NULO_E2E_CHAOS=1 NULO_E2E_CHAOS_SEED=7001 NULO_E2E_CHAOS_RUNS=3 bun run test:e2e -- tests/e2e/profile-chaos.test.ts --retry=0` (smoke env as README § Profile chaos) on Chrome and under `NULO_E2E_BROWSER=firefox`; lists (a) to (f) on both; `bun run test:e2e -- tests/e2e/account-import-export.test.ts --retry=0` on Chrome (the shared helper's callers). Pass: each list runs every step on both browsers, which covers every new action and variant; the seeds are a smoke run; no red but a filed finding.

**1.3 ✗ The seeded runs and the docs.** Rewrite README § Passkey profiles for the new flows (what is modelled, D1's narrowing, the slots). Run the campaign at retry 0: smoke 7001 to 7030 per browser (three parallel `seeded` batches of ten per browser, `bun apps/extension/scripts/e2e/chaos-session.ts seeded --browser <b> --seed <first> --runs 10`), `pre-update` 7101 to 7105 per browser (`NULO_E2E_UPDATE_FROM=v0.31.0`, the candidate built from the committed head), network 7201 to 7205 per browser (`NULO_E2E_CHAOS=1 NULO_E2E_CHAOS_SEED=7201 NULO_E2E_CHAOS_RUNS=5 NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_PROVERLESS=1 bun run e2e:agent tests/e2e/network/profile-chaos.test.ts` from the repository root, one at a time, the smoke dist rebuilt after). Triage every red by CHARTERS.md § Triage, class first; file each product finding with its seed and step; fix every harness red and rerun its seed.
Gate: fast layers; every seed green, or red only on filed findings, or incomplete only for a planned restart's log window; the table (seed, outcome, time, coverage, findings met) in this plan; each new action's per-seed time measured.

**Arc 2 (the fleet wave; on the orchestrator's resume only).**

**2.1 ✗ Launcher fixes and the brief.** Fix F10's four defects in `scripts/e2e/chaos-session.ts` and `E/helpers/chaos-session/`: refuse a capture of a Chrome page without focus as a refusal the session survives; answer every discovery that no `passkey other` narrowed at once with an `incomplete` line, on both browsers; the same for a create on a full Chrome authenticator and a ceremony on a non-anchor Chrome page. Check CHARTERS.md's brief, which carries wave 2's traps, against the fixed behaviour.
Gate: fast layers; the launcher's unit tests with one case per fix and a success control; one 10-minute session per browser replays to the same end.

**2.2 ✗ The wave.** Twelve Opus agents, 60 minutes each from spawn, six per browser, spawned as CHARTERS.md § Fleet permissions says, sessions started at spawn (archived D76). Charters: Chrome CH1, CH3, CH4, CH5, CH7, CH9; Firefox CH2, CH3, CH7, CH7, CH8, CH8 (D15).
Gate: every agent's session ran 60 minutes or ended by the agent; each session's replay recorded.

**2.3 ✗ Triage and record.** Triage by CHARTERS.md § Triage; file each finding (five sections, deduplicated); record the wave table in this plan.
Gate: every finding filed or dispositioned; `bun run check:plans`.

**The Testnet pass:** #1189's checklist, the owner's; no step of this lane.

## UI impact

None. No product file changes; a testid a driver needs is added without changing what a screen shows (D14).

## Delivery

| Arc | Phases | Base | PR title (≤ 92) | Closes | code_review |
|---|---|---|---|---|---|
| 1 | 1.1-1.3 | `dev` | `test(e2e): profile chaos drives passkey imports, method changes and shared passkeys` | Part of #1157 | off |
| 2 | 2.1-2.3 | arc 1 | `test(e2e): chaos sessions refuse silent ceremonies; fleet wave on passkey flows` | none | off |
| close-out | Outcome, archive | arc 2, or arc 1 if arc 2 is dropped | `docs(plans): close chaos-3 with its outcome and archive it` | none | off |

- `gh stack` (`gh stack add` per arc, `gh stack submit --auto`, bodies by `gh pr edit`). Each PR opens without labels after its gates and its Codex loop; the chaos files stay skipped unarmed, so each suite's wall-clock is unchanged; the PR body states each browser's suite wall-clock and the measured time per seed before and after.
- Serial: arc 2 needs arc 1's head and the orchestrator's word. No lanes.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `17f35c504`, with these specifics:
- Review loop per arc, while it is the stack tip: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; the prompt carries the arc's diff from its base, this plan and ledger, the arc map ("arc N of 2; arc 2 adds launcher fixes and a fleet wave on arc 1"), the adversarial ask, and the standard's two rules verbatim. Hard stop at three rounds. After the last arc, one fresh session over the net diff from `17f35c504` with the cross-arc ask.
- `/code-review`: off.
- Close-out: merge `origin/dev`, read `index.md` and `lessons.md`; the Outcome; lessons promotion; the comment on #1157 (D12); known limits filed closed; `STATUS.md` deleted; `git mv` into `archive/` in its own commit; `bun run check:plans` green.
- Teardown after the close-out merges: `agent-worktree done chaos-3 --merged --trunk dev`. A `/loop` session checks each firing; a `/goal` session arms one background wait after its report.

## Review verdicts

Each finding was checked against the tree before its disposition; detail in lessons/phase-0.md.

- **Codex, round 1:** reject; 8 findings, all accepted: O6 siblings by phrase only (D8); passkey imports checked by O6 (D6); the narrowing reads the wallet's request first (D1); capture by `rawId` before a drain or a navigation (D1); wrong credentials from every minted one (D8); the gate loop exits 1; hand lists per critical combination (1.2); CH6 out of the fleet (D15); the full confinement probe (CHARTERS.md). It preferred Outline A.
- **Opus, round 1:** conditional approve; 9 findings. Accepted: findings 1 and 2 (as Codex 1 and 3); the launcher's `do` installs no capture, so each driver does (§ Shape); the probe list verbatim, a canary under `$HOME`, the CLI's `--permission-mode default` rechecked (CHARTERS.md); D7's salt clause dropped as O7's; D10 narrowed to the lines a run meets; `World.minted` dropped for the counter (D2) and optional fields as `onboardingCreate` (D3); `PC/network-drivers.ts` in the map; hand lists carry per-action coverage and the network command arms the file (1.2, 1.3); every un-narrowed discovery refused (2.1). Rejected: none. It preferred Outline A.
- **Codex, final fresh pass:** conditional approve; 3 conditions, all accepted: a step's ceremonies checked as the sequence its action names (D1, `answeredCredentials`); an absent `method` keeps password semantics, with two legacy replay controls (§ Model, 1.1); the launcher check made executable with explicit parameters and two credentials (1.2). No finding against F1 to F10; Outline A kept. Resumed over the fixes: approve, no regression.
- **Outline B** (cheapest-first: one action per path, credentials from the row, a reuse only with one credential held, the in-process test as a phase): rejected by both audits and here: it binds by the write under test, never meets a reuse among several credentials, duplicates four drivers, and its in-process phase is outside the lane (D12).

## Seeds (draft; finalized after approval)

```
/goal Arc <N> of implementations-plan/chaos-3/plan.md is done: every phase of the arc marked ✓ with its validation gate reported passing in the transcript, LESSONS_FILE=implementations-plan/chaos-3/lessons/phase-<N>.md printed, the Codex loop converged (a resumed pass with no new material point quoted), the arc's PR open against its base with its checks green, `bun run test` and `bun run lint` exit 0.
```

```
/loop 15m Drive arc <N> of implementations-plan/chaos-3 forward per its plan.md: reality check (plan, lessons, git status, the PR's checks), next pending phase, fast layers after each edit, the gate before ✓, the Codex loop at the arc boundary, then the PR. Decide with Codex, never wait; never merge; stop after three failures on one step.
```
