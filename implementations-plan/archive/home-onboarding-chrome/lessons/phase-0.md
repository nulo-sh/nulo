# Phase 0: planning log

Every consult and attempt during planning, in order. Paths are repo-relative unless they name another repo.

## Recon (2026-10-13)

- Three Explore agents (sonnet), one per area: History and Home (#130, #132); onboarding theme, routes, own windows (#133, #135, #149); manifest, Presto, store captures (#156, #170). Their findings, re-checked by hand at `36c43155`, are in `recon.md`.
- `gh issue view N` printed nothing in this shell; `GH_PAGER=cat gh issue view N --repo nulo-sh/nulo --json title,body,comments` with `jq` worked.
- Line drift: #130's link is at `RecentActivityView.vue:773` (issue says `:765`); #132's rule at `:858-861` (issue says `:850-853`). Both issues were written before #344 merged.
- P13-01's build note names `journalRecordInScope` as the token check; it has none (`activity-rows.ts:94-101`). The token page's three checks are inline (`RecentActivityView.vue:78-80, 296-300`; `recent-activity-rows.ts:59`).

## #156: why the loopback request fails on Firefox (inference, not proven)

- Presto's server answers every origin: `CorsLayer` with `allow_origin(Any)` (presto repo, `packages/presto/core/src/server.rs:383-393`). So CORS is not what blocks an extension page without the host permission.
- Presto's platform notes say Firefox 153 enables Local Network Access by default and the SDK reports a denial as `permission-blocked` (presto repo, `docs/PLATFORM_SUPPORT.md:76-78`). Whether LNA treats an extension page without the host permission like a web page is I3; Phase 2.1 measures reachability before and after the grant.
- The wallet's content script matches `*://*/*` (`manifest.config.ts:38`), and on Firefox that pattern is a host permission (`tests/e2e/FIREFOX.md:50`). So a person who left all-sites access on has the loopback origins too. The probe must revoke both, or `contains` stays true and the probe proves nothing (Opus r1, finding 8).

## MDN reads (2026-10-13)

- `manifest.json/host_permissions`: from Firefox 127 the install prompt shows host permissions; an update that adds host permissions does not prompt; the user can revoke them in about:addons; an extension "can request them using `permissions.request`".
- `permissions.request` names only `optional_permissions`, which is why I1 is an inference. Codex (round 1) reports Firefox's `ext-permissions.js` and `Extension.sys.mjs` count MV3 manifest origins as requestable, and that `extensions.webextOptionalPermissionPrompts=false` (used by Mozilla's own tests) skips the doorhanger.

## Audit round 1 (2026-10-13)

### Codex, gpt-6.1-sol, high, read-only

- Prompt: `~/.cache/nulo-backlog/home-onboarding-chrome/codex-audit-r1.md` (scratch, not committed). Session `01a13461-d152-7152-8d99-65441214ea2d`. First attempt ran on the default account; no retry needed.
- **Verdict: reject.** Blocking: token-read completion undefined (no loaded signal in `useScopedTokens`); own-window dedup racy between `create` and the new window's registration; D11's "the scroll still ships" contradicts its gate.
- Also: an empty-state flash for a tx-only token; register only `popup` windows and clear only your own id; `useConfigRead` for onboarding; `request()` must return the grant, fenced reads, exact host match; the LNA mechanism was stated as fact; two unsigned visible behaviours (auto filter removal, live theme); the capture overwrites tracked PNGs; driver changes need the network suite, the driver unit test, `FIREFOX.md`, `build:firefox`.
- Agreed with D1's History-only scope (pin parity), D6, D12, D14. Preferred a separate permission banner over folding into `PrestoUiState`.
- Every factual claim was checked in the tree before triage. Dispositions: `plan.md` § Audit verdicts.

### Opus Plan agent (same family), read-only

- **Verdict: conditional approve.** Conditions: a settled flag; a ringed Allow that does not sit above a contradicting card; revoke the content-script grant in the probe; provable Phase 1.3 (fresh install), 1.4 (a distinct contract for the second token) and D11; share the tx predicate; unsigned states into OWNER-ASKS.
- Also: sanitize the symbol (`sanitizeWireString`, F18); strict query parse; `RowAction` for the clear; the Chrome run of `passkey-toolbar-panel` checks nothing; export never releases; I4 is unsafe (`files.test.ts:62-66`); I6 misses derivation timing; `presto.vue:32`'s comment is false; one old path is enough in the settings-routes e2e; fee-fixture changes need the fee network files.
- Preferred folding the permission into the status card (Outline B).
- Verified in the tree: `base.css:260-264` drops every button outline and `Banner`'s action adds no ring; `sanitizeWireString` exists and the token page uses it; the `files.test.ts` note holds; `FIREFOX.md:50` holds; the feed can render with no rows (`:764`); reset leaves `localStorage`.

### Triage outcome

- Accepted nearly everything. Rejected: reloading tokens on `onTokenDeleted` (changes Home's labels after a deletion elsewhere; a stale list keeps the filter working) and Codex's background-serialized own-window open (the race needs a multi-click restart inside a new window's boot; disputed, re-argued in round 2).
- The two auditors split on #156's form; the plan takes a third: a separate row with a ringed control, standing in place of the card while the permission is missing (D9).

## Audit round 2 (2026-10-13)

- Codex, same session resumed (`resume-codex.sh` on the round-1 directory), prompt `~/.cache/nulo-backlog/home-onboarding-chrome/codex-audit-r2.md`. **Verdict: conditional approve.**
- D7: Codex took the local in-flight guard over its own round-1 background serialization once the realistic path was named (a double click is one document). D9: Codex took the replacement row, on condition the first read is a third state.
- Its finding 3 (export's Back leaves a registered window) did not hold: `SubPageHeader.vue:36` closes an own window on back, and both flow pages hide the bottom nav. Checked before triage, as every claim was.
- Found while checking finding 1: `usePrestoCheck` reads `detecting` until `start()` reads its flag, and onboarding hides Skip while `detecting`, so "no probe while missing" done by not calling `start()` would have left the onboarding step with neither Continue nor Skip. The pitch wrapper must stay mounted (`v-show`), or its listeners are lost when the row swaps in and out.
- OA-8 changed to ship B: the rule is that anything beyond a signed record ships without it, and following later theme changes is beyond P13-03.

## Final pass (2026-10-13)

- Fresh Codex session, prompt `~/.cache/nulo-backlog/home-onboarding-chrome/codex-final.md`. **Verdict: reject**, two blocking: an own window abandoned through the lock screen's profile picker stays registered; the network gate commands left the config's default of two retries.
- Both held in the tree. The first overturns round 2's reading that an own window can leave its flow only by closing: the back arrow does close it, but the lock screen's profile picker opens Create and Import, and profile creation ends on Home. Lesson: when ruling out an escape path, enumerate every route reachable from the interim screens (the lock screen here), not only the flow page's own controls.
- The second: `vitest.e2e.network.config.ts:40` defaults to two retries unless `NULO_E2E_RETRY` is set, and `agent.sh` only forwards arguments; a plan's "retry 0" must be in the command itself.
- All six findings accepted and fixed in the plan; a confirmation round on the same session follows.
- Confirmation round (same session): conditional approve. `router.afterEach` also fires on failed navigations, so the release hook must check the `failure` argument; and the guard's redirects (`route-guard.ts`) go to `from.name`, Home, register or Profile Settings, never back to a flow, so the only exemptions are the flow's own path and `/popup/auth`. Applied in place.
