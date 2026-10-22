---
plan: note-owner-1
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: 5c35ca934
issues: "#1049 (known limit, closed as not planned; no arc closes it)"
---

## Outcome

- **Date:** 2026-10-22.
- **Status:** completed with its one PR (`worktree-note-owner-1` → `dev`), which carries this close-out; the merge closes the plan.
- **Shipped:**
  - **The tripwire** (`packages/aztec-runtime/src/pxe/note-owner-scope.sources.test.ts`): five tests pin the rules that keep the PXE's own sync from storing a note under a scope lacking its owner's key (the key oracle's scope check, one scope per sync, and in each receipt class the owner-key nullifier and the discovery gate), each with mutation controls.
  - **The coupling entry** (`UPDATE.md` § Types coupled to Aztec shapes): a red test, or a new amount-bearing class in `note-schemas.ts`, means retrace #1049 before the bump ships.
- **Dispositions:**
  - #1049 closed as a known limit: on 6.0.0-rc.3 the PXE's own per-scope sync never stores a receipt-class note under a non-owner scope (§ The path). The `owner: account` filter (outline B) and the docs-only close (outline C) were rejected (D1, D2).
  - The lane brief's default for a known limit was a docs-only PR; the panel chose the tripwire instead (D2).
  - Phase 1 green ([lessons/phase-1.md](lessons/phase-1.md)); no e2e ran, as no runtime file changed (D3).
- **Lessons:** nothing promoted: `lessons.md` is at its budget, and the coupling lives where the next bump reads it, in `UPDATE.md` and the test.
- **Known limits:** #1049.
- **Open items:** none.
- **Seeds retired:** the `/goal` and `/loop` below; they are no live instructions.

# note-owner-1: a note in two of a profile's accounts' scopes

#1049 says an incoming receipt can land under the wrong account of a profile: the wallet reads notes by scope with no `owner` filter, and the receipt id names no account. The path needs one note stored under two scopes of one profile. On the pinned line (6.0.0-rc.3), the reviewed honest discovery paths never store a note that can become a receipt under any scope but its owner's (§ The path). So #1049 is a known limit. This plan ships no runtime change. It ships one test that pins the upstream rules the conclusion rests on, so the Aztec bump that changes one of them fails a test instead of reopening #1049 silently.

## Outcome & Quality Bar

- **For whom**: the maintainer who bumps the Aztec line, and a person with several accounts in one profile who reads each account's history.
- **Excellent**: the disposition is backed by source lines a reviewer can check; a bump that changes a rule the conclusion needs fails `test:all` with a test name that says which rule moved; the change touches no runtime file, so no screen and no stored row moves.
- **Good enough**: no test reproduces the two-scope state, because the reviewed honest discovery paths on 6.0.0-rc.3 never produce it; the tripwire detects the rule changes it pins, not every upstream change; the receipt id keeps its shape.

## The path (#1049), traced

**Hypothesis.** A note N is stored under the scopes of accounts X and Y of one profile; both accounts' incoming scans return N; the receipt id `note:profileId|networkId|uniqueNoteHash` (`incoming-transfer/spec.ts:124-126`) names no account and the first commit wins (`incoming-transfer/service.ts:1824-1829`). Consequence: the receipt shows under the non-owner and is missing from the owner's history. Balances are unaffected: they come from `balance_of_private` simulations, not from these reads.

**Prerequisites, each checked against the pinned sources** (recon § The PXE and aztec-nr behaviour has the lines):

1. N must decode an amount, or no receipt exists (`parseNoteAmount`, `incoming-transfer/service.ts:2856-2865`). Only three classes decode one: the noir-contracts Token, the aztec-standards Token (every default token) and PrivateFPC, all UintNote. A dApp-registered class has no schema, so its notes make no receipt.
2. N must be stored under X, a scope that is not its owner's. Under honest discovery a note is stored under the scope whose `sync_state(scope)` discovered it, which the PXE runs with execution scopes `[scope]` (`contract/helpers.ts:9-35`).
3. Discovery under X needs N's nullifier: a note without one is never stored (`nonce_discovery.nr:98-120`). UintNote's nullifier reads the owner's nullifier hiding key (`uint_note.nr:73-82`), and the PXE refuses any key no account in the execution's scopes holds (`utility_execution_oracle.ts:245-256`). Y's key is not X's: each derived account's secret key comes from its own account seed (`address-freeze.ts:58-66`), an address is a function of its signing key, and a second import of one key is refused (`account/service.ts:776`), so two accounts of a profile never share keys. So discovery under X fails for a Y-owned note.
4. The three classes also never send X a message about a Y-owned note: they deliver each note to its owner (`deliver`, `note_message.nr:51-55`; `partial(to, ctx, to, completer)`).

**Label: needs conditions the wallet does not support.** Prerequisite 3 fails for every receipt class under the PXE's own sync, and by prerequisite 4 no honest sender produces such a message. This conclusion covers the PXE's own per-scope sync on the pinned line.

**Claims in #1049 checked:** "the NoteStore keeps one note under several scopes" holds (`note_store.ts:52-63`); "the first commit wins" holds; "Aztec can deliver one note message to several recipients" holds in aztec-nr (`deliver_to`) but none of the three classes does it; "its nullifier can be computed in both" does not hold for any receipt class, which is the restriction the issue suspected. The A3 test race (`c71f43287`) came from a stub that handed one note to both accounts, which the reviewed discovery paths never do.

**Reopening condition** (on #1049): the tripwire test below fails on an Aztec bump; or a later line stores notes it cannot nullify (the "store external notes" TODO in `nonce_discovery.nr`); or a receipt class gains a note whose nullifier needs no owner key; or an amount-bearing class joins the schema map (`note-schemas.ts`); or new evidence shows a receipt-class note under a non-owner scope; or a person reports a receipt under the wrong account. Reopened, #1049 is retraced and gets a fix for the cause found; the tripwire prescribes none.

## Architecture & Implementation

**Proposed change.** One test file beside the existing upstream pins, one `UPDATE.md` entry, and the close-out. No runtime file changes.

**File-level change map**

| File | Change |
|---|---|
| `packages/aztec-runtime/src/pxe/note-owner-scope.sources.test.ts` | new: five tests, below |
| `UPDATE.md` § Types coupled to Aztec shapes | one entry: the incoming reads (`note/service.ts` `fetchContractNotes`) filter by scope only and rely on the pinned rules; the test pins them; a red test, or a new amount-bearing class in `note-schemas.ts`, means retrace #1049 before the bump ships |
| `implementations-plan/note-owner-1/**`, `implementations-plan/index.md`, `implementations-plan/archive/index.md` | plan, then close-out and archive |

**The test** (two `describe`s, PXE `dest/` text and artifacts, in the shape of `handshake-delivery.sources.test.ts`):

- **Reading.** Every file comes through `resolvePackageAsset(pkg, path, { from: import.meta.url })` (`@nulo/resolve-asset`, a declared devDependency of `aztec-runtime`), never the siblings' ascent from an export entry. The artifacts are the copies the wallet loads: `@aztec-foundation/aztec-standards` `artifacts/target/token_contract-Token.json`, `@aztec-labs/noir-contracts.js` `artifacts/token_contract-Token.json`, `@alejoamiras/private-fee-juice` `target/private_contract-PrivateFPC.json`. A `file_map` lookup takes the one entry whose path ends with the suffix and fails on zero or several.
- **Matching.** One expression first drops `/* */` and `//` comments from the file's text. Then one whitespace-tolerant regex per rule, anchored on its function's signature and bounded so it cannot run into the next function declaration, exported, `async` or neither (D5); no body parser. The `dest/` text is formatted (`for(`, `[\n        scope\n    ]`), so every gap is `\s*`.
- **Controls.** Each test asserts its regex matches the shipped text and misses an in-memory mutation of the rule it guards, and that each `.replace` changed the text (a never-happens check with its success control; the installed files are never touched).

1. "the PXE refuses a key that no account in the execution's scopes holds": `dest/contract_function_simulator/oracle/utility_execution_oracle.js`, `getKeyValidationRequest` loops `this.scopes` through `accountHasKey` and throws before returning a key. Mutations: comment out the throw; keep the original method in a block comment beside an active one that returns the key unchecked.
2. "a contract's state syncs one scope at a time": `dest/contract/helpers.js`, `syncScope` calls `utilityExecutor(syncStateFunctionCall, [scope])`. Mutations: pass the caller's scopes; rename `syncScope`; pass `[]` and put the original call in a sibling `async function`.
3-5. `test.each` over the three artifacts, "<class> stores a UintNote only where its owner's key is in scope": in `uint-note/src/uint_note.nr`, `compute_nullifier_unconstrained` goes owner → `try_get_public_keys(owner)` → `npk_m_hash` → `get_nhk_app` → `compute_note_nullifier`; in `aztec/src/messages/discovery/nonce_discovery.nr`, the `maybe_inner_nullifier_for_i.is_none()` branch pushes no note and the push sits in its `else`. Mutations: a constant secret for `get_nhk_app(...)`; a push inside the none branch; the gate disabled and a copy of it in a sibling `fn`.

The file header states the invariant in one sentence: these rules keep the PXE's own sync from storing a note under a scope that lacks its owner's key, which the scope-only incoming reads rely on; a bump that changes one needs a fresh look at those reads. No issue number in the header (CLAUDE.md § Code-comment style).

**Data and control flow.** None at run time. The test reads installed package files.

**Trade-offs and alternatives not taken**

- **`owner: account` on the incoming reads now (outline B).** The precise query, one property plus a unit test. Rejected (D1) on proportion: it closes no path the trace leaves open, and a finding that needs unsupported conditions is a known limit.
- **Docs only (outline C)**, the lane brief's default for a known limit: the `UPDATE.md` entry alone. Rejected (D2): the reopening condition would then rest on a person re-reading upstream sources on each bump; the repo already pins upstream behaviour it depends on with `*.sources.test.ts`, and a red test is the cheapest reliable trigger.
- **A behavioural test** (a real PXE with two scopes): needs bb and a node; the composition layer forbids both (`apps/extension/tests/COMPOSITION-TESTS.md`). The text pin is the established, cheaper layer.

## Security & Adversarial Considerations

- **Threat model**: the change adds no trust boundary, no input and no runtime path. The incoming feed's attribution stays as it is; its correctness rests on the upstream rules the test pins.
- **Least privilege, cryptography, supply chain**: unchanged. The test reads packages already in `bun.lock`; no dependency, no workflow change.
- **Input validation**: none added.
- **Logging**: the test logs nothing; no log line changes.

## UI impact

None. No screen, copy or stored shape changes.

## Assumptions

**Facts** (recon.md has every line): F1 the NoteStore and its filter (`note_store.ts:52-63, 104-198`); F2 per-scope sync (`helpers.ts:9-35`, `contract_sync_service.ts:150-220`, `pxe_debug_utils.ts:64-87`); F3 the key oracle's scope check (`utility_execution_oracle.ts:245-256`); F4 UintNote's nullifier needs the owner's key, the same text in all three artifacts; F5 owner-only delivery in the four schema classes; F6 the receipt needs `content.value`, which only the schema classes give; F7 distinct keys per account; F8 the viewer needs every scoped note, the incoming reads need owned notes only; F9 `owner` crosses the RPC schema; F10 the `*.sources.test.ts` precedent and the `UPDATE.md` convention; F11 a scratch prototype of these regexes, over comment-stripped text, matched the shipped text of all five files and missed every mutation listed above (2026-10-22); F12 a refused key throws inside `compute_note_nullifier`, before `enqueue_note_for_validation` (`nonce_discovery.nr:88`, `private_notes.nr:83-114`), so that message's notes are never enqueued or stored.

**Inferences**: I2 a formatting-only upstream change can red the test with no rule moved; that cost is accepted, as the sibling sources tests accept it.

**Asks**: none. The deviation from the lane brief's "docs-only PR" is a panel decision (D2), stated in the PR body.

## Decision ledger

| Id | Decision | Codex | Opus | Outcome |
|---|---|---|---|---|
| D1 | #1049 is a known limit; no owner filter (outline B rejected) | path r1 preferred the filter; r2 withdrew it (it closes no path the trace leaves open); audit: B "still closes no established path" | B fixes no supported path; the objection is proportion, not cost | adopted |
| D2 | Pin the upstream rules with a sources test, not docs only (outline C rejected) | "a small drift detector is reasonable"; C also proportionate | A beats C: C leaves the next bump to memory | adopted |
| D3 | No e2e run: no runtime file changes | agrees | agrees | adopted |
| D4 | One PR against `dev`, no stack (orchestrator D-orch-1) | agrees | n/a | adopted |
| D5 | One comment-dropping expression, then signature-anchored, function-bounded regexes; no body parser | asked for comment-proof, function-bounded matches; the final pass showed a block-commented original fooled a plain regex | the parser is a new abstraction for one caller | adopted: the strip is one expression, not a parser; the retired-code, rename and sibling-function controls prove both requirements |
| D6 | Pin the nullifier gate in `nonce_discovery.nr`, not owner-only delivery | the gate is needed; delivery is redundant while it holds | agrees | adopted |
| D7 | The Codex loop reviews the close-out and the #1049 comment before either is published | asked | agrees | adopted |

## Audit verdicts

- **Path consult, Codex `gpt-6.1-sol` high.** r1: the facts hold; "the ordinary discovery argument holds"; a refused key throws rather than returning none; partial notes and the offchain inbox pass the same gate; recommended the owner filter. r2: withdrew it, `approve (a)`: #1049 a known limit.
- **Dual audit, Codex leg (same session), `conditional approve`.** Adopted all six conditions: bound every public claim to the reviewed honest discovery paths; pin the nullifier gate (D6) and name `note-schemas.ts` in the bump entry; make the matches comment-proof and method-bounded (D5); replace the expected-text red proof with in-test mutation controls; a red test prescribes a retrace, not the owner filter; review the close-out text before it is published (D7). Accepted its resolution advice: `resolvePackageAsset`, one `file_map` match or fail. I2 reworded as an accepted maintenance cost.
- **Dual audit, Opus 5.5 leg (`Plan`), `conditional approve`.** Verified F1-F10 and that the three `uint_note.nr` copies are byte-identical. Adopted: prerequisite 2 and the label bounded to the PXE's own sync; F7 extended to imported accounts; D1's reason reduced to proportion; the anchored-regex form (D5) with controls that check their `.replace` changed the text; the Post-implementation fixes below. Adopted its finding on public wording: this section and the lessons log carry no consult detail beyond the verdicts.
- **Final fresh pass, Codex `gpt-6.1-sol` high (new session).** r1 `conditional approve`: no private-track hints in committed text; D5's plain regexes were fooled by a block-commented original and could leave their function; the gate's working directory; I1 unsupported. All fixed (D5, F11, F12, the subshell). r2 found the sync regex could still match in a sibling `async function`; the bound and sibling controls fixed it. r3: `approve`.

## Phases

### Phase 1: the tripwire test and the coupling entry ✓

Steps:
1. Merge `origin/dev` into the branch. Read what changed in `implementations-plan/index.md` and `lessons.md`.
2. Write `note-owner-scope.sources.test.ts` as the change map says, its mutation controls included.
3. Add the `UPDATE.md` entry.

**Validation gate**

- Commands, from the repository root: `(cd packages/aztec-runtime && bun --bun vitest run src/pxe/note-owner-scope.sources.test.ts)`; `bun run lint`; `bun run typecheck:all`; `bun run test:all` (check `rc=$?`, then grep for `Exited with code [1-9]` and `FAIL `).
- Pass criteria: the new file runs 5 tests, all green, each with its shipped-text and mutation assertions; every other command exits 0.
- Layers: typecheck, lint, unit.

### Phase 2: close-out text, published only after review ✓

Steps:
1. Merge `origin/dev`; read what changed in `index.md` and `lessons.md` (another plan may have landed; neither merges by union).
2. Write the `## Outcome` block after the front matter: Date, Status `completed`, Shipped (the tripwire and the `UPDATE.md` entry; the PR number is added after `gh pr create`), `Known limits: #1049`, `Open items: none`, Seeds retired.
3. Draft the #1049 comment in `~/.cache/nulo-backlog/note-owner-1/issue-1049-comment.md` (outside the repo): the trace (prerequisites 1-4 with their lines), the disposition, the reopening condition and the test that guards it, all bounded to the reviewed honest discovery paths on 6.0.0-rc.3.
4. Promote lessons, with the pruning pass: the coupling lives in `UPDATE.md` and the test, so expect no new `lessons.md` line; say so in the Outcome if none.
5. Delete `STATUS.md`. `git mv` the plan into `implementations-plan/archive/` in its own commit, repair links, move the index line to `archive/index.md`.
6. Stage, then run `bun run check:plans`.

**Validation gate**

- Commands: `bun run check:plans`; `bun run test:ci-gating`.
- Pass criteria: both exit 0.
- Layers: plans gate.

## Delivery

- **Arc 1** = Phases 1-2, one PR against `dev` from `worktree-note-owner-1`; `code_review: off`. No stack (D4).
- Title: `test(pxe): pin the upstream rules that keep a note in its owner's scope` (71 characters).
- Body: what changed and why; the gates with outcomes; `Known limit: #1049 (closed as not planned)`. No `Closes #1049`: the issue closes as not planned, not completed. No e2e scenario is added, so no suite wall-clock applies. No label at creation; add none, since no runtime file changes.
- **Issues**: #1049, no arc closes it; Post-implementation step 3 closes it as a known limit.
- **Neighbours**: none of `encryption-at-rest-1` A4's or `pxe-cost-1` A1's files are touched. Merge `origin/dev` before the gates.
- **Parallelism**: one arc, nothing to split.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `5c35ca934`. Plan-specific values:

- Step 1 (diff review): absent, `code_review: off`.
- Step 2 (review loop): `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, after Phases 1 and 2 are green, over the arc's diff against its merge base with `dev` plus the #1049 comment draft, so every text that gets published is reviewed. One Opus review (`Agent`, `model: "opus"`, `general-purpose`) runs beside round 1. Resume with `resume-codex.sh`. Hard stop at three rounds. The plan is archived by then: log each round in `implementations-plan/archive/note-owner-1/lessons/phase-1.md` and its Audit verdicts. A security finding the loop raises is handled per CLAUDE.md § Where open work lives.
- Step 3 (delivery): rerun the Phase 1 gate on the final head; `gh pr create --base dev` with the Delivery title and body; one commit that adds the PR number to the Outcome's Shipped line and nothing else; post the reviewed #1049 comment, add the `known-limit` label, close it as not planned. Then `gh pr checks <n> --watch` to the end: a known flake gets one rerun, real breakage a fix and the loop again. Pass: `gh issue view 1049 --json state,stateReason,labels` shows `CLOSED`, `NOT_PLANNED`, `known-limit`. Do not merge.
- Step 4 (close-out): Phase 2 and step 3.
- Step 5 (teardown after the merge): `agent-worktree done note-owner-1 --merged`, once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/note-owner-1/plan.md` succeeds.

## Seeds

Not run: the orchestrator drives the lane. Recommended: `/goal`.

```
/goal All phases marked ✓ in implementations-plan/note-owner-1/plan.md, each backed by its validation gate reported passing in the transcript; LESSONS_FILE printed per phase; the Codex fix loop converged on the arc diff and the #1049 comment draft (a resumed pass reporting no new material finding, quoted); the PR exists against dev, opened only after the loop, with the archive-move commit shown by `git show --stat`; `bun run test:all` and `bun run lint` exit 0.
```

```
/loop 15m Drive implementations-plan/note-owner-1 forward per its plan.md: reality-check plan.md and lessons/, take the next pending step, run its gate, commit, and consult Codex at high on gpt-6.1-sol for any decision; never merge; stop when the PR is green and report.
```
