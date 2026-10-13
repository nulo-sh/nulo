---
plan: dynamic-token-list
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: narrated
eli5_mode: artifact
budget: recon 2 Sonnet agents; audits = Codex (gpt-6.1-sol, high) + one Opus 5.5 Plan leg, then one fresh Codex pass
base: origin/dev d01569a200ccdf010a1f7cbcf38ffa37948ee3c6
issues: "#79 (closes, arc 2); #324, #98, #329 collide (no arc)"
harden: not scheduled (owner, 2026-10-13)
---

# dynamic-token-list

The wallet's default tokens are a list compiled into each build (`apps/extension/src/wallet/services/token/default-tokens.ts`). A new token, or a Testnet reset, waits for a store release, and the addresses mirror unleashed's bridge generation. This plan replaces that list with one Nulo publishes. A CI job signs the list after the owner approves it in a gated environment. A Cloudflare Worker serves it at `https://tokens.nulo.sh/v1/list.json`. The wallet fetches it once the Terms are accepted and then about once a day. The wallet accepts a list only with a signature from a key it pins and a sequence number higher than the last list it accepted. Closes #79. It reverses `chain-endpoints` decision P12-05 (owner request, 2026-10-13); `chain-endpoints` phase 2a.3 then leaves #79 open, as that plan says it should.

**Not in scope:**
- Chain identity and RPC endpoints stay compiled in, so a network reset (#324) still needs a wallet release for the new chainId.
- Live checks of entries against a node, flagging scam tokens, and an npm verifier package are follow-up issues (owner, 2026-10-13).
- An entry's class must be one the wallet bundles; supporting several Token classes is out.

## Outcome & Quality Bar

- **For whom:**
  - a person installing or using Nulo, who should see the right default tokens without waiting for a store review;
  - the owner, who publishes token changes;
  - another Aztec wallet's developer, who may consume the same list.
- **Excellent:**
  1. No list bytes are used unless they verify against a pinned key and carry a strictly higher sequence. A refused list never replaces an accepted one. Each refusal path has a test.
  2. No request leaves before the Terms are current. The request carries no cookie, referrer, query, chainId or holdings. `legal/privacy.md` describes exactly what it does carry, including any per-install `Origin` the browser adds.
  3. A token change takes a reviewed PR, one environment approval and one publish-PR merge, with no wallet release. `infra/token-list/FORMAT.md` lets a stranger verify a list by hand.
- **Good enough:** no settings toggle, no new UI copy, no bundled fallback list, no live chain checks in CI.

## Assumptions

### Facts

1. `DefaultTokenSeed` = `{chainId, contract, expectedClassId, expectedSymbol, expectedDecimals, displayName}`. The four Testnet seeds share the aztec-standards Token rc.1 class `0x24c3…1505` (`default-tokens.ts:27-86`), which `default-tokens.test.ts:15-19` pins to the bundled class.
2. The seeder reads `getSeeds()` per pass (`seeder.ts:401`) and on every status read, announce and continuation (`:580,598,636`). It reads its version later in the pass (`:424`). Its pass guards check profile, network and purge epoch (`:408-417`). A pin rejection waits for a version change (`:43-44,84-97`).
3. `parseTokenInterface` resolves the artifact for the instance's class (`token/service.ts:699`), through `pxe-local` and then the compiled catalog (`packages/aztec-runtime/src/pxe/artifact-registry.ts:100-123`). The seeder's class pin binds the artifact to the class. No path fetches an artifact (`artifact-catalog.ts:27-35`).
4. `getPriceMapEntry` runs synchronously in the popup (`composables/usePrices.ts:68`, `BalanceView.vue:216`) and the worker (`incoming-transfer/service.ts:650`). `allCoingeckoIds` derives from `TOKEN_ENTRIES`, keyed on `TESTNET_TOKENS` (`price/price-map.ts:53-95`).
5. The Terms gate is in the onboarding router only (`apps/extension/src/onboarding/legal-guard.ts:24-31`). `LegalAcceptanceService` exposes `getStatus()` and emits `onAcceptanceChanged` on accept (`wallet/services/legal/service.ts:34,46,55-65`).
6. `AlarmsPort` has `create`, `clear` and `onAlarm` only. A waking alarm reaches only listeners registered at module scope (`apps/extension/src/wallet/index.ts:86-101`).
7. `connect-src` admits `https:` (`manifest/manifest.config.ts:56`). Host permissions are pinned exactly, and they include `http(s)://127.0.0.1/*` (`:24`; `src/manifest.test.ts:77-81`).
8. The source smoke build always arms `VITE_NULO_E2E_TOKEN_SEEDS` (`tests/e2e/global-setup-smoke.ts:34-53`), whose list replaces the production seeds (`wallet/runtime.ts:525-536`). The e2e stamps stay live data so tree-shaking cannot hide them (`e2e/config.ts:92-98`).
9. `release-integrity.test.ts:72-79` counts a job as privileged only for `id-token`, `attestations` or an App mint. A listed job that holds none fails (`:151-156`). Commits made through the App token are GitHub-signed, and its PRs trigger CI (`release.yml:68-76`, `scripts/release/lock-version-run.ts`).
10. `dev` requires zero approvals and its required checks are not strict. Its only bypass actor is the owner.
11. Privacy § 5.5 tells the reader that the zone keeps a 30-day sample of individual requests, with IP, time, user agent and path (`legal/privacy.md:178-181`). § 2 says "I do not operate a backend for the wallet."
12. The wallet is pre-production (`CLAUDE.md` § Persisted-storage), so no installed user upgrades into the new request. Nightly artifact smoke is red until #324.

### Inferences (each proven by the phase named)

- I1. WebCrypto Ed25519 verifies in the pinned e2e browsers and in Firefox ≥ 153. A browser without it fails closed and backs off to daily [P3 composition; P5 smoke on both browsers].
- I2. A background `fetch` with `Access-Control-Allow-Origin: *` and `credentials:"omit"` needs no host permission. P5 serves from `http://localhost` (outside the `127.0.0.1` grant) and the artifact launch reaches the real host [P5].
- I3. Firefox may send `Origin: moz-extension://<per-install UUID>`, a stable id per install. The wallet's node and price requests would already carry it [P5 records the headers on both browsers; the disclosure follows the result].
- I4. Workers Builds builds one repo path from `dev` with build watch paths (Cloudflare monorepo and watch-path docs) [O3].

### Asks (all resolved by the owner, 2026-10-13: A1-A3 OK; A4 disclose; A5 the agent drives the key ceremony as a keyed run)

- A1. No settings toggle for the fetch [none; uninstall is the control].
- A2. Privacy 1.2 is material and never blocks; Terms § 7.5 adds "a token list" as a patch [drafted in P6; the owner signs off the text in the arc 2 PR].
- A3. At most 16 entries per chainId [the wallet uses the first 16 and CI refuses more; a leaked key's rows outlive the rotation].
- A4. If P5 confirms I3, disclose the Firefox `Origin` id in § 5.x and § 5.5 rather than build a mitigation [disclose; the same id already reaches the node and CoinGecko].
- A5. O2 (real keys) happens before arc 1's PR, as a keyed run the agent files and the owner approves [a test refuses a placeholder key, so CI cannot go green without it].

## Architecture & Implementation

**Shape.** One leaf package holds the format. The `infra/token-list` workspace hosts and publishes it. One new wallet service consumes it.

- `packages/token-list` (`@nulo/token-list`, private, tested by `test:all`):
  - `envelope.ts` and `sign-cli.ts` / `keygen-cli.ts` use only WebCrypto and `node:` imports. A test pins that import closure, so the signing step runs with `bun --no-install`.
  - `parse.ts` (zod): bounds, refuse-not-normalize, BN254 field modulus (a constant the extension test pins to `Fr.MODULUS`), no control or bidi characters in `name` or `symbol`.
  - `keys.ts` holds the pinned `{keyId, publicKey}` list.
  - `price-ids.ts` is the single price table: id, sanity band, proxy ticker. `price-map.ts` imports it.
  - `class-ids.ts` holds the bundled token classes, which an extension test pins to `getBundledTokenClassId()`.
  - Vectors are generated per test run; no committed private key.
- `infra/token-list` (`@nulo/token-list-host`):
  - `list.source.json` holds the tokens only. Its sequence is assigned at signing.
  - `public/v1/list.json` is the envelope, written only by the publish PR.
  - `public/_headers`, `wrangler.jsonc` (assets only, wrangler pinned, `deploy`/`deploy:dry` scripts), `FORMAT.md`, `README.md`.
  - `scripts/check.ts`: the tree invariants run as tests.
  - `scripts/open-publish-pr.ts`: App token, `createCommitOnBranch`, closes older open publish PRs.
- `apps/extension/src/wallet/services/token-list/` holds `TokenListService`, registered beside `PriceService`.

**Format `nulo-token-list/1`.**
- Envelope: `{format:"nulo-token-list-envelope/1", keyId, payload:<base64url>, signature:<base64url, 64 B>}`. The signed message is UTF-8 `"nulo-token-list/1\n"` followed by the payload bytes. Verification comes before any parse.
- Payload: `{format, sequence:<int, 1..2^53-1>, issuedAt:<ISO>, tokens:[{chainId:<uint32>, address, classId, symbol, decimals, name, priceId?}]}`.
- `address` and `classId` are lower-case `0x` + 64 hex digits, below the field modulus. `name` is 1-80 characters, `symbol` 1-32, `decimals` an integer 0-18. Each (chainId, address) is unique. The envelope is at most 64 KiB.
- The wallet ignores unknown entry keys. It skips an entry whose class it does not bundle, and leaves an entry with an unknown `priceId` unpriced. It uses the first 16 entries per chain. A breaking change moves to `/v2/`.
- The tree tests are strict: `list.source.json` has known keys and allowlisted ids only, at most 16 entries per chain, and canonical serialization. A placeholder key fails. A committed envelope, when one exists, verifies against `keys.ts` and parses strictly. Arc 1 ships none; the first publish (O6) adds it.

**Publish flow** (`.github/workflows/publish-token-list.yml`). Triggers: `push` to `dev` filtered to `infra/token-list/list.source.json`, and `workflow_dispatch` from `dev`. `concurrency: publish-token-list`, with no cancel.
1. `prepare`: no secret. The step summary shows the token diff, the payload sha256, and `git diff --stat` since the last publish commit for the workflow, `packages/token-list/src/**` and the source. The owner reads it before approving.
2. `sign` (environment `token-list`, owner reviewer, branch `dev`, `contents: read`):
   - checks out without credentials;
   - runs `bun --no-install packages/token-list/src/sign-cli.ts`, with the secret in that step only;
   - sets `sequence` to the signing time in seconds, and refuses unless it is above the published sequence;
   - verifies its own envelope, then uploads it.
3. `publish-pr`: an App token (contents and pull-requests write) commits the envelope on `token-list-publish-<seq>`, opens `chore(token-list): publish sequence <seq>`, and closes older open publish PRs. The PR's `quality-status` re-runs the tree tests, and the owner merges.
4. Workers Builds serves `infra/token-list/public/` from `dev`. `/v1/*` sends `Access-Control-Allow-Origin: *`, `Cache-Control: public, max-age=300`, `nosniff`, CSP `default-src 'none'` and HSTS. The `observability` setting is off.

**Wallet flow (`TokenListService`).**
- State: `nulo:core:token-list` = `{envelope, lastSuccessAt, nextAttemptAt, failures}`. One device-global key, in no backup slice.
- At `init()`, the service verifies the stored envelope into an in-memory snapshot `{sequence, keyId, entries}`. It discards a stored envelope whose key is no longer pinned.
- Admission: the service fetches only when `getStatus() === "current"`.
- Triggers:
  - `onAcceptanceChanged` to `current`;
  - boot;
  - a one-shot alarm `nulo:token-list:refresh`, dispatched by the module-scope shim, at the persisted `nextAttemptAt`.
- One deadline function sets `nextAttemptAt` for every trigger:
  - success, or an equal sequence: `now` + 24 h + a jitter of 0-2 h;
  - failure: backoff of 5 min, 30 min, 2 h, 6 h, then 24 h.
- Boot recreates the alarm at `nextAttemptAt`, and runs at once if that time has passed.
- `refresh()` is single-flight:
  - `GET` with `credentials:"omit"`, `referrerPolicy:"no-referrer"`, `redirect:"error"`, `cache:"no-cache"`, and a 10 s abort;
  - read at most 64 KiB, verify, then parse;
  - commit only if `sequence` is above the snapshot's.
- The service logs fixed categories only (the `ERROR_CATEGORIES` pattern, `seeder.ts:715-720`).
- On change, the service emits `onListChanged`:
  - `TokenService` calls `seeder.invalidate()`, which bumps the existing epoch so an in-flight pass aborts, and then `seeder.run()`;
  - `PriceService` re-emits `onQuotesUpdated`.

**Consumers.**
- `getSeeds` and `getVersion` read one snapshot together. The version is `${manifestVersion}+${sequence}`, so a failed or rejected default gets one fresh round per list update.
- Every user delete writes a tombstone keyed by (chainId, lower-case contract). The tombstone has no effect on a token that is not listed.
- The preview path alone writes a new marker field, `verifiedPins` (`classId|symbol|decimals`). A token that was already present gets none.
- `knownContracts` names a list entry only when that marker's `verifiedPins` equal the entry's current pins.
- A seed commit becomes irrevocable when `persist()` starts. A list change during it lets the row land, as a seed just before the change would.
- `price-map.ts` uses `PRICE_IDS`. `allCoingeckoIds()` returns every id in the table, so the request never varies. The worker reads `priceIdFor` from the snapshot.
- `getQuotes()` and `refreshIfStale()` return `{quotes, pricedTokens}`, and `onQuotesUpdated` carries both. The incoming-transfer dust filter unpacks the new shape. `usePrices` resnapshots both on reconnect, exposes `isPriced`, and makes `settled` cover the mapping. The persisted quote cache keeps its shape. The e2e sandbox rule (`price-map.ts:49-67`) does not change.
- `default-tokens.ts` loses `TESTNET_TOKENS` and `DEFAULT_TOKEN_SEEDS`. Tests use a fixture constant.

**Armed e2e seam.**
- Armed builds read `{url, publicKey}` from `chrome.storage.session` key `nulo:e2e:token-list`. These replace the endpoint and the pinned keys. With no key, the fetcher is off.
- The stamp `NULO_E2E_TOKEN_LIST_BUILD_STAMP` is live data, as in `e2e/config.ts:92-98`. `global-setup-smoke.ts` asserts it. `_build-extension.yml` greps release bundles for the stamp and the key name.
- `ChromeStorageTokenSeeds.get()` returns `undefined` when its key is absent, so the list applies. Existing smoke tests set no list key and see no defaults, as today.
- `interceptRpc` is not reused, because its Firefox redirect conflicts with `redirect:"error"` (`fixtures/browser/firefox-rpc-intercept.ts:21-44`).

**Alternatives not taken** (see the ledger): a GITHUB_TOKEN deploy branch (outline B); owner signing on the Mac; Sigstore; per-network files; a bundled list; a host permission; `@noble/curves`; a separator in `wallet-crypto`; a hand-edited sequence.

## Security & Adversarial Considerations

- **Who can serve bytes.** DNS, Cloudflare, the deploy, or a bad commit on `dev` can serve anything. The wallet trusts only the signature and the sequence, never TLS or the host.
- **The signer is the asset.** A forged list can seed a real standard Token with the attacker's supply, named "USDC" and priced as `usd-coin`. The limits:
  - a bundled class only;
  - a table price id with its sanity band;
  - 16 entries per chain per list;
  - "Nulo knows" names only entries whose current pins the seeder verified on chain;
  - no endpoint, chain, fee payer or code.
  A sequence of forged lists still accumulates rows, which delisting leaves in place by owner decision. Each user deletes them by hand. `SECURITY.md` records this.
- **Signer code custody.** The environment approves a run; it does not vet the code. `dev` needs no approvals, so an agent PR could change the workflow or `sign-cli.ts`. Mitigations: the `prepare` summary shows every signing-relevant change since the last publish before the approval; the signing step's import closure is pinned and it installs nothing; `release-integrity.test.ts` and `behavior-gating.test.ts` pin the jobs. The owner's GitHub account plus the approval is the trust root, the same as the store-publish environments. The owner chose this on 2026-10-13, bending the "no secrets in CI" rule.
- **Key lifecycle.**
  - Both keys are 32-byte Ed25519 seeds, generated by 1Password (`op-remote create`, `# op: generate hex32`) in `Keyed-Runs/Nulo-TokenList`. The template is `infra/token-list/keys.env.example`.
  - `keygen-cli.ts install` runs as a keyed run. It pipes the CI seed to `gh secret set TOKEN_LIST_SIGNING_KEY --env token-list` over stdin and prints only the two public keys. A test pins that it writes nothing else.
  - Rotation: delete the secret, sign with the recovery key in a keyed run, then release without the leaked key.
  - A stored list under an unpinned key is discarded, so a forged maximum sequence cannot freeze updates after that release. Until the release, the leaked key works. This is a known limit.
- **Rollback and freeze.**
  - Sequences come from the signing clock, so two signings never share a number.
  - A host attacker can still serve the last good list forever. It can also serve an older signed list to a fresh install, which restores entries delisted since. This withholds corrections and re-seeds delisted entries. It is a known limit, reopened with the scam-flagging issue.
- **Least privilege.** `sign` has `contents: read` and keeps no credentials; `publish-pr` mints `contents` and `pull-requests` write only; no Cloudflare token exists.
  - `privileged()` also counts jobs that read a custom secret, meaning any `secrets.X` with X ≠ `GITHUB_TOKEN`. Those are `sign` and the two AMO jobs, which already keep no credentials.
- **Crypto.** WebCrypto Ed25519 (RFC 8032), with no new dependency. It signs the exact bytes with a domain prefix. An unknown `keyId` is refused.
- **Input.** The wallet caps the size, verifies before it parses, bounds every field, and refuses non-canonical hex. This closes #329's mechanism for this path. A replayed or lower sequence is a no-op.
- **Privacy.**
  - The URL is fixed, and the request carries no cookie or referrer.
  - The first request leaves after acceptance; later ones come daily with jitter.
  - The zone keeps per-request samples (IP, time, user agent, path, Fact 11), and § 5.5 says so.
  - A per-install Firefox `Origin` id is measured in P5 and disclosed (A4).
  - The seam cannot ship: its stamp is live data, it is grepped in release bundles, and it carries a per-run key.
- **Supply chain.** No new npm package. Actions reuse the pinned SHAs. Wrangler runs through a workspace script, never root `bunx`.

## UI impact

- **Placeholder rows.** Default-token placeholder rows on Home and Holdings now appear when the first list lands, normally before onboarding ends, instead of at first unlock. With no list, Home shows no default rows. The owner chose this on 2026-10-13: "Nothing extra".
- **Names.** The connect window's "Nulo knows" list now names a default only after it has seeded. Names come from the signed list, with today's strings.
- No copy, layout or format changes.

## Phases

Each gate also runs `bun run lint`, `bun run typecheck:all` and `bun run check:plans`, each exiting 0.

### Arc 1: format, host and publish

**P1. `packages/token-list`.**
1. Add the package: envelope, `sign-cli`, `keygen-cli install`, parse, keys, `price-ids`, `class-ids`, and per-run vectors.
2. Add the extension pins: class ids, `Fr.MODULUS`, price table.
3. Pin the import closure.
4. Write tests that refuse each of these: tampered, wrong key, unknown `keyId`, no domain prefix, upper-case hex, address at or above the modulus, duplicate, oversize, a bidi character in `name`.
5. Write tests that check the 16-per-chain cut, and that an unknown class or price id is skipped.
- Gate: `bun run --cwd packages/token-list test` and `bun run --cwd apps/extension test -- token-list` are green.

**P2. Host and publish.**
1. Add `infra/token-list`: source with the four rc.1 seeds (owner, 2026-10-13) and today's price ids (GBPC unpriced, as today), `keys.env.example`, `_headers`, `wrangler.jsonc`, `FORMAT.md`, README (Workers Builds settings, zone rule), and `scripts/`.
2. Write tests for headers and config, the tree invariants, `open-publish-pr`, and a `test:live` that verifies the host's list and fails on a challenge page.
3. Add the advisory nightly `token-list-host-live`.
4. Add `publish-token-list.yml`.
5. Extend `privileged()` to custom secrets. Add `release-integrity` entries for `sign` and the two AMO jobs, a mutation test that keeps a `GITHUB_TOKEN`-only job unprivileged, and the `behavior-gating` entries.
6. Add the custody and rotation section to `SECURITY.md`. Update `CI.md`, `.github/WORKFLOWS.md` and `CLAUDE.md:103` (a new `BUN_VERSION` site).
- Gate:
  - `bun run --cwd infra/token-list test` and `bun run --cwd infra/token-list deploy:dry` are green;
  - `bun run test:ci-gating` and `bun run lint:actions` are green;
  - `sign-cli.ts`, run on a throwaway key, gives an envelope that `check.ts` accepts.

### Arc 2: wallet

**P3. `TokenListService`.**
1. Add the service, the alarm shim line, its registration in `runtime.ts`, and the armed seam with its build guards.
2. Add `packages/token-list` paths to the extension build, smoke and network filters for both browsers.
3. Write a composition test. It covers:
   - admission: no fetch until acceptance, then a fetch on `onAcceptanceChanged`;
   - commit: accept, an equal-sequence no-op, a refused lower sequence that keeps the list, an unpinned stored key discarded at boot;
   - timing: one deadline (boot honours the backoff; an unsupported verify backs off to daily), single-flight overlap, the request options, `onListChanged` reaching the seeder.
- Gate: `bun run audit:vue` exits 0, and `bun run test:ci-gating` is green.

**P4. Consumers.**
1. Rewire `getSeeds`/`getVersion`, `invalidate()`, tombstone-on-delete, `knownContracts`, `price-map`, `getQuotes`, and `usePrices`/`BalanceView`.
2. Remove `TESTNET_TOKENS` and `DEFAULT_TOKEN_SEEDS`.
3. Write seeder tests: a re-pin and a delist during a held preview; a list change during a held persist (the row lands, with no name under the new pins); no `verifiedPins` for an already-present token; a rejected default that retries after an update.
4. Write a `usePrices` test: the mapping is resnapshotted on reconnect.
- Gate: `bun run audit:vue` exits 0. `rg -n "TESTNET_TOKENS|DEFAULT_TOKEN_SEEDS" apps/extension/src` returns nothing.

**P5. E2E.**
1. Declare `tokens.nulo.sh` in `DECLARED_REFUSALS`.
2. Add one smoke file, `token-list.test.ts`. A port-registry server on `http://localhost` sends the Worker's headers, and a per-run key signs its lists. The file checks that a signed list makes placeholder rows appear, that a forged list is refused, that a lower sequence leaves the rows in place, and that the request carries no cookie and no referrer. It records each browser's `Origin` header.
3. Add a live leg, which runs only in artifact launches (nightly and release): it lets `tokens.nulo.sh` through and asserts a verified, non-empty stored list. It reads the shipped-token-list expectations from that list. Its first green run comes after O6; it is not a delivery gate.
4. Measure the suite's wall-clock before and after, per browser.
- Gate:
  - `bun run test:e2e tests/e2e/token-list.test.ts` and the same with `NULO_E2E_BROWSER=firefox` are green;
  - the full smoke suite is green on both browsers;
  - `bun run e2e:agent tests/e2e/network/default-token-seeding.test.ts` is green on Chrome and Firefox.

**P6. Disclosure and docs.**
1. `legal/privacy.md` 1.2: the short version, § 2, a new § 5.x, § 5.5, the appendix, and the `Origin` per A4. Archive the old copy and add the `@nulo/legal` entry.
2. Terms § 7.5 as a patch.
3. `store/remote-code.md` and its citations; `store/listing.md` (data row, alarms "four jobs", reviewer notes).
4. `ARCHITECTURE.md:99,101`, `CLAUDE.md:26,82`, `UPDATE.md:117`, the `aztec-update` reset step (publish entries keyed on the new chainId), and the `BEFORE-LAUNCH.md` § 5.5 re-read row.
- Gate: `bun run --cwd packages/legal test`, `bun run --cwd apps/extension test -- store-listing` and `bun run test:all` are green.

## Owner steps (agents never handle a private key)

- **O1.** Create the `token-list` environment: you as reviewer, deployment branch `dev`.
- **O2.** Before arc 1's PR, the key ceremony runs as a keyed run:
  1. The agent pushes the arc 1 branch.
  2. The agent files `env-exec request --template infra/token-list/keys.env.example --slug token-list-keys -- bun packages/token-list/src/keygen-cli.ts install`.
  3. You run `op-remote create alejo-box <id>` and then `op-remote alejo-box <id>`.
  4. The agent pastes the printed public keys into `keys.ts`.
- **O3.** Connect Workers Builds for `nulo-tokens`: root `infra/token-list`, branch `dev`, watch paths `infra/token-list/**`, `BUN_VERSION=1.4.2`, deploy command `bun run deploy`.
- **O4.** Attach `tokens.nulo.sh` as a custom domain.
- **O5.** Skip bot challenges for `tokens.nulo.sh`, as for `passkey.nulo.sh`.
- **O6.** After arc 1 merges:
  1. Dispatch `publish-token-list.yml` from `dev`.
  2. Read the `prepare` summary, then approve.
  3. Merge the publish PR.
  4. Run `token-list-host-live`, and see it green before you merge arc 2.

## Delivery

| Arc | Branch | Phases | Stacks on | `/code-review` |
|---|---|---|---|---|
| 1 | `worktree-dynamic-token-list` (`gh stack init --adopt`) | P1-P2 | `dev` | off |
| 2 | `dynamic-token-list-wallet` | P3-P6 (`Closes #79`) | arc 1 | off |
| close-out | `dynamic-token-list-close-out` | Outcome, lessons, issues, archive | arc 2 | off |

Arc 2's PR body attaches a Home screenshot with the placeholder rows, and the owner's sign-off on the legal text.

**Merge order (bootstrap)**, every merge the owner's call:
1. `gh stack merge --squash` on arc 1 alone.
2. O6, until the live list verifies.
3. `gh stack merge --squash` on the close-out, which lands arc 2 with it.

So no `dev` build fetches a list before the host serves one.

## Post-implementation

This section follows [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at d01569a200ccdf010a1f7cbcf38ffa37948ee3c6. What is specific to this plan:

- **Review loop:**
  - Codex through `/codex`, with `run-codex.sh <prompt> <cwd> high read-only gpt-6.1-sol`, resumed in the same session.
  - Runs per arc, before `gh stack add`. A final fresh session reviews the net diff from `d01569a2` for cross-arc issues.
  - `code_review: off`.
- **Delivery:**
  1. `gh stack submit --auto`, then `gh pr edit` for each body (titles at most 93 characters).
  2. Add the close-out layer.
  3. `gh pr checks <n> --watch`.
  No PR opens before the loops converge.
- **Close-out**, on `dynamic-token-list-close-out`. Where open work lives: an issue; a private draft advisory for a suspected exploitable weakness; `BEFORE-LAUNCH.md` for a legal or store blank (`CLAUDE.md` § Where open work lives).
  1. Open issues, after deduping: live entry checks; flagging scam tokens through the list (including a compiled sequence floor); an npm verifier package.
  2. Comment on #324 that its seed step is now a list publish.
  3. Give each rejected item a disposition line.
  4. File the known limits (a leaked key until the release; freeze and rollback for fresh installs; leaked-key rows that persist) as closed `known-limit` issues.
  5. Archive the plan.
- **Teardown:**
  1. When `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/dynamic-token-list/plan.md` succeeds, run `ExitWorktree` (`keep`).
  2. Run `agent-worktree done dynamic-token-list --merged`.
  A `/goal` session arms one background wait.

## Decision ledger

| ID | Decision | Source | Rejected alternative, and why |
|---|---|---|---|
| D1 | Ed25519 key in the `token-list` environment, recovery key offline | owner | Mac signing (the owner chose CI); Sigstore (an X.509 and transparency-log verifier in the extension, with root rotation forcing releases) |
| D2 | Own Worker at tokens.nulo.sh, Workers Builds from `dev`, envelope via an App-token publish PR | owner + A | B's GITHUB_TOKEN orphan deploy branch: unreviewed bytes, unpinned `npx wrangler`, `contents: write` beside the secret |
| D3 | One file for all networks | owner | Per-network files reveal the active network |
| D4 | Tokens + price id; class pin limited to bundled classes | owner | Multi-class support (out of scope) |
| D5 | First fetch on Terms `current`; then daily; no bundled copy | owner + both audits | `onProfileAdded`: the router-only gate does not guard the background |
| D6 | Delist stops seeding, rows stay; scam flagging is an issue | owner | Removal (a list deletes user data) |
| D7 | First list = the rc.1 seeds; structural checks only | owner | Live preflight in CI (owner: a later issue) |
| D8 | Sequence = signing time, assigned by `sign-cli` | Codex S3 | A hand-bumped sequence lets two merges sign the same number |
| D9 | Tree tests in `test:all`, no new `pr-quick` job | Opus | A new filter key and state-machine entry |
| D10 | Two arcs + close-out | both audits | Three arcs (Opus); one arc (Codex: too large to review in one sitting) |
| D11 | Tombstone every user delete | Opus over Codex C2 | Marker-or-membership (more code; same effect) |
| D12 | "Nulo knows" names only entries whose current pins the preview path verified (`verifiedPins`) | Opus S1, final Codex 1 | List names, or the `seeded` outcome (written without a preview for tokens already present) |
| D13 | Mapping rides `getQuotes`; `settled` covers it | both audits | A separate getter and event (reconnect drift; a hero jump) |
| D14 | Domain prefix in `envelope.ts`; no `wallet-crypto` edit | both audits | The KDF separator file (coupling; breaks `--no-install`) |
| D15 | CORS `*`, no host permission; proven from `localhost` and the live leg | both audits | A host permission (store warning; 127.0.0.1 tests prove nothing) |
| D16 | Per-run e2e key from session storage | Opus S7, Codex S6 | A committed test key |
| D17 | Privacy: disclose the per-request zone samples and any Firefox `Origin` | both audits | "Identical request" (false on Firefox if I3 holds) |
| D18 | Sequence floor compiled into builds | Codex S5, Opus S8 | Deferred: it needs a host compromise and matters once delisting removes harm (the scam-flagging issue) |
| D19 | No diff-scope check on the publish PR | Opus S6 | Needs a second writer on the bot branch; the owner reviews the diff |
| D20 | No count quota for leaked-key rows | Codex S4 | A new persistent policy; recorded as a consequence |
| D21 | Arc 1 ships no envelope; merge arc 1, publish, then arc 2 | final Codex 3 | Tests that require an envelope before any key can sign (circular) |
| D23 | Keys are generated by 1Password and installed by a keyed run | owner condition at approval | Owner runs keygen on the Mac (the owner asked the agent to drive it); anything on npm (a public registry) |
| D22 | A seed commit is irrevocable once `persist()` starts | final Codex 4 | Re-checking the epoch after persist (the row already exists; delisting keeps rows anyway) |

## Audit verdicts

**Round 1 (draft of 2026-10-13).**
- **Codex** (`gpt-6.1-sol`, high): **reject**. Its blocking findings were S1 (privacy), S3 (sequence reuse), C1 and C2 (the seeder lifecycle and tombstones), C4 (smoke validity) and R1 (validation wiring).
  - Accepted: S1 → D17/A4; S2 (signer code) → `prepare` summary and closure pin; S3 → D8; S5 → freeze wording; S6 → live stamp; F1 → D5; F2 → Fact 3; F3 → Fact 11; I1 → D15; A1 → Fact 12 (pre-production; a stable promote deploys the policy with the release); A2 → keygen transport; C1 → `invalidate()`; C2 → D11; C3 → single-flight and one deadline; C4 → seam; C5 → D13; R1 → filters, `privileged()`, scripts in a workspace; R2 → field modulus; R3 → D14 and one price table.
  - Partly accepted: the single arc (D10).
  - Recorded, not built: S4 (D20).
- **Opus 5.5** (Plan): **conditional approve**.
  - Accepted: S1 → D12; S2 → D15 live leg; S3 → D17; S4 → D14 and closure pin; S5 → `privileged()`; S7 → D16; S8 → freeze wording; the smoke seam; the I1 backoff; the first-publish dispatch; the source-only trigger; the placeholder-key guard (A5); privacy short version; `CLAUDE.md:103`; the tombstone rule (D11); the hero gap (D13); persisted jitter; single-flight; bidi refusal; check in `test:all` (D9); arcs (D10); A3 at 16.
  - Rejected: S6 (D19).
- **Final fresh Codex pass, round 2** (new session, `gpt-6.1-sol`, high): **reject**, on three blocking findings. It found no rejected alternative that should have won.
  - Accepted: 1, `seeded` is written without a preview → D12 `verifiedPins`; 2, a `secrets.*` predicate would make the network e2e and nightly `resolve` jobs privileged → custom secrets only, plus a mutation test; 3, a circular first publish → D21; 4 (nonblocking), an in-flight persist → D22 and a held-persist test; and that `refreshIfStale` and the incoming-transfer filter consume quotes too → both carry the mapping.
- **Owner: approve (2026-10-13).** A1 to A5 confirmed; A4 is disclose. The one condition: the agent drives the key ceremony with the keyed-run tools (D23).
- **Final pass on the round-2 fixes** (same session, resumed): **approve**. All four findings are closed and no new material defect was found. Implementation review must verify that the marker round-trips and that the named regression tests exist.

## Seeds

ELI5: https://claude.ai/artifact/Mfc36XwwvgdxxiJWZhwJ1F. Its source is `implementations-plan/dynamic-token-list/eli5.html`, which stays local; republish that same path to keep the URL. Final seeds were written after the owner's approval on 2026-10-13. Use exactly one per session, run from inside the worktree (`agent-worktree resume dynamic-token-list`). The plan runs past 350 lines only because of these seeds, which the protocol requires.

**Recommended: `/goal`**

```
/goal All phases marked ✓ in implementations-plan/dynamic-token-list/plan.md (its phase headers, not the chat), each backed by its validation gate reported passing in the transcript; for each phase the agent printed LESSONS_FILE=implementations-plan/dynamic-token-list/lessons/phase-N.md; code_review is off, so /code-review was NOT run; the Codex fix loop (gpt-6.1-sol, high) converged for arc 1 and arc 2 at their boundaries and for the final cross-arc pass, each convergence a resumed Codex pass reporting no new material findings, quoted in the transcript; the O2 key ceremony ran as a keyed run (env-exec request id and the printed public keys in the transcript, no private value anywhere); the stack (arc 1, arc 2, close-out) exists on GitHub, created only after all loops converged (gh stack view output in the transcript), including the close-out that archived the plan (git show --stat of the archive-move commit); bun run test:all and bun run lint exit 0 in the transcript. Owner steps O1 and O3-O6 are requested in chat, never performed by the agent; merging stays the owner's call, in the plan's bootstrap order.
```

**Alternative: `/loop`**

```
/loop 15m Drive implementations-plan/dynamic-token-list forward; never idle waiting for me. Each firing:
1. Reality check from plan.md and lessons/ (the top stack layer's copy once stacked), judged against Outcome & Quality Bar. If the plan path is gone and `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/dynamic-token-list/plan.md` succeeds: ExitWorktree (keep) if entered through EnterWorktree, then `agent-worktree done dynamic-token-list --merged`, report its output (never force), clear this loop, STOP. If it fails, it is delivered and awaits my merge: babysit CI only; once all PRs are green, report once and STOP. A live plan.md with an ## Outcome means an interrupted close-out: finish it.
2. CI waits are fine (gh run watch up to 10 min); use them to review the diff or prep the next phase.
3. Take the next pending step; after each meaningful edit run bun run lint and the touched workspace's tests; commit; gh stack push.
4. O2 is a keyed run you file (env-exec request ... keygen-cli.ts install; give me `op-remote create alejo-box <id>` then `op-remote alejo-box <id>`; env-exec wait in the background). O1 and O3-O6 are mine: ask in chat, keep working on what doesn't depend on them. Never handle a private key.
5. Stuck or facing a decision? /codex high on gpt-6.1-sol until there is a defensible call, act, log it in lessons. Never merge, publish, deploy or expand scope.
6. Same step failed 5 times: stop, reassess with Codex.
7. Phase green = its gate in plan.md passes: paste it, mark ✓, file lessons, print LESSONS_FILE=..., advance. At the arc boundary run the Codex loop on the arc diff (arc map + plan.md's two rules) until nothing material, THEN gh stack add dynamic-token-list-wallet.
8. All phases ✓: run the fresh cross-arc Codex pass from d01569a2 until clean, then Delivery and the close-out per plan.md, then gh pr checks --watch, then the wrap-up report (what shipped, contested decisions with context, open items by number). Stop: merging, in the bootstrap order, is mine.
```
