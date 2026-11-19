---
plan: notes-1-3-0
tier: light
status: planned
issues: none
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 Explore agents (sonnet); no plan audit round; one Codex pass (gpt-6.1-sol, high, read-only) over plan and diff after the build
post_implementation_hardening: not scheduled
base: origin/dev at 846f26379
trunk: dev
---

# notes-1-3-0: the 1.3.0 release notes and changelog page, drafted for the owner's sign-off

The owner, 2026-11-19: "I want to work towards the 1.3.0 release." The release skill (`.claude/skills/release/SKILL.md` § Release notes) has whoever prepares the promote draft `release-notes/X.Y.Z.md`, its changelog page and its link-preview card in one PR to `dev`; the owner signs off the text before the promote. One arc, one draft PR, docs and landing content only. Evidence: [recon.md](recon.md).

## Outcome & Quality Bar

- **For whom:** a person updating from 1.2.0, who meets the notes in the GitHub Release, on AMO, and on `nulo.sh/changelog/v1.3.0/`, which Home's What's new row opens once after the update (F6); and the owner, who signs the text.
- **Excellent:** (1) every bullet is true at `846f26379` or at the named in-flight PR's head, and the PR body maps each bullet to its PRs; (2) the first bullets are what an existing user must know or do, in the wallet's own words for its screens (D3); (3) nothing reads as a promise the code does not keep; (4) every CI rule on the notes, the TOML and the cards passes first time.
- **Good enough:** a person-noticeable change below the cut lands in "Also" or the fix count rather than its own bullet.

## Assumptions

**Facts** (verified 2026-11-19 at `846f26379`):
- F1. `v1.2.0` (`7793112bc`) is an ancestor of HEAD: 96 commits, 91 first-parent, 35 `feat` subjects. No `type!:` subject, `BREAKING CHANGE:` footer or `Release-As:` in `git log v1.2.0..HEAD --format=%B`, nor in the five in-flight PRs' titles and bodies. `.release-please-manifest.json` holds `1.2.0`. So release-please picks 1.3.0.
- F2. The rules are `scripts/release/release-notes.ts`, applied to every file in `release-notes/` by `release-notes.test.ts` (in `test:release`) and to the version the tree would release by `release-notes-run.ts check` (`pr-quick.yml`): non-empty, at most 3,000 code points, no line or item opening with `#`, no line of only `=` or `-`, no em dash, no `@SOURCE_COMMIT@`.
- F3. The landing's `scripts/build-changelog.ts` refuses notes without their TOML and the reverse, an unknown key or glyph, an em dash and markup beyond `p`, `ul`, `ol`, `li`, `strong`, `em`, `code`. The TOML holds `version`, `date` (printed on the page and the card), `title`, `lede` and three to five `[[change]]` of `icon` (a `core/glyphs.ts` name), `area`, `title`, `line`. `og:cards` writes `1.3.0.og.png` and re-renders `index.og.png`; `og-card.test.ts` refuses a missing or stale card (`apps/landing/README.md` § Changelog pages).
- F4. Legal since `v1.2.0` (`packages/legal/src/manifest.ts`): Terms 1.2.1 → 1.2.4, all patches; Privacy 1.2.9 → 1.3.1, where 1.3 is material, but acceptance derives from the Terms alone (`status.ts`, Terms § 23) and Settings → About only notes a policy change (`utils/legal-about.ts`). So nothing asks to be accepted again.
- F5. The relay reaches an existing profile once per network kind at unlock, only while that network's primary is still its seed's endpoint (`wallet/services/unlock-conversions.ts:58-68`, `network/seeds.ts:189-197`); Testnet and Mainnet seeds carry it (`seeds.ts:70,88`). A Mainnet-kind row still named "Alpha V6" or "Mainnet" takes "Alpha" unless the profile already has a network so named (`seeds.ts:109-111,202-207`).
- F6. Home's What's new row shows on a stable build whose minor is above the device's marker; an update writes the minor it came from, so 1.2.0 → 1.3.0 prompts, and the row opens `https://nulo.sh/changelog/v1.3.0/` (`utils/whats-new.ts`).
- F7. In flight at plan time: #1870 (`c1383298`), #1854 (`9a47bd85`), #1866 (`454a02e0`, draft, stacked on #1854), #1867 (`a3f2bbce`; #1853 merged), #1859 (`bcb6a3a4`, waits on decision page 191). fee-juice-link-1 has no PR; its lane routes Mainnet's Fee Juice links to Shield and rewrites privacy § 5.10, likely as a new privacy version.
- F8. The wallet's own names: the nav tab reads HISTORY (`Navigation.vue:26`), the settings page "Connected Apps" (`settings-search.ts:82`), the authwit page "Authwits" under Settings → Developer → Account State (`account-state/index.vue:27`). A single private call with no account is still sent; only a public, utility, several-call or empty request without one is refused (`windows/execute/refusal.ts`).

**Inferences:**
- I1. Draft notes near 1.2.0's length (1,802 characters) stay well under the cap with the in-flight bullets in.

**Asks** (to the orchestrator; working assumption in force):
- A1. The TOML `date`: the draft day, `2026-11-19`. The page and both cards print it; at sign-off it moves to the promote day (one line, then `og:cards`). A review point in the PR body.
- A2. The legal bullet names privacy 1.3.1. If fee-juice-link-1 lands a new privacy version first, the number follows on a resume.
- A3. The #1859 and fee-juice-link-1 bullets are drafted as shipped and marked conditional in the PR body; a resume drops either one that misses the promote.

## UI impact

Surfaces: `release-notes/1.3.0.md` (the GitHub Release's opening and AMO's version notes, at the release) and `nulo.sh/changelog/v1.3.0/` with its two cards (live once the Release PR's bump reaches `main`). No wallet screen changes. Sign-off: pending, by the owner on the draft PR's text and its Workers Builds preview, as the release skill requires; the owner's words that open this lane ("I want to work towards the 1.3.0 release.") start it and approve no text.

## Architecture & Implementation (arc 1, branch `notes-1-3-0-a1` off this plan's commit)

### Phase 1: the notes, the page, the cards ✓ (gate green; notes 2,952 code points after review)
1. `release-notes/1.3.0.md`: a lead line, a blank line, `- ` bullets in 1.2.0's order (D2), each mapped to its PRs in [recon.md](recon.md).
2. `apps/landing/content/changelog/1.3.0.toml`: `version = "1.3.0"`, `date` per A1, a title, a lede, five changes (D6).
3. `bun run --cwd apps/landing og:cards`; commit what it adds and changes (`1.3.0.og.png`, `index.og.png`). Copy both cards to `~/.cache/nulo-backlog/notes-1-3-0/shots/`.
4. Commit: `docs(release): the 1.3.0 notes and changelog page`.
- **Gate**, in order: `bun run lint`; `bun test scripts/release/release-notes.test.ts` (D9); `bun run --cwd apps/landing scripts/build-changelog.ts`; `bun run --cwd apps/landing test` (`og-card.test.ts`, `changelog-pages.test.ts` included); `bun run check:plans` after staging. Pass: every command exits 0. No e2e (lane brief).

### Phase 2: review, PR, close-out
1. One Codex pass (§ Post-implementation); fix what holds, commit, re-run Phase 1's gate.
2. Push; `gh pr create --base dev --draft` (§ Delivery); `gh pr checks <n> --watch` once; read the Workers Builds preview URL off the PR and add it to the body.
3. Close-out commits (§ Post-implementation); push; checks once more. Leave the PR a draft.

## Security & Adversarial Considerations

- **A false promise is the threat.** Text a person trusts ("nothing needs accepting", "a node you set yourself stays") that the code does not keep misleads about funds or privacy. Defence: every bullet traced to code or a PR head (F4-F8), and the Codex pass asked exactly that.
- **Leaks:** no local path, account name, store launch day or secret in the files, the PR body or a commit. The notes name no endpoint URL; Shield is named by product, as the lane that routes to it does.
- **Supply chain:** none. `og:cards` runs the Puppeteer Chrome `bun install` already fetched, offline but for its inline fonts (F3).

## Decision ledger

| # | Decision | Alternatives | Why |
|---|---|---|---|
| D1 | `1.3.0` | 1.2.1; 2.0.0 | F1 |
| D2 | 1.2.0's order: what to know or do (the relay, the rename, What's new), Send, approvals, tokens and History, apps, Developer, Also, legal, fixes | by PR date; by package | the skill's "led by what an existing user must know or do"; 1.2.0 is the model |
| D3 | The wallet's words: History, Connected Apps, Authwits, Alpha | the brief's "Activity", "the Authorizations page" | a person searches the screen for the word they read (F8) |
| D4 | No bullet for tests, docs, CI, infra, the landing, the token list's files (#1778, #1780 draw nowhere yet) or the website newsletter (#1695) | a bullet each | they change no wallet screen (recon) |
| D5 | "Over 30 fixes" | an exact count | 34 `fix` subjects since `v1.2.0` plus #1870; in-flight PRs can move it |
| D6 | Five changes: Send (`send`), approvals (`signature`), the relay (`network-edit`), token pictures (`holdings`), app permissions (`app`) | the What's new row; Authwits | the five a person meets first; What's new is the page itself; Authwits is a Developer page |
| D7 | `OWNER-ASKS.md` holds no ask: the text's sign-off is the draft PR, by the lane's design | an ask per review point | the lane routes the whole text to the owner; A1-A3 are review points in the body |
| D9 | Phase 1's gate runs `release-notes.test.ts`, which checks every file in `release-notes/` | `release-notes-run.ts check` (the plan's first gate) | the run script checks only the root `package.json` version, 1.2.0 until the Release PR, so it never reads `1.3.0.md`; deviation found in Phase 1 |
| D8 | The PR opens and stays a draft | ready (the implementer brief) | the lane brief and the spawn message: the owner signs the text before it is ready |

## Review verdicts

- **Codex round 1** (gpt-6.1-sol, high, over the plan and the arc diff): `changes needed`, seven findings, all accepted after checking the tree. (1) The relay: a return needs two passing checks, and it is a new recipient of requests (privacy § 5.12): the bullet states who runs it and when Nulo uses it. (2) Dollars show only where a price is shown (`SendReviewSheet.vue:193`), and the fee warning's fix is paying from private Fee Juice or a link to get some (`FeeSettingsCard.vue:513-514`). (3) The app chip carries no seal (`contract-chip.ts:141`) and a seal means "Nulo knows this contract", not safety (`:35`). (4) Allow every site also reveals the version (`every-site.ts:5`). (5) #1859 covers discovery and continues with the app's request, not always the connect window. (6) Authwits: only call-shaped rows name an action, and the check reads confirmed grants; Contracts: the explorer link does not apply everywhere. (7) The What's new row stays until dismissed. Applied in shorter words; for the cap, "say who pays the fee" and "every switch has a spoken name" were cut (the latter a `fix(a11y)` inside the fix count).
- **Codex round 2** (resumed, verification): `changes needed`, one finding, accepted: "only while" broke on a send carried by the relay, whose receipt checks stay there until final (`packages/aztec-runtime/src/routing/routed-node.ts:291,592-593`).
- **Codex round 3** (resumed): **approve**.

## Delivery

- **Arc 1** = Phases 1-2, one PR against `dev`, opened as a draft after the Codex pass; the orchestrator marks it ready after the owner's sign-off. Title: `docs(release): the 1.3.0 notes and changelog page` (49 characters). No `Closes` line, no label: `release-notes/**` and `apps/landing/**` trip `quality-status` and the landing build.
- **Body:** the notes and the page's text in full; the preview link; the range `v1.2.0..846f26379` (or the head it was refreshed to); the PRs behind each bullet, in-flight ones marked, #1859 and fee-juice-link-1 conditional (A3); the version reasoning (F1); the review points A1-A3; the gates; the Codex verdict; the owner's quote with "sign-off pending".

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `846f26379`, bounded work. Plan-specific values:
- **Diff review:** `code_review: off`; absent.
- **Review:** one pass, `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, over this plan and the arc diff, with the two standard rules verbatim and the lane's three questions: is every bullet true at its cited PR, is anything a person would notice missing, does anything read as a promise the code does not keep. A second round only on a finding (resume). Logged in `lessons/phase-1.md` and Review verdicts.
- **Close-out**, the PR's final commits, after merging `origin/dev` and reading `index.md` and `lessons.md`: the `## Outcome` block; `STATUS.md` deleted; `git mv implementations-plan/notes-1-3-0 implementations-plan/archive/notes-1-3-0` in its own commit, the index line to `archive/index.md`; `bun run check:plans` green after staging. Never merge, mark ready or tear down.

## Seeds (draft)

```
/goal Arc 1 of implementations-plan/notes-1-3-0/plan.md delivered: Phases 1-2 marked ✓ with their gates reported in the transcript; one Codex pass (gpt-6.1-sol high) quoted, its findings resolved; a draft PR against dev titled "docs(release): the 1.3.0 notes and changelog page" with its checks reported (gh pr checks output); the close-out's archive move shown with git show --stat.
```

```
/loop 15m Drive arc 1 of implementations-plan/notes-1-3-0 per its plan.md (plan.md is the state). Next unchecked step, Phase 1's gate after each edit, signed commits. One Codex pass, then the draft PR, checks once, close-out, checks again. Report and stop. Never merge or mark ready.
```
