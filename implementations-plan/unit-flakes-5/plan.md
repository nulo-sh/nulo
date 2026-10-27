---
plan: unit-flakes-5
tier: light (one Codex audit round-trip plus the Opus Plan leg)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at 17f35c504dacfadf49e4291c496054252b5594b2
---

# unit-flakes-5: whole-tree unit tests near the 5 s default

#1270 names nine extension unit tests that run 0.5 to 2.4 s at load 73 to 123 on this host, which gives 2.3 to 10.7 s at #1112's 4.5× load factor. This plan measures each one (`recon.md` § Measurements) and decides one by one. Four guards stop parsing files that provably cannot hold a finding, and one of them also stops rescanning the tree for every constant. Four tests stay as they are, for the reasons in D4 and D5. No budget is raised, no assertion is loosened, and only test files change.

## Outcome & Quality Bar

- **For whom**: whoever runs `bun run test` or `audit:vue` on a shared host at load 200 or more. A red run must mean a defect.
- **Excellent**: (1) each changed guard gives today's verdict on every file: identical tree findings, an inline case per trigger, and a mutation proof per trigger; (2) each change is measured: 30 runs at retry 0, with the worst durations against the base.
- **Good enough**: a guard whose remaining cost is the files that can hold a finding keeps that cost. The plan says so, and a closed `known-limit` issue records what remains exposed (D5).

## Assumptions

Facts (verified at the base; evidence in `recon.md`):
- F1. stored-shapes' five tree tests each parse all 1076 files through `scriptsOf` (`stored-shapes.scan.test.ts:144-149`). 178 files spell a trigger in D1.
- F2. useLogFilters' tree test runs `callsTo` on 1080 files, and `constantValue` (`:84-92`) scans all 1080 texts on each of its 153 calls. The two costs are about 60% and 40%.
- F3. TypeScript cooks every escape in literals and names, and each escape starts with `\`. Vue decodes character references in template code but not in `<script>`. Of the named references, only `&mdash;` decodes to an em dash, only `&fjlig;` decodes to ASCII letters (`fj`), `&bsol;` decodes to `\`, and `&period;`, `&quest;`, `&lowbar;` and `&colon;` decode to punctuation. Numeric references (`&#8212;`, `&#x97;`, `&#151;`) also decode to an em dash.
- F4. copy-dash's and type-role's `scanScript` receive both raw script blocks and decoded template expressions (`copy-dash-ban.test.ts:301,304,313`; `type-role-ban.test.ts:508,582`).
- F5. A tree dump with and without each D1/D2 check is byte-identical for all four guards (and for the log-payload check D4 drops).
- F6. The deep-nesting cost is JavaScriptCore's `JSON.stringify`: about 0.6 s at 30,000 levels and 1.1 to 1.3 s at the refusal (40,001 levels or more, arrays or objects). Building the array takes 62 ms. The case pins #671's fix.

Inferences:
- I1. Each check is a necessary condition for a finding of the call it guards, under the guard's current rule (D1). So it removes no finding from any file while that rule stays the same. The tree dump (F5) covers only today's tree; the inline cases and mutations of Phase 1 cover inputs the tree lacks. A rule change must re-derive its trigger: stored-shapes builds its trigger from the rule's own sets, and D3 checks the two tables that grow.
- I2. D3 catches a new name in a growing table. It does not catch an alternative added inside an existing site regex (`/^(?:Lock|Mutex)$/`).

Asks (working assumption in force; none concerns a screen):
- A1 (for the orchestrator). Close #1270 with this PR, though four tests keep their cost (D4, D5)? Working assumption: yes. The issue's own possible fix expects some guards to keep a proportional cost, and the known-limit issue (D5) records what remains exposed. The final report flags the closure for acceptance before the merge.

## Architecture & Implementation

Test-only. Each check sits just before the expensive call it guards, so the inline cases also run through it. A trigger read off raw `.vue` text that Vue later decodes holds letters only, or `&#` (F3).

| Guard | Where | Skip unless the text holds |
|---|---|---|
| `stored-shapes.scan` | `scriptsOf`, the whole file's text, before `parseSource` | `nulo:`, `useSyncedRef`, `\`, each entry of `STORE_CLASSES` and `STORE_CLASS_MODULES` |
| `useLogFilters.scan` | the `callsTo` call in `sourceExprs`, raw file text; the `own` regexes still run on every file | `logger`, `Lock`, `ReadWriteGuard`, `createPlaced`, `LoggingTelemetrySink`, `ClockTickerAdapter`, `NuloAccount`, `&#` |
| `copy-dash-ban` | `scanScript`, decoded code | `—`, `\u` |
| `type-role-ban` | `scanScript`, decoded code | `font`, `letter`, `transform` (any case), `\` |

- **useLogFilters `constantValue`**: add a `Map` from constant to value. Store a value only on success, so a failed lookup still throws at every call.
- **Comment drafts**: stored-shapes: "A file holds no finding unless it spells a key head, `useSyncedRef`, a store class or module, or an escape (`\`) that a literal or a name decodes." useLogFilters: "Every callee `READ_CALLEES` matches spells one of these names. A template's code is decoded, and no named reference decodes to their letters, so only `&#` can hide one." copy-dash: "A literal holds an em dash only if its code spells one or a `\u` escape." type-role: "Every judged key and style string spells font, letter or transform in some case, unless an escape hides a letter."
- **Alternatives not taken**: D6.

## Security & Adversarial Considerations

- **Threat model**: these are repository gates. The risk is a guard that silently stops guarding: a trigger that is too strict now, or one that goes stale when the guard's rule grows. Mitigations: each trigger is derived from the rule (I1), the tree dump is identical (F5), each disjunct has an inline case and a mutation proof, and D3 checks the growing tables for a new name. Deliberate evasion (aliasing, computed names) stays outside these name-based guards, as their headers state.
- **Input validation, crypto, least privilege, supply chain**: N/A. No trust boundary, key, token or dependency changes.

## UI impact

None. Only test files change.

## Phases

### Phase 1: the four pre-checks and the memo ✓
- Files, under `apps/extension`: `src/wallet/storage/stored-shapes.scan.test.ts`, `src/components/JsonViewer/useLogFilters.scan.test.ts`, `src/utils/copy-dash-ban.test.ts`, `src/utils/type-role-ban.test.ts`.
- Steps: make the changes in § Architecture. Add these inline cases, each confirmed to pass on the base guard first. Each case holds only the trigger it proves. An escape is in the text the scanner reads, so the test source writes its backslash doubled.
  - stored-shapes: `"\x6eulo:core:unregistered"` is unregistered.
  - useLogFilters: one logger-free site per primitive, each read: `new Lock("network", log)`, `new ReadWriteGuard("fpc", log)`, `h.createPlaced(a, b, c, log, "fpc")`, `new LoggingTelemetrySink(log, "fpc")`, `new ClockTickerAdapter(c, log, "fpc")`, `NuloAccount.new(a, log, "pxe")`. A service that logs only through its helpers (`static name = CONFIG_SERVICE_NAME`, `super(CONFIG_SERVICE_NAME)`, `this.logWarn("m")`) reads `config`. `x.vue` with `:title="&#108;ogger.log(&quot;fpc&quot;, l, &quot;m&quot;)"` reads `fpc`.
  - copy-dash: `'Wrong chain \u2014 retry'` hits; `<Banner :text="'Retry &#8212; later'" />` hits.
  - type-role: script keys `letterSpacing` (tracking), `textTransform: "uppercase"` (case) and `"\u0066ontSize": "9px"` (size); the string `"FONT-FAMILY: serif"` (face); `:style="{ &#102;ontWeight: 600 }"` (faceless).
  - The two D3 tests, reading the same constants the checks read.
- Mutation proof, as scratch: drop each disjunct in turn (stored-shapes' two spreads count as one disjunct each; for type-role also the `i` flag). Move each decoded-code check onto the raw file text, and put useLogFilters' check in front of `own` as well. Record which named case goes red each time, then revert. The memo has no predicate; the tree dump of F5 proves it.
- **Validation gate**: `bun run lint`; `bun run typecheck:all`. Run `cd apps/extension && bun --bun vitest run <the four files> --retry=0 --reporter=verbose` 30 times. It must print `30/30`, and every mutation must go red. Report the worst duration of each tree test, base against change, as a measurement. Layers: lint, typecheck, unit.

### Final gate (before the review loop and again before the PR)
`bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`, each exit 0; `bun run check:plans` after the plan files are staged. No e2e file, `scripts/` or `.github/` changes.

## Decision ledger

- **D1 (method and placement)**: a substring check before each guard's expensive call, as in #1269. It must be a necessary condition for a finding (F3, I1). Where the guard parses decoded code (copy-dash, type-role), the check reads that code. There `&#` and `&mdash` need no trigger, and the inline reference cases pin the placement. Otherwise it reads the raw file: stored-shapes reads only `<script>`, and useLogFilters' `callsTo` decodes later, hence `&#`. stored-shapes uses one union in `scriptsOf`, because all four of its scans parse there. It checks the file's text before `parseSource`, so a skipped `.vue` file is not SFC-parsed either, and it takes the class and module names from the rule's own sets. Per-scan lists would cut 178 files to about 140, for more code.
- **D2 (`constantValue`)**: memoise per constant. It is the second cause of F2 and removes about 40% of that test's time. Rejected: an index built in one pass (`/\bexport const (\w+)\s*=/g`). It reads a line differently in a contrived case, while a memo keeps the regex as it is.
- **D3 (a new name in a growing table)**: two tests. In useLogFilters, every `INJECTED` site's regex source contains a `CALLEE_NAMES` entry, and `LOGGER_CALL`'s contains `logger`. In type-role, every `SCRIPT_KEYS` and `ROLE_PROPERTIES` entry, in its kebab and camel forms, and every `STRING_PICKS` source match `MAY_PICK`. They are sanity checks for a new entry, not proofs of necessity (I2); the inline cases are the proof. Rejected: a regex-to-substring extractor, and `READ_CALLEES` run without its anchors on the raw text (#1269 D1: no necessary substring can be read off an arbitrary regex, and a lookbehind would break the second).
- **D4 (`icon-names` and `log-payload-ban`)**: no change. icon-names' maximum is 738 ms (3.3 s at the 4.5× factor), and a check would admit 132 of its 252 `.vue` files. log-payload's 337 candidate files carry 975 of its 1124 ms of parsing, so a check saves at most about 13%. It would also restate `ERROR_TEXT_READ`'s names beside the rule. The Opus leg argued to leave it, and Codex found its inclusion proportionate. The smaller design wins (D5 lists the guard).
- **D5 (the deep-nesting pair, and what stays)**: no change. The cost is the engine's own refusal of #671's realistic input (F6). Rejected: mocking `JSON.stringify` to throw, because the case would then prove the `catch`, not that a nested body is refused, which the owner's no-workaround rule excludes. Rejected: a smaller depth, because the cost sits at the engine's cap and the saving is 60 ms. Rejected: a depth check in production, because it is out of scope and changes behaviour. At close-out, file one closed `known-limit` issue. It lists this pair (about 1 to 1.5 s at load 100), log-payload (1.4 to 2.4 s) and copy-dash's remaining cost (0.8 to 1.6 s at load 160 to 220). Reopening condition: a recorded timeout of one of them with no code cause. The next step would then be D6's shared corpus, an owner decision.
- **D6 (alternatives not taken)**: a corpus shared across test files (`globalSetup` with `provide`, or a disk cache). Up to 17 guards could use it, but it adds a lifecycle, staleness and a test-infrastructure layer, so it is scope expansion for the owner. `jsDocParsingMode: ParseNone` in the guards' own parses: no measurable gain in vitest (827 to 1246 ms against 903 to 1017 ms). Memoising `scriptsOf`: the first test would still pay the full parse.
- **D7**: one PR with one phase, as the lane brief asks.

## Audit verdicts

- **Codex round 1** (gpt-6.1-sol, high): reject. All four accepted.
  1. Demonstrated: a check in front of all of `sourceExprs` skips a service that logs only through its helpers (`own`). Now only `callsTo` is guarded, with a helper-only case, and a mutation puts the check back in front of `own`.
  2. Demonstrated: the escape fixtures held no escape, because the tool that wrote this plan decoded them. Repaired; `"FONT-FAMILY: serif"` is added for the `/i` flag.
  3. Demonstrated under a rule edit: D3 proves a name is present, not that it is necessary. D3 is now a sanity check, and the six per-primitive cases are the proof.
  4. Ask: closing #1270 while some tests keep their cost is the orchestrator's call (A1).
  Codex found no skip in the other checks. It agreed with D2, D5 and log-payload's inclusion.
- **Opus Plan leg**: conditional approve. All accepted.
  1. The `own` trap (as Codex 1).
  2. The missing escape cases (as Codex 2).
  3. Leave log-payload alone, since its gain is at most about 13%. This was against Codex; it is D4.
  4. stored-shapes must check before `parseSource` and take its names from `STORE_CLASSES` and `STORE_CLASS_MODULES` (D1).
  5. type-role's key sets can grow like `INJECTED`: the second D3 test.
  6. D3 is the proof only with the same constant: Steps say so.
  Facts F3, F4 and F6 and the useLogFilters comment draft are corrected. It found no skip in any check as placed.
- **Codex final pass** (resumed session, with both legs' dispositions): **approve**, no remaining material findings. It accepted leaving log-payload unchanged on the 13% ceiling.

## Delivery

Single arc: branch `worktree-unit-flakes-5` → one PR into `dev`, opened only after the review loop converges. Title (73 chars): `test: four whole-tree guards parse only the files that can hold a finding`. The body gives the 30-run counts, the worst durations against the base, the mutation proof, the tree-dump identity, D4 and D5, `Closes #1270` and `Known limits: #N`. No label: no e2e lane is needed. Parallel lanes: none.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `17f35c504dacfadf49e4291c496054252b5594b2`. Plan-specific parts:

1. Diff review: absent (`code_review: off`).
2. Review loop, once over the whole diff from the base after the final gate: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`. Resume with `resume-codex.sh`. Send the standard's two verbatim rules and the adversarial ask. One Opus review (`Agent`, `model: "opus"`, `general-purpose`) runs alongside round 1. Hard stop at three rounds. Log each round in `lessons/phase-1.md` and under Audit verdicts.
3. Delivery as above, then `gh pr checks <n> --watch` once. A known flake gets one rerun.
4. Close-out as the PR's final commits:
   - Merge `origin/dev` first.
   - File the D5 known limit (dedupe first) and write the Outcome.
   - Promote lessons. Candidate: an agent tool's input decodes backslash-u escapes, so write a fixture's backslash by code point and `grep` the file. `lessons.md` is near its 8 KiB, so prune first.
   - Comment on #1270 with D4 and D5. Delete `STATUS.md`.
   - `git mv` the plan into `archive/` in its own commit, move the index line, and run `check:plans`. Nothing merges before the orchestrator's word.
5. Teardown after the merge: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/unit-flakes-5/plan.md`, then `agent-worktree done unit-flakes-5 --merged`. The orchestrator notices the merge. A `/loop` session checks on each firing.

## Seeds

```
/goal Phase 1 of implementations-plan/unit-flakes-5/plan.md marked ✓, backed by its gate reported passing in the transcript (30/30, each mutation red, tree dump identical); LESSONS_FILE=implementations-plan/unit-flakes-5/lessons/phase-1.md printed; /code-review NOT run (code_review: off); the Codex loop converged over the whole diff (a resumed pass reporting no new material findings, quoted); one PR into dev opened only after that (`gh pr view` output), carrying the close-out archive commit (`git show --stat`); bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/unit-flakes-5 forward per its plan.md (Outcome & Quality Bar first). Each firing: reality check (plan.md, lessons/, git status, gh pr view); if the plan sits under archive/ on dev, run the teardown in Post-implementation step 5 and stop; else run phase 1's gate exactly, tick it, log lessons; then the review loop, Delivery and close-out; decide with /codex high on gpt-6.1-sol, never merge, never widen scope; 5 failures on one step → reassess with codex.
```
