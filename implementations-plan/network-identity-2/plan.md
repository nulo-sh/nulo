---
plan: network-identity-2
tier: light
status: planned, Codex approve; one PR against dev, merging is the owner's call
issues: none (the PR closes nothing)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex review round-trip (gpt-6.1-sol, high) plus the Opus Plan leg
base: origin/dev at ad4de50d8
trunk: dev
post_implementation_hardening: not scheduled
---

# network-identity-2: the token-list and price requests bypass the browser's HTTP cache

One arc, one PR against `dev`. The wallet's two requests to third-party hosts, the signed token list and the CoinGecko prices, fetch with `cache: "no-store"`: the browser's HTTP cache neither answers nor stores them, so no request carries a cache validator (`If-None-Match`, `If-Modified-Since`). The price request also omits credentials and the referrer, as the list request already does. What the wallet keeps in its own storage (the verified list, the usable quotes) is unchanged. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Lane-brief claims that did not hold

- "The composition test that pins `no-cache` is updated to pin `no-store` for both fetches": only the list has a composition test (`S/token-list/service.composition.test.ts:120`). The price pin lands in `S/price/service.test.ts`, whose harness already fakes the fetch.
- The price fetch cannot take the new fields as it stands: its local `FetchLike` (`S/price/service.ts:44`) types `init` as `{ signal?, headers? }` (D2).
- "No e2e": the plan extends the existing smoke request loop instead (D3). The lane's base line names `13d5f8d0`; the worktree is at `ad4de50d8`, and the cited lines hold there.

## Outcome & Quality Bar

**For whom**: every installed wallet, which fetches the list about daily and, with fiat values on, prices every three minutes while unlocked; and the maintainer who changes either fetch later.

**Excellent**:
1. Every list request and every price request is sent with `cache: "no-store"`; the price request also with `credentials: "omit"` and `referrerPolicy: "no-referrer"`. A composition or unit test fails if either init loses one of them.
2. In a real browser, no list request carries a cache validator, even when the host sends a content `ETag`. Claimed as demonstrated only for each browser whose base build sent one (Phase 1).

**Good enough**: refresh outcomes, backoff and logs stay as they are; "unchanged" stays a sequence comparison on a verified body.

## Assumptions

**Facts** (at `ad4de50d8`; `S/` = `apps/extension/src/wallet/services`):
1. `download()` sends `credentials: "omit"`, `referrerPolicy: "no-referrer"`, `redirect: "error"`, `cache: "no-cache"` (`S/token-list/service.ts:211-217`).
2. The price fetch sends `{ signal, headers }` only (`S/price/service.ts:373`); `headers` is `{}` or the build's `x-cg-demo-api-key` (`:360-361`).
3. "Unchanged" is a sequence comparison on a verified `ok` body (`S/token-list/service.ts:201-204`). A non-`ok` answer, a raw 304 included, is `http-status`: a failed attempt with backoff, logged at `debug` (`:27-29`, `:218`).
4. Both services run in the background and call the global `fetch` by default (`wallet/runtime.ts:531,538`; `S/token-list/service.ts:107`; `S/price/service.ts:139`). Neither host is in `host_permissions` (`apps/extension/manifest/manifest.config.ts:24`), but Firefox counts the content script's `*://*/*` match as all-sites access (`tests/e2e/FIREFOX.md:38`).
5. The smoke e2e `tests/e2e/token-list.test.ts:94-140` serves three envelopes from a loopback host that mirrors `infra/token-list/public/_headers` and records each request's `cookie`, `referer` and `origin` (`tests/e2e/fixtures/token-list.ts:102-121`). It sends no `ETag`. `rows.test.ts:1114` is the host's other caller.
6. Both production hosts answer with an `ETag` and a cacheable `Cache-Control` and no `Last-Modified` (recon.md). No e2e reaches the price host: the egress guard refuses it (`tests/e2e/README.md:92`).

**Inferences**:
- Under the Fetch standard, `no-cache` stores a cacheable response and revalidates it with its validator; `no-store` neither reads nor writes the HTTP cache. It does not purge entries an earlier build stored, which no later request of this build reads. Phase 1 checks the `no-cache` half per browser.
- Whether Firefox's all-sites access lets today's price request (default `same-origin` credentials) carry CoinGecko cookies is unverified. `credentials: "omit"` keeps cookies and HTTP authentication off on every browser either way.
- The price schedule does not change (`S/price/service.ts:176-190`, `:346-350`). CoinGecko's 30 s freshness is shorter than the 3-minute refresh, so a request that was a revalidation answered by a 304 now downloads the small body; the list now downloads its capped envelope daily instead of a 304.

**Asks** (proceeding on the working assumption): the host's `Cache-Control` and a privacy-policy line are the owner's (OA-1, OA-2); the arc ships without either.

## Architecture & Implementation

- **Token list**: `cache: "no-cache"` becomes `cache: "no-store"` in `download()`.
- **Prices**: the `fetchFn` call becomes `{ signal, headers, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" }`; the local `FetchLike` becomes `(input: string, init: RequestInit) => Promise<Response>` (D2).
- **Comments**: one sentence at each init states the invariant: the HTTP cache neither answers nor stores the request, so it carries no cache validator.
- **Docs**: `ARCHITECTURE.md:99` names "cache validator" in what the list request carries; `:100` says the price request carries no credentials, referrer or cache validator.
- **E2E host** (D3): the loopback list host sends `ETag: "<sha-256 of the envelope>"`, as the production host sends a content `ETag`, and records `if-none-match`. The scenario's request loop asserts it is absent on all three requests, beside its cookie and referrer checks. No `Last-Modified`: production sends none.
- **Alternatives not taken**: `cache: "reload"` (it skips the read but stores the response); a cache-busting query (it leaves the store in place and changes the URL every wallet requests); a shared init constant (D4).

## Security & Adversarial Considerations

- **Threat model**: `SECURITY.md` § Token list signing treats DNS, Cloudflare, the deploy and the list host as untrusted; CoinGecko is a third party. The invariant: a request to either host carries no HTTP-cache validator, no browser-managed credential and no referrer. The request's own fields are the scope; what the browser's network stack keeps between connections is not changed, and the transport metadata `legal/privacy.md` § 5.11 discloses stays as it is.
- **Input validation**: unchanged. The envelope is size-capped and signature-checked; the price body is size-capped and band-checked.
- **Least privilege, crypto, supply chain**: no new permission, dependency or key. The e2e host hashes with `node:crypto`.
- **Frontend**: no XSS or CSRF surface changes; no dApp-facing surface is touched.

**UI impact**: none. No screen, copy or row changes. The host header (OA-1) and a privacy-policy line (OA-2) are owner asks, and the arc ships without them.

## Phases

Run every command from the worktree root unless the command starts with `cd`. Phase 1 lands in one commit with Phase 2, never alone.

### Phase 1: the request loop pins no cache validator (red on the base build) ✓

- [x] Change map: `apps/extension/tests/e2e/fixtures/token-list.ts` (`ListRequest` gains `ifNoneMatch`; the handler sends a content `ETag`); `apps/extension/tests/e2e/token-list.test.ts` (the loop asserts `ifNoneMatch` is undefined; the title names "a cache validator").
- Build both armed builds from this tree, whose fetch code is the base, and run the file on each. Firefox needs `geckodriver` and `bun x puppeteer browsers install firefox`.
- **Validation gate**
  - Commands: `bun run lint`; `bun run typecheck:all`; then per browser `B` in `chrome`, `firefox`: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:$B`, then `cd apps/extension && NULO_E2E_BROWSER=$B NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/token-list.test.ts --retry=0`.
  - Pass: lint and typecheck exit 0. On each browser, record in `lessons/phase-1.md` whether the first scenario failed only at the `if-none-match` assertion.
  - A run that fails anywhere else is inconclusive: fix its cause and run it again.
  - If both runs complete with every assertion passing (no validator sent): revert both files, record it, and drop D3. Excellent 2 is then not demonstrated; the composition and unit pins still cover Excellent 1.
  - Layers: lint, typecheck, e2e (smoke, Chrome and Firefox).

### Phase 2: both fetches use `no-store`, pinned (tests first) ✓

- [x] Change map: `S/token-list/service.composition.test.ts:120` (`cache: "no-store"`); `S/price/service.test.ts`; then `S/token-list/service.ts` (`download()`); `S/price/service.ts` (`FetchLike`, the `fetchFn` call); `ARCHITECTURE.md:99-100`.
- Tests:
  - Composition: the admission test pins `cache: "no-store"` beside the other three fields; its accepted snapshot is the success control.
  - Price, one new test in "refresh pipeline": `expect(fetchFn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: expect.any(AbortSignal) }))`; the same refresh returns the parsed quotes (the success control).
- Run the two test files after the test edits and before the code edits, and record the red in `lessons/phase-2.md`.
- **Validation gate**
  - Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/wallet/services/token-list src/wallet/services/price src/wallet/storage/stored-shapes.writers.test.ts`; `bun run test:all`.
  - Pass: the red run failed at both pins only; after the code edits everything exits 0.
  - Layers: lint, typecheck, unit, composition.

### Phase 3: the arc gate, in both browsers

- [ ] Rebuild both armed builds (Phase 1 commands) and run, per browser, `cd apps/extension && NULO_E2E_BROWSER=$B NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/token-list.test.ts tests/e2e/rows.test.ts --retry=0`.
- **Validation gate**
  - Pass: every scenario of both files passes on both browsers at retry 0; record each file's vitest duration. `bun run lint:actions` and `bun run check:plans` (after staging) exit 0.
  - Layers: e2e (smoke, Chrome and Firefox), plans gate.
  - Deviation, recorded: CLAUDE.md asks both suites on Firefox when `tests/e2e/fixtures/**` changes. The change touches only `serveTokenList`, whose callers are these two smoke files; no network spec imports it, and CI runs all four e2e lanes on `apps/extension/**`.

## Decision ledger

- **D1, `no-store` on both fetches.** The one mode that neither reads nor writes the HTTP cache. "Unchanged" already comes from the sequence, so no 304 path is lost.
- **D2, widen the price `FetchLike` in place.** Codex: each service owns its fetch seam, and importing the list's alias would make the list module its owner by accident. Opus: one definition, and price already imports that module. Chosen: Codex's. Two one-line structural types share no logic.
- **D3, extend the existing e2e request loop.** Both legs agree: only the e2e goes through the default `fetch` to a real browser cache (the composition test injects its own fetch), and the loop already checks cookie and referrer. It adds no scenario. Phase 1 proves it can fail, per browser.
- **D4, inline init literals.** Two callers with different fields (`redirect: "error"` is the list's), each pinned by its own test.
- **D5, the price fetch keeps following redirects.** A redirect can change the URL and, through a response `Referrer-Policy`, the referrer policy, and it carries the explicit API-key header; none of that reuses HTTP-cache state under `no-store`. `redirect: "error"` would drop fiat values if CoinGecko moved an endpoint. Out of scope.

## Review results

- Codex (`01a15b22`, high) and the Opus Plan leg: both **approve with changes**; every accepted change is in this revision and in [lessons/phase-0.md](lessons/phase-0.md). D2 split the legs (above).
- Codex verification, resumed twice: the Phase 1 fallback and the close-out push corrected, then **approve**.
- Not taken: a raw-304 test (the generic non-`ok` branch is unchanged and covered by the 503 cases, `S/token-list/service.composition.test.ts:231,263`); `Last-Modified` in the e2e host.

## Delivery

- Branch `network-identity-2-a1`, created from the plan commit on `worktree-network-identity-2` (origin/dev plus the plan); one PR against `dev` with `gh pr create`; the close-out lands as its final commits. No stack.
- Title (89 chars): `fix(token-list): fetch the list and prices with no browser cache, credentials or referrer`.
- Body: the change and its invariant; the gates with their outcomes; D3 as a deviation from the lane sketch; each browser's smoke suite wall-clock before and after, per the `e2e-testing` skill § Runtime budget ("after" from this PR's CI run, written in with `gh pr edit`); no `Closes` line. Open without labels: the smoke and network path filters already match `apps/extension/**`.
- Wording rule for every committed artifact (code comments, test names, commits, lessons, the PR body, the Outcome): the change and the invariant it keeps, never more. This arc files no `known-limit` issue.

## Post-implementation

The steps are `implementations-plan/README.md` § Post-implementation standard at `ad4de50d8`, steps 2 to 5 (`code_review: off`, so step 1 is absent). Plan-specific values:
- Review loop: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` over `git diff origin/dev...HEAD`, with the plan, the decision ledger and the standard's two verbatim rules. Resume with `~/.claude/skills/codex/scripts/resume-codex.sh <session-id> <followup-file> <codex-dir> high`. Hard stop at three rounds. One Opus `general-purpose` review of the final diff runs beside round 1. Log each round in `lessons/phase-3.md` and under Review results.
- Then the final-head gates: `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run lint:actions`, the Phase 3 e2e runs, `bun run check:plans` after staging. Then push, `gh pr create`, and `gh pr checks <n> --watch`; a known flake gets one rerun. Do not merge.
- Close-out per step 4 once the PR exists; then the final-head gates again, push the close-out commits, and `gh pr checks <n> --watch` once more on that head. Teardown per step 5 after the merge (`agent-worktree done network-identity-2 --merged`).

## Seeds

```
/goal Phases 1-3 of implementations-plan/network-identity-2/plan.md are ✓, each gate's output is in the transcript, the Codex loop converged (a resumed pass with no new material issue quoted), the PR against dev exists with the close-out commits, and `bun run test:all` and `bun run lint` exit 0.
```

```
/loop 15m Drive implementations-plan/network-identity-2 forward per its plan.md: reality check (plan, lessons, git status, the PR's checks), take the next unticked phase and run its gate, decide with Codex instead of waiting, never merge, stop when the PR is green and report.
```
