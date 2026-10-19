---
plan: execute-window-3
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: 993b3efc
trunk: dev
status: completed
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-19
- **Status:** completed. One PR against `dev`, #854, carrying this close-out; merging it is the orchestrator's call.
- **Shipped:** #854: the closing advice reads once after a send's list of calls (P52-01 F, C); no advice on a request Nulo refuses, an unreadable grant or a scope refusal held by the window, through `OperationCard`'s `refused` (E); an unreadable discovered authorization shows `ArgsNotice`'s warning and reason under its at-rest line (P58-05 B). Closes #776 and #777.
- **Dispositions:** A1 (does C reach the one-call `aztec_createAuthWit` card?): the card ships untouched; moving its advice needs the owner's picture and pick. The details' fallback advice stays, on P58-05's record (I1).
- **Known limits:** none.
- **Open items:** none of this plan's. Found on the way and filed: #849 (a Firefox flake in `viewers-csp.test.ts`, unrelated to this diff).
- **Lessons:** none promoted: `lessons.md` is at 8191 of 8192 bytes; the notes stay in [lessons/phase-1.md](lessons/phase-1.md) and [lessons/phase-2.md](lessons/phase-2.md).
- **Seeds retired:** the `/goal` and `/loop` seeds below.

# execute-window-3: the advice once after the calls, none on a refused request; an unreadable authorization flagged at rest

One arc, one PR against `dev`, `Closes #776` and `Closes #777`. Recon: [`recon.md`](recon.md); planning log: [`lessons/phase-0.md`](lessons/phase-0.md); owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md) (none). The picks, quoted:
- **P52-01 = F**, "A's words and tooltip, with C and E (the lead's pick; see C's and E's pictures)." (#776). A: "Keep A as shipped: the four lines as #778 drew them." C: "The advice once, after the whole list of calls." E: "No advice in the body of a request Nulo refuses."
- **P58-05 = B**, "Under the line, the orange 'Can't read the arguments' and its one-line reason, as an unreadable call's row shows them." (#777)

## Issues

| Issue | Arc | Disposition |
|---|---|---|
| #776 | arc 1 | F: the words and the footer tooltip stay (A); the advice moves after the list of calls (C, D1-D2); a refused request shows none (E, D3-D4). The issue's claims hold at `993b3efc`; its `UnreadableArgsNotice.vue` is now `ArgsNotice.vue` (#806). |
| #777 | arc 1 | B (D6). The claims hold: the line has no warning (`SendTxSummary.vue:104-110`) and a failed batch marks every authorization `unavailable` (`index.vue:388-399`). |

## Outcome & Quality Bar

- **For whom**: a person approving a dApp request in the execute window when Nulo cannot read part of it.
- **Excellent**: (1) the advice reads once, where it covers every call, and never on a request Nulo will not send; (2) an authorization Nulo cannot read carries the same warning and reason at rest as a call does, from the same component.
- **Good enough**: no copy changes; a one-call card and the details' fallback keep their shipped place (D2, D5).

## Assumptions

**Facts** (verified at `993b3efc`)
1. `ArgsNotice.vue` renders the warning, the reason and an optional advice; the summary's call rows pass `advice` at `adviceAt` (`SendTxSummary.vue:84`).
2. `adviceSite` (`OperationCard.vue:228-250`): the last unreadable summary call; for `send_transaction`, the last unreadable grant; for `aztec_createAuthWit`, its call; else the last open unreadable discovered authorization.
3. A surface is `raw` exactly when its decode is `undecoded` (`call-surface.ts:143-152`); `grantRefusalRow` refuses on any undecoded grant (`:285-288`; `index.vue:136`, `fee/index.vue:107`); each window decodes its grants once through `readableGrants` (`index.vue:371`, `fee/index.vue:174`), which the card reads (`OperationCard.vue:141`). So an unreadable grant row always comes with the footer's refusal and a disabled Confirm.
4. The execute window's scope refusal is a ref that never clears and fills the card's `#fee` slot (`index.vue:177-183`, `:627`); the fee-raised window always fills `#fee` (`fee/index.vue:269`) and has no scope refusal.
5. The window renders an array of operations (`index.vue:606`), but every bridge builder submits one (`packages/wallet-bridge/src/dispatcher.ts:516, 584, 629, 676`), so once per card is once per window. A multi-operation request is not supported; it would reopen this (no coordinator now).
6. The summary's authorization rows get `{ authwit, surface }` (`SendTxSummary.vue:11`) and show no warning (`:104-110`).
7. No e2e asserts the advice or the authorization line's words (recon).

**Inferences**: I1. Neither pick moves the details' fallback (D5): C replaces "under the last unreadable call"; P58-05's page described that case as "the orange 'Can't read the arguments', its reason and the closing advice appear only under Show all details" and the owner picked B over C (the advice at rest), so the record keeps it there. I2. C acts on a list of calls; the `aztec_createAuthWit` card shows one call and no list, so it stays as shipped (D2). C's only picture is a send, and the picture lead's report scopes it: "C and E both move the advice: C on a send, E on a grant request." Moving the card's advice would be a change nobody drew. I3. E's words cover #832's refusal: "a request Nulo refuses" is general, and the window then says "Nulo won't send this".

**Asks** (orchestrator, not owner: nothing a person sees changes on the strength of them): A1. Does C reach the `aztec_createAuthWit` card? Working assumption: no (I2); the card is untouched and the PR says so. Moving it would need a picture and an owner pick.

## Decisions

- **D1. C's place.** `SendTxSummary` takes `advice?: boolean` in place of `adviceAt` and renders `RAW_ADVICE` once after the `<ol>`, inside the "What this does" section: flush with the label, `body`/`tertiary`, the section's 8 px gap (C's picture). Its testid stays `execute-op-summary-unverified-advice`. With authorizations listed, it reads between the calls and "Authorizations", as the words say. The call rows' `ArgsNotice` lose `advice`.
- **D2. The `aztec_createAuthWit` card is untouched** (I2, A1): its advice stays in its call's notice.
- **D3. E for grants: `send_transaction` has no advice site.** Fact 3: every unreadable grant refuses the request. The `grant` branch and the grant `:advice` go.
- **D4. E for the scope refusal: `OperationCard` takes `refused?: boolean`**; with it, `adviceSite` is `undefined`. The execute window passes `refusal !== undefined`; the fee-raised window passes nothing. E covers the two refusals the window states; an app-paid send whose fee contract is proven short keeps Confirm off but is no refusal (`index.vue:196-206`), and keeps the advice. Rejected: reading `$slots.fee` (the fee-raised window always fills it); also passing `grantRefusal` (D3 already removes that site: two sources for one fact).
- **D5. The fallback stays** (I1): every call reads → the last open unreadable authorization's details, as #778 shipped.
- **D6. #777 B.** The authorization row takes the call row's shape: marker, then a column `Flex` (`item_body`) with the line and, when its surface is `raw`, `Flex data-testid="execute-op-summary-authwit-unverified-args" :data-reason` around `ArgsNotice` (`prefix="execute-op-summary-authwit"`, `kind="unverified"`, no advice). `authwitRows` keeps `surface`. A pending authorization adds nothing (B names the unreadable one). The prefix keeps every testid unique (recon, Collisions).
- **D7. Accessibility** (the owner's 2026-10-19 delegation): each `interface` term in the new notice is a Tab stop in reading order, as every instance is (`DottedTerm` default; iface-line-1 D2). The notice is static, with no live region, as the call row's.
- **D8. Dotted terms** count distinct terms: the window still shows at most `interface` and `priority fee`.

## Architecture & Implementation

| File | Change |
|---|---|
| `…/execute/OperationCard.vue` | `refused` prop; `AdviceSite = { on: "calls" } \| { on: "authwit"; index }`; no `grant` branch; `SendTxSummary :advice`; `createAuthWit :advice` on `on === "calls"`; the doc comment |
| `…/execute/SendTxSummary.vue` | `advice` replaces `adviceAt`; the line after the list (D1); the authorization row's shape and notice (D6) |
| `…/execute/index.vue` | `:refused="refusal !== undefined"` |
| `…/execute/call-surface.ts` | `RAW_ADVICE`'s comment: never on a refused request |
| `…/execute/OperationCard.{summary,authwit}.test.ts`, `index.test.ts` | T1-T5 |

No new `.vue`, no new string, no change to `ArgsNotice.vue`, `CallArguments.vue` or `fee/index.vue`.

Tests (wire-shaped fixtures from `execute.fixture.ts`; each red on the base copy of its source):
- **T1** (`summary`, rewrites `:129-176`): three unreadable calls and a readable one: one advice, in no call row, directly after `execute-op-summary-calls`; the same with details open. An unreadable call and an unreadable authorization, details open: one advice, after the calls.
- **T2** (`summary`, #777): every call reads; authorizations `unknown-contract`, `unavailable` and decoded: the first two read the warning and `RAW_LINE`'s text under their line (`shownText`), the first's term has `tabindex="0"` and the glossary description, the third reads none; no advice at rest, then with details open one advice, in the `unavailable` authorization's details (the same mount). `:179-214` stays: it proves D5's moves.
- **T3** (`authwit`, rewrites `:104-121`, `:137`): two unreadable grants of three, and each reason: the reason under `execute-grant-` reads, and no `execute-grant-unverified-advice` exists. No grant can carry the advice now, so the reason is the paired success check.
- **T4** (`summary`): one mounted card with an unreadable call shows the advice, then `setProps({ refused: true })` removes it and the warnings stay; the same for an unreadable authorization with its details open. The refusal lands while the window is open, so the test moves one mount.
- **T5** (`index.test.ts`, the #832 refusal test): the `OperationCard` stub declares `refused`; it reads false before the refusal and true once it is held.
- `createAuthwit.test.ts:187-195` stays: it proves D2.

## Security & Adversarial Considerations

- Display only: no data, trust boundary, permission, log line or dependency moves. Every string is a wallet constant; the reason comes from the wallet's own decode.
- A hostile dApp can make the authorization unreadable (an unknown consumer, a failed batch); that now adds a warning at rest and never removes one. Removing the advice on a refused request removes no control: Confirm is already hidden or disabled there (Facts 3-4).

## Phase 1: the advice, the refusal, the authorization notice ✓

Warning: take the before pictures (Pictures, step 1) before you change code.
Steps: D1-D6 in the files above; T1-T5.
**Gate**: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/popup/windows/execute`; then `bun run audit:vue`; `bun run test:all`. Pass: exit 0; T1-T5 red on the base copies. Layers: lint, typecheck, unit, component, build.

## Phase 2: e2e and pictures ✓

Warning: load1 below 150 before each build or run; one `e2e:agent` at a time; `agent.sh` leaves a network build in `dist/`, so rebuild armed before smoke.
1. Smoke, Chrome then Firefox: `cd apps/extension && VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<browser>`, then `env -u EXTENSION_PATH NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 [NULO_E2E_BROWSER=firefox] bun run test:e2e -- --retry=0`.
2. Network, Chrome then Firefox (it sweeps the summary's authorization rows): `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first [NULO_E2E_BROWSER=firefox] bun run e2e:agent tests/e2e/network/type-roles-windows.test.ts`.
3. The after pictures.
**Gate**: exit 0 on every run. Read a red first: a flake already named in an issue or the `e2e-testing` skill gets one rerun; any other red is breakage to fix. No e2e scenario is added. Layers: smoke, network.

## Pictures

A scratch spec in `~/.cache/nulo-backlog/execute-window-3/`, from the shots-776 and execute-window-2 specs, copied into `tests/e2e/network/` for each run only, through `agent.sh` with `NULO_E2E_SHOT_DIR`; the window at 400 × 600, Chrome, both themes, the changed rows scrolled into view. Run `git diff --stat` before every commit.
1. Before (base), then after: two unreadable calls and a readable one; a grant on an unknown contract; a delegated send whose authorization decode fails; the #832 refusal over unreadable calls (execute-window-2's misnamed send, `transfer_public_to_public` claimed as `balance_of_public`).
2. The two failed decodes are scratch edits in `index.vue` (`decodeAuthwitBatch`, and the `decodeOperationArguments` callback at `:297` storing `undecodedAll(n)`), each switched on per scene by a `localStorage` flag and reverted after the run.

## UI impact

- **Execute window, and the fee-raised window, a send with an unreadable call**: the advice moves from under the last unreadable call to one line after the list of calls (P52-01 F, C's picture).
- **A request Nulo refuses**: no advice in the body: under an unreadable grant (E's picture), or after the calls when the window says "Nulo won't send this" (E's words). The footer tooltip is unchanged (A's).
- **The summary, an unreadable discovered authorization**, in the execute and fee-raised windows: the orange `Can't read the arguments` and its one-line reason under its line (P58-05 B); no advice at rest.
- **The advice can leave**: the decodes land first and a refusal later (an estimate, a preview or a pressed Confirm, `index.vue:168, 226, 474`), so the advice shows, then goes with Confirm.
- **Unchanged**: every word, the `aztec_createAuthWit` card, the details' fallback, every other screen.

## Delivery

- Branch `execute-window-3-a1` off `origin/dev`, carrying the plan commit. One PR, `gh pr create --base dev --title "feat(execute): advice once after the calls, none when refused; flag unreadable authorizations"`, opened ready after both phases and the Codex loop; no label at creation, then `e2e:extension-smoke` or `e2e:extension-network` only if the path filter skips a lane.
- Body: what and why; P52-01 and P58-05 quoted by id and text; D7 as an accessibility call made under the owner's 2026-10-19 delegation; I1-I3 and A1; the before and after pictures; the runs with outcomes; no e2e scenario added, so the wall-clock is unchanged; `Closes #776`, `Closes #777`; ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Commits conventional, lower case, signed, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `993b3efc`. Specific here:
- Step 1 is absent. Step 2 runs once over the arc's diff from its merge base with `origin/dev`, after Phase 2: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus 5.5 diff review (`general-purpose`) beside round 1; prompts under `~/.cache/nulo-backlog/execute-window-3/`; hard stop at three rounds; rounds in `lessons/phase-2.md` and the table below.
- Approval boundary (a plan change; stop): any copy change, moving the fallback or the one-call advice, a new `.vue` file or window-level coordinator, a refusal concept in the fee-raised window, any advice on a refused request.
- Close-out in the PR's final commits: Outcome; lessons promoted only within the 8 KiB budget; `STATUS.md` deleted; `git mv` into `archive/`, index line moved. Teardown after the merge: `agent-worktree done execute-window-3 --merged`; trunk `dev`; `implementations-plan/archive/execute-window-3/plan.md`.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| plan 1 | Codex, gpt-6.1-sol (session 01a153c0) | conditional approve | Fact 5 scoped to the bridge's single-operation builders; citations; I2 no longer rests on the grant remark (A1); T4 moves one mount from unrefused to refused; T5 declares the stub's prop; a red is read before any rerun; agreed: no coordinator for multi-operation requests | none |
| plan 1 | Opus 5.5 (Plan) | conditional approve | Fact 3 citations; E's boundary (the proven-short app payer is no refusal, D4); UI impact names the fee-raised window and the advice that leaves when a refusal lands; the #832 picture made reachable by a scratch decode failure; T2 and T3 success checks on the same mount | I1 as an owner ask: P58-05's page described the details-only advice and the owner kept it by picking B |
| plan 2 | Codex, resumed | **approve** | none new: the round-1 fixes verified; I1 settled by P58-05's record; A1 an orchestrator-level scope question that arc 1 does not depend on | none |
| arc 1 | Codex, gpt-6.1-sol (session 01a153e0) | **approve** | the `adviceSite` doc trimmed to its constraints; two test comments that narrated their assertions removed | none |
| arc 1 | Opus 5.5 (general-purpose) | approve | the same comments; `afterTheCalls` names what broke | none |
| arc 1 r2 | Codex, resumed | **approve** | none new | none |

## Seeds

```
/goal Phases 1-2 of implementations-plan/execute-window-3/plan.md marked ✓, each backed by its gate passing in the transcript; the Codex loop (gpt-6.1-sol, high) converged; one PR against dev closing #776 and #777 with its pictures, its close-out archiving the plan; bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/execute-window-3 forward per its plan.md and the README § Post-implementation standard at 993b3efc: run the next gate, one e2e:agent at a time at retry 0, decide open questions with Codex (gpt-6.1-sol, high), never merge, never widen scope; stop after the PR's checks are green and report.
```
