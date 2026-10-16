---
plan: type-roles-coverage
tier: light
status: planned, awaiting orchestrator approval
issues: "#366 (arc 1 Refs, arc 2 Closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet); one Codex audit (gpt-6.1-sol high) with one resume; one Opus Plan leg
base: origin/dev at 8459699c
trunk: dev
post_implementation_hardening: not scheduled
---

# type-roles-coverage: every identifier site observed in its mono role

#366, owner A on decision page 19 (2026-10-15): extend the two type-roles specs state by state, cheapest first, then assert that nothing a spec owns is unobserved. Arc 1 is the smoke half. Arc 2 is the network half, and it starts only if arc 1 stays inside its budget (A1). No UI change. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Over the 150-line target: two arcs, a 12-step cost table and the audit ledger.

**Issue claims that did not hold** (counts at 8459699c): the expected file now lists 120 entries, 90 live, not 111 and 86. The smoke spec observes 7 and the windows spec 14 (#437 closed #365 and added the raw field). Unobserved: 49 smoke and 20 network, not 45 and 21. Two of the 20 (the `call` authwit record) are reachable in smoke by a storage seed (D5), so arc 1 takes **51** and arc 2 **18**. `coverageOf` has no caller: holds.

## Outcome & Quality Bar

- **For whom:** the next contributor whose change renders an address, hash or id. Today 69 of 90 live sites can leave their mono role with CI green.
- **Excellent:** (1) a site that loses its role fails the spec that owns its state, naming the site's key; (2) a new site in an owned state fails that spec's coverage test until a state renders it visibly; (3) each added step states its failure mode and its measured cost on both browsers.
- **Good enough:** coverage is per spec file, and full on source-built runs (D3). A site deleted from the source is the inventory unit test's job.

## Assumptions

Facts:
- F1 `coverageOf(observations, { sites })` counts a live site as read when one observation of its key has readings (`tests/e2e/fixtures/type-roles.ts:583`).
- F2 `observeIdentifierSites` fails a state whose selector matches nothing (`:529`). It reads hidden matches too (`readTypography`, `kind: "at"`, `:107`). It cannot tell sibling branches that share a testid apart (`activity-row-hash`, `TransactionCard.vue:178,183`).
- F3 Smoke runs one fork per file, tests in definition order, `retry: 2` (`vitest.e2e.config.ts:41`). PR lanes shard by file; artifact runs are unsharded.
- F4 The `(network)` suffix marks the states the expected file gives the network suite. One pair does not need it: `AuthwitCard.vue:34` renders a stored `kind: "call"` row, and `getAuthwits` reads storage (`auth-registry/service.ts:199-208`).
- F5 `registeredExtension` is file-scoped (`fixtures/extension.ts:731`). Four read-only tests and the Send/Settings test share it.
- F6 The journal's boot sweep fails every non-terminal record created before the boot (`operation-journal/reaper.ts:141-152`, `:228`).
- F7 The FPC page always renders the synthetic Public Fee Juice row. A named row's title takes `row-title` (`FpcRow.vue:34`), so the site's selector `[data-testid="fpc-row"] [data-testid="setting-title"]` matches rows outside its branch.
- F8 An `AddressDisplay` showing a known account or contact is judged as `name` (`fixtures/type-roles.ts:514`). `seedTransaction` sets `from` and `to` to the wallet's own account (`helpers/activity-seeds.ts:96`).
- F9 dApp sessions carry a MAC (`dapp-session/spec.ts:64`), so a connected-app state cannot be seeded and stays in the network suite.
- F10 Baselines are CI per-file durations: `type-roles.test.ts` 41.8 s on Chrome (run 38890651617) and 68.4 s on Firefox (run 38889987097).
- F11 `getFpcs` registers each missing canonical FPC through the PXE before it answers (`fpc/service.ts:140-181`).

Inferences (the implementer verifies in phase and logs in `lessons/phase-1.md`):
- I1 Raw `nulo:core:auth-registry@<id>` rows render on the authwits page when written before the seeded test's restart. The key's suffix must equal the row's `id`.
- I2 The received detail of a `seedPublicReceipt` row settles with Testnet refused (its fee lookup fails closed).
- I3 An import row written after the boot, with its timestamps at now, shows in flight on a re-mounted Home.

Asks (the working assumption holds until the orchestrator overrides it at approval):
- A1 Arc 2 starts only if `type-roles.test.ts`'s CI per-file duration on arc 1's PR, first attempt, stays within +100 s on Chrome and +160 s on Firefox of F10. It also needs no smoke shard job over 25 min. Otherwise the numbers go to the orchestrator and #366 stays open.
- A2 Arc 2 opens with a plan revision, approved before any arc 2 code. The revision gives a producer path, a measured cost and a disposition for each of the 18 sites, all observed in `type-roles-windows.test.ts`. A missing playground control does not make a state `unreachable`.

## Architecture & Implementation

- **D1 Ownership.** A live site belongs to the network spec when its state ends in `(network)`, else to the smoke spec. One exported predicate in `fixtures/type-roles.ts` serves both specs. It partitions every live site, so a new one lands in exactly one coverage test. Rejected: `surfaces.expected.json`'s `suite` field (board-era, disagrees with site states); a per-surface list (a second list to keep in step).
- **D2 Aggregation.** `type-roles.test.ts` keeps one module-level `observed: IdentifierObservation[]`. `expectPageClean` pushes an observation only after `expectSitesClean` passes on it. A final test asserts `coverageOf(observed, { sites: smoke-owned }).unobserved` is `[]` and `live` > 0. It logs `live` and the network-owned and unreachable counts, so drift shows. It is a last test, not `afterAll`, because `afterAll` also runs under a `-t` filter. Test bodies are linear, so a passing retry re-observes every state. Rejected: per-attempt buffers (Codex), which guard a path that cannot leave the file green.
- **D3 Precondition.** The coverage test calls `skipUnlessListPrices(skip)`, the precondition of the seeded test it reads. PR lanes never skip it. Full coverage is therefore guaranteed on source-built runs only. An artifact run whose list prices no Testnet token skips both tests.
- **D4 A new test for the mutating states.** S9–S12 go into a new `registeredExtensionPerTest` test. They write a contact, an FPC row and a hidden account. The existing Send/Settings test stays on the shared context and unchanged, apart from S1's state. Rejected: moving that whole test to a per-test context. It costs the same browser launch, and a retry would repeat more work.
- **D5 Seeds.** Rows the producing flow would write go straight to storage: four authwit kinds, an unnamed FPC, an import in flight. Each renders the same branch. The two `call` sites' state loses its `(network)` suffix, with a relabel to `a public authwit granted` (2 sites move to arc 1). The other reviewed labels stay. The import row is written after the restart (F6). A seed under the boot sweep would show a failed row and certify the wrong state.
- **D6 Selectors and testids.** `FpcRow.vue` gains `data-fpc-unnamed`, present only when the title shows the address. The unnamed-FPC entry's selector becomes `[data-testid="fpc-row"][data-fpc-unnamed] [data-testid="setting-title"]`. The fix lives in the expected file, so every observer reads the branch. Rejected: a spec-local remap (it leaves the entry wrong); a `data-fpc-name^="0x"` prefix (a user may name an FPC `0x…`); the seed's `data-fpc-id` (it ties the inventory to one test). Two testids are added: `tx-debug-toggle` (`TxDebugPanel.vue:29`) and `token-menu-metadata` (`tokens/[id].vue:255`).
- **D7 Visible readings.** `observeSite` judges only visible matches and fails a state with none. This keeps a hidden element from counting as observed (F2). The other half of F2 is shared testids: each "without an explorer" state first asserts its branch, with `tx-hash` present and `tx-hash-link` absent on the tx page.
- **D8 AddressDisplay forms.** The type-roles seed passes an external `to` (`seedTransaction` gains an optional `to`), so `tx-to-address` reads its address. A control asserts that the smoke observations hold both `address` and `name` readings (the windows spec's check, `type-roles-windows.test.ts:212-218`). `tx-from-address` and `received-to-address` always show the wallet's own account, so they are read as `name`. That becomes a close-out `known-limit` issue, reopened by a state that renders an own account by address.
- **D9 Measurement.** Each step is timed in one local run per browser, at retry 0, on base and head, on the same host. The `performance.now()` stamps stay uncommitted. A1 is judged on CI per-file durations. If a test passes half its timeout on CI, it is split. The timeout is never raised.

## Arc 1: the 51 smoke sites (`Refs #366`)

Every step proves one failure mode. The source guard (`type-role-ban.test.ts`) cannot see a site leave its mono role through a shared module, a bound variant or a runtime class. A component test cannot either, because jsdom computes no font from the CSS modules. The estimates are CI growth on Chrome; Firefox is about 1.6×.

**Stop rule:** a genuine role, hex or cut-figure failure on a newly swept page stops its step. It goes to the orchestrator as an issue, never as a narrowed assertion. A fix that changes a screen is the owner's.

| Step | Sites | Test | Est. |
|---|---|---|---|
| S1 states already rendered: Header on Home, Receive, tx hash link + nonce + user call, Activity row hash, Manage accounts | 7 | seeded, Send/Settings | +2 s |
| S2 seeds before the restart: a tx with a block, an external `to` and a call with `chunkNonce`; a public receipt; a journal record; four authwit rows | 0 | seeded | +1 s |
| S3 explorer on: tx block link, Activity incoming hash, received detail (from, to, tx link, block link), journal recipient link; then the import row written, Home again | 8 | seeded | +6 s |
| S4 token metadata popup, New token popup | 4 | seeded | +4 s |
| S5 explorer None, the branch asserted, then tx, Activity, received and journal again | 6 | seeded | +8 s |
| S6 Developer mode, tx debug toggle: debug hash, chunk nonce | 2 | seeded | +4 s |
| S7 authwits page: `encoded_call` (3), `message_hash`, `intent`, `call` (2) | 7 | seeded | +2 s |
| S8 stale takeover A3, last (from the lock screen the test ends on) | 1 | seeded | +8 s |
| S9 a contact, then Send: suggestion, chosen card, revealed card; Contacts row | 4 | new | +14 s |
| S10 contacts import popup: new row, address change (2) | 3 | new | +4 s |
| S11 unnamed FPC row, Edit FPC (2), New FPC; New sender; Profile id; Export account list | 7 | new | +8 s |
| S12 a hidden account; the Import account preview | 2 | new | +20 s |

The total is about +80 s on Chrome and +130 s on Firefox.

### Phase 1.1 ✓ — ownership, visibility, collector, S1
- Change map: `tests/e2e/fixtures/type-roles.ts` (the D1 predicate, D7 in `observeSite`); `tests/e2e/type-roles.test.ts` (`observed`, the push, S1's states; Manage accounts also waits for `manage-accounts-row`). In the fixture test (`:115`), add a hidden element at a site's selector next to a visible one. Assert that only the visible one is read. Assert that a site with only a hidden match fails `selector`.
- Validation gate:
  - `bun run lint && bun run typecheck:all && bun run test` exits 0.
  - `cd apps/extension && bun run test:e2e -- tests/e2e/type-roles.test.ts --retry=0` passes on Chrome and with `NULO_E2E_BROWSER=firefox`, with 14 sites asserted.
  - D7 touches the network spec's reads. Run `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/type-roles-windows.test.ts` on both browsers, only with load1 < 150. It must stay green.

### Phase 1.2 ✓ — the seeded test (S2–S8)
- Change map:
  - `helpers/activity-seeds.ts`: `seedTransaction` gains optional `block`, `to` and call fields; add an import-row writer.
  - An authwit-row writer beside the type-roles helpers.
  - `scripts/type-roles/identifier-sites.expected.json`: the `call` pair's state (D5).
  - `TxDebugPanel.vue`, `tokens/[id].vue` (D6).
  - `type-roles.test.ts`: S2–S8 as named helper functions in table order, and the D8 control.
- Order: write every explorer-on state before S5 and S5 before S6. Run S8 last.
- Validation gate: Phase 1.1's first two commands. Then run `bun run test:e2e -- tests/e2e/rows.test.ts tests/e2e/send-outcome-rows.test.ts tests/e2e/navigation.test.ts tests/e2e/home-links.test.ts --retry=0` on Chrome. These are the other `seedTransaction` callers, and their defaults are unchanged. All must pass.

### Phase 1.3 — the new test (S9–S12)
- Change map:
  - `type-roles.test.ts`: one `registeredExtensionPerTest` test; the hide flow inlined, as in `accounts.test.ts:117`.
  - `helpers/fpc-seeds.ts`: a row writer with an optional name.
  - `FpcRow.vue` (`data-fpc-unnamed`) and the expected file's FPC selector (D6).
- Steps:
  - Run the native-field check (`expectRoleAt(…, "input-data", true)`) before a recipient is chosen. The card replaces the field.
  - Hold `refuseTestnet` for the whole test, as `contacts-import.test.ts:127` does. Assert its `failures()` is empty at the end.
  - Seed the canonical rows with `seedProtocolFpcs` beside the unnamed row, so `getFpcs` registers nothing (F11). Give the unnamed row a non-protocol address so Edit shows.
- Validation gate: Phase 1.1's first two commands. Then run `tests/e2e/send-keyboard.test.ts --retry=0` on Chrome, since it imports `fpc-seeds.ts`.

### Phase 1.4 — the coverage test and the measurement
- Change map: `type-roles.test.ts` (the final test, D2 and D3).
- Never-happens proof: locally drop one state from a call and see the coverage test name that site's key. Then restore it. The success control is the green run with `live` = 58.
- Validation gate:
  - The file passes three runs in a row per browser at retry 0.
  - The S1–S12 base and head timings (D9) are logged in `lessons/phase-1.md`.
  - A1 is checked on the PR's CI numbers before arc 2.

## Arc 2: the 18 network sites (`Closes #366`; only after A1 and A2)

- 2.1 Existing windows tests (6): the field-parameter state on row 1, its selector qualified by `data-value-kind`, like `ADDRESS_ARGUMENT`; `registerToken` and `createAuthWit`-for-an-intent rows; the connected-app detail after the transaction grant.
- 2.2 New window flows (6): an imported token's transfer (`to`, explicit `from`); a contract-scope grant's detail; the contracts and senders pages after a registration; the Send review sheet.
- 2.3 Landed-tx states (3): a private note (2) and an incoming transfer from an unknown sender.
- 2.4 No path through the generic playground (3): a send's non-zero authwit nonce, a sender of kind `account`, a concrete class scope. Each gets a generic playground control (C13: test infrastructure, a screenshot in the PR).
- 2.5 The network coverage test in `network/type-roles-windows.test.ts`, on D1, D2 and D7.
- Gates: lint, typecheck and test. Then `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/type-roles-windows.test.ts` on Chrome and with `NULO_E2E_BROWSER=firefox`. Run only with load1 < 150, and never two in one worktree.

## Security & Adversarial Considerations

- The change is test-only, plus two `data-testid` attributes and `data-fpc-unnamed`. Permissions, storage shapes and dependencies stay the same; no screen changes.
- The seeds are raw rows in a throwaway e2e profile. Each is shaped as its producer writes it: wire-shaped `0x` plus 64 hex, under the field modulus (lessons.md § Aztec). No secret, key or seed phrase is written or logged.
- The real risk is false coverage evidence. D2 (push after a pass), D6 and D7 close the paths the panel traced. A hand-written `(network)` suffix or `unreachable` entry can still move a site out of smoke coverage. That edit shows in review, and the coverage test logs the counts.
- Supply chain: no new dependency, frozen lockfile.

## UI impact

None. The two testids and `data-fpc-unnamed` change no pixel. No copy, layout or row changes.

## Delivery

- One PR per arc against `dev`, no stack (D-orch-1). Arc 2 branches from `dev` after arc 1's squash merge.
- Titles: `test(e2e): observe the smoke identifier sites and assert their coverage` (70 characters); `test(e2e): observe the network identifier sites and assert their coverage`.
- PR body:
  - What changed and why.
  - Each step's failure mode and measured time on both browsers.
  - Each browser's smoke suite wall-clock before and after (`.claude/skills/e2e-testing/SKILL.md` § Runtime budget).
  - The gates with their outcomes.
  - `Refs #366` (arc 1) or `Closes #366` (arc 2).
- If A1 stops arc 2, arc 1's close-out comments on #366 with the numbers, and #366 stays open.
- `apps/extension/**` trips both the smoke and the network path filters, so no label is needed.

## Post-implementation

Per `implementations-plan/README.md` § Post-implementation standard at 8459699c:
- Step 1 is absent (`code_review: off`).
- Step 2 runs per arc, after the arc's last phase is green and before its PR. Use `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, until a round has no material finding. Stop hard at three rounds. Arc 2's prompt also carries the arc map: "arc 2 of 2; arc 1 landed D1, D2 and D7".
- Step 4, close-out, goes on the last arc's PR, or on arc 1's if A1 stops arc 2. It includes the `## Outcome` block, the D8 `known-limit` issue, the lessons pass, the `git mv` to `archive/` in its own commit, the index line moved to `archive/index.md`, and `STATUS.md` deleted.
- Step 5, teardown after the merge, is `agent-worktree done type-roles-coverage --merged`. Its trigger is `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/type-roles-coverage/plan.md`.

## Audit verdicts and decision ledger

- **Codex** (gpt-6.1-sol, high), round 1: `conditional approve`. Accepted:
  - FPC selector → D6, via the expected file instead of Codex's spec-local remap.
  - The reaped import row → D5, written after the restart.
  - Hidden and shared-testid readings → D7.
  - D3's scope stated.
  - Comparable base and head timings plus explicit A1 → D9 and A1.
  - A2 as an approval boundary.
  - `NULO_E2E_RETRY=0` added on the agent runs.
  - Rejected: per-attempt observation buffers (D2: linear bodies; a failed attempt cannot leave the file green). Pushing after a pass covers the rest.
- **Opus Plan leg**: `conditional approve`. Accepted:
  - The FPC selector, in its expected-file form.
  - The `call` authwit pair moved to smoke (F4, D5).
  - AddressDisplay name readings → D8.
  - A1 judged on CI.
  - S9–S12 in a new per-test test (D4).
  - The stop rule.
  - The `refuseTestnet` decision in Phase 1.3.
  - Logged counts.
  - Per-file coverage settled for arc 2 (A2).
  - Rejected: its claim that no startup step clears an in-flight import (F6 shows the boot sweep does).
- **Codex resume** (verification): `conditional approve (with conditions: make D6's selector exact; prevent protocol discovery in S11)`. Both demonstrated by source trace and met as Codex specified: `data-fpc-unnamed` (its second option; the first, the seed's id, ties the inventory to one test), and `seedProtocolFpcs` with the refusal held for the whole test. It confirmed every other disposition, the `call` pair's move and D8's known limit (own-account displays are `static`).
- **Arc 1 implementation deviations** (evidence in [lessons/phase-1.md](lessons/phase-1.md)):
  - S3's Activity and tx states ride S1's visits, and the import row and New token share one Home visit: no page is opened twice for one state.
  - The seed also writes the scope's arrival row (`seedArrivalRow`). Without one, Activity holds its incoming rows until the chain-tip read gives up, about 60 s under the refused Testnet. The state is a wallet's after any feed read the tip; no timeout was raised.
  - The unlock screen is read after explorer None and Developer mode, where the lock lands in the flow; S8 stays last.
  - D9's base timing restores `type-roles.test.ts` at d738b790 over the head on the same host, rather than a second worktree.

## Seeds

- `/goal` Every arc 1 phase is ✓ in implementations-plan/type-roles-coverage/plan.md. Each ✓ has its gate reported passing in the transcript on Chrome and Firefox. The Codex loop has converged: a resumed pass reports no new material finding, quoted. Arc 1's PR exists on `dev` with the per-step timings. `bun run test` and `bun run lint` exit 0.
- `/loop 15m` Drive arc 1 of implementations-plan/type-roles-coverage per plan.md: reality check, the next phase, its gate, the arc's Codex loop, then the PR. Stop at the PR and report A1's CI numbers.
