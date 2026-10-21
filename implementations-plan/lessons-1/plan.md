---
plan: lessons-1
tier: light
status: planned, Codex approve
issues: none open (#957 closed by the owner's P78-10 A; cited only)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet); one Codex audit (gpt-6.1-sol, high) and its resumes; one Opus Plan leg
base: origin/dev at cef87d9de
trunk: dev
post_implementation_hardening: not scheduled
---

# lessons-1: promote this week's cross-task gotchas into lessons.md

One arc, one docs-only PR against `dev` that edits `implementations-plan/lessons.md` (§ Delivery). Recon and the evidence for every candidate: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Outcome & Quality Bar

For every session that reads `lessons.md` before a task, agent or contributor:

- Each promoted line is true at HEAD, links evidence that states it, and changes what its reader does.
- The file stays within 8192 B, and every line it keeps still holds. A line leaves only when another home states it, and the plan names that home.

Good enough: a candidate whose knowledge already lives where its reader is routed stays there. A candidate that changes no action, or that would push out a line whose miss costs more, is not promoted; its evidence stays in the archive.

## Assumptions

**Facts** (verified at `cef87d9de`; evidence in recon.md):

- F1. `lessons.md` is 8152 of 8192 B (`scripts/ci-cd/plans/structure.ts:37`) in 33 entries. The gate wants one line per entry with at least one plans-tree or allowlisted-permalink link; an issue link may sit beside it (`structure.ts:41,226-266`). No rule checks a `#fragment` (`links.ts:160`). All 43 existing links resolve.
- F2. No code unmounts an extension window as it closes: no `.unmount()`, `pagehide` or `unload` handler under `apps/extension/src` outside tests; `closeCurrentWindow` calls `chrome.windows.remove` (`utils/close-current-window.ts:2-6`). Vue hooks still run on a route change inside a window. `endAndClose` drops the `beforeunload` listener, waits up to 3 s for the send, then closes (`composables/useDappApprovalWindow.ts:122-136`); on a person's close the page has only `beforeunload` (registered by that composable and the json and logger windows; the passkey window has none), while the worker settles the close from `windows.onRemoved` (`wallet/services/window-manager/window-manager.ts:128-133`). `archive/fee-estimate-cancel-1/plan.md` F1, D3 and KL1 state it; no skill or doc does, and CLAUDE.md § Cleanup order puts teardown in `onBeforeUnmount`.
- F3. Line 33's two CodeMirror facts sit at the code that needs them: `apps/extension/src/components/JsonViewer/creator.js:98-99` (one theme, marked dark, serves both app themes) and `:116` (the base theme's pressed rule is one class more specific).
- F4. C1 holds (#957's comment: PR #978 CONFLICTING on GitHub, `merge-tree` clean with `-c attr.tree=origin/dev`), and a local merge applies the union (`structure.test.ts:226`). Line 17 already says "a PR conflicting with `dev` gets no run: merge `dev` first".
- F5. C2's second half is false: run 39652968832 (`nightly` on `encryption-at-rest-1-a1`) failed at `resolve` in 10 s, since `nightly.yml:109` refuses any ref but `dev`. Its first half holds: run 39642793500's iterations died at the 30-minute limit (`_extension-network-e2e.yml:115`). No archived plan holds either run.
- F6. C3's sharpest case was fixed at its cause: `zod-jitless.test.ts` now imports statically, outside every test timeout (#533). The 2026-10-21 case (two source-scan tests at vitest's 5 s limit beside two armed builds, green alone: `archive/firefox-files-1/lessons/phase-6.md:49-51`) stands. `STACK_TRACE_ERROR` accompanies every vitest 4 timeout, so it marks no load. Line 52 already says "rerun an environmental-looking red on base first".
- F7. C4 is at `.claude/skills/e2e-testing/SKILL.md:556-564`; C5's D1 verdict at `SKILL.md:283-288`; its kept-popup lever is open on #1006 (lane warm-stack-1, CI numbers pending). C6 does not hold as worded: `CODEX_ACCOUNT` was not set by the lead, the managed routing picked a home, the consult worked (`archive/heavy-pool-1/lessons/phase-0.md:11`).

**Inferences:**

- I1. Line 19 is not a rare technique: every close-out moves its plan with `git mv` and repairs links, and a reviewer reading `git diff -M`'s R100 as "pure move" can miss changed bytes (Codex r1). It stays.
- I2. C3's drift half (interleaved timing arms drift with load unless the order is balanced; `archive/block-time-1/lessons/phase-3.md:144`) has no home outside the archive. It stays there: the measuring lanes since then ran balanced orders (heavy-pool-1 alternated arms; #1006 orders P F F P P F per browser).

**Asks:** none. No surface a person sees changes.

## Architecture & Implementation

Two edits in `implementations-plan/lessons.md`; every other line stays byte for byte.

| Edit | Where | Text |
|---|---|---|
| add P3 | § Extension runtime, after the `PopupManager` line (25) | `- A closing extension window runs no Vue unmount hook: await what it owes, bounded, as `endAndClose` does; a person's close leaves the page only a best-effort `beforeunload`. [Evidence](archive/fee-estimate-cancel-1/plan.md)` |
| delete | § Extension runtime, line 33 | the CodeMirror base-theme line (its home is `creator.js`, F3) |

Bytes: 8152 + 225 − 199 = 8178 (measured on a scratch copy), 14 B under budget.

Alternatives not taken:

- **Also promote C3, narrowed** ("a loaded host can fail vitest 4 tests that time nothing at the 5 s default: state load1 with a local gate; rerun such a red once load falls"; Opus r1 as its own line, Codex r1 folded into line 52). It needs 140-190 B more than the room, so a still-true line would leave. Line 52 already sends such a red to a rerun, and its sharpest case was fixed at the cause (F6).
- **Fold a fact into a related line**: saves 3 B a line, since evidence links dominate, and mixes topics.
- **Raise the budget or shorten every link label**: the first weakens a gate (portable rule 8); the second rewrites all 33 lines and conflicts with every other lane's close-out.

### Decision ledger

- **D1, C1 not promoted.** It holds (F4) but changes no action: line 17 already says to merge `dev`, the union makes that merge clean, and #957 records the owner's call (P78-10 A).
- **D2, C2 not promoted; its false half reported.** Half is false (F5); no plans-tree evidence exists; lane soak-mode-1 changes the soak workflow, which would make the true half stale. The soak-mode-1 lane brief names run 39652968832 as a branch soak; the orchestrator hears that it is not.
- **D3, C3 not promoted.** "Above about 150", "smoke stretches 50 %" and "A/B belongs on CI" have no source or are contested (`archive/e2e-fixed-cost-1/plan.md`: CI's whole-minute envelopes could not resolve a few seconds). What holds (F6) does not fit beside line 19 and the others without evicting a line whose miss costs more (a changed move accepted as pure; a purge that misses hidden rows); its action is line 52's. The drift half stays archived (I2). Panel: Codex r1 and Opus r1 each kept a narrowed version; overruled on room, both recorded.
- **D4, C4 and C5 not promoted.** Both live in the e2e-testing skill, the routed home (F7); C5's open lever is warm-stack-1's to promote at its close-out.
- **D5, C6 not promoted.** Not as worded (F7), and it concerns the owner's personal tooling outside this repo.
- **D6, P3 promoted** from the sweep (F2). Opus r1's wording replaced the draft's "do what a close owes before `closeWindow`", which describes the fire-and-forget close fee-estimate-cancel-1 replaced with `endAndClose`, missed the person's close, and used "popup", which line 25 already gives to the in-page modals. Codex r1b narrowed the person's close to the page (the worker also hears `onRemoved`) and named the wait bounded.
- **D7, line 33 retired, line 19 kept.** Line 33's facts are stated at their code (F3), so its removal is a dedupe under portable rule 8. The draft also ranked out line 19; Codex r1 showed it serves every close-out (I1); Opus r1 accepted either.
- **D8, the roster account name already in the archive** (`archive/heavy-pool-1/lessons/phase-0.md:11` and 72 archived files in all): pre-existing, outside this lane's write scope; reported to the orchestrator for the owner. No new file names one.

## Security & Adversarial Considerations

- A lessons line is read by every session before it acts: a wrong line misleads every run. P3 is checked at HEAD (F2) and names the existing helper, so a reader does not write a send that the close outruns.
- The repository is public: no home path, host name, account name or secret enters the file. The Testnet endpoint file is never opened.
- No code, dependency, workflow, token or permission changes.

## Phases

### Phase 1: the two edits

- Change map: `implementations-plan/lessons.md` only.
- Steps: apply the table above. Check that the new link resolves and that the file is within budget.
- Gate: `LC_ALL=C wc -c < implementations-plan/lessons.md` prints at most 8192; `git add implementations-plan/lessons.md && bun run check:plans` reports 0 findings; `bun run lint` and `bun run typecheck:all` exit 0; `bun run test` and `bun run test:all` exit 0 once on the final head, with load1 given beside them. Layers: the plans gate, lint, typecheck, unit. No e2e: no runtime path changes.

## UI impact

None: a planning document only.

## Delivery

- One arc: branch `lessons-1-a1` off this plan's commit. One PR against `dev`, ready, no label (no e2e filter matches the path). No stack (D-orch-1).
- Title: `docs(plans): add the extension-window close lesson; drop one its code now states` (81).
- Body: the two edits and why, D1-D7 in one line each, the gates with load1, `UI impact: none`. No `Closes`: no open issue; #957 is context.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `cef87d9de`; step 1 absent (`code_review: off`).

- After Phase 1: the Codex loop over the arc's diff against `origin/dev` (`~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; prompts under `~/.cache/nulo-backlog/lessons-1/`). Each prompt carries the two verbatim rules and asks: is the new line true at HEAD and stated by its evidence; does the dropped line's knowledge live where the plan says; does any kept line now contradict the new one. One Opus review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1. Hard stop at three rounds; rounds logged in `lessons/phase-1.md` and § Audit verdicts.
- Before the PR and again at close-out: merge `origin/dev`, read what changed in `lessons.md` and `index.md`, and re-measure. Over budget after another lane's promotion: stop and report; never retire a further line without the panel.
- Close-out: the Outcome (`Known limits: none`, `Open items: none`, the seeds retired); no lesson beyond the arc's own; `STATUS.md` deleted; `git mv` to `archive/` in its own commit, this plan's line moved to `archive/index.md`; `bun run check:plans` green.
- Teardown once `implementations-plan/archive/lessons-1/plan.md` is on `origin/dev`: `agent-worktree done lessons-1 --merged`.

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session 01a15fd6, default `~/.codex` login): conditional approve.
- #1 P2 overstated its evidence (the zod case fixed by #533; `STACK_TRACE_ERROR` is no load marker): demonstrated; P2 then dropped on room (D3).
- #2 recon: 43 links, not 44; `creator.js:98-99,116` already state line 33: demonstrated; corrected (F1, F3), and it turns D7's ranking into a dedupe.
- #3 I2 claimed the drift half had a home: demonstrated wrong; I2 rewritten.
- #4 keep line 19 (close-out moves): taken (D7, I1). Its "merge P2 into line 52" is overruled on room (D3).
- #5 a roster name in an archived log: pre-existing, reported (D8).

**Round 1, Opus Plan:** conditional approve.
- #1 P3's "before `closeWindow`" describes the replaced fire-and-forget close and misses the person's close: demonstrated by trace; P3 rewritten to `endAndClose` and `beforeunload`, linked to the plan (D6).
- #2 "popup" collides with line 25; hooks run on a route change: taken ("extension window", "as it closes").
- #3 P2 overstated: as Codex #1. #4 the link count: as Codex #2.
- #5 retiring true lines is a ranking: answered by D7 (33 is now a dedupe; 19 stays). #6 P2's placement: moot (D3).
- #7 the roster name in the archive: as Codex #5 (D8).

**Round 1 resumed (r1b), Codex:** conditional approve. #1 "a person's close reaches only `beforeunload`" is false outside the page (`window-manager.ts:128-133` settles it from `onRemoved`; the passkey window has no handler): demonstrated; P3 narrowed to the page, the wait named bounded (D6). #2 recon still marked line 19 retire: demonstrated; corrected. P2 may stay unpromoted (D3 accepted). The byte math checked.

**Round 1 resumed (r1c), Codex:** **approve**, no remaining finding; 8178 B verified.

## Seeds

- `/goal` Phase 1 marked ✓ in implementations-plan/lessons-1/plan.md with its gate output in the transcript (lessons.md at most 8192 B, `check:plans` 0 findings); the Codex loop converged (a resumed pass with no new material finding quoted); PR `docs(plans): add the extension-window close lesson; drop one its code now states` open against `dev` with the close-out commits; `bun run test` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/lessons-1: read plan.md and lessons/, run Phase 1 and its gate, tick it, then the Codex loop, the PR and the close-out; never merge.
