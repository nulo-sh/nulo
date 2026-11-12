---
plan: token-icons-build-3
tier: light
status: approved (panel); implementing arc 1
issues: "none closed; page 136's three (b) answers. #625 (closed known limit) gets a data point"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev 1593cf027
trunk: dev
post_implementation_standard: implementations-plan/README.md § Post-implementation standard at 1593cf027
---

# token-icons-build-3: page 136's three (b) answers on Home's import and seed rows

Page 136 approved #1792 and answered its five build questions. B2, B1 and B4 are (b), each promised as a follow-up with captures. This lane builds them in one PR. The PR waits for the owner's decision page with its captures; it never lands on its own.

## Outcome & Quality Bar

- **For whom**: a person on Home while a token is being added or a default stopped setting up.
- **Excellent**: one token shows one face from its seed row through its import row to its card; a stopped default reads as stopped in its picture too; no import title runs under its spinner or ×, or past the row, on either browser at 360 or 240 px. Every `data-testid`, word, tooltip and stored shape stays.
- **Good enough**: the reason line under a failed import is unchanged (#1799 owns it); a send or receive row's long symbol stays uncut (#625).

## Sign-offs (verbatim; the visible budget)

- **P136-03, B2 = b** (2026-11-12 14:36:36 UTC): "The list's picture on an import row whose chain and contract the list names, initials on any other: one picture from seed row to card." Premise: a default passes through an import row on its way from seed row to card, and that row knows the list's entry; also a listed token added again after it was deleted.
- **P136-02, B1 = b** (14:36:09 UTC): "The picture dimmed with the symbol, as a failed import row's is." Surface: Home, a default whose setup failed ("Couldn't set up", RETRY) or was refused ("Couldn't verify"); its symbol shows at 55 % opacity; a failed import row dims as a whole (0.7).
- **P136-05, B4 = b** (14:36:55 UTC): "Cut with an ellipsis where it meets the spinner or ×, as a token row cuts its symbol." Surface: Home, a token being added whose contract names itself with one long unbreakable symbol (up to 32 characters), during its import or on its failed row until dismissed.
- Unchanged, as shipped: **P136-04, B3 = a** (the dash on the grey disc until the symbol is read), **P136-06, B5 = a** (the row's existing ellipsis at 240 px under the reviewed `NARROW_ACCEPTED` entry).
- Still binding, from #1792's body: **P129-01 = A** ("the issuers' logos as published, round, unaltered, initials in a grey circle when there is none, the red badge when flagged"), **P129-02 = M1**, **P134-04 = a** with A3 (a): "the list's picture on a seed row (it comes from the list), grey initials on an import row, a 32 px round skeleton on a loading row. Every row's text starts at one edge, and a seed row keeps its picture when it becomes a card." B2 = b supersedes A3's "grey initials on an import row" for a listed import.

## Assumptions

### Facts (at 1593cf027; `recon.md` has the file map)

- F1. `TokensView.vue` renders `TokenImportRow` twice: for `userImports` (above the list) and for a default's `kind: "import"` slot, which carries `entry`; it already passes `prices.iconFor(row.entry)` to `TokenSeedRow`. `TokenImportRow` draws `TokenMark` with no `icon`.
- F2. `persistToken` stamps every token import with its `networkId`, as it has since the first commit (`token/service.ts:453-460`). `journalRecordInScope` still shows a record with no stamp on every network (`utils/activity-rows.ts:113`, `activity-rows.test.ts:337`), so only a record stamped with the active network has that network's chain (D1). `tokenKey` lower-cases the contract.
- F3. `TokenSeedRow.vue` dims only the symbol (`.dimmed`, opacity 0.55) when stopped; the reason line is `txt-danger`, undimmed. `TokenImportRow.vue`'s `.failed` dims its whole row to 0.7. `TokenMark`'s root takes a parent's class (`SendTxSummary.vue:169`).
- F4. The import title (`token-import-title`) has no overflow rule; both wrappers carry `.lead` (`min-width: 0`). The 32-character title ran 16.1 px over the × and 2.1 px past the row on Chrome (`archive/token-icons-build-2/lessons/phase-2.md`).
- F5. `type-roles.test.ts`'s seeded-wallet test (`listedExtensionPerTest`) seeds a title-less import in flight after the worker's last start (`expectImportAndNewToken`) and sweeps Home at its width and at 240 px. `seedTokenImport` takes no title.
- F6. No open issue matches (`gh issue list --state all --search "import row"`, `"seed row"`, `"token mark"`, 2026-11-12): #1799 (open) owns the failed import's reason line and is out of scope. No `Part of`, no `Closes`.

### Claims that did not hold

- C1. "the touched smoke specs ... through `agent.sh`": `scripts/e2e/agent.sh` hard-wires the network config (line 16). Smoke runs go through `bun run test:e2e`; each launch claims its egress-guard ports in `~/.agents/ports.md` itself (`fixtures/egress-guard.ts`), so the ports rule holds (token-icons-build-2 D7).
- C2. "a stopped default ... refused if the fixture allows": no smoke fixture reaches `rejected`. The stand-in node answers 400 and never returns a read that disagrees with the list. The component test pins it; the PR says it has no capture.

### Inferences

- I1. A throwaway spec that removes the `nulo:e2e:token-seeds` session key before the profile registers (the seeder runs on list, profile, network and account events, `token/service.ts:227-231`; removing the key triggers nothing) lets the held list's two Testnet entries seed against the stand-in, ending `failed` about 75 s later (README, held and artifact runs). The egress guard fails any launch that reaches a real host, so no Testnet traffic. Unverified until the capture run; without it, the stopped default has no capture and the PR says so.

### Asks

- None open. D2 and D3 read the picks literally; the captures show both readings to the owner on the decision page.

## Architecture & Implementation

- **B2**: `TokenImportRow` takes an optional `icon` prop and passes it to `TokenMark`. `TokensView` gives both of its import branches one helper: an import stamped with the active network gets `prices.iconFor({ chainId: appStore.network.chainId, contract: op.contractAddress })`, the seed row's lookup on the same key; an unstamped one gets none (D1). With a picture the mark draws it whatever the title; without one, initials or the dash as today (D2).
- **B1**: `TokenSeedRow` puts its `.dimmed` class on the mark too, so the picture and the symbol dim as one (D3).
- **B4**: the import title gets `overflow: hidden; white-space: nowrap; text-overflow: ellipsis` in one `.title` rule beside its role class. No px cap, no new gap (D4).
- Alternative not taken: `TokenImportRow` owning a `PriceServiceClient` as `TokenCard` does. It adds a reader per row where the parent already holds one.

## Security & Adversarial Considerations

- **Pictures**: only from the verified list through `PriceSnapshot`, keyed by chain and contract, drawn only as `TokenMark`'s `<img src="data:…">`. A dApp's `registerToken` at a listed contract shows the listed picture, which is that contract's; an unlisted contract that copies a listed symbol gets initials. A journal row's stamp, not the active network, names its chain (D1). The list's signature authenticates its publisher, not each picture's truth, as for every mark. No `v-html`; CSP untouched.
- **Hostile strings**: a contract-supplied title stays text; the cut keeps a long one from covering the row's status control or pushing past the row.
- **Look-alikes**: the import row keeps `badge: false` as shipped; a flagged pair has no list picture, and its card draws the badge once it lands. No new read, request, storage key or log line.

## Phases

`bun run lint` and `bun run typecheck:all` close every phase. Unit gates: `bun run test` and `bun run --cwd apps/extension test:components`, exit 0. Armed build: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 VITE_NULO_E2E_EXECUTE_FIXTURE=1 bun run build:<chrome|firefox>` in `apps/extension`, from a bash script. Smoke: `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_EXECUTE_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- $SPECS --retry=0`, with `NULO_E2E_BROWSER=firefox` for Firefox. `SPECS` = `tests/e2e/type-roles.test.ts tests/e2e/rows.test.ts tests/e2e/token-list.test.ts tests/e2e/home-links.test.ts`, the smoke specs that render Home's token rows, by exact file (a bare `rows` also matches `send-outcome-rows`).

### Phase 1: B4's guard, red on base, then the cut

- **Change map**: `tests/e2e/helpers/activity-seeds.ts` (`seedTokenImport` takes an optional `title`), `tests/e2e/type-roles.test.ts` (`expectImportAndNewToken`), then `TokenImportRow.vue` (+ test).
- **Tests**: e2e, at the end of the existing step, after its title-less sweep and the New token popup (that sweep's identifier site holds every visible `token-import-title` to `meta`, which a named title is not): seed a second import in flight titled "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345", route away from Home and back so the view reads it, and require visible, non-zero title and spinner boxes. At the popup's width and at 240 px, its painted text (the text's range, clipped by the title's own box when the title clips) ends at or before the spinner's left edge and inside the row, and the title draws an ellipsis (`text-overflow: ellipsis`, `scrollWidth > clientWidth`). The title-less row's address stays whole (success control). Estimated cost: about 3 s per browser; measured in Phase 4. Component: the title takes the same classes in flight and failed, so the cut holds on both.
- **Gate**: build base (dev's `src`, the new specs) for Chrome and Firefox; run `SPECS` on each. Pass: type-roles is red only at the new assertion; the other three are green, with their wall-clock recorded as "before". Then the cut, and the unit gates green.

### Phase 2: B2, the list's picture on a listed import row

- **Change map**: `TokenImportRow.vue`, `TokensView.vue` (+ tests).
- **Tests**: `TokenImportRow`: with `icon` the mark is the logo, titled or not; without it, the initials and dash cases as today. `TokensView`: a default's import slot gets its entry's picture; a user import at a listed contract stamped with the active network gets it; one at an unlisted contract, and an unstamped one at the listed contract, get none.
- **Gate**: unit gates green.

### Phase 3: B1, the stopped default's picture dims with its symbol

- **Change map**: `TokenSeedRow.vue` (+ test).
- **Tests**: failed and rejected: the mark and the symbol carry the same `.dimmed` class, and the reason and RETRY do not. Working (pending, seeding, seeded): neither carries it (success control).
- **Gate**: unit gates green.

### Phase 4: gates, measurements, captures, the PR, the close-out

- **Gates, once, in order, at the head**: `lint`, `typecheck:all`, `test`, `test:components`, `audit:vue`, `test:all`, `check:plans`; armed head builds; `SPECS` on Chrome, then Firefox. Pass: every command exits 0; the spec durations go into the PR's base-to-head table.
- **Measurements**, throwaway spec on the head build, both browsers: titles of 28 and 32 characters, in flight and failed, at 360 and 240 px: painted text right edge, trailing control's left edge, row width. Pass: every title ends at or before its spinner or × and inside its row; the 32-character ones end in an ellipsis. This is the failed state's browser check (D5).
- **Captures**, Chrome, light and dark, throwaway spec, `~/.cache/nulo-backlog/token-icons-build-3/shots/` with `captions.json`: Home with a listed import row beside an unlisted one; a stopped default (I1); the 32-character import in flight and failed. Seed the failed record as terminal with the worker alive, so its reason is the row's own "Couldn't add token", never the reaper's (#1799). A throwaway spec lives in the lane cache and is copied into `tests/e2e/` only for its run. For the stopped default, remove the empty seed list before the profile registers on the list's chain (`registerOnListChain`; a fresh profile starts on Mainnet, where the list names nothing), then wait for `data-status="failed"` (I1).
- **PR**: the body quotes the sign-offs, embeds the captures from `pr-captures/token-icons-build-3/` (committed in one commit, removed in the next) and states the measurements and durations. Close-out in its final commits; #625 gets a comment that the import title now cuts.

## UI impact

- **Home, an import row whose chain and contract the list names** (a default mid-setup, or a listed token added again): the list's picture in the 32 px slot, where grey initials stood. Other import rows unchanged. Sign-off: P136-03.
- **Home, a stopped default** (failed or refused): its picture at the symbol's 55 %, where it stood at full strength. Sign-off: P136-02.
- **Home, an import row whose title is too long**: the title ends in an ellipsis where it meets the spinner or ×, where it ran under them. Sign-off: P136-05. Nothing else moves.

## Delivery

One arc, one PR. Branch `token-icons-build-3-a1` off `origin/dev`, carrying the plan commit. Title: `feat(tokens): a listed import draws its picture, a long title cuts, a stopped default dims` (90). Opened ready, no labels, after the gates and the Codex loop; `Part of` and `Closes`: none. The orchestrator lands it on the owner's approve and runs the teardown.

## Post-implementation

Cite `implementations-plan/README.md` § Post-implementation standard at 1593cf027. Single arc: the Codex loop runs once over `1593cf027..head` after Phase 4's gates (`~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`), until a round has no material finding, hard stop at three rounds. One Opus review (`general-purpose`) runs beside round 1. Then the gates on the final head, the PR, `gh pr checks <n> --watch`, the close-out. Anything visible beyond the UI impact lines goes to `OWNER-ASKS.md` and ships without it. Teardown is the orchestrator's.

## Decision ledger

| # | Decision | Codex (plan audit) | Call and reason |
|---|---|---|---|
| D1 | Where B2's lookup lives, and what names the import's chain | `TokensView`; but a record with no network stamp still shows on every network, so guard its picture | One helper in `TokensView` for both import branches: the active network's chain only for a record stamped with it. The unstamped path needs a record no writer makes (stamped since the first commit), so it is labelled unsupported; the guard is taken because it is the lookup's own input, one condition and one test. A reader per row was rejected: the parent holds one. |
| D2 | A listed import before its symbol is read | agree: P136-03 names chain and contract, not a symbol | The picture. B3's dash stays for an import the list does not name. |
| D3 | B1's opacity: the symbol's 0.55 or the failed import row's 0.7 | agree: 0.55; "dimmed with the symbol" names the symbol's dim, and the brief's paraphrase cannot change the words | 0.55 on the mark through the symbol's own class. 0.7 on both, a cap, a gap or a badge would be an owner ask. |
| D4 | B4's cut point | agree | Where the title meets the trailing control, with no px cap and no gap. The token row's 160 px cap would cut a title that fits at 360 px. |
| D5 | B4's test layer and placement | agree on e2e; reject seeding beside the title-less sweep, whose identifier site holds every import title to `meta` | E2e after that sweep, in flight only, with the clipped-range measurement and visible boxes. The failed row (30 s on Home) is checked by Phase 4's measurement on both browsers, not a permanent sweep. |
| D6 | B2's test layer | agree; add wrong-chain and unstamped controls | Unit, with the unstamped control. `rows.test.ts` already proves the worker's pictures reach the popup. A snapshot-update test was rejected: `usePrices.test.ts` pins how a snapshot is adopted. |

## Audit verdicts

- **Codex, plan audit** (session `01a1d04b`, gpt-6.1-sol, high, read-only): conditional approve. Accepted: D1's stamp guard (F2 corrected), D5's order, the 95-character title (now 90), the exact spec files, I1's trigger order, the runtime estimate, the failed state's measurement as a pass criterion, C1's line (16, not 14). Rejected: the snapshot-update test (D6). Its other positions agree with D2 to D4.
- **Codex, final fresh pass** (session `01a1d054`, gpt-6.1-sol, high, read-only): **approve**. No blocking finding; D1 to D6 and the snapshot-update rejection stand. Folded in: recon's `agent.sh` line, and I1's capture registers on the list's chain.

## Seeds

```
/goal All phases marked ✓ in implementations-plan/token-icons-build-3/plan.md, each gate reported passing in the transcript; the Codex loop converged; one PR open, ready, carrying the close-out; bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/token-icons-build-3 forward per its plan.md; decide with Codex at high on gpt-6.1-sol; never merge; stop once the PR is open with its checks read.
```
