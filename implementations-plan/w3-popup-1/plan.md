---
plan: w3-popup-1
tier: light
status: arc 1 merged (#1580); arc 2 built on OA-1's answer (A)
issues: "#1486, #1499, #1406 (arc 1); #1405 (arc 2, after OA-1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg; final fresh Codex pass
base: origin/dev at baec79333
trunk: dev
post_implementation_hardening: not scheduled
---

# w3-popup-1: the connected app's detail page, New sender's Enter, pasted addresses with invisible characters

Two arcs. Arc 1 fixes three bugs whose rules already exist. Arc 2 (#1405) changes which pasted text Send accepts, so it waited on the owner (OA-1), who picked A. Each fix starts with a test that is red at the base. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/extension/src/` unless they name a package.

## Outcome & Quality Bar

- **For whom**: a person in the popup who taps away from a page that is still loading, presses Enter in a form, or pastes an address copied from a web page, a chat or a document.
- **Excellent**: (1) the popup lands where the person went, and a form's Enter and its button refuse the same values; (2) a search field keeps none of the characters the typed-text rule removes, and its matches and its add offer read the same query.
- **Good enough**: no new copy, state or screen. What Send accepts follows OA-1's answer (A).

## Findings (each traced in code, `recon.md` § Issue claims checked)

- **#1486**, plausible but unverified (timing not measured). Unlocked; the detail page's first `getDappSession` is out. The person taps the Header's network chip; the route change unmounts the page, whose `onBeforeUnmount` disconnects the client; the client rejects the read; `fetchSession`'s catch pushes Connected apps. Broken: an unmounted page does not navigate. Consequence: a wrong screen.
- **#1499**, demonstrated by trace. A listed sender typed into New sender shows "Already exists" and disables the button, but Enter calls `handleAddSender`, whose gate never reads `isAlreadyExist`: `addSender` runs, the popup closes, the toast says "Sender is added". Broken: one rule for button and Enter. Consequence: a false success and a redundant PXE registration.
- **#1406**, demonstrated by trace. A zero-width space or bidi control pasted into Holdings' search (and Send's token picker, the same `TokenList`) makes `addCandidate` undefined: no add offer, "no results". The developer searches filter on the raw term. The issue's fix ("`:normalize` on each `Input`") does not hold for Holdings: `SearchField` is a native input without that prop.
- **#1405**, demonstrated by trace. An address pasted with a trailing space, NBSP, tab, joiner or Hangul filler fails `isValidAztecAddress`: "Invalid address" after blur, Confirm off, cause unseen. Consequence: a send blocked until the person retypes.

## Assumptions

**Facts**
- F1. Outside a stale-network takeover or a network arrival, the Header renders over every route, and its chip pushes `/popup/settings/networks` while unlocked (`popup/app.vue:661-663`, `components/Header.vue:138-141`).
- F2. `disconnect()` rejects every pending request, and a port drop after Ready rejects every posted one, with the same disconnect error; a drop while connecting rejects nothing (`packages/extension-messaging/src/background/client.ts:101-105`, `:138-145`).
- F3. The detail page already holds `let unmounted` (`popup/pages/settings/connected-apps/[id].vue:51`, set at `:209`); `fetchSession` (`:93-110`) reads it on neither navigation.
- F4. `NewSenderPopup.vue`: the gate (`:40-48`) skips `isAlreadyExist` (`:39`); the button adds `!!error.type` (`:166`); the verdict watcher watches the address only (`:86-89`).
- F5. `SearchField.vue` is a native `<input maxlength="80">` bound by `:value` and `@input`, with one consumer, `TokenList.vue:117`. The developer searches use `@nulo/design`'s `Input`, which has `normalize` (`packages/design/src/ui/Input.vue:138`, `:197`).
- F6. `matchesQuery` trims and lowercases the query (`utils/token-search.ts:8-15`), and `addCandidate` trims it (`TokenList.vue:93-96`): today both read one query.
- F7. The typed-text rule removes bidi controls, the zero-width space, the word joiner, the BOM and the soft hyphen anywhere in the text, and keeps joiners, variation selectors and tags; the orchestrator ratified that split under the owner's delegation (`utils/string.ts:46-54`; the unicode-1 plan, A1). That plan's D5 deferred the same rule at Holdings and the developer searches as the bug #1406.
- F8. `usePopupEntity`'s `submitWaitsForShow` keeps Enter inert while `onShow` is pending, for popups whose entry checks read a populated list; New FPC, New token, Edit FPC and Edit contact set it, New sender does not (`composables/usePopupEntity.ts:34-40`, `:56`).

**Inferences**
- I1. #1486's window is one read on a fresh port; a slow worker widens it. The test holds the read, so the fix does not depend on the window's length.
- I2. An input method's last `input` event can arrive with `isComposing` true, then `compositionend` with no further `input` (the UI Events order). So a strip that skips composing input needs a pass at `compositionend` (Codex R1, Opus R1; browser order unverified, the test drives the events).

**Asks**
- A1 (OA-1). #1405: which pasted text Send accepts as an address. Answered: A (D7).

## Architecture & Implementation

- **#1486 (arc 1)**: `fetchSession` reads into a local. The catch only drops the error, then `if (unmounted) return`, then the existing `router.push` when there is no session. One fence covers the refused read and the empty answer.
- **#1499 (arc 1)**: the gate returns false on `isAlreadyExist`; the verdict watcher watches `[senderAddress, senders]`, so a list that lands after the address shows "Already exists"; `usePopupEntity` gets `{ submitWaitsForShow: true }` (F8), so Enter waits for the list. The duplicate check compares with `sameFieldAddress`, as New FPC does, since `getSenders` answers lower case and the field takes either (Opus fix R1). The button's `:disabled` stays.
- **#1406 (arc 1)**: `SearchField.vue` applies `stripBidiAndZeroWidth` on each `input` that is not composing, and once at `compositionend`. When the text changes, it writes the kept text to the element, puts the caret after what preceded it (as `AccountSelectRow.vue:52-62` does), and emits it. A composing input emits the raw text, as today. `TokenList` is unchanged: its matches and `addCandidate` keep reading one trimmed query (F6). The three developer searches pass `:normalize="stripBidiAndZeroWidth"`.
- **#1405 (arc 2, OA-1's answer A)**: new `bareAztecAddress(text): string | undefined` in `utils/aztec-address.ts`. It drops `\p{White_Space}` and `\p{Default_Ignorable_Code_Point}` code points from each end, one character at a time with code-point indices and one final slice, so no `+$` regex reaches CodeQL's ReDoS rule (`lessons.md`) and the cost stays linear. It returns the rest when `isValidAztecAddress` accepts it, else undefined; a text that is no address after that is never rewritten. `RecipientField`'s `normalize` becomes `stripBidiAndZeroWidth`, then `bareAztecAddress(kept) ?? kept`. `TokenList` derives one term, `bareAztecAddress(query) ?? query`, for both `matching` and `addCandidate`, so a listed contract with a joiner at an edge shows its row and no add offer (Codex R1).
- **Files, arc 1**: `popup/pages/settings/connected-apps/[id].vue`, `popup/components/popups/NewSenderPopup.vue`, `components/composite/SearchField.vue`, `popup/pages/settings/developer/account-state/{contracts,notes,authwits}/index.vue`, and their tests. **Arc 2**: `utils/aztec-address.ts`, `popup/components/modules/send/RecipientField.vue`, `popup/components/modules/holdings/TokenList.vue`, and their tests.

## Decision ledger

- D1. #1486 fences on `unmounted`, the page's own flag. Rejected: `isClientDisconnectRejection` in the catch, because a port drop while mounted throws the same error (F2), and the page would then stay blank (it renders only with a session). Rejected: a failed-read state, as `received/[id].vue` has, because it is a new screen state and the issue does not need it. Left as it is: a port drop while mounted during the first read still opens the list, a working screen one tap away (plausible, unmeasured).
- D2. #1499's gate reads `isAlreadyExist`, a synchronous computed, not the shown verdict, which follows a watcher. The watcher also re-runs on `senders`; without that, the late-list case would disable the button with no verdict shown (Codex R1 agreed it is needed). It shows existing copy under the existing rule. Not waiting for #1449, an enhancement with no owner decision. Before the list lands, Enter is inert (F8, Codex final pointed to it); the existing test that pins Enter live in that window changes with it, as its premise (the hex check as the only guard) no longer holds. Left as it is: a click on Add before the list lands still submits, as on the sibling popups; closing it needs a readiness state for the button (a plan change), so it is a known limit filed at close-out.
- D3. #1405 goes to the owner (Codex R1): it changes which pasted text Send accepts and lets an edge joiner through, which the ratified rule keeps (F7). The recommendation strips at input time, in `normalize`, so the shown, judged and sent values stay one. Rejected: a rewrite at blur (an Enter or a Confirm before the blur still sees the old text); judging a trimmed copy while the model keeps the raw text. Inner joiners, spaces and fillers stay refused; inner bidi and zero-width characters are already removed by the ratified rule (Codex R1 corrected the plan here).
- D4. #1406 puts the typed-text rule in `SearchField` itself, with no prop: it has one consumer, and the ratified rule binds every typed field. Rejected: stripping in `TokenList`'s computeds (the field would keep the character); a `normalize` prop (an option for one caller); swapping in `Input` (a different look); native `v-model` (it would stop the live search while an input method composes). The edge helper waits for OA-1 with #1405 (D3).
- D5. No new e2e. Component tests witness each fix (the real `Input` and `SearchField` where a field's strip is the fix; New sender's stubbed `Input` suffices for its gate); the existing smoke specs reach the touched surfaces in a browser, not the composition order (I2).
- D6. As built: the page tests register `Input` and `Flex` from `@nulo/design` (the test environment has no component resolver), and authwits' takes a `realInput` mount option so its other tests keep their stub.
- D7. OA-1 answered **A** by the owner (decision page 102, P102-01, signed 2026-11-03): "When the pasted text is an address once the invisible characters at its two ends are removed, the field keeps only the address. It looks exactly as a clean paste does today." That sign-off covers exactly the recipient, Holdings' search and the picker's Add token offer as OA-1 describes them; arc 2 builds § Architecture's #1405 entry and changes no copy. As built: `bareAztecAddress` slices `Array.from(text)` (code points), so an edge character outside the BMP goes whole; `TokenList`'s `addCandidate` reads the same derived address as `matching`, which replaces its own trim and validity check; the regenerated auto-import types ship with it.

## Security & Adversarial Considerations

- **Threat**: clipboard text from a page an attacker shapes (padding, joiners, bidi controls) that tries to make a value read as one address and act as another. Arc 1 removes only what the ratified rule removes (F7), so no hex digit changes and what a field shows is what it holds. Arc 2's `bareAztecAddress` returns only text that `isValidAztecAddress` accepts, with no case or compatibility folding, and removes characters only at the edges. Hostile-input rows: fullwidth and look-alike digits, inner whitespace, an inner kept joiner, a supplementary-plane ignorable, two addresses, hex off the curve.
- **Edge class**: `\p{White_Space}` includes U+1680, which draws a dash; `.trim()` already removes it at the base, and no digit changes.
- **Cost**: the scan is linear in the pasted text; the curve check runs only on a 66-character hex candidate.
- **No change** to permissions, storage shapes, messages, logs, crypto or dependencies.

## UI impact

No copy, layout, row or format changes in arc 1; each surface keeps its rule.

1. Settings › Connected apps › an app: leaving it during its first read lands where the person went.
2. Settings › Developer › New sender: Enter on a listed address does nothing, like the disabled button; "Already exists" also shows when the list loads after the address.
3. Holdings' search, Send's token picker and the developer searches: they keep none of the characters the ratified rule removes, so a pasted address with a zero-width space finds its row or gets the add offer.
4. Arc 2 (OA-1 answered A, the owner's sign-off, P102-01, 2026-11-03: "When the pasted text is an address once the invisible characters at its two ends are removed, the field keeps only the address. It looks exactly as a clean paste does today."): Send's recipient keeps only the address when a paste is one once its edge characters go, so it reads as a clean paste: no "Invalid address", the same contact card on leaving the field. A space typed right after a complete address does not appear. Holdings' search and Send's token picker show the listed token, else the Add token offer, for such a paste. Text that is no address keeps its spaces; anything inside an address is refused as today. No copy changes. Captures (Chrome, light): [before](screenshots/a2-before-padded-paste.png), [after](screenshots/a2-after-padded-paste.png).

## Phase 1: the connected app's detail page (#1486, arc 1) ✓

- Commit the tests first, red at the base, in `[id].test.ts` (make `router.push` observable). (a) Hold `getDappSession`, unmount: no push. (b) The read answers with nothing, and the page unmounts before it resumes: no push. Controls: a read the service refuses while mounted pushes `/popup/settings/connected-apps`; a session that loads pushes nothing. Then the fix.
- **Gate**: `bun run lint`, `bun run typecheck:all`: exit 0. From `apps/extension`: `bun --bun vitest run src/popup/pages/settings/connected-apps --retry=0`: green; (a) and (b) red at the test commit.

## Phase 2: New sender's Enter (#1499, arc 1) ✓

- Tests first, red at the base, in `NewSenderPopup.test.ts`. A listed address and Enter: `addSender` is not called and no toast opens (the unlisted control is the existing Enter test). The list held, a listed address typed: Enter adds nothing; then the list lands with it: "Already exists" shows and Enter still adds nothing. The test at `:143` becomes: Enter is inert while the list is held, and an unlisted valid address submits once it lands (control). Then the fix.
- **Gate**: lint and typecheck as above; `bun --bun vitest run src/popup/components/popups/NewSenderPopup.test.ts --retry=0`: green; both cases red at the test commit.

## Phase 3: the searches (#1406, arc 1) ✓

- Tests first, red at the base.
  - `TokenList.test.ts`, with the real `SearchField`: an unlisted address with an inner zero-width space offers Add token with the address, and the field's value equals the emitted query, without the character; the same paste of a listed contract shows its row and no add offer; a visible wrong character offers none (control).
  - `components/composite/SearchField.test.ts` (new), through a parent-bound `v-model`, reading the element's value, the emitted text and the caret after Vue updates: a mid-text strip keeps the caret after what preceded it; a composing input is emitted as typed and not rewritten, and `compositionend` strips it.
  - Colocated page tests, `contracts/index.test.ts` and `notes/index.test.ts` (new) and `authwits/index.test.ts` (extended), each with the real `Input` and a fixture whose searched field holds the term (Notes searches its contract, type, name and location): the term pasted with a zero-width space shows the row; a visible wrong character shows the no-results line.
- Then the changes.
- **Gate**
  - `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`, `bun run audit:vue`: exit 0. From `apps/extension`: `bun --bun vitest run src/components/composite src/popup --retry=0`: green.
  - Smoke, from `apps/extension`: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome`, then `env -u EXTENSION_PATH NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/send-picker-add.test.ts tests/e2e/token-list.test.ts tests/e2e/holdings-add-token.test.ts --retry=0`: pass. Repeat with `build:firefox` and `NULO_E2E_BROWSER=firefox`.
  - Network, from the repo root: `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_PROVERLESS=1 bun run e2e:agent tests/e2e/network/senders-advanced.test.ts tests/e2e/network/connect-check-window.test.ts --retry=0`: pass. Repeat with `NULO_E2E_BROWSER=firefox`.
  - `bun run check:plans` after staging: exit 0.

## Phase 4: the recipient (#1405, arc 2, OA-1 answered A) ✓

- Built as OA-1's answer says (A). Tests first, red at the base.
  - `utils/aztec-address.test.ts`, `bareAztecAddress`: a bare address; one table of kept edges (space, NBSP, tab, ZWJ, ZWNJ, U+3164, U+115F, U+E0020 and U+E0100 outside the BMP, a mix before and after) returning the address. One row per refused class returns undefined: inner whitespace, an inner joiner, a visible edge character, a combining mark at an edge (U+0301), fullwidth digits, two addresses, hex off the curve, a name, empty text, edges only.
  - `RecipientField.test.ts`, in its real-`Input` block: an address with a trailing space or a joiner emits the address and the field holds it before any blur; no hint after the blur; "Alice " keeps its space (control). An inner joiner keeps the hint (control).
  - `TokenList.test.ts`: a listed contract with an edge joiner shows its row and no add offer; an unlisted one offers Add token with the bare address; an inner joiner offers nothing (control). `SelectTokenPopup.test.ts`: the picker's Add token offer on a padded paste hands New token the bare address.
- **Gate**: lint, typecheck:all, test:all; from `apps/extension`, `bun --bun vitest run src/utils/aztec-address.test.ts src/popup/components/modules/send src/popup/components/modules/holdings src/popup/components/popups/SelectTokenPopup.test.ts src/popup/pages/holdings.test.ts --retry=0`; smoke `send-keyboard`, `send-picker-add`, `token-list`, `holdings-add-token`, `type-roles` on Chrome and Firefox at retry 0 (phase 3's build flags); `check:plans`. No network file reaches the recipient or the searches.

## Panel verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex R1 | reject | #1405 to the owner (OA-1) and the arc split; one TokenList term for arc 2; the composition commit path; F1 and F7 restated; inner removals named; colocated page tests with searchable fixtures; the extra hostile rows; D1's restructure and its empty-answer test | surfacing #1406 and D2 as owner asks (D2, D4: each applies an existing rule) |
| Opus R1 (Plan) | conditional approve | one TokenList term (as Codex); emit raw text while composing and rewrite nothing; `SearchField.test.ts`; D1's wording and the empty-answer row; F2 and I2 restated; outside-BMP, combining-mark, empty and edges-only rows; arc 2's visible side effects listed in OA-1; U+1680 named | its finding 6, that #1405 needs no owner call: Codex R1's stronger argument (D3) |
| Codex final (fresh) | conditional approve; arc 1 may proceed | U+1680 disclosed in OA-1; #1499 bounded, with `submitWaitsForShow` for Enter (F8) and the button's window a known limit; F7 tied to unicode-1 D5; D5 and I2 narrowed; SearchField tested through a bound model; code-point indices in arc 2 | none; it upheld rejecting owner asks for #1406 and D2 |
| Codex final (resumed) | approve; arc 1 may proceed, arc 2 waits on OA-1 | none; `submitWaitsForShow` confirmed as the documented mechanism, not a reopened disposition | none |
| Codex fix R1 (arc 1) | changes requested | `SearchField`'s header cut to its why; the sender test file's summary cut to its pointer | none |
| Opus fix R1 (arc 1) | changes requested | the duplicate check by `sameFieldAddress` (an upper-case paste of a listed sender reached #1499's consequence; test red first); the hostile rows' titles named, with `\u200B` escapes | none |
| Codex fix R2 (arc 1) | clean | none | none |

## Delivery

- **Arc 1** (phases 1-3; #1486, #1499, #1406), now: branch `worktree-w3-popup-1` to `dev`, `gh pr create` after the fix loop converges, ready, no labels. Title `fix(popup): an app page's late read, new sender's enter, invisible characters in searches` (89 characters, lower case for `subject-case`). Body: what changed and why, the gates with outcomes, "no e2e scenario added or changed", what waits on OA-1, `Closes #1486`, `Closes #1499`, `Closes #1406`. Before building, each issue gets a `## Decision` comment with its pick; #1405 gets OA-1's options.
- **Arc 2** (phase 4; #1405), on OA-1's answer, branch `w3-popup-1-a2` off `dev` after #1580: title `fix(send): an address pasted with invisible characters at its ends reads as the address` (87 characters); `Closes #1405`. The close-out is the last arc's final commits.

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `baec79333`, with these values:

- Step 1 is absent (`code_review: off`). Step 2 per arc over that arc's diff (arc 1 from `baec79333`): `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`. Every prompt carries both verbatim rules and the adversarial ask. One Opus `general-purpose` review runs beside round 1. Hard stop at three rounds.
- Steps 3 and 4 as written. Close-out, on the last arc: the Outcome block, lessons promoted with a pruning pass, `STATUS.md` deleted, `git mv` to `archive/w3-popup-1/` in its own commit, the index line moved. If OA-1 declines #1405, the close-out comments the reason on it.
- Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/w3-popup-1/plan.md`, then `agent-worktree done w3-popup-1 --merged`. The orchestrator's session notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds (not run; orchestrator-owned)

- `/goal` Phases 1-3 ✓ in implementations-plan/w3-popup-1/plan.md, each gate passing in the transcript; the Codex loop converged on arc 1's diff from baec79333; a ready PR to dev closing #1486, #1499 and #1406; `bun run test` and `bun run lint` exit 0. Phase 4 only once OA-1 is answered.
- `/loop 15m` Drive implementations-plan/w3-popup-1 from plan.md and lessons/: the next unchecked phase, its gate, the Codex loop, delivery, the close-out; never merge.
