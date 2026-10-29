---
plan: lessons-budget-1
tier: light (the orchestrator's spawn: one Codex audit round-trip and the Opus Plan leg)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 87d04118e
trunk: dev
status: completed; delivered as one PR carrying this close-out
issues: "#1347"
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-29. Planned and implemented in one session, as one arc.
- **Status:** completed. The arc and this close-out ship as #1350 into `dev`; its merge closes #1347 and archives this plan.
- **Shipped:** `implementations-plan/lessons.md` from 8191 B and 33 entries to 7940 B and 31, every entry checked against the tree and every clause linked to a source. Four entries routed to the doc their readers read: the chaos `passkey` fault's timing to the e2e README's session commands, `always() && !cancelled()` to `CI.md` § Adding a new gate, the stacked and parallel arc rules to `implementations-plan/README.md` § Post-implementation standard, and error text to the logging-policy skill. The HandshakeRegistry entry retired (stated at its code, enforced by the send sequencer); the MAC and contract-class rules split; the `innerText` fact merged into the success-control entry; stale wording fixed (root `test`, `PopupManager`, `viaPxe`); stamps now carry version and month, the Aztec ones re-checked on 6.0.0. Two lessons promoted from send-picker-1 (the `<script setup>` shadowing, the lifted display gate).
- **Dropped or rejected:** the brief's 7 KiB aim, missed by 772 B: the reviews' accuracy and evidence conditions cost about 800 B and no further entry met the retirement rule, so 252 B of head-room remain. T6 in the e2e skill (its readers never load it); the merge-ref entry routed away (`lessons.md` is the only doc every PR session reads); the decision-ids clause moved out of README step 3 (planners read it before writing a plan); thirteen promotion candidates (recon § Candidates). Outside this lane and passed to the orchestrator unverified: whether a wallet-UI send paid by a fee contract can run beside a popup transfer that holds that contract's notes.
- **Known limits:** none.
- **Open items:** none.
- **Lessons:** none beyond the pass itself.
- **Seeds retired:** the `/goal` and `/loop` below are a record, not an instruction.

## Goal

#1347: `implementations-plan/lessons.md` holds 8191 of its 8192 B, so three plans closed this week with no promotion (`archive/firefox-pin-1/`, `archive/send-picker-1/`, `archive/send-side-1/`). One docs-only pass over the whole file applies the retirement policy (`implementations-plan/README.md` portable rule 8), promotes what those plans learned, and leaves head-room for the next close-outs. Recon, line by line: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Outcome & Quality Bar

- **For whom:** every later session, which reads `lessons.md` at its start, and the close-outs after this one (fee-race-1 first), which need room to add a line.
- **Excellent:** (1) every line that stays is true at `87d04118e`, links the evidence for each of its clauses, and carries the version and month it was checked when a tool's behaviour is its subject; (2) no line is lost: each retired line is moot or stated where every session it bites reads it, and the PR body accounts for every line.
- **Good enough:** wording is tightened only where no clause is lost; sections and their order stay as they are.

## Assumptions

**Facts** (verified at the base):
- F1. The gate (`scripts/ci-cd/plans/structure.ts`, `LESSONS_BUDGET` 8192; `structure.test.ts:259`) refuses an entry over one line, one that links no evidence in `implementations-plan/` or an allowlisted permalink, and any link leaving the plan tree. So a lesson cannot link a skill or `CI.md`; a routed line carries its evidence into its new home.
- F2. `links.ts` `LIVE_DOCS` checks every link in root `*.md`, every `apps/**/README.md`, package READMEs and `.claude/skills/**`, so routed text with a broken link fails `check:plans`.
- F3. Any change under `apps/extension/**` trips all four e2e lanes; `.claude/skills/`, `CI.md` and `implementations-plan/` trip none. `lint-and-typecheck` and `unit-tests` (with `test:ci-gating`, so `check:plans`) run on every PR (`pr-quick.yml:235-247`). T6 below lands in `apps/extension/tests/e2e/README.md`, so this PR runs the e2e lanes.
- F4. CLAUDE.md routes a logging rule to the `logging-policy` skill (read before adding a log line) and a workflow change through `CI.md`; `implementations-plan/README.md` § Post-implementation standard binds every plan's delivery; a chaos fleet agent gets `apps/extension/tests/e2e/README.md`'s session commands and its charter, and reads nothing else (`archive/passkey-chaos-1/CHARTERS.md:3,15`).
- F5. Precedent: #1017 retired a line "its code now states" and kept the R100 line because every close-out moves a plan.
- F6. Earlier tightenings dropped evidence: L11's `archive/owner-feedback-1/lessons/phase-8.md` (#798 had it) and L21's class sources (#368 dropped them).
- F7. Aztec moved to 6.0.0 (`dda72e321`); L27, L29 and L30, stamped `6.0.0-rc.1`, hold on 6.0.0 (recon: `fetch.ts`, a `safeParse` probe, `l2_block_stream.js`). Popup transfers and dApp sends both wait on the send sequencer (`dapp-send-executor.ts:355-358`, `send-sequencer.ts:15-17`).

**Inferences:**
- I1. A rule moves out of `lessons.md` only to a doc that every session it bites reads at that moment; a domain skill read by one kind of work does not qualify for a gotcha every PR meets (L8 stays).
- I2. fee-race-1's close-out adds one or two lines; about 600 B of head-room covers them.

**Asks:** none. No line touches what a person sees ([OWNER-ASKS.md](OWNER-ASKS.md)).

## Architecture & Implementation

**Rule for each line (D1).** Retire a line when its cause is gone, when its rule already sits where every session it bites reads it, or when it bites only someone editing the code whose comment states it (F5). Route a line when such a home exists and lacks it: add the text there with its evidence and drop the line, in one commit named for it. Keep every other line; tighten its words only where no clause is lost; restore evidence an earlier pruning dropped (F6); merge two lines that state one fact.

**Files.** `implementations-plan/lessons.md`; one routed text each in `apps/extension/tests/e2e/README.md`, `.claude/skills/logging-policy/SKILL.md`, `CI.md`, `implementations-plan/README.md`; this plan's folder and `implementations-plan/index.md`. No code, script or test.

**Dispositions** (L = file order at the base; "stamp" = `(<version>, 2026-10)`, D3):

| Line | Disposition |
|---|---|
| L10, L14, L15, L18, L20, L23, L25, L26 | keep verbatim |
| L33 base copy | keep; restore the green-run clause's source #68 had, `archive/code-followups-1/plan.md#outcome` |
| L1, L4 | keep; add the month to the stamp |
| L31 agent Bash | keep; month added; link this plan's recon, which records the pipe-status and word-splitting reproductions (the line's evidence covers `set -e` only) |
| L3 `vue-tsc` | keep; stamp `(3.3.10, 2026-10)`, reproduced: a bad prop from a JS `<script setup>` passes, the same from `lang="ts"` fails |
| L2 root `test` | fix: "Root `test` (so `audit:vue`) runs only `apps/extension`'s vitest config, in jsdom, without the packages' node-only tests" (typecheck and lint are repo-wide; some packages' tests ride along, `vitest.config.ts:37-70`) |
| L5 success control | keep "match a captured identity exactly", sourced from `archive/harden-dedupe/plan.md#success-control`, and merge in L22's `innerText` clause: "(whole `textContent`: `innerText` follows `text-transform`)" |
| L6 virtual authenticator | route to the e2e README's `passkey` row: T6 |
| L7 CodeQL | keep; stamp `(2026-10)` (a service, no version) |
| L8 merge ref | keep, shortened: "A PR lane builds `head.sha` with the merge ref's workflows, so a later `dev` fix is absent until you merge `dev`; a PR that conflicts with `dev` gets no run at all." (`pr-quick.yml` builds `head.sha` too, and the skills that state it are read by e2e and Aztec work only) |
| L9 `always()` | route to `CI.md` § Adding a new gate: T9 |
| L11 `gh stack` | route to `implementations-plan/README.md` § Post-implementation standard step 3, its dropped evidence restored: T11 |
| L12 popup RPC | restore the two sources #607 dropped (`archive/account-session-life/lessons/phase-4.md`, `archive/wallet-followups/lessons/phase-4.md`); trim: "A popup RPC fails 60 s after it began, the worker's Ready wait included, unless its client sets `requestTimeoutMs` (a proof outlasts it, so a send that lands reads as failed)" |
| L13 `PopupManager` | fix: "`PopupManager` keeps a popup mounted while it is hidden: gate its setup on `show` or a `v-if`" (`SelectTokenPopup` is `v-if`-gated, `PopupManager.vue:97`); second link to `archive/passkey-unlock-1/lessons/phase-A4.md`, the substance |
| L16 typed errors | fix: "`viaPxe` flattens the rest to `Error`" (it also synthesizes `SessionEndedError`) |
| L17 hidden rows | link the legacy-variant rule's source, `archive/passkey-unlock-1/plan.md#decision-ledger` (D4); "skips"; "zod strips unknown keys, so a legacy variant forbids newer ones (zod 4.6.7, 2026-10)" |
| L19 error text | route to `logging-policy`, after the "Pass the value…" bullet: T19 |
| L21 MAC and class | split: the MAC rule stays; the class rule moves to § Aztec with its restored evidence (`archive/security-fixes-1/lessons/phase-6.md`, `archive/tokens-and-balances/lessons/phase-3.md`) |
| L22 four facts | drop the `composes` clause (`packages/design/README.md:51-55`, `type-role-ban.test.ts`) and the `innerText` clause (into L5); stamp the storage clause `(153.0.4, 2026-10)`, the pin it was seen on |
| L24 `Lock` | trim to its general rule; the deleter count is one service's remedy, stated at `incoming-transfer/service.ts:292-295` |
| L27, L29, L30 | restamp `(6.0.0, 2026-10)` (F7); L29 also links its `safeParse` source, `archive/dapp-ingress-grants/lessons/phase-3.md` |
| L28 HandshakeRegistry | retire, stated at its code (`execution/transfer-sequence-keys.ts:1-9`, `execution/README.md:16`) and enforced for every popup transfer and dApp send (F7); wallet-UI sends skip the sequencer but never use the pair handshake |
| L32 `pgrep` | keep; "not `$$`/`$PPID`" becomes "never `$$`/`$PPID`" (the agent's own shell is the wrong target the line exists to name); restore the `signalCode` source, `archive/code-followups-2/lessons/phase-2.md` |
| P1 new, § Extension runtime | "A `<script setup>` local shadows a same-name prop in the template, `:label` shorthand included: never name a local after a prop (Vue 3.5.42, 2026-10)." ← `archive/send-picker-1/lessons/phase-1.md` |
| P2 new, § Extension runtime | "Lifting a display gate (a hidden zero, a skipped row) shows the malformed stored values it hid: parse what newly renders (`utils/token-amount.ts`)." ← `archive/send-picker-1/lessons/phase-4.md` |
| C1-C4, C7-C15 | not promoted: already in their home or below the bar (recon § Candidates gives each reason) |

Measured: 7940 B, 31 entries (from 8191 B, 33), 252 B of head-room. The brief's 7 KiB aim is missed by 772 B: the panel's accuracy conditions (L8 kept, L5's and L12's clauses, the months) cost about 470 B, and the implementation review's evidence conditions (a source for every clause, five lines) about 330 B; no further line meets D1, and the next pass starts from a file whose every clause can be re-checked.

**Routed texts:**
- T6, the end of the `passkey refuse|no-prf|other|hold|release` row: "The test authenticator approves every prompt silently: set a fault right before the press that prompts. A fault armed after a press cannot test that press: before reporting a step that ran unprompted, check their order in `actions.jsonl` (`implementations-plan/archive/passkey-chaos-1/lessons/phase-C5.md`)."
- T9, a paragraph after the numbered steps: "A job that needs one that can be skipped is skipped with it unless its `if:` calls a status function, and `always()` also runs after a cancel: a job with side effects gates on `always() && !cancelled()` and the success results it needs (`[record](./implementations-plan/archive/release-pipeline-hardening/plan.md#always)`)." The `status` aggregators keep a bare `always()` on purpose (CI.md:107), so the text names side effects only.
- T11, after step 3's `gh pr edit` sentence: "On a stack the plans gate runs at each arc head, so no arc links a later arc's file, and after a squash merge, merging the trunk into an old arc head is add/add. Parallel arcs of one plan, stacked or not, take disjoint decision ids, and a trunk merge into an arc can list the plan's index line twice: run `bun run check:plans` after every trunk merge into an arc (`[evidence](archive/ux-feedback/plan.md#stack-gate), [more](archive/harden-security-fixes-2/plan.md#decision-ledger), [more](archive/owner-feedback-1/lessons/phase-8.md)`)."
- T19: "**An error's message is a finished string.** `trim` keeps up to 200 characters of it (`MAX_ERROR_MESSAGE_CHARS`), and a message can quote its input (`JSON.parse`'s does): where that input can hold anything this policy never logs, log a fixed category, never the error (`implementations-plan/archive/backup-log-hygiene/plan.md#error-text`)."

**Not taken.** (a) Raise the budget: a weakened gate. (b) T6 in the e2e skill: the fleet agents it bites never read the skill (F4); the README row costs this PR its e2e lanes, which is the price of the right home. (c) L8 into README step 3 (Opus) or `CI.md`: each reaches only part of the sessions that open PRs; `lessons.md` reaches all (I1). (d) L2, L4 or L25 into CLAUDE.md, their natural home: out of this lane's scope. (e) Version-only stamps: the file's habit, but portable rule 8 and the brief say "dates"; a month costs about 10 B a line.

## Decision ledger

- D1. The rule above. D2. A routed text goes to the doc its readers read (T6 to the README though it trips the e2e lanes; the others outside `apps/`).
- D3. A stamp is the version it was last checked on plus the month, `(1.4.2, 2026-10)`; a service with no version gets the month; a line about our own code or protocol semantics gets none.
- D4. Lines are edited in place; headings and order stay, so fee-race-1's close-out merges against a stable file.
- D5. Restored evidence costs bytes and stays: a clause with no source cannot be re-checked.
- D6. Commits: one per routed line, named for it; one for the retirements, fixes, merges and stamps; one for the two promotions; then the close-out.

## Phases and gates

Commands run from the worktree root. Every gate: `bun run lint` exit 0; `git add` the touched files, then `bun run check:plans` exit 0 with 0 findings; `bun test scripts/ci-cd/plans/` all pass; `bash scripts/check-no-local-paths.sh` prints `ok`.

**1. Routes** ✓ (L6, L9, L11, L19). Write T6, T9, T11 and T19 where the table says; delete each line from `lessons.md` in the same commit. Gate, also: `git grep -n` finds each routed text once in its home and its old line nowhere in `lessons.md`.

**2. The pass and the promotions** ✓. Apply every other row of the table in one commit, then P1 and P2 in a second. Gate, also: `wc -c implementations-plan/lessons.md` ≤ 7950; `grep -c '^- '` is 31; reading the whole diff finds no account name, launch day or advisory finding.

**3. Close-out** ✓ (the PR's final commits, after `gh pr create`). Merge `origin/dev`; read what changed in `index.md` and `lessons.md` and re-run the phase 2 gate on the merged file. Then the Outcome block, `STATUS.md` deleted, `git mv` into `archive/` in its own commit with the index line moved to `archive/index.md`. Gate: as above, plus `bun run test:ci-gating` exit 0.

## Security & Adversarial Considerations

- **Threat model:** docs only, no code path. The risks are what committed text discloses or misteaches: a local path, an account name, the store launch day or an unpublished advisory's finding (none of the moved or kept lines holds one; `check-no-local-paths.sh` and a read of the diff check it), and a routed security rule that reads weaker in its new home. T19 widens the logging rule to everything the policy never logs; it never loosens one. T6 tells a triager why "no prompt" is a timing error, and names the actions file as the check, so a real passkey bypass is not waved off.
- **Least privilege, crypto, supply chain:** unchanged; no dependency, workflow or permission moves. T9 describes existing `if:` semantics; it changes no workflow.

## UI impact

None. No file a person sees changes.

## Delivery

One arc, one PR into `dev`, the close-out as its final commits. Branch `worktree-lessons-budget-1`. Title (70 chars): `docs(plans): retire, route and promote lessons.md entries in one pass`. Body: the table above as an accounting (every retired line with its reason, every merged or split pair, every routed text with its home, every promoted line with its source, every candidate not promoted), the before and after bytes and why the 7 KiB aim is missed, the gates run, and that the e2e lanes run because of T6; `Closes #1347`. Opened without labels. Serial; no lanes.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `87d04118e`, with:
- Loop once over the whole diff: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus review (`Agent`, `opus`, `general-purpose`) beside round 1; three rounds at most. The prompt asks for each kept line to be checked against the tree, not only the diff.
- `/code-review`: off.
- Close-out: phase 3; no further lesson (the pass is the promotion); known limits and open items none expected.
- Teardown once merged: `agent-worktree done lessons-budget-1 --merged --trunk dev`; a `/loop` checks each firing, a `/goal` arms one wait after its report.

## Review verdicts

Each finding was checked against the tree; the consults are in [lessons/phase-0.md](lessons/phase-0.md).

- **Codex, round 1** (fresh, `gpt-6.1-sol`, high): conditional approve. Accepted: keep L8 (`pr-quick.yml` builds `head.sha`; its claimed homes are e2e and Aztec skills); keep L5's exactness clause (`archive/harden-dedupe/plan.md#success-control`, a substring accepts `Mainx` for `Main`), its source corrected in recon; split T11's stack-only rule from the parallel-arc rules, which bit unstacked arcs (`archive/owner-feedback-1/lessons/phase-8.md:3`); add months to stamps (portable rule 8 says "dates"); L2's and L13's wording overbroad (`vitest.config.ts:43-48`, `PopupManager.vue:97`). Fact corrected: dApp sends are sequenced too, which strengthens L28's retirement.
- **Opus, round 1** (`Plan`): conditional approve. Accepted: T6 to the README's `passkey` row, since fleet agents read only that and their charter (F4); T19 scoped to everything the policy never logs, not "a secret or a row" (`logger/utils.ts:183-188` keeps 200 characters); L12 keeps its consequence (a send that lands reads as failed); L2 also excludes node-only tests; the gate uses `check-no-local-paths.sh`, which covers the `/mnt/<volume>/<user>` shape the plan's grep missed; the Firefox stamp names the version it was seen on. Rejected: L8 into README step 3 (Not taken c).
- **Disagreement settled:** T6's home. Codex judged the skill appropriate; Opus showed its readers never load the skill. The README row wins on F4, at the cost of the e2e lanes.
- **Codex, round 2** (resumed, the folded plan): conditional approve; three local conditions, applied: T6 said a late fault "meets nothing", but a later press can spend it (`helpers/chaos-session/faults.ts:1-7`), so it now says to check the order in `actions.jsonl`; L3 stamped after a probe on vue-tsc 3.3.10; recon's stale T6 home and `viaPxe` wording corrected. It judged the README row the better T6 home and 7592 B defensible (no further line meets D1).
- **Codex, round 3** (resumed, verify): approve, no new material finding.

## Implementation review verdicts

- **Codex, round 1** (fresh, `gpt-6.1-sol`, high, the diff from `87d04118e`): conditional approve; one finding, accepted: five kept lines held clauses no linked file states (L12's Ready and replay clauses, L17's legacy variant, L31's pipe status and word splitting, L32's `signalCode`, L33's green-run grep). Four of the sources were dropped by earlier tightenings (#607, #240, #68) and are restored; L17 gains its decision-ledger source; L31 links this plan's recon, which records the reproductions. It confirmed every disposition, the nine verbatim lines, all stamps and the four routes.
- **Opus** (`general-purpose`, the same diff): conditional approve. Accepted: the index hook claimed "7 KiB or less" and the status read "planned"; L32's trim lost the concrete wrong target, restored as "never `$$`/`$PPID`"; P1 is Vue behaviour and takes a stamp; the plan's L28 reason now says "every popup transfer and dApp send" (wallet-UI sends skip the sequencer and never use the pair handshake); recon's source for the 153.0.4 stamp corrected (`archive/e2e-followups-3/plan.md:91`). Rejected: moving the disjoint-decision-ids clause out of README step 3, since CLAUDE.md § Implementation plans has every planner read that README before writing a plan, so the rule reaches it before arcs take ids. Noted for the orchestrator, outside this lane: whether a wallet-UI send paid by a fee contract can run unsequenced beside a popup transfer that holds that contract's notes (plausible, unverified).
- **Codex, round 2** (resumed, `c7044e9df`): approve, no new material finding; each new link states the clause it backs. The loop converged.

## Seeds

```
/goal Phases 1-3 of implementations-plan/lessons-budget-1/plan.md are marked ✓, each backed by its gate reported passing in the transcript; LESSONS_FILE=implementations-plan/lessons-budget-1/lessons/phase-N.md printed per phase; `wc -c implementations-plan/lessons.md` ≤ 7950; the Codex loop over the whole diff converged (a resumed pass with no new material finding quoted); one PR into dev exists, opened after the loop, carrying the close-out that archived the plan (`git show --stat` of the move); `bun run check:plans` and `bun run lint` exit 0.
```

```
/loop 15m Drive implementations-plan/lessons-budget-1 forward per its plan.md: reality check (plan.md, lessons/, git status, the PR's checks); next pending step; the phase gate after each edit; the Codex loop after phase 2; then Delivery and the close-out; merging is the owner's call; once implementations-plan/archive/lessons-budget-1/plan.md is on origin/dev, run `agent-worktree done lessons-budget-1 --merged --trunk dev` and stop.
```
