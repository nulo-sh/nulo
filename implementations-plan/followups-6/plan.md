---
plan: followups-6
tier: light
status: arc 1 implementing (plan approved by the orchestrator at c1d6377)
issues: "#317 (arc 1), #315 (arc 1)"
not_this_lane: "#316, #310, #294, #290, #262, #277"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 Explore agents (sonnet); one Codex audit (gpt-6.1-sol, high) resumed to a final verdict; one Opus Plan lens beside it (the panel's same-family leg)
base: origin/dev at 58d6cbc
trunk: dev
post_implementation_hardening: not scheduled
---

# followups-6: a hermetic artifact smoke with one declared live spec (#317), a fixed PXE stamp log category (#315)

One arc, one PR against `dev` (no stack: D-orch-1). Nothing a person sees changes: a CI harness mode, one new smoke spec, docs, and one log line.

- **#317.** An artifact smoke run (`NULO_E2E_ARTIFACT_RUN=1`: the nightly's and the release's `smoke-against-artifact` on both browsers) runs under the source-build run's model: behind the egress guard, with the Testnet node answered by the loopback stand-in from the moment each launch settles. One difference stays: a release build seeds the four shipped Testnet tokens, which now end `failed` about 75 s after each profile is created. The live leg moves into one declared spec, `shipped-token-list.test.ts`, which runs only in artifact runs: its one launch sends the Testnet node's host direct, and it asserts that every shipped Testnet seed resolves to its token. Every other outside call, in every launch, is refused and recorded.
- **#315.** The PXE store's version guard logs a stamp it cannot parse as a fixed category, `{ reason: "stamp failed to parse" }`, never the parser's text. The comparison branches keep `detail`.

## Scope

**In:** #317 and #315, one arc.

**Out, with the reason (`no arc`):** #316, #310, #294 and #290 (`owner-decision`: product or release calls); #262 (a product bug in the chain sweep, not this surface); #277 (a product bug: reset and deletion stall with the node unreachable; the stand-in's terminal 400 is what keeps smoke clear of it, in both modes now). Any change under `apps/extension/src`. Stripping the parser's text from the thrown `PxeStoreVersionMismatch` message (OWNER-ASKS OA-1).

**Issue claims checked against the tree (58d6cbc):**

- #317 holds. `global-setup-smoke.ts:72` arms the guard only outside artifact runs; only a guarded launch holds the stand-in (`fixtures/extension.ts:101,151`); an artifact launch blackholes only the price host (`chrome.ts:51`, `firefox.ts:247-248,295`). `send-fee-privacy.test.ts:36` arms its refusal after `registeredExtensionPerTest` registered, so in an artifact run registration and Home's first reads reach the live node.
- Same shape, no verdict dependence: `contacts-import.test.ts` arms its refusal inside `onContacts` (`:78`, via `helpers/contacts.ts:37`) after registration, and its header says the Testnet RPC "is refused throughout" (`:5-6`). Its assertions read nothing the node gives: no sender is ever confirmed (`:8-10`, `:132-134`), failed sender reads become an empty set (`popup/pages/settings/contacts/index.vue:79-86`), and the export's `isSender` is false either way (`:335-342`). Under D1 both specs get the stand-in from settle in both modes; only the header needs correcting.
- The lane brief's "find the spec that is the documented live leg" does not hold: no spec asserts the shipped list. The leg is every artifact profile's seed pass, and a seed that ends `failed` still settles (`rows.test.ts:43-48`). Today it checks nothing; D1 makes it a spec.
- #315 holds as written, and its proposed `{ reason, error: err }` would still carry stored bytes: on the browser path the line reaches `LoggerStore` as `[bindings, data, msg]`, so `trim` projects an `Error` under `error` to `{ name, message }`, and that message quotes the stamp (`DatabaseVersion.fromBuffer` wraps `JSON.parse`).

## Outcome & Quality Bar

**For whom.** The nightly and release pipelines, whose Chrome and Firefox artifact smoke gates a prerelease and a release's assets, and the maintainers who read that verdict. For #315, whoever reads a user's exported log.

**What excellent looks like.**

1. An artifact run is hermetic except for one named spec: every launch but that spec's reaches no outside host, and a new outside call fails the launch, exactly as on a source build. A red in an artifact run is the build, unless it is the live spec, whose failure names the node or the seed.
2. The live spec gives positive evidence: the live node answers it directly (never through the guard), and every shipped Testnet seed ends stored as a token with its expected contract, symbol and decimals. Removing either half of the route exception turns it red, shown once on both browsers.
3. No spec is made green by a skip on failure, a retry or a longer wait.
4. The PXE stamp log line carries a fixed category on the parse branch and the public versions on the comparison branches, pinned one test per branch, the parse pin red on base.

**Good enough.** One spec depends on the live node; nothing else does. No change to the node client, the seeder or any product path.

## Architecture & Implementation

### #317

**Shape.** The source-build run already has the right model: guard plus stand-in. Apply it to artifact runs unchanged, and add the one thing neither mode has: a launch that sends the Testnet node's host direct, used only by the declared live spec.

- `global-setup-smoke.ts`: provide `egressGuard: true` on every smoke run. Provide `liveLeg: boolean`, set from `NULO_E2E_ARTIFACT_RUN === "1"`: whether this run may start the live launch. `assertArmedSmokeBuild` still runs only outside artifact runs (a release dist carries no seed stamp). The setup becomes the harness's one reader of that variable for routing; `backup-migration.test.ts:34` and `passkey-toolbar-panel.test.ts:477` keep their own skips.
- `fixtures/egress-guard.ts`: export `LIVE_NODE_HOST = new URL(TESTNET_RPC_URL).hostname`. Its comment says the exception is the whole host, every scheme and port of dRPC's shared load balancer, opened for the live spec's one launch. `egressFailure` / `closeAfterEgressCheck` take an optional `liveHost`: any attempt recorded for it fails the launch, since a live launch's node request must never reach the guard. `DECLARED_REFUSALS` keeps its `lb.drpc.live` entry for stand-in launches.
- `fixtures/browser/index.ts`: `LaunchOptions["egress"]` becomes `{ guardPort: number; liveHost?: string }`.
- `fixtures/browser/chrome.ts`: `egressGuardArgs(guardPort, liveHost?)` appends `;<liveHost>` to `--proxy-bypass-list` and `, EXCLUDE <liveHost>` to `--host-resolver-rules`. `routingArgs` loses `artifactRun`, the price-host `MAP` and the "cannot be both" throw: once artifact runs are guarded, no launch reaches that branch (`launchBrowser`'s one caller is `fixtures/extension.ts:98`, and the smoke config always runs the smoke setup).
- `fixtures/browser/firefox.ts`: `egressGuardPrefs(guardPort, liveHost?)` adds `if (host === ${JSON.stringify(liveHost)}) return "DIRECT";` before the proxy line. `capabilities` loses `artifactRun`, `PRICE_HOST_BLACKHOLE` and its throw, for the same reason. `failover_direct: false` and `localDomains` stay.
- `fixtures/extension.ts`: `launchExtension` gains `liveNode?: true`. With it: refuse unless `inject("liveLeg")` (a live launch from a PR run would reach the outside), pass `liveHost: LIVE_NODE_HOST`, arm no `holdNode`, and pass `liveHost` to the egress check. Without it: the guarded launch with its stand-in, in both modes, as source runs have today. The unguarded path (network suite, `test:e2e:all`) is unchanged.
- **New spec `shipped-token-list.test.ts`** (smoke, both browsers), in a `describe.skipIf(!inject("liveLeg"))`: its subject exists only in an artifact run (the armed source build seeds an empty list, `_extension-smoke-e2e.yml:106-153`), the same mode scoping `egress-guard.test.ts:137` already uses. One test, one `launchExtension({ liveNode: true })`:
  1. From the background, `POST node_getNodeInfo` to `TESTNET_RPC_URL`; expect `status 200`, with the message "the live Testnet node did not answer: <outcome>". This separates an outage from a seed failure.
     The probe reads the JSON-RPC body too: a `result` object and no `error`, so a 200 that is not a node answer fails it. The probe lives in the spec (the control spec's `backgroundFetch` returns only the status).
  2. `registerProfile(ctx)`, open Home, wait until `tokens-list` carries `data-settled="true"` (it covers every default, shown or not: `TokensView.vue:114-116`) with no `token-seed-row` in a non-terminal status. Budget: the 150 s `rows.test.ts:53` already gives a seed pass.
  3. Expect no `token-seed-row` left: Home caps its rows at `HOME_TOKEN_ROWS = 3` (`src/utils/token-order.ts:12`) but keeps a stopped default past the cap (`home-slots.ts:99-111`), so a failed or rejected seed always shows. Then read the profile's `nulo:core:tokens@*` rows from an extension page (the shape `helpers/activity-seeds.ts:81-86` writes) and expect the Testnet chain's `(contract, symbol, decimals)` tuples to equal those of `seedsForChain(CHAIN_IDS.TESTNET)` (`src/wallet/services/token/default-tokens.ts:53-89`) exactly, multiplicity kept. That binds each shipped contract to its stored token without a DOM attribute; the seeder itself already refused any seed whose class-id pin, symbol, decimals or name bounds did not match the chain (`seeder.ts:550-575`). No balance, price or transaction is read.
  4. `close` fails on an undeclared host, a canary connection, or any guard record for `LIVE_NODE_HOST` (D9).
  5. **Failure naming.** The probe and the seed wait each fail with their own context, never a bare timeout: the probe with "the live Testnet node did not answer: <status or rejection>", the seed wait with each seed's symbol, contract, `data-status` and `token-seed-reason` text. **Time budget:** `{ timeout: 240_000, retry: 0 }`: a launch's settle (up to 30 s), the probe (10 s), `registerProfile` (up to 30 s), the seed wait (150 s), and the reads. It is this new test's contract, not a change to any other wait.
- `egress-guard.test.ts` (the control spec) now runs in both modes unchanged: its stand-in test holds wherever the launch holds a stand-in, which is every launch but the live spec's.
- `contacts-import.test.ts:5-6`: the header says what is true in both modes (the launch's stand-in answers the node until the Contacts page arms the refusal). `send-fee-privacy.test.ts` is unchanged: the launch holds the node from settle, so its premise ("nothing readable") holds through registration in both modes.
- Docs in the same PR: `tests/e2e/README.md` (§ default-token seeding `:59`, § Egress guard `:71-94`: the live spec replaces "each artifact profile seeds through dRPC"; an artifact profile shows the four shipped seeds pending, then `failed`, where a source profile shows none; the exception is URL routing for HTTP(S) and WebSocket, not a packet-level boundary), `tests/e2e/FIREFOX.md:69`, `.claude/skills/e2e-testing/SKILL.md` (`:155-167`, the `NULO_E2E_ARTIFACT_RUN` row `:190`, the recipe `:698-702`).

**Control flow of an artifact run after the change.** Setup provides `egressGuard: true`, `liveLeg: true`. Every launch but one: guard and canary, every outside host to the guard, the stand-in from settle; the production bundle's seed pass meets the stand-in's 400, retries twice (15 s, then 60 s, `seeder.ts:24-28`) and ends `failed`; `close` fails on an undeclared host. The live spec's launch: guard and canary, `LIVE_NODE_HOST` direct, no stand-in; the seed pass reaches the live node; `close` also fails on any guard record for that host.

**Alternatives not taken.**

- **A. Guard every artifact launch with the node live (the draft's design; the Opus lens's pick).** Keeps today's resolved seeds in every spec, and `contacts-import` and the control spec almost untouched. Not taken: every artifact verdict still depends on the live node, which is the cause #317's Impact names; the specs whose premise is a dead node would have to hold the node themselves, and the harness allows one interception per origin (chain-endpoints D24), so `send-fee-privacy` would either register under a refused node (the roughly 6 s retry per call that made chain-endpoints adopt the stand-in, its D23, and that e2e-followups-4 rejected for the same reason) or swap a stub for a refusal with a live gap between; and the live leg would still assert nothing. A stays the fallback under Phase 2's stop rule.
- **Each spec holds the node itself (the issue's wording).** Under D1 the launch holds it in both modes, so the fee-picker's own hold (#318) stays the one spec-level hold, kept because it needs the node held before the profile on a fresh launch, as today.
- **The guard tunnels the live host.** Breaks the module's invariant that it never opens an outbound connection (`egress-guard.ts:6-8`).
- **Drivers keep reading `NULO_E2E_ARTIFACT_RUN`.** Routing would be decided in three places; the setup decides, and the launch option carries the data.
- **A general `direct: string[]`.** One host has a reason to be live.

### #315

- `packages/aztec-runtime/src/pxe/opfs-store.ts` `initStoreVersionStamp`: the parse branch logs `{ reason: "stamp failed to parse" }`; the comparison branches keep `{ detail }`. The thrown `PxeStoreVersionMismatch` message is unchanged (D6, OA-1).
- `packages/aztec-runtime/src/pxe/opfs-store.test.ts`: a spy `Logger` (its `warn` a `vi.fn()`) replaces `nullLog` in the three mismatch tests; each pins the exact payload. Parse: `[[MESSAGE, { reason: "stamp failed to parse" }]]` (red on base, which logs `{ detail: "stamp failed to parse (Failed to deserialize …)" }`). Comparison branches (success controls, green on base): `{ detail }` strings built from `PXE_DATA_SCHEMA_VERSION_PIN` and the two rollup addresses, never literals, so a pin bump does not red them. The parse test also asserts the thrown message still names the parse failure.

**Why a fixed category.** On the browser path Aztec's `Logger.warn(msg, data)` reaches the console as `[bindings, data, msg]` (pino's browser build reads `browser.formatters`, which Aztec leaves unset: `pino@9.14.0/browser.js:113`), and `LoggerStore` runs `trim` over it, so `{ error: err }` would be projected to `{ name, message }`, and that message quotes the stored stamp. The codebase's rule for an error whose message quotes stored input is a fixed category (#301's migration lines; `implementations-plan/lessons.md`, "An error message carries text the log redactor never sees").

**Why a spy, not `loggedAfter`.** `loggedAfter` reads `LoggerStore`'s buffer in the extension; this module's test cannot import the extension (layer rule), and under `bun --bun vitest` Aztec's pino takes its Node path. The spy pins the payload this module hands its injected `Logger`, which is what becomes `data[1]` in the browser.

**Alternative not taken.** Delete the `warn` and rely on `PxeService.logOpFailure`: not every `createChainRuntime` caller is shown to pass through it, and the store's line names its own decision (refuse, preserve) at the source.

## Decision ledger

| # | Decision | Chosen | Rejected | Who argued what |
|---|---|---|---|---|
| D1 | Artifact-run egress | B: guard and stand-in in every artifact launch; one declared live spec sends the node host direct and asserts the shipped seeds resolve | A (guard, node live in every launch); unguarded as today | Codex: B (A leaves #317's cause; the leg asserts nothing). Opus: A (keep the design; the issue says keep the leg). Planner: B, since the stand-in IS the existing design, B keeps the leg as a spec, and A cannot fix `send-fee-privacy` without a slow refused registration or a live gap (D24). Round 2: Codex holds B; Opus accepts B ("I picked the wrong existing design") |
| D2 | Where the mode is decided | the smoke setup (`liveLeg`); drivers take `liveHost` data | drivers read the env var | both legs: keep |
| D3 | The artifact price blackhole and the "cannot be both" throws | deleted with their unit pins | kept | both legs: correct |
| D4 | `send-fee-privacy` | unchanged | refusal before registration; stub then refusal | moot under D1 |
| D5 | `contacts-import` | header corrected | refusal moved before registration | both legs: change to the header (I3 refuted) |
| D6 | `PxeStoreVersionMismatch` message | unchanged; OA-1 asks the owner | strip the parser's text | both legs: keep; it reaches `NewTokenPopup` (`token/service.ts:587,636-638` → `extension-messaging/src/core/error-response.ts:29-34` → `NewTokenPopup.vue:256,332-336`) |
| D7 | #315 log payload | `{ reason: "stamp failed to parse" }` | `{ reason, error: err }` | both legs: keep, on the stored-bytes rationale |
| D8 | #315 test shape | spy `Logger`, exact payload per branch, PIN-derived strings | `loggedAfter` / `data[1]` | both legs: keep |
| D9 | Live launch's guard record for the node host | fails that launch only | silently declared; failing every launch | Codex round 1 finding 4 and round 2 finding 3, Opus round 1 finding 4 |
| D10 | Live spec's identity check | stored token rows' `(contract, symbol, decimals)` equal the shipped seeds', after Home settles with no seed row | Home's `token-symbol` set (capped at 3); Holdings with its fold opened | Codex round 2 findings 1-2, Opus round 2 finding 1: storage binds the contract without a `src` change |
| D11 | Where the live spec's node probe runs (deviation from § #317 step 1) | an extension scratch page, awaited | the background with the control spec's storage relay | implementer: routing is per browser, so the page proves the same direct route, and it returns the JSON-RPC body on both browsers without duplicating `backgroundFetch`; Phase 3's removals red it on both browsers |
| D-orch-1 | Delivery shape | one PR against `dev`, no stack | a `gh stack` of one | orchestrator |
| D-orch-2 | OA-1 (the popup's store error quotes the stored stamp) | ships unchanged; at close-out one `owner-decision` issue (`ux` + `owner-decision`, both options and the recommendation from OWNER-ASKS) is filed and listed on the Outcome's `Open items:` line | deciding it in this lane | orchestrator: a screen's copy is the owner's call |
| D-orch-3 | OA-2 (a live outage and the nightly and release gate) | decided, not asked: the live spec gates the nightly and the release like every smoke spec; a named node outage is a rerun | the live spec reported but not gating | orchestrator, on the plan's recommendation |
| D-orch-4 | Phase 2's stop rule | stands exactly as written: more than two specs needing a change, or any change that drops coverage, stops the arc for a re-plan; never a loosened or skipped assertion, retry, timer wait or `skipIf` | relaxing it | orchestrator |
| D-orch-5 | Workflows | never dispatch or re-run `nightly.yml`, `release*.yml` or `publish-*.yml`; the next scheduled nightly after the merge confirms #317; a workflow edit moves its pins in the same commit and runs `lint:actions` | a dispatched confirmation run | orchestrator |
| D-orch-6 | What a person sees | unchanged: #315 changes one `warn` payload, the thrown message stays (OA-1); no other `apps/extension/src` or `packages/*/src` change | — | orchestrator |
| D-orch-7 | `lessons.md` | at its 8 KiB budget: promote nothing unless a retirement pays for it; merge `origin/dev` and read `index.md` and `lessons.md` before the final gates; never a union merge | — | orchestrator |

## Audit record

### Round 1 (on draft v1, design A)

**Codex** (gpt-6.1-sol, high, read-only; session `01a12de2`): **reject (with blocking findings: false logger Fact 8, an insufficient live-route control, and a globally scoped live dependency)**.

| # | Finding | Disposition |
|---|---|---|
| 1 | High. Fact 8 false: pino's browser build reads `browser.formatters`, so the line reaches the console as `[bindings, data, msg]` and an `Error` survives to `trim` | Accepted, verified at `pino@9.14.0/browser.js:113`. Fact 8, § #315 and recon corrected; D7 kept on the stored-bytes rationale alone |
| 2 | High. A leaves #317's cause (every spec on the live node); choose B with one live spec asserting each shipped seed's contract, symbol and successful terminal state | Accepted: D1 is B. Symbols and `seeded` status are asserted; the card exposes no contract attribute, and adding one would change `apps/extension/src`, so the contract is covered by the seeder's own `expectedSymbol` check against the chain |
| 3 | High. Unchanged guard counts and zero canary connections cannot prove a direct route (a DNS failure or a missing `EXCLUDE` also pass); require positive evidence and show that removing each half reds the control | Accepted: the live spec's `status 200` node probe and resolved seeds, plus Phase 3 step 3's three removals |
| 4 | Medium. A live launch's node request that reaches the guard is silently declared | Accepted: D9 |
| 5 | Medium. The exception covers the host on every scheme and port; the guard measures URL routing, not packets | Accepted: `LIVE_NODE_HOST`'s comment, the README wording, § Security |
| 6 | Medium. I3 does not establish a contacts verdict dependency | Accepted: D5 is a header correction |
| 7 | Medium. I4's evidence is a refused local RPC during backup import, not `registerProfile` under a refused Testnet | Accepted; moot under B (no spec registers under a refusal) |
| 8 | Medium. A1 is architectural; surface "should an outage withhold release assets" to the owner; the thrown-message screen path is real (`NewTokenPopup`) | Accepted: the live spec ships in this lane; OA-2; D6's trace recorded |
| 9 | Low. The unit test runs on Bun, not Node; Phase 4's print is valid only after the guard stops | Accepted: § #315 wording; Phase 2 step 5 prints after the guard stop |

**Opus Plan lens** (Opus 5.5): **conditional approve (with conditions: in artifact mode the live-route control must prove the node answers directly and that no stand-in is held; pin that `send-fee-privacy` arms before registration; D5 takes its fallback; Phase 4 requires zero guard records for the live host)**. It kept D1 as A.

| # | Finding | Disposition |
|---|---|---|
| 1 | High. The live-route control passes while the leg is broken (a resolver miss rejects; a stand-in still armed answers 400) | Accepted, folded into the live spec (`status 200`, no stand-in on its launch) and Phase 3's removals |
| 2 | Medium. Nothing pins D4's order; chain-endpoints D2 was revised by D23, and e2e-followups-4 rejected a refusal before registration (6 s retries) | Accepted as evidence against A; D4 is moot under B |
| 3 | Medium. I3 refuted: D5 should correct the header | Accepted |
| 4 | Low. Require zero guard records for the live host | Accepted: D9, Phase 4's gate |
| 5 | Low. Whole-host exception; quote the host with `JSON.stringify` in the PAC | Accepted |
| 6 | Low. D6 untraced; keep and ask the owner | Accepted: traced (Codex 8), OA-1 |
| 7 | Low. Derive the comparison strings from `PXE_DATA_SCHEMA_VERSION_PIN` | Accepted |
| — | Facts: contacts arms at `:78`, not `:70`; the test runs on Bun; Phase 3 expected `hits()` from contacts, which checks only `failures()` | Accepted; the last is moot (contacts keeps its behaviour) |
| — | D7 "checked: `for…in` turns an `Error` into `{}`" | Rejected: that formatter path is not the browser build's (Codex 1, verified) |
| — | D1: keep A (keep the existing design; the issue says keep the leg; B's gain belongs to a follow-up) | Rejected: the existing design is the stand-in, which B applies; B keeps the leg as an asserting spec; A cannot fix `send-fee-privacy` without a slow refused registration or a live gap (one interception per origin, chain-endpoints D24) |

### Round 2 (on v2, design B)

**Codex** (resumed, session `01a12de2`): **reject (with blocking findings: Home cannot expose all four successfully seeded tokens)**. Holds B (high confidence architecturally, moderate on suite compatibility until Phase 2 runs).

| # | Finding | Disposition |
|---|---|---|
| 1 | High. Home caps rows at 3; the four-symbol check on Home can never pass | Accepted, verified (`token-order.ts:12`, `home-slots.ts:99-111`): D10 |
| 2 | Medium. Contracts need no product change: assert the stored `nulo:core:tokens@*` tuples; describe the seeder's checks accurately | Accepted: D10; the class-id, decimals and name checks named (`seeder.ts:550-575`) |
| 3 | Medium. Phase 4's "no guard record for the live host" contradicts ordinary launches, which record early node requests before the stand-in | Accepted: the live launch only |
| 4 | Medium. The stop rule could license dropping coverage | Accepted: Phase 2 step 6 keeps scenario and assertion strength and stops if a fix would drop either |
| 5 | Medium. Declare the new test's whole time budget (the default is 60 s) | Accepted: `{ timeout: 240_000, retry: 0 }` with its parts; Fact 11 |
| 6 | Medium. Name failures explicitly; a 200 is not a node answer | Accepted: the probe checks the JSON-RPC `result`; both waits fail with their own context |

**Opus Plan lens** (resumed): **conditional approve (with conditions: the live spec reads all four seeds, from Holdings with its fold opened or from stored rows; Phase 2 reads through the specs that look at Home's token area without a settled wait)**. Accepts B ("I picked the wrong existing design ... the cause of #317 is that the two run modes differ"); withdraws its round-1 D7 check after verifying `browser.js:113`.

| # | Finding | Disposition |
|---|---|---|
| 1 | High. The symbol check on Home cannot pass (cap 3; Holdings folds empty balances) | Accepted: D10 (stored rows; Holdings not needed) |
| 2 | Medium. One run cannot catch a timing dependence on the 15-75 s seed window | Accepted: Phase 2 step 4's read-through |
| 3 | Low. The docs overstate how close the modes are | Accepted: the summary and the README wording name the four seed rows |

### Round 3 (on v3) and the final verdicts

**Codex** (resumed, session `01a12de2`): **approve**. New material findings: none.

**Opus Plan lens:** its round-2 verdict stands, **conditional approve**; both conditions are met in v3 (D10 reads stored rows; Phase 2 step 4 reads the Home specs through). Not re-run.

**Disputes left open:** none. D1 began as a split (Codex B, Opus A) and closed in round 2 with both legs on B.

### Post-implementation (arc 1)

**Codex** (gpt-6.1-sol, high, read-only; session `01a12e3c`, default `~/.codex` login), round 1 on `58d6cbc..1e8f648`: **approve**, two low findings.

| # | Finding | Disposition |
|---|---|---|
| 1 | Low. `shipped-token-list.test.ts`'s seed wait caught every rejection, relabelling a frame detach as a seed timeout, and a failing diagnostic replaced the original error | Accepted: the wait goes through `withTimeoutMessage` |
| 2 | Low. Two comments above the row reader and `storedTestnetTokens` restated their names | Accepted: deleted |

**Opus review** (Opus 5.5, `general-purpose`, read-only), beside round 1: **no correctness bugs**, three low findings.

| # | Finding | Disposition |
|---|---|---|
| 1 | Low. Comments the change made false: `rows.test.ts:50-52,82`, `home-links.test.ts:15,38` said the default tokens land from the live network | Accepted: they now say the launch's stand-in fails them after the seeder's retry waits, and lands none |
| 2 | Low. A default that fails after its import was journaled is drawn as `token-import-row` (`home-slots.ts:77`), so the "never became tokens" check missed it by name (the stored-tuple check still reds) | Accepted: the reader reads seed rows and import rows |
| 3 | Nit. `opfs-store.ts`'s comment said "those bytes", pointing at the line above | Accepted: "the stored stamp" |

Fix commit 06755d0; the live spec green once per browser after it.

**Codex round 2** (resumed) on `1e8f648..06755d0`: **approve**, "No new material findings", high confidence. The loop converged in two rounds.

## Security & Adversarial Considerations

- **Threat model.** CI harness code: no secret, no product path. The risk is a false gate: an artifact run that looks hermetic but is not, or a live route wider or narrower than intended. The live route is one exact hostname for one launch; Chrome's bypass and resolver rules match it exactly (no subdomains, no IP literals), Firefox's PAC compares with `===`. Both match the host on every scheme and port: the comment and the README say so. The canary still proves the guard route on every launch, the live spec proves the live route by a direct answer, and a guard record for the live host fails that launch.
- **Scope of the boundary.** The guard and the canary see HTTP(S) and WebSocket requests routed by URL; they do not see DNS prefetch or other UDP. The docs say "reaches no outside host by URL", not packet-level isolation.
- **Least privilege.** No workflow, token or permission change; no `.github/` file changes.
- **Egress.** An artifact run reaches `lb.drpc.live` from one launch instead of every launch, and nothing else outside.
- **Input validation.** #315 is a trust boundary: the stamp is stored data, possibly corrupt or hostile. The log line stops carrying it; the store is still refused and never wiped.
- **Log redaction.** #315 removes stored bytes from a `warn` line every user's log viewer keeps and exports. The thrown message still carries them into `logOpFailure`'s projected `error` line, capped at 200 characters (OA-1).
- **Supply chain / crypto.** No dependency change; no cryptography touched.

## Assumptions

**Facts.**

1. `global-setup-smoke.ts:72-75` arms the guard only outside artifact runs.
2. `fixtures/extension.ts:101` takes the guarded path when `guardArmed(inject("egressGuard"))`; `:151` arms `holdNodeStub` for `TESTNET_RPC_URL`; `launchBrowser`'s one caller is `:98`.
3. `chrome.ts:36-52` and `firefox.ts:247-303` route a guarded launch to the guard and an artifact launch around the price host only, and throw on both; `scripts/e2e/chrome-driver.test.ts:18-21` and `firefox-driver.test.ts:51-54` pin the throw.
4. Only `nightly.yml:341,429` and `release.yml:395,406` reach artifact mode, through `_extension-smoke-e2e.yml:62`; `test:e2e:all` uses `global-setup.ts`, which provides no `egressGuard`.
5. One interception per browser and origin: a spec's `interceptRpc` on an origin the launch holds suspends the launch's hold until `stop()` (`standing-interception.ts:113-115`; chain-endpoints D24).
6. The seeder retries a failed seed after 15 s and 60 s and stops at three attempts (`seeder.ts:24-28`); `rows.test.ts:50-53` already budgets 150 s for a node that fails.
7. `DatabaseVersion.fromBuffer` throws `Failed to deserialize version information: ${err}` around `JSON.parse` (stdlib 6.0.0-rc.1); the message quotes the input (measured).
8. In the browser, Aztec's `Logger.warn(msg, data)` reaches the console as `[bindings, data, msg]` with `data` intact (`pino-logger.js:52,263-268`; `pino@9.14.0/browser.js:113,327-328`), and the offscreen console sniffer forwards it to `LoggerStore`, which runs `trim`.
9. A dApp never sees the thrown message (`error-envelope.ts:194-210`); a popup can (D6's trace).
10. `TokenSeedRow.vue:30-31,39,46` renders `token-seed-row` with `data-status`, `token-seed-reason` and, once failed, `token-seed-retry`; Home caps rows at `HOME_TOKEN_ROWS = 3` (`token-order.ts:12`) and keeps a stopped default past the cap (`home-slots.ts:99-111`); token rows are stored as `nulo:core:tokens@<id>` with profile, chain and contract (`helpers/activity-seeds.ts:81-86`).
11. `vitest.e2e.config.ts:19` sets a 60 s default test timeout.

**Inferences (attack these).**

- **I1.** Chrome honours a hostname after `<-loopback>;localhost;127.0.0.1;[::1]` in `--proxy-bypass-list` and resolves it with `EXCLUDE <host>` after `MAP * ~NOTFOUND`; Firefox's PAC `DIRECT` for one host with `failover_direct: false` resolves it normally. Phase 3 proves it on both browsers by the live spec's direct answer, and once by removing each half (Chrome's bypass, Chrome's `EXCLUDE`, Firefox's PAC line) and seeing the spec red.
- **I2.** The production bundle under the stand-in calls no outside host beyond the price host and each browser's declared own hosts. Phase 2 measures it.
- **I3.** The only state the stand-in adds to an artifact launch that a guarded source launch lacks is the four shipped seeds pending, then `failed` with a retry button, about 75 s after each profile is created. Specs that read Home's token list, its Tab order or its layout may see either end of that window. Phase 2 reads them through and measures, under the stop rule.

**Asks (working assumption in force).**

- **A1** (OWNER-ASKS OA-2). Today a live-node outage can red the artifact smoke through any spec; after this change only through the live spec, which gates the nightly and the release like every smoke spec. Working assumption: keep it gating.
- **A2** (OWNER-ASKS OA-1). Should the thrown store error, which a popup can show, drop the parser's quoted text? Working assumption: unchanged.

## UI impact

None. #317 changes e2e fixtures, one spec header, one new spec and docs. #315 changes one log line's payload in `packages/aztec-runtime` and leaves the thrown message, which screens can show, as it is (OA-1). No file under `apps/extension/src` changes. Orchestrator record: "Nothing a person sees changes: a CI harness mode and one log line."

## Phases

Every phase lists its assumptions: Phase 0 Facts 1-4; Phase 1 Facts 7-9, D6-D8; Phase 2 Facts 1-6 and 10, I2, I3, D1-D3, D5; Phase 3 Facts 5, 10, 11, I1, D9, D10; Phase 4 I2, I3.

Scratch, builds and copies live under `~/.cache/nulo-backlog/followups-6/`, never `/tmp`. Run smoke from `apps/extension` with `bun run test:e2e -- … --retry=0`; a guarded launch claims its loopback ports in `~/.agents/ports.md` itself (`agent.sh` runs the network suite only). One smoke run per `EXTENSION_PATH` at a time; never raise the stall watchdog or a timeout.

A **release-shaped copy** is built with no `VITE_*` variable and no `.env*` file (`bun run --cwd apps/extension build:chrome` or `build:firefox`), then `dist/<browser>` is copied to a path under the scratch root that prefixes no other run's `EXTENSION_PATH`. An **artifact run** is `NULO_E2E_ARTIFACT_RUN=1 EXTENSION_PATH=<copy> bun run test:e2e -- --retry=0` (add `NULO_E2E_BROWSER=firefox` for Firefox). An **armed run** first builds `ARMED_BUILD` (`global-setup-smoke.ts:35`), then runs `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --retry=0`.

### Phase 0: baseline (before) ✓

1. Build release-shaped copies of the base for Chrome and Firefox.
2. Run the whole suite as an artifact run on each.
3. Record each run's file and test tally, duration and every red in `lessons/phase-0.md`. Rerun a red once alone at retry 0 to classify it and record both runs; a red does not block the lane.

**Validation gate.** Pass: both runs completed and recorded. Layers: smoke e2e, artifact mode, both browsers.

### Phase 1: #315, a fixed category for an unparseable stamp ✓

1. Edit `initStoreVersionStamp` per § #315.
2. Edit the three mismatch tests per § #315. Run the parse pin against the base source first, see it red, and record the red line in `lessons/phase-1.md`.

**Validation gate.** `bun run --cwd packages/aztec-runtime test`, `bun run lint`, `bun run typecheck:all`, `bun run test`. Pass: exit 0 everywhere; the parse pin red on base and green after; both comparison pins green on base and after. Layers: lint, typecheck, unit.

### Phase 2: #317, every artifact launch guarded with the stand-in ✓

1. Edit `global-setup-smoke.ts`, `fixtures/egress-guard.ts`, `fixtures/browser/index.ts`, `chrome.ts`, `firefox.ts`, `fixtures/extension.ts` per § #317 (the `liveNode` launch included; no spec uses it yet).
2. Edit the unit pins: `scripts/e2e/chrome-driver.test.ts` (with a live host: it bypasses the guard and is excluded from the resolver map, and no other outside host is; without one: today's guarded args) and `scripts/e2e/firefox-driver.test.ts` (the PAC evaluated: the live host `DIRECT`, any other outside host to the guard, loopback `DIRECT`; prefs still outside `FIREFOX_LAUNCH_PREFS`); `scripts/e2e/egress-guard.test.ts` (a guard record for the live host fails the close; without a live host it stays declared). Remove the pins of the deleted branches.
3. Correct `contacts-import.test.ts:5-6`.
4. Read through every smoke spec that opens Home and looks at its token area (Tab order, layout, rows) without first waiting for `data-settled`, for example `tooltips-glossary.test.ts:140-143`. For each, write in `lessons/phase-2.md` what it sees in the window from 15 s to 75 s after registration (pending seed skeletons, then failed rows with `token-seed-retry`), and whether its assertions hold at both ends. A run that happens to land before 75 s does not prove a spec.
5. Measure the new state. Add a local, uncommitted print of `guard.attempts()` after each guarded close's guard stop. Run the whole suite as an artifact run on fresh release-shaped copies, Chrome then Firefox. Write the per-host tally (host, port, count, launches) and every red to `lessons/phase-2.md`, then drop the print.
6. **Stop rule (I3).** A spec that steps 4 or 5 show depends on the seed outcome keeps its scenario and the strength of its assertions. Correct only an incidental fixture assumption (for example, wait for `data-settled` before measuring Home, as `rows.test.ts` does), never by a skip, a retry, a longer wait or a dropped assertion. Stop and report to the orchestrator if a fix would drop what the spec proves, if more than two specs need one, if one needs a product change, or if a host is not declared; the panel then weighs A again.

**Validation gate.** `bun run --cwd apps/extension test`, `bun run lint`, `bun run typecheck:all`, then step 5's runs. Pass: exit 0; both artifact runs green on their first run after any stop-rule fix; no undeclared host and no canary hit; the control spec ran (not skipped) in both. Layers: lint, typecheck, unit, smoke e2e (artifact mode, both browsers).

### Phase 3: #317, the declared live spec ✓

1. Write `shipped-token-list.test.ts` per § #317.
2. Run it five times as an artifact run on Chrome and twice on Firefox, each on a fresh release-shaped copy. Run it once as an armed run per browser and see it skipped.
3. Prove the route both ways: locally and uncommitted, remove Chrome's bypass entry, then Chrome's `EXCLUDE`, then Firefox's PAC line, one at a time; run the spec once each and see it red at its node probe or its close. Record the three reds in `lessons/phase-3.md` and restore the code.

**Validation gate.** `bun run lint`, `bun run typecheck:all`, plus steps 2 and 3. Pass: every artifact run green on its first attempt; every armed run skipped it; each of the three removals red. Layers: lint, typecheck, smoke e2e (both modes, both browsers).

### Phase 4: proof (after) ✓

1. Rebuild release-shaped copies at the final head and run the whole suite as an artifact run on Chrome and Firefox; rebuild the armed dist and run the whole suite as an armed run on both browsers.
2. `bun run test:all`, `bun run test:ci-gating`, `bun run lint`, `bun run typecheck:all`.

**Validation gate.** Pass: all four whole-suite runs green on their first run, compared file by file with Phase 0's tally in `lessons/phase-4.md` (the live spec added; the duration change stated); no undeclared host, no canary hit, no guard record for `LIVE_NODE_HOST` in the live spec's launch (ordinary launches may record early node requests from before their stand-in is held, a declared refusal); every command in step 2 exits 0. A red in a file this lane does not touch: rerun that file once at retry 0 to classify it, record both runs, file or extend an issue (deduped), and report the gate failed; the arc does not deliver on a failed gate. Layers: lint, typecheck, unit, CI gating, smoke e2e (both modes, both browsers).

## Delivery

| Arc | Phases | Stacks on | `/code-review` | PR |
|---|---|---|---|---|
| arc 1 | 0-4, then the close-out commits | `dev` | off | `fix: run the artifact smoke hermetic with one live spec; log a fixed pxe stamp category` (87 chars) |

Single arc: one branch (`worktree-followups-6`), one PR opened with plain `gh pr create --base dev`, only after Phase 4's gate passes and the Codex fix loop converges. Open it without labels; once its checks start, add `e2e:extension-smoke` only if the smoke lanes skipped. The body says what changed and why, the validation runs with outcomes, and `Closes #317`, `Closes #315`. The close-out lands as the PR's final commits. Merging is the orchestrator's call.

## Post-implementation

1. **Codex audit** (`~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, prompt file under `~/.cache/nulo-backlog/followups-6/`): the net diff from 58d6cbc, this plan with its decision ledger, the adversarial ask ("What could go wrong? What would an attacker target? What are we trusting that we shouldn't? Could any launch but the live spec's reach an outside host, or the live spec pass without a direct answer?"), and these two rules verbatim:
   - *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*
   - *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*
2. **Fix loop.** Check each finding against the tree first. Apply the accepted fixes, rerun the gate of the phase each touches, commit, log the round (consult and verdict) in `lessons/phase-4.md`, then resume the same session (`resume-codex.sh <session> <followup> <codex-dir> high`) with the fix diff and the same two rules. Repeat until a round yields no new material finding. Still material after three rounds: stop and report to the orchestrator.
3. **Delivery** per the Delivery section: the first time any PR exists.
4. **Close-out**, as the PR's final commits:
   1. An `## Outcome` block directly after the front matter: date, status, what shipped with the PR number, the dispositions (A, the deleted blackhole, D6), `Open items:` with issue numbers or `none`, and a line retiring the seeds below.
   2. Lessons: `implementations-plan/lessons.md` is at its 8 KiB budget. Promote a gotcha only if an entry it supersedes or a stale one is retired in the same edit.
   3. Open items: file each per this table, deduped first (`gh issue list --state all --search "<words>"`), five sections (`## What happens`, `## Where`, `## Impact`, `## Possible fix`, `## Record`). OA-1 and OA-2 stay in OWNER-ASKS for the orchestrator; an answer that leaves work becomes an issue.

      | Situation | Home |
      |---|---|
      | Work inside the implementation you are on | the active `plan.md` and the PR |
      | Actionable work that outlives the plan | a GitHub issue, with a domain label and a `Record` link to the archived plan |
      | Needs a product call, or waits outside the repo | an issue labelled `owner-decision` or `blocked:external` |
      | A suspected exploitable weakness | a private draft security advisory; the plan says only "tracked privately: GHSA-…" |
      | Rejected, superseded or already done | a disposition line in the Outcome block |
      | Knowledge that prevents a repeat | `implementations-plan/lessons.md` (8 KiB budget) |
      | A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` |
      | Accepted code work that blocks launch | the `v1.0.0` milestone |

   4. Before the archive commit, merge `origin/dev` into the branch and read what changed in `implementations-plan/index.md` and `lessons.md`; never a union merge.
   5. `git mv implementations-plan/followups-6 implementations-plan/archive/followups-6` in its own commit; repair links the extra level breaks (`git grep -n followups-6`); move the index line to `implementations-plan/archive/index.md`; delete `STATUS.md`; run `bun run check:plans` on the staged files.
   6. Comment on any issue whose fix was left out or did not hold, with the reason; it stays open.
5. **Report and wait.** The orchestrator merges.
6. **Teardown after the merge** (standing authorization, no ask): once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/followups-6/plan.md` succeeds, run `agent-worktree done followups-6 --merged --trunk dev` (this session did not enter through `EnterWorktree`, so there is nothing to exit). On a refusal, relay its output and stop. A `/loop` session checks this on every firing; a `/goal` session arms one background wait after its wrap-up report: `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/followups-6/plan.md; do sleep 300; done`.

## Seeds (draft; not run, orchestrator-owned)

Recommended: `/goal`.

```
/goal All phases marked ✓ in implementations-plan/followups-6/plan.md, each backed by its validation gate reported passing in the transcript; LESSONS_FILE=implementations-plan/followups-6/lessons/phase-N.md printed for each phase; /code-review NOT run (code_review: off); the Codex fix loop (gpt-6.1-sol, high) converged on the whole diff, evidenced by a resumed pass reporting no new material findings, quoted; one PR against dev exists, opened only after that (gh pr view output in the transcript), its final commits the close-out with the archive move (git show --stat in the transcript); bun run test:all and bun run lint both exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/followups-6 forward per its plan.md (authoritative, with lessons/), judging each step against its Outcome & Quality Bar. If implementations-plan/followups-6 is gone: when git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/followups-6/plan.md succeeds, run agent-worktree done followups-6 --merged --trunk dev, report its output (never force past a refusal), clear this loop and stop; otherwise babysit the PR's checks only. Else: pick the next pending step, run the fast layers (bun run lint, bun run typecheck:all, the touched workspace's tests) after each edit, commit, and mark a phase ✓ only when its gate passes. Phase 2's stop rule is a hard stop. Stuck or facing a decision: consult Codex (run-codex.sh … high read-only gpt-6.1-sol), log it in lessons/, act; never raise a timeout, add a retry or skip a spec. All phases ✓: the Codex fix loop until clean (hard stop at 3 rounds), then gh pr create --base dev, the close-out commits, gh pr checks --watch, report and stop. Never merge, push to main or touch repository settings.
```
