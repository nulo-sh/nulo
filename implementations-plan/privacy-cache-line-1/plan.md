---
plan: privacy-cache-line-1
tier: light
status: planned; final Codex pass approve; A1 under auto-continue
issues: none (the work is the owner's pick P77-13 C; the PR closes nothing)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit round-trip (gpt-6.1-sol, high) plus the Opus Plan leg
base: origin/dev at f55b7b4e6
trunk: dev
post_implementation_hardening: not scheduled
---

# privacy-cache-line-1: the privacy policy names what the list and price requests carry

One arc, one PR against `dev`, in `legal/` and `packages/legal`, plus one checklist item and one line citation outside them (D3). PR #969 made the token-list and price fetches bypass the browser's HTTP cache, and the price fetch omit credentials and the referrer. Privacy 1.2.2, a patch, says so: one sentence in § 5.11, one in § 5.2, in the words the owner picked. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

**Owner sign-off (2026-10-20):** P77-13 C, "B, and § 5.2 says the price request carries no cookies, no referrer, no cache.", where B is "§ 5.11 gains the cache sentence now (a patch bump)." The exact sentences are the ones that page offered (network-identity-2's OA-2, options B and C). P77-12 A keeps the list host's `Cache-Control`: nothing changes there.

## Lane-brief claims checked

All hold at `f55b7b4e6`. "Settings → About shows its usual non-blocking notice" holds for a patch: `isOlder` compares exactly, patch included (`apps/extension/src/utils/legal-about.ts:13-20`). #496's body says the opposite for 1.2.1; the code has changed since. The price properties are pinned at unit level only (Fact 3).

## Outcome & Quality Bar

**For whom**: a person who reads `nulo.sh/privacy` to learn what the wallet's requests reveal; a store reviewer who checks the policy against the build.

**Excellent**:
1. Each added sentence is true of every list or price request the build makes, and a test reds when the code stops doing it (Facts 2-4).
2. Nobody is asked to accept anything again. A record that last showed 1.2.1 gets the About notice, no sheet. 1.2.1's text stays readable at its permalink, byte-identical.

**Good enough**: no new test, no change to `ARCHITECTURE.md` or the store listing, which already say this or less.

## Assumptions

**Facts** (at `f55b7b4e6`; `S/` = `apps/extension/src/wallet/services`):
1. Privacy is at 1.2.1, effective 15 October 2026 (`legal/privacy.md:3`, `:449`; `packages/legal/src/manifest.ts:42-46`). § 5.11 "What it reveals" already says the list request carries "no cookies and no referrer" (`legal/privacy.md:281-283`). § 5.2 says only that CoinGecko gets ordinary request metadata (`:132-134`).
2. The list fetch is the only one: `cache: "no-store"`, `credentials: "omit"`, `referrerPolicy: "no-referrer"`, no headers (`S/token-list/service.ts:211-218`). The composition test pins all four fields (`S/token-list/service.composition.test.ts:120`). The smoke loop proves in Chrome and Firefox that no list request carries a cookie, a referrer or `If-None-Match` (`apps/extension/tests/e2e/token-list.test.ts:134-137`).
3. The price fetch is the only CoinGecko request: the same three options, plus an optional API-key header (`S/price/service.ts:373-380`). A unit test pins the RequestInit (`S/price/service.test.ts:123-131`). No e2e reaches the price host.
4. With `cache: "no-store"` the Fetch standard neither reads nor writes the HTTP cache, so the browser adds no conditional header (it adds `Cache-Control: no-cache` and `Pragma: no-cache`, which are not validators). The list host sends an `ETag` and no `Last-Modified` (network-identity-2 recon), so `If-None-Match` is the only validator it could get back, and the e2e pins it.
5. A patch never asks again: status reads the Terms only, by `major.minor` (`packages/legal/src/status.ts:36-39`, `:126-134`). `packages/legal/src/manifest.test.ts` pins head = version line (placeholder included), history = manifest, and an archived copy for each superseded version.
6. `packages/legal/src/**` trips the smoke and network e2e filters on both browsers. `legal/**` trips only the landing build (`.github/workflows/pr-quick.yml:110-117`, `pr-extension-smoke-e2e.yml:71`).
7. The landing renders a page with a `«FILL` as a draft (banner, `noindex`) and an `effective: null` entry as "not yet effective" (`apps/landing/scripts/legal-pages.ts:136,155-161`). From 1.0.0 the release gate refuses a blank in either document (`packages/legal/src/launch.ts`; `pr-quick.yml` `launch-legal`).

**Inferences**:
- The next promote publishes 1.2.2, and its day is unknown today. The root version is 0.31.0, so that promote is probably 0.x, which the release gate does not check (Fact 7). PR #893's Terms 1.1 blank is a different case: it waits for the 1.0.0 listing day, and the gate holds it.
- `git merge` keeps PR #893's `terms:` hunk and this arc's `privacy:` hunk apart: about twenty lines separate them.

**Asks** (proceeding on the working assumption):
- A1. The PR closes no issue: the work is a recorded pick, not a finding. Working assumption: `Closes` none, as #969 did.
- A2. Two edits fall outside `legal/` and `packages/legal`: the `BEFORE-LAUNCH.md` § 4 item and the `remote-code.md` citation (D3). Working assumption: both ship in this PR. The item is where the repository's rules put a legal or store step that has a release deadline. Without the citation fix, the arc leaves a stale line reference. Neither changes a screen.

## Architecture & Implementation

Reuse the shipping procedure (`packages/legal/README.md` § Shipping a new version), as #496 did for 1.2.1; nothing new is built.

**File-level change map**:
- `legal/archive/privacy-1.2.1.md` (new): `git show f55b7b4e6:legal/privacy.md`, byte-identical.
- `legal/privacy.md`:
  - The version line becomes `**Version 1.2.2 — effective «FILL: effective date»**`.
  - § 5.11 "What it reveals": after "…no cookies and no referrer.", insert "The request bypasses the browser's HTTP cache, so it carries no cached copy's validator."
  - § 5.2 "What it reveals": after "…or transaction contents.", insert "The request carries no cookies and no referrer, and bypasses the browser's HTTP cache."
  - A new history row: `| 1.2.2 | «FILL: effective date» | The token-list and price requests bypass the browser's HTTP cache, and the price request carries no cookies and no referrer (§§ 5.2, 5.11). |`
- `packages/legal/src/manifest.ts`: append `{ version: "1.2.2", effective: null, material: false, changes: [<the history row's text>] }` to `privacy`.
- `BEFORE-LAUNCH.md` § 4: after the 1.2.1 item (`:125-134`), add an item modelled on it. Name it "Due at the release that publishes privacy 1.2.2", with three boxes:
  - the version line and the 1.2.2 history row, dated the day it is published;
  - `effective` for `privacy` 1.2.2 in the manifest (now `null`);
  - after the deploy, `/privacy` and `/privacy/v1.2.2/` show no DRAFT banner, and AMO's Privacy policy field carries the 1.2.2 text (`apps/extension/store/listing.md` § Privacy policy text).
- `apps/extension/store/remote-code.md:110`: move the citation `legal/privacy.md:391-392` to the lines that hold "The extension loads no remote code" after the edit. `store-listing.test.ts:137-145` checks only that the range exists.

**Alternative not taken**: one combined sentence in § 5 for both requests. Rejected: the owner picked per-section sentences, and each section says what its own request reveals.

## Decision ledger

- **D1 wording**: verbatim from the options the owner picked (OA-2 B and C). Each names only properties Facts 2-4 pin. The singular "The request" after "requests do not include" in § 5.2 stays: any edit is an owner ask (both legs agree). Patch, not minor: `legal/README.md:120-121` makes a change "affecting what leaves the device" material. The owner picked "a patch bump" (P77-13 B). The text adds a disclosure of #969, which reduced what leaves. A material privacy flag would change nothing at runtime: status reads the Terms only (Fact 5). The version line keeps its parser-required " — ". No added sentence has an em dash. The history row and `changes` restate the two sentences and claim nothing new.
- **D2 effective date**: `«FILL: effective date»` (manifest `effective: null`), not a guessed day. `legal/README.md` § Placeholders names this blank for a patch: "the day it is published". The release gate refuses it from 1.0.0. `BEFORE-LAUNCH.md` § 4 has the promoter date a changed document. A guessed date that slips stays wrong, and no gate catches it. The one cost: a 0.x promote that misses the blank publishes `/privacy` as "Draft… not yet in effect" with `noindex`, and `/privacy/v1.2.1/` as "Superseded" (`apps/landing/scripts/legal-pages.ts:126-128,161`). No check fails, so the § 4 item (D3) is what prevents it. Codex held that § 4's paragraph already carries the date. Opus showed it does not: the paragraph assumes a change with no version yet, it never names AMO, and `git grep «FILL` mixes these lines with the Terms blanks held for 1.0.0. Taken: the item. #496 dated 1.2.1 ahead of time because its publish day was known.
- **D3 scope**: two edits outside the lane (A2). The § 4 item holds the date and the AMO re-paste, the plan's two open steps, in their documented home (`implementations-plan/README.md` § Where open work lives). The `remote-code.md:110` citation fix keeps a store-review document exact. No edit to `ARCHITECTURE.md`, which already names the properties (`:99-100`), or to `listing.md`, whose summary says less and stays true. The stored-shape goldens keep `privacyVersionShown: "1.2.1"`: they are stored records, not the current version (recon.md).
- **D4 tests**: none added. The manifest tests pin document and manifest agreement. The three request tests (Facts 2-3) red if either existing fetch loses a property. A future second price fetch would not be covered: the price pin is that one call site's RequestInit. The list e2e checks every request the host receives.

## Security & Adversarial Considerations

- **Threat**: the risk is a false statement in the policy, which is a misrepresentation (`legal/README.md`). A sentence must not claim more than the code does. Each sentence is bounded by a pinned property (Facts 2-4). The cookie and referrer claims for the price request are pinned at unit level only (Fact 3). That covers what this build sends: `credentials: "omit"` and `referrerPolicy: "no-referrer"` are standard Fetch semantics, and `Cookie` and `Referer` are headers a script cannot set.
- **Not claimed**: what the host or a network observer receives beyond these headers. The `Origin` header and the IP address stay as § 5.11 states them.
- **Supply chain, crypto, input validation, privilege**: N/A. No dependency, no code path, no trust boundary moves.

## UI impact

- **Settings → About, Privacy row**: the title reads "Privacy Policy v1.2.2". For a record that last showed 1.2.1 or older, the description reads "Privacy Policy updated" (`about.vue:127`). This is the existing notice; there is no sheet and no new copy. Within P77-13 C ("a patch bump").
- **`nulo.sh/privacy` (deploys from `main` at the promote)**: §§ 5.2 and 5.11 each gain one sentence, and the history table gains the 1.2.2 row. `/privacy/v1.2.1/` serves the archived text. Within P77-13 C.
- **AMO's Privacy policy field** (a pasted copy): the owner re-pastes it at the promote (the § 4 item). Until then it shows 1.2.1, which says less and stays true.
- **Popup and onboarding links** open `/privacy/v1.2.2/` (`apps/extension/src/utils/legal-links.ts:10`), which exists once the promote deploys. This is existing behaviour for every version bump.

## Phase 1: privacy 1.2.2 (arc A1)

Steps: write the change map above, in this order: archive, document, manifest, `BEFORE-LAUNCH.md`, the citation. Assumptions: Facts 1-7, D1-D4.

**Validation gate** (all exit 0; layers: lint, typecheck, unit, smoke e2e):
- `git show f55b7b4e6:legal/privacy.md | cmp - legal/archive/privacy-1.2.1.md`
- Read-through (exits 0 always): `git diff --word-diff f55b7b4e6 -- legal/privacy.md` shows exactly four changes: the version line, the two sentences and the history row.
- `sed -n '<from>,<to>p' legal/privacy.md` for the range `remote-code.md:110` now cites prints "The extension loads no remote code".
- `bun run --cwd packages/legal test`, `bun run --cwd apps/landing test`, `bun run --cwd apps/landing build`
- `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`
- `bun run check:plans` (after staging), `scripts/check-no-local-paths.sh`
- `cd apps/extension && bun run test:e2e -- tests/e2e/legal-acceptance.test.ts --retry=0` (Chrome). S9 reads the About row from the manifest. Without a fixture, focus or window change, the Firefox twin runs in CI (Fact 6).

## Delivery

- Branch `privacy-cache-line-1-a1` off `origin/dev`, one PR against `dev`, no stack (D-orch-1). Title: `docs(legal): privacy 1.2.2 names what the list and price requests carry` (70 characters).
- The body states what changed and why. It quotes P77-13 C by id and text, the two sentences and the history row's text. It names the D2 date and the § 4 item, gives the validation runs, and says "Closes: none". It ends with the Claude Code line. No label: the filters run every suite (Fact 6). Not a draft.

## Post-implementation

The standard is `implementations-plan/README.md` § Post-implementation standard at `f55b7b4e6`. Plan-specific values:
- Step 1 is absent (`code_review: off`).
- Step 2 runs once over `git diff origin/dev...HEAD`, after Phase 1 is green and before any PR. Use `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`. Resume with `resume-codex.sh`. Stop hard at three rounds. An Opus `general-purpose` review runs beside round 1. Log rounds in `lessons/phase-1.md` and § Audit verdicts.
- Step 3: `gh pr create`, then `gh pr checks <n> --watch` once.
- Step 4 is the PR's final commits. Write the Outcome (`Open items:` names the `BEFORE-LAUNCH.md` § 4 item for privacy 1.2.2). Delete `STATUS.md`. `git mv` the plan into `archive/` in its own commit, after merging `origin/dev`.
- Step 5: `agent-worktree done privacy-cache-line-1 --merged` after the merge. The orchestrator merges.

## Seeds

- `/goal`: "Implement implementations-plan/privacy-cache-line-1/plan.md Phase 1 in this worktree, run its gate, the Codex loop and the delivery; do not merge."
- `/loop`: "Check privacy-cache-line-1: if PR open, watch checks; if merged, run teardown; else continue the plan."

## Audit verdicts

- **Round 1, Codex (gpt-6.1-sol, high): conditional approve.** One P2, accepted: the handoff omitted AMO's pasted copy (now in the § 4 item). D2: keep the placeholder; § 4's paragraph carries the date (rejected on Opus's evidence, D2). No misrepresentation found.
- **Round 1, Opus Plan: conditional approve.** Accepted: the P2 for a § 4 item naming 1.2.2 (D2, D3); the P2 for AMO; the P3s for the stale `remote-code.md:110` citation (demonstrated), D4's overclaim, patch vs material (D1), the A2 / OWNER-ASKS contradiction and quoting the history row in the PR body, and the word-diff step that cannot fail. Fact 2's line range is fixed. Kept as is: the § 5.2 singular (owner wording).
- **Final fresh pass, Codex (gpt-6.1-sol, high): approve**, no P1 or P2. It upheld D2 (placeholder plus the § 4 item: a missed 0.x handoff passes `launchBlanks` and renders the policy as a draft, a demonstrated conditional path) and judged both out-of-lane edits maintenance that the change requires, not scope creep.
- **Fix loop round 1** (diff `f55b7b4e6..abe0f7ef7`): Codex (gpt-6.1-sol, high, session `01a15bb8-5409-75f0-bd84-bfc5a9b7c5fc`) clean. Opus `general-purpose`: two P3s, both applied to plan files outside the reviewed diff: the index status, and `OWNER-ASKS.md` naming A1 and A2 as process assumptions. Not taken: a clause in the release skill's promote step pointing at `BEFORE-LAUNCH.md` § 4. It is outside the arc, and `CLAUDE.md`'s first pointer already sends every promote to `BEFORE-LAUNCH.md`. Converged at round 1.
