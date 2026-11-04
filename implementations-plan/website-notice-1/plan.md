---
plan: website-notice-1
tier: light
status: arc 1 in progress (OA-1 answered 2026-11-04)
issues: "#1541"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 040334f53; standard: implementations-plan/README.md § Post-implementation standard at 040334f53
budget: recon 1 explorer (sonnet); one Codex gpt-6.1-sol high audit, resumed until approve
---

# Website privacy notice 1.1

`legal/website-privacy.md` 1.0 promises "one email when Nulo is on the stores" and says replies are not received, while the launch email asks for replies and its reply address is hello@nulo.sh (#1541). The owner, 2026-11-04: "Sounds good, notice ok." That approves exactly three sentence changes. The owner, the same day, on OA-1: "notice 3.2 ok.", which adds § 3.2's first sentence and signs the history row. Those four changes and the row are the scope. Version 1.1 ships with the landing and the `nulo-subscribe` Worker, which both deploy from `main` at the next promote.

## Outcome & Quality Bar

- **For whom**: a person who reads nulo.sh/website-privacy before or after joining the list, and the owner, whose consent record names the notice version in effect.
- **Excellent**: (1) the four approved sentences and the row read word for word as approved, and every other sentence of 1.0 is unchanged; (2) the archived 1.0 Markdown is byte-identical to the 1.0 file, `nulo.sh/website-privacy/v1.0/` renders it under its own date, and once both Workers have deployed, a signup records `consent_version` "1.1".
- **Good enough**: other stale text is reported, not changed (recon.md).

## UI impact

- `nulo.sh/website-privacy` (signed by the owner's words above): the box's last sentence becomes "You get occasional product updates, and you can leave in one click."; § 3.4's first and last sentences become "Occasional product updates, from `hello@news.nulo.sh`." and "Replies reach hello@nulo.sh."; § 3.5's last sentence becomes "Before each send I review the list and remove entries that are plainly not real."; § 3.2's first sentence becomes "To send occasional product updates." (OA-1); the header reads "Version 1.1 — effective 4 November 2026"; the version history gains the 1.1 row signed on OA-1: "Drops the one-time email at store launch (summary, §§ 3.2 and 3.4); replies reach hello@nulo.sh (§ 3.4); the list is reviewed before each send (§ 3.5)."
- `nulo.sh/website-privacy/v1.0/`: a new permalink with the 1.0 text, which the build makes from the archived copy.
- No other surface changes.

## Assumptions

**Facts**
- F1. `infra/subscribe/test/deploy.test.ts:26-30` pins `CONSENT_VERSION` (`wrangler.jsonc:16`, "1.0") to the notice's version line; `worker.test.ts:264` reads the var, so it needs no edit.
- F2. `apps/landing/scripts/build-legal.ts:17-29` reads `legal/archive/website-privacy-<v>.md` for each superseded history row, and a missing file fails `prebuild`. `legal-pages.ts:50-56` dates each published version by that file's header; `legal-pages.ts:185-186` refuses a header whose version differs from its row. `legal-pages.test.ts:226-231` checks the head only.
- F3. Demonstrated: the Worker sends no email. `resend.ts:42-104` calls only `GET /contacts/{email}` and `POST /contacts`; `worker.test.ts:241-265` pins exactly two requests for a new address.
- F4. No file pins a broadcast's reply address. `scripts/unsubscribe-test.ts:108` copies the Resend draft's `reply_to`; its fixtures hold `["hello@nulo.sh"]`.
- F5. § 3.2 (`legal/website-privacy.md:65`) still says "To tell you when Nulo is available and to send occasional product updates."
- F6. The landing's signup copy already says "Occasional updates" (`index.html:258`, `subscribed.html:30`, since #1540). `legal/privacy.md` §§ 2 and 5.5 only point at the notice.
- Brief claim that held only in part: "the landing's tests prove the archive and the history agree". The build proves the archived file exists and carries its row's version. Nothing checks its date against its row (D2 adds a test).

**Inferences**
- I1. "Nothing is sent when you sign up" also needs Resend to send nothing on a new contact (no dashboard automation). The repo cannot show that. The sentence is unchanged from 1.0.
- I2. "Replies reach hello@nulo.sh" holds while each broadcast's reply-to in Resend is hello@nulo.sh: the lane brief says the launch draft carries it. The repo's fixtures show no live configuration. The runbook step of D3 is a manual check, not enforcement.
- I3. The effective date is the promote day, 4 November 2026. If the orchestrator relays a slip, the header, the row and the gate script's two date strings move together.

**Asks**: OA-1 in `OWNER-ASKS.md` (§ 3.2, and the history row's wording), answered 2026-11-04: option (a) and the row quoted under UI impact.

## Architecture & Implementation

- **Shape**: text and one config value. No code path changes. The procedure is `legal/README.md` § Changing these documents.
- **Change map**: `legal/archive/website-privacy-1.0.md` (new, a byte copy of the 1.0 file at base); `legal/website-privacy.md` (header, four sentences, history row); `infra/subscribe/wrangler.jsonc` (`CONSENT_VERSION` "1.1"); `apps/landing/scripts/legal-pages.test.ts` (D2); `infra/subscribe/README.md` (D3).
- **Order**: copy the archive first, then edit. Editing first and copying after archives 1.1 under the 1.0 name.
- **Alternative not taken**: a script that archives and bumps the notice. The procedure is a `cp` and two lines, run a few times a year.

## Security & Adversarial Considerations

- **Threat**: a notice that misstates what the list does is a misrepresentation claim (`legal/README.md`). Each changed claim is traced (F3, F4, I1, I2), and the PR body states what the repo cannot prove.
- **Consent record**: a signup must record the version in effect. F1's pin reds unless the header and `CONSENT_VERSION` agree. The two Workers deploy independently from one `main` push, with no bound on the gap between them. That window is a settled disposition: the record is "the version in effect", not proof of what was shown (recon.md). A deploy coordinator is rejected: it adds ordering, failure handling and recovery for a record that already claims no more.
- **Archive integrity**: the v1.0 permalink is how a contact who joined under 1.0 reads what they joined under. The gate compares the archived Markdown with the base file byte for byte, and D2's test holds every archived header to its row. Header equality does not prove the body; `cmp` does, for this change.
- **Secrets, supply chain**: none touched. `deploy.test.ts:18-22` keeps any key out of `wrangler.jsonc`; no dependency is added.

## Phases

### Phase 1: notice 1.1, archive, consent version, test, runbook
1. Copy `legal/website-privacy.md` to `legal/archive/website-privacy-1.0.md`. Change nothing in the copy.
2. In `legal/website-privacy.md`, replace exactly these base lines with the text shown, and keep every other byte. Line 92 (`entries that are plainly not real.`) stays as it is.
   ```text
   3      **Version 1.1 — effective 4 November 2026**
   12-13  > You get occasional product updates, and you can leave in one click.
   65     To send occasional product updates. **Legal basis (GDPR):**
   80-82  Occasional product updates, from `hello@news.nulo.sh`. Nothing is sent when you sign up.
          Replies reach hello@nulo.sh.
   91     received it and lets you leave in one click. Before each send I review the list and remove
   +153   | 1.1 | 4 November 2026 | <the row signed on OA-1> |
   ```
3. Set `CONSENT_VERSION` to `"1.1"` in `infra/subscribe/wrangler.jsonc`.
4. Add D2's test to "the real documents" in `apps/landing/scripts/legal-pages.test.ts`. Prove it red twice: with the archived file moved away, then with its header date changed. After each case, restore the file with `git show 040334f53:legal/website-privacy.md > legal/archive/website-privacy-1.0.md` (the file is untracked, so `git checkout` cannot restore it).
5. Edit `infra/subscribe/README.md:51` as D3 says.
- **Validation gate**:
  - `cmp <(git show 040334f53:legal/website-privacy.md) legal/archive/website-privacy-1.0.md` exits 0.
  - The exact-content check exits 0 and prints `expected 1.1: identical`. Write this one-off script to `~/.cache/nulo-backlog/website-notice-1/expect-1.1.ts` (outside the repo), then run it from the worktree root as `bun ~/.cache/nulo-backlog/website-notice-1/expect-1.1.ts '<the signed OA-1 row>'`. It builds the expected 1.1 from the base with step 2's replacements, each found exactly once, and compares it byte for byte. On the unedited base it fails at the compare.
    ```ts
    import { readFileSync } from "node:fs"
    const ROW = process.argv[2] ?? ""
    if (!ROW) throw new Error("usage: bun expect-1.1.ts '<the signed history row text>'")
    const base = Bun.spawnSync(["git", "show", "040334f53:legal/website-privacy.md"]).stdout.toString()
    const swaps: [string, string][] = [
    	["**Version 1.0 — effective 27 October 2026**", "**Version 1.1 — effective 4 November 2026**"],
    	["> You get one email when Nulo is on the stores, then occasional product updates, and you can leave in\n> one click.", "> You get occasional product updates, and you can leave in one click."],
    	["One email when Nulo is available on the Chrome Web Store and Firefox Add-ons, then occasional\nproduct updates, from `hello@news.nulo.sh`. Nothing is sent when you sign up. Replies to these\nemails are not received; write to hello@nulo.sh instead.", "Occasional product updates, from `hello@news.nulo.sh`. Nothing is sent when you sign up.\nReplies reach hello@nulo.sh."],
    	["Before the launch email I review", "Before each send I review"],
    	["To tell you when Nulo is available and to send occasional product updates.", "To send occasional product updates."],
    	["| 1.0 | 27 October 2026 | First published version. |\n", `| 1.0 | 27 October 2026 | First published version. |\n| 1.1 | 4 November 2026 | ${ROW} |\n`],
    ]
    let want = base
    for (const [from, to] of swaps) {
    	if (want.split(from).length !== 2) throw new Error(`not exactly once: ${from.slice(0, 40)}`)
    	want = want.split(from).join(to)
    }
    if (readFileSync("legal/website-privacy.md", "utf8") !== want) throw new Error("legal/website-privacy.md is not the expected 1.1")
    console.log("expected 1.1: identical")
    ```
  - `bun run --cwd apps/landing test` and `bun run --cwd infra/subscribe test`: 0 failed. D2's test was red in both step 4 cases and is green now.
  - `bun run --cwd apps/landing build`, then in `apps/landing/dist/`: `website-privacy/v1.0/index.html` contains `one email when Nulo is on the stores`; `website-privacy.html` contains `Replies reach hello@nulo.sh.`, `<a href="/website-privacy/v1.0/">Version 1.0</a> <span>27 October 2026</span>` and `<a href="/website-privacy/v1.1/">Version 1.1</a> <span>4 November 2026</span>`.
  - `bun run lint`, `bun run typecheck:all`, `bun run test:all` (it runs root `test`'s extension suite, so `test` is not run twice), `scripts/check-no-local-paths.sh`, and `bun run check:plans` after staging: all exit 0.
  - Layers: lint, typecheck, unit, build. No e2e: no extension file changes.

## Decision ledger

- D1. The approved words go in verbatim. The sender keeps its existing code formatting (`` `hello@news.nulo.sh` ``).
- D2. One test beside `legal-pages.test.ts:226-231`: each superseded history row has `legal/archive/website-privacy-<v>.md`, and its header equals `{ version, effective }` from that row. It asserts that the superseded list is not empty, so the test cannot pass on nothing. One small row-date helper serves both tests. Why: an archived copy with its row's version and a wrong date (copied from a half-edited head, or the date retyped) publishes that wrong date in the version list. The build already fails on a missing file (`build-legal.ts`) or a wrong version (`legal-pages.ts:186`); nothing catches the date. This mirrors `packages/legal/src/manifest.test.ts:53-60` for the wallet documents.
- D3. Operator runbook only: `infra/subscribe/README.md:51` "Review the list for junk before the launch send." becomes "Before each send, review the list for junk and check that the broadcast's reply-to is hello@nulo.sh (website privacy notice §§ 3.4, 3.5)." Why: 1.1 makes both promises for every send, and the owner reads the runbook before sending. It is a manual check, not enforcement, and not user-facing copy. `:70` ("the launch email says why") is reported, not changed: rewriting it as "every email" would state a wider duty than § 3.5's "first email".
- D4. § 3.2 waited on the owner, since the first approval named three changes. OA-1's answer (2026-11-04, "notice 3.2 ok.") replaces its first sentence only; line 66 keeps its wrap, so no other byte moves.
- D5. No reply-to pin. The value lives in Resend, and the brief forbids inventing one. The PR body says so.
- D6. No CI change: `build-landing` already checks the notice and its v1.0 page.
- D7. The 1.1 date and the deploy checks are a `BEFORE-LAUNCH.md` § 4 step, the file every promote reads; the repo's other dated legal versions keep theirs there. Only the promote can make I3 and the post-deploy checks true.

## Audit verdicts

- **Codex round 1** (Sol, high, `01a1a73c`): `conditional approve` on the history row's approval, a narrower D3 and repaired gate instructions. All six findings adopted (log: `lessons/phase-0.md`): the row's wording is an owner ask and no longer claims more than the change (OA-1); D3 drops the `:70` rewrite; the archive is restored from the base, not `git checkout`; the gate compares an exact expected file, names `dist/` paths and the version links, and runs `test:all` once; D2's reason names the renderer's version check; the deploy window carries no time bound. D4 confirmed: § 3.2 is ambiguous, not covered by the approval.
- **Codex round 2** (resumed): `conditional approve` on one finding: the gate named a scratch script no step created. Adopted: the script is inline in the gate, written outside the repo before it runs; dry-run on the unedited base, every replacement is found once and the compare fails as it should. Codex also checked the line ranges and wrapping and rendered the four `dist/` strings through the real renderer.
- **Codex round 3** (resumed): `approve`, no new material finding. It checked the validator against an independently built 1.1, the unedited base and a one-byte change.
- **Arc 1, Codex round 1** (Sol, high, `01a1a752`) over `040334f53..e377326d6`: `approve`; one report-only nit (`infra/subscribe/README.md:70`, kept by the brief's report rule). **Opus review** beside it: `conditional approve`, four findings. Adopted: (1) the promote step (D7); (3) the archive test also holds the copy's own history to end at its version, which catches a later text with a hand-edited header (proved red); (4) status bookkeeping. Rejected (2): `broadcast-topic.ts`'s PATCH omits `reply_to`, and whether Resend resets it is unverified; D3's check runs before each send, after any draft write, and the script prints `reply_to` back. A script pin would break D5.
- **Arc 1, Codex round 2** (resumed) over `f49072173`: `approve`, no new finding; it re-proved the strengthened test against a header-edited 1.1 copy. Converged.
- **Auto-continue**: not taken. OA-1 holds the history row's wording, which is copy on the page this arc edits, and the gate needs the signed row. The orchestrator relays OA-1 and spawns the arc.

## Delivery

Single arc, single PR from `worktree-website-notice-1` to `dev`, opened ready: `docs(legal): website privacy notice 1.1 drops the launch-email promise and fixes replies` (88 characters), `Closes #1541`. Body: the four changes and the row as approved, quoting both approvals ("Sounds good, notice ok." and "notice 3.2 ok.", 2026-11-04), what the repo proves (F3) and cannot (I1, I2, F4: no file pins the reply address), the validation runs. No e2e label: no suite's path filter covers the change, and none is needed. The close-out lands as the PR's final commits.

## Post-implementation

The standard named in the front matter governs. Plan-specific values:
- Step 1 is absent (`code_review: off`).
- Step 2 runs once over `040334f53..HEAD` after Phase 1: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`. One Opus `general-purpose` review runs beside round 1. Hard stop after three rounds. Log each round in `lessons/phase-1.md` and under Audit verdicts.
- Step 3: rerun the Phase 1 gate on the final head. Then `gh pr create --base dev` (ready), then the close-out commits, with `bun run check:plans` green after staging. Then `gh pr checks <n> --watch` once. Never merge.
- Step 4 lists #1541 as closed by the PR. OA-1 is answered, so no `owner-decision` issue.
- Step 5: after the merge, `agent-worktree done website-notice-1 --merged`. This session runs headless and arms no wait; the orchestrator's next session in this worktree runs it.

## Seeds

```
/goal Phase 1 of implementations-plan/website-notice-1/plan.md marked ✓ with its gate's output in the transcript; the Codex loop converged (a resumed pass reporting no new material finding, quoted); the PR to dev open with Closes #1541; the close-out committed; bun run lint and bun run test:all exit 0.
```

```
/loop 15m Drive implementations-plan/website-notice-1: read plan.md, run Phase 1 and its gate if not ✓, then the Post-implementation steps; never merge; copy questions go to OWNER-ASKS.md, never guessed.
```
