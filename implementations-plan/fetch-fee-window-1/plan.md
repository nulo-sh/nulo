---
plan: fetch-fee-window-1
tier: light
status: plan approved (Codex final approve); arc 1 implementing
issues: "#1475, #1477 (part of #1472)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg
base: origin/dev at 3af5f7840
trunk: dev
post_implementation_hardening: not scheduled
---

# fetch-fee-window-1: one private-fetch recipe, and the fee window shares the execute window's prelude

Two duplication findings the owner decided on decision page 94 (signed 2026-11-01). #1475: the token-list and price services each spell the private fetch options, and only the token list refuses redirects. #1477: the fee approval window copies the execute window's start-up, decode fallbacks and JSON opener, and ends another profile's request as a close. Recon: [recon.md](recon.md). Paths are under `apps/extension/src/` unless they name a package.

## Outcome & Quality Bar

- **For whom**: a maintainer adding a remote source or changing an approval window; a person whose price host moves.
- **Excellent**: (1) the published request promise (no cookies, no referrer, no HTTP cache) and the redirect refusal live in one function, and a test fails when a service spells one inline; (2) the fee window starts, decodes and ends a request through the execute window's helpers, so a fix to one reaches both, with no pixel changed.

## Assumptions

**Facts**
- F1. Token list: `wallet/services/token-list/service.ts:207-226` sets `credentials`, `referrerPolicy`, `redirect: "error"`, `cache`; maps `!ok` to `http-status`, oversize to `oversize`, any other throw to `network` (`:193`). Price: `wallet/services/price/service.ts:369-380` sets the same minus `redirect`, adds `headers` (an optional API key), publishes its controller for the kill switch; every failure goes to `recordFailure` (backoff, warn log, `:411-412,429-442`). Both carry the same cache comment (`:215`, `:376`).
- F2. The promise: `packages/legal/src/manifest.ts:75` (1.2.2). No legal text names redirects (`grep -ri redirect legal packages/legal/src`).
- F3. Unit pins: `price/service.test.ts:123-136` (no `redirect`); `token-list/service.composition.test.ts:106-120` (all four). Smoke `tests/e2e/token-list.test.ts:100` checks the wire.
- F4. Fee window: `popup/windows/fee/index.vue:118-148` copies execute's init (`execute/index.vue:317-376`); `:103` passes the end unchanged and `:304` dismisses the notice with a bare `closeWindow()`, so its unload ends the request as `close`. Execute remaps a wrong-profile `close` to `switch` or `lock` (`:314`) and its notice's OK does too (`:542-543`). The notice text is the same in both (`fee:303`, `execute:747`).
- F5. Decode copies: authwits `execute/index.vue:443-455`, `fee/index.vue:151-162`; grants `execute/index.vue:415-429`, `fee/index.vue:166-176`; calls `execute/operation-display.ts:84-92`. JSON opener: `execute/index.vue:585-590`, `fee/index.vue:217-222`, `components/JsonViewer/JsonViewer.vue:87-92`, whose button renders only with a `requestId` no caller passes (`DataViewerPopup.vue:33`, `windows/json/index.vue:58`).
- F6. `wallet/services/execution/service.ts:880-892`: `askInWindow` turns any refusal of the fee question into `false`, and `cancelQuestion` cancels the held send. Which end the window named (`close`, `switch`, `lock`) reaches no record; the refusal itself does.
- F7. A lock or switch cancels every held pre-submit send of the ended session, `queued` included (`execution/execution-lane.ts:68,256-262`), and the journal subscription then closes its question window as cancelled (`dapp-interaction/service.ts:187,237-245`). The sweep is asynchronous and catches its own failures.
- F8. `useDappApprovalWindow.ts:99` ends on unload as `close`; `:138-141` ends a later profile change as `lock` or `switch`. `window-end.ts:3-4` defines `close` as "the X, or an overlay dismissed".

**Inferences**
- I1. A reachability hypothesis, not reproduced: from F6-F7, the fee window meets another profile's request only when its init reads the payload before the switch's cancel lands, and the end it names changes no record. So #1477's drift has no traced consequence today; it ships as the owner's consistency rule, and no coordination is added to prove it.
- I2. CoinGecko's `/api/v3/simple/price` answers without a redirect today; the live test (phase 1) checks it when run. Plausible.

**Asks**: none. Both picks are recorded (P94-19, P94-20); [OWNER-ASKS.md](OWNER-ASKS.md) is empty.

## Architecture & Implementation

- **`privateFetchInit(signal, extra?)`** (new `packages/wallet-core/src/utils/private-fetch.ts`, re-exported from `utils/index.ts`): returns `{ headers: extra?.headers, credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", cache: "no-store", signal }`; `extra` is typed `{ headers?: HeadersInit }` and only its `headers` is read, so nothing a caller passes reaches the init but its headers. Its TSDoc states the promise and the cache-validator reason once. Each service keeps its controller, timeout, `ok` check and error mapping (D2, D3).
- **Fee prelude** (`popup/windows/execute/operation-display.ts`): `WrongProfileError`; `function assertRequestProfile(active, requestProfileId): asserts active is ProfileInfo` (a declaration: an unannotated arrow cannot assert, TS2775), throwing it; `resolveForProfile(requested, profileId)`, which builds the account and network clients, calls `resolveOperations`, and disconnects both in its own `finally` (the leak comment moves here; the file header stops saying every client is the caller's); `requestEnd(end, wrongProfile, profile)`, the remap rule (D7). Both windows: `assertRequestProfile` then `resolveForProfile`, so no client is built for another profile's request; execute keeps `session.value` and `initComplete` after the resolve, and its clients now disconnect before `prefetchTokenMetadata`, which never used them. The catch sets `isWrongProfile` on `WrongProfileError`, then logs and sets the error row as today; the unload option passes `requestEnd(end, isWrongProfile.value, profile.value)`; the notice's OK calls `requestEnd("close", true, profile.value)` when the request is live, else `closeWindow()`.
- **Decode helpers** (`execute/display-calls.ts`): `decodeCallsOrUnavailable(decoder, networkId, calls)` (refused → `undecodedAll`), `decodeGrantsOrUnavailable(read, count)` (refused → `readableGrants([], count)`). Used by both windows and by `decodeOperationArguments`, which keeps its guard around `displayCallsOf` and its callback order (D8).
- **`openJsonWindow(requestId)`** (new `utils/json-window.ts`): the 900 × 700 popup on `#/windows/json`. `JsonViewer` loses its unreachable opener, `requestId` prop, icon and style (D9).
- **Change map**: the files above, `token-list/service.ts`, `price/service.ts`, `execute/index.vue`, `fee/index.vue`, `JsonViewer.vue`, `packages/wallet-core/README.md` (the utils row names `private-fetch.ts`); tests in each phase.
- **Not taken**: a `privateFetch` wrapper that calls fetch (the services inject `fetchFn`; an init builder keeps that seam); `fetchBoundedText` (D2); the remap inside `useDappApprovalWindow` (D7); a service-worker change (D11).

## UI impact

1. Fee window, another profile's request: the notice and its text are unchanged. Its OK, or the window's X, now ends the request as the switch or the lock, and the OK closes the window once the wallet takes it (bounded, 3 s), where it closed at once and ended as a close. The send ends cancelled either way (F6). Sign-off, P94-20: "Match execute: the fee window ends a wrong-profile request as switch or lock, with the same texts." Capture (light, Chrome) in the PR body.
2. Prices, only if the price host redirects: no redirected quote is accepted; quotes already held still show until they go stale (`QUOTE_TTL_MS`), then none show, as on any refused fetch. Sign-off, P94-19: "One rule for both: refuse redirects. A price endpoint that moves fails visibly and is fixed by a release."
3. No other surface: `JsonViewer`'s expand icon never rendered; log text is not copy.

## Security & Adversarial Considerations

- **Threat model**: whoever controls a price response (the host, or a party that can make it redirect). Today a redirect sends a request carrying the IP, URL and `Origin` to a host the Privacy Policy does not name; if that host permits CORS (a preflight, with the optional API-key header), the key follows (the Fetch standard strips only `Authorization`) and its quotes are accepted within the sanity bands. After: `redirect: "error"` refuses every 3xx, so the request reaches only the named host. Exploitability unknown; the fix closes it either way.
- **Trust boundary**: `privateFetchInit` reads only `extra.headers`; the scan pins that neither service names an option in an object literal and that each fetch's init is `privateFetchInit(...)`. Responses stay capped by `readBodyCapped`.
- **Profile boundary**: both windows refuse another profile's request before any client is built; `execute/index.test.ts` (its case "D13") and phase 2's fee case pin it.
- **Logging**: no new line; the decode warning keeps `{ error }` under a named key at `warn`. Terms guard and the one broadcast line: untouched. Crypto, supply chain, permissions: no change.

## Phase 1: one private-fetch recipe, redirects refused for both (#1475) ✓

- Add `private-fetch.ts` and its export; the token list calls `privateFetchInit(controller.signal)`, the price service `privateFetchInit(controller.signal, { headers })`.
- **Tests**
  - `packages/wallet-core/src/utils/private-fetch.test.ts`: one exact `toEqual` of the init, with and without headers.
  - `price/service.test.ts` (the harness's `fetchImpl` now receives `init`): the options case adds `redirect: "error"`. New: a fake that follows a redirect to a 200 with good quotes unless `init.redirect === "error"`, which rejects with `TypeError`, as the standard's redirect modes do. A wiring regression, not browser evidence: the refresh returns and stores no redirected quote (the failure's snapshot emit is allowed) and the backoff suppresses the next refresh. Red at the base, which stores them. The pipeline cases are the success control.
  - `wallet/services/private-fetch.scan.test.ts` (TypeScript's parser, as `scripts/type-roles/source-code.ts` uses it): in the two services, no object-literal property is named `credentials`, `referrerPolicy`, `cache` or `redirect`, quoted, shorthand or with any value; every `fetchFn(` call (`callsTo`) passes `privateFetchInit(...)` as its init. A self-check on fixture texts: `"redirect": "follow"`, `redirect: mode` and `{ cache }` are caught; a comment and a class field named `cache` are not. Red at the base.
  - `price/real-data.test.ts`: the first live fetch passes `{ redirect: "error" }`; run once with `COINGECKO_REAL_TESTS=1` if the host is reachable (not a gate).
- **Validation gate**
  - `bun run lint`, `bun run typecheck:all`: exit 0.
  - `bun run --cwd packages/wallet-core test`; from `apps/extension`: `bun --bun vitest run src/wallet/services/price src/wallet/services/token-list src/wallet/services/private-fetch.scan.test.ts --retry=0`: green; the redirect case and the scan red with the base's two services (`git show 3af5f7840:<path>`).
  - Smoke, from `apps/extension`, on armed builds: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome`, then `env -u EXTENSION_PATH NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/token-list.test.ts --retry=0`; the same with `build:firefox` and `NULO_E2E_BROWSER=firefox`: pass.
  - Network, from the root: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/hero-prices-unavailable.test.ts`, then with `NULO_E2E_BROWSER=firefox`: pass.

## Phase 2: the fee window uses the execute window's prelude (#1477, part of #1472) ✓

- Add the helpers; move both windows onto them; delete `JsonViewer`'s opener.
- **Tests**
  - `fee/index.test.ts` (the overlay stub emits `dismiss`): `test.each` over another profile active (`switch`) and none (`lock`): no account or network client is constructed; the notice's OK ends the request as that end, once, then the window closes. The window's X on another profile's question names the switch; on the person's own, `close`; the same-profile cases are the control. Red at the base, whose OK ends nothing and whose X names `close`.
  - `display-calls.test.ts`: `decodeCallsOrUnavailable` refused (every call `undecoded`/`unavailable`) and answered (the decoder's rows); no window test refuses an authorization decode. The grant fallback is pinned by the windows already (`execute/index.test.ts:1531`, the fee grant cases).
  - `utils/json-window.test.ts`: one 900 × 700 popup on `#/windows/json` with the request id.
  - `execute/index.test.ts`'s wrong-profile cases ("D13", "D14", "D14-lock") and its disconnect-on-throw case stay green unchanged: the refactor proof.
- **Validation gate**
  - `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`: exit 0.
  - From `apps/extension`: `bun --bun vitest run src/popup/windows/execute src/popup/windows/fee src/utils/json-window.test.ts src/components/JsonViewer --retry=0`: green; the fee cases red with the base's `fee/index.vue`.
  - Network: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/tx-sendTx-default.test.ts tests/e2e/network/tx-sendTx-reject.test.ts`, then `tx-sendTx-default.test.ts` with `NULO_E2E_BROWSER=firefox`: pass.
  - `bun run check:plans` after staging; `bun run lint:actions` before the push: exit 0.
- **Capture** (PR body, required; labelled a fixture capture): a scratch Puppeteer spec under `~/.cache/nulo-backlog/fetch-fee-window-1/`, uncommitted, on the armed Chrome smoke build with a real unlocked profile: a page on `#/windows/fee?requestId=<fixture>` whose `getInteractionPayload` answer is a fixture question naming another profile (a port wrapper installed before the page's scripts; the real profile service answers), screenshotted in the light theme at the window size; then its OK, logging the `rejectInteraction` end. The PNG goes under `screenshots/`, linked by raw URL. No funded send is needed. If it cannot be produced, the arc report says so; no exception is self-granted.

No e2e scenario is added: the end rule and the redirect are decided inside one module the unit and component layers drive exactly, and the fee window's wrong-profile state needs a race (I1).

## Decision ledger

- D1. `privateFetchInit` per the owner's pick; it reads only `extra.headers`, the only extra a caller has, so a wider `RequestInit` passed by mistake adds nothing (Opus R1).
- D2. No `fetchBoundedText`: the callers differ in the `ok` check and the error mapping, so a shared reader needs a new status error type to keep the token list's outcomes, to save three lines a caller.
- D3. Error mapping stays per service: a redirect reads as the token list's `network` outcome and as price's failed refresh. Both refuse the response and keep their last good state, which is "fails as the token list's does".
- D4. The scan covers the two services only (a tree-wide ban hits the routers' `redirect:` routes, `popup/index.ts:42`, `popup/legacy-routes.ts`), reads property names from the parser, not lines, so a quoted name, a variable value or a split line is caught and the price service's `cache` field is not (Codex R1), and requires each fetch's init to be the helper's (Opus R1).
- D5. The redirect test fakes the standard's redirect modes, so it fails on the outcome (stored quotes), not only on the init; it is a wiring regression, and `redirect: "error"` itself is the browser's (Codex R1).
- D6. `WrongProfileError`, `assertRequestProfile` and `resolveForProfile` as picked; the error row under the notice stays as today.
- D7. `requestEnd` beside them, not in `useDappApprovalWindow`: capabilities and discover check no profile, and the per-window reject guards stay.
- D8. The decode warning becomes one text for both windows (it named `[Execute]` or `[Fee]`).
- D9. `JsonViewer`'s opener is deleted, not routed through the helper: its button never renders.
- D10. #1472: `Part of`. Left on it: execute's confirm eligibility in one computed, and the per-window `grantsPending`/`grantRefusal` computeds, which wrap rules already single-sourced over different shapes.
- D11. No service-worker change: the fee question's end reaches no record (F6), and reading it would go past the owner's pick.
- D12. The capture renders the real window on a smoke build with one fixture answer, not a race on the network fixture: the state needs a race in the product (I1), and the notice's pixels do not change (Codex R1, Opus R1).
- D13. As built: the live price test passed with `redirect: "error"` (I2 holds, 2026-11-01); phase 1's Firefox network run moved to phase 2's head, one sandbox boot for both; the scan walks one AST with structural callee matching instead of `callsTo` (Codex fix R1); the decode warnings read `[Approval]`; the clients now disconnect before the token metadata prefetch (none used them).

## Panel verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex R1 | conditional approve | F6 and I1 reworded; parser-based scan (D4); fee clients never built for another profile; UI impact 2 and the threat model qualified; the redirect test bounded (D5); a required, deterministic capture (D12); `lint:actions` before the push | none |
| Opus R1 | conditional approve | the same fee client check; harness edits (`fetchImpl` gets `init`, the overlay stub emits); UI impact 2; `headers` read, not spread (D1); the fetch-init check (D4); TS2775 and execute's ordering written down; the grant helper's unit cases dropped as duplicates; wallet-core README row | none; the capture shim it proposed is narrowed further (D12) |
| Codex final (resumed) | approve | none | none |
| Codex fix R1 (arc 1) | conditional approve | the scan reads static computed names and accessors and matches the fetch callee structurally; execute's init catch logs `{ error }`; the redirect fake's comment bounded; three comments deleted | none |
| Opus fix R1 (arc 1) | approve | `privateFetchInit`'s doc and the README row narrowed (the node RPC fetch does not use it); the grant helper's doc says it holds Confirm off | none |

## Delivery

- One arc (phases 1 and 2): branch `worktree-fetch-fee-window-1` to `dev`, `gh pr create`, opened ready after the Codex loop converges and the final gates pass, no label at creation; add `e2e:extension-network` or `e2e:extension-smoke` afterwards only if the path filter skips a suite the change needs. Title: `refactor: one private-fetch recipe, and the fee window shares execute's prelude` (79 characters). Body: what changed and why, both owner quotes, the UI impact lines, the capture, the gates with outcomes, no added e2e scenario, `Closes #1475`, `Closes #1477`, `Part of #1472` (with the comment on #1472). The close-out is the PR's final commits. The phases share no file but the plan; their critical path is short, so no lanes.

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `3af5f7840`, with these values:

- Step 1 is absent (`code_review: off`).
- Step 2 once over the arc's diff from `3af5f7840`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; both verbatim rules and the adversarial ask in every prompt; one Opus `general-purpose` review beside round 1; hard stop at three rounds.
- Steps 3 and 4 as written; then `gh pr checks <n> --watch` once. Close-out: the Outcome, lessons promotion with a pruning pass, the #1472 comment, `STATUS.md` deleted, `git mv` to `archive/fetch-fee-window-1/` in its own commit, the index line moved.
- Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/fetch-fee-window-1/plan.md`, then `agent-worktree done fetch-fee-window-1 --merged`; the orchestrator's session notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds (not run; orchestrator-owned)

- `/goal` Phases 1 and 2 ✓ in implementations-plan/fetch-fee-window-1/plan.md, each gate passing in the transcript; the Codex loop converged on the diff from 3af5f7840 (a resumed pass with no new material point, quoted); a ready PR to dev closing #1475 and #1477; `bun run test` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/fetch-fee-window-1 from plan.md and lessons/: the next unchecked phase, its gate, the Codex loop, delivery, the close-out; never merge.
