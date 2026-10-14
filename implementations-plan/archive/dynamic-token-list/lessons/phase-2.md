# Phase 2 — host and publish

## Deviations from plan.md (each with the reason)

- **The path filters land in arc 1, not P3.** `behavior-gating.test.ts` requires every library the extension depends on to be in the smoke, network and quick filters, and P1 made `@nulo/token-list` one. `packages/token-list/src/**` and its `package.json` now sit beside the third-party-notices lines in all five PR workflows.
- **`recovery.env.example` joins `keys.env.example`.** The recovery signing run is a keyed run too, and its template names only `TOKEN_LIST_RECOVERY_SEED`; its comments carry the full `sign-cli` command.
- **The `SECURITY.md` "Request" bullet moves to P6.** It describes the wallet's fetch, which arc 1 does not ship.
- **`privileged()` now reaches two AMO jobs.** Counting custom-secret reads made `release.yml#publish-firefox-amo` and `store-check.yml#firefox` credentialed; both run only `oven-sh/setup-bun`, now pinned in `THIRD_PARTY`.

## Facts found

- env-exec runs an approved command in the requesting worktree, and at run time needs a clean tree with HEAD equal to the approved, pushed commit. A detached worktree at that commit (`git worktree add --detach`) lets edits continue in the main one; remove it after the run.
- wrangler parses `public/_headers` and never serves it as an asset.
- A GitHub step summary renders Markdown with HTML: an HTML comment in a token name hides text from the approver. Backslash-escaping every ASCII punctuation mark shows it verbatim.
- An all-zero Ed25519 public key is a small-order point, and WebCrypto accepts some forged signatures under it. A placeholder key must not be base64url at all.

## Arc 1 implementation review (Codex `gpt-6.1-sol`, high)

**Round 1: reject**, one blocking finding. All seven accepted:
1. (blocking) The summary's own code was outside `SIGNING_PATHS`, so a merged change could show one token set and output another's digest. Fix: `infra/token-list/scripts` and `package.json` join the list; a test walks every file the workflow runs and their imports and requires each to be listed.
2. A token name could carry markup the summary renders invisibly. Fix: escape all ASCII punctuation; rendering test.
3. A fork PR named `token-list-publish-<seq>` would be reused and close real publish PRs. Fix: `publishPrs` keeps this repository's heads only; fork-collision test.
4. The all-zero placeholder verified forged signatures. Fix: a non-base64url placeholder; the test now requires `bad-key`.
5. `toJSON(secrets)` escaped `privileged()`. Fix: any `secrets` read inside a `${{ }}` expression except `secrets.GITHUB_TOKEN`; mutation case.
6. `require()` escaped the import-closure scan. Fix: refuse `require(` and `import(`; mutation cases.
7. (nit) Two file headers restated the code. Fix: one sentence each; the two non-obvious whys moved onto their functions.

**Round 2 (resumed): conditional approve.** All seven fixes verified closed. One new should-fix, accepted: the `${{ }}` span extractor stopped at a `}}` inside a quoted literal, so `format('}}{0}', secrets.X)` hid the read. Fix: a quote-aware extractor; mutation case. Scanning the whole text instead was tried and rejected: it flags `_extension-network-e2e.yml#network-e2e` on a shell comment that says "secrets".

**Round 3 (resumed): approve.** "No NEW material findings or comment issues in arc 1."

## Key ceremony (O2)

- Keyed run `token-list-keys-925e45c1`, approved by the owner with `op-remote`: `keygen-cli.ts install` set `TOKEN_LIST_SIGNING_KEY` in the `token-list` environment (owner reviewer, branch policy) and printed only the public keys, `nulo-ci-1` `Al201vPu8pwqVmqmVBOxQqozL55HI0oViOA1QVeU6k4` and `nulo-recovery-1` `zxIA-cxJ7IPlSvaDWEW5V8UgFfzne2RsHoCN8kg1tl0`. Both seeds stay in 1Password.
- **Deviation:** `FORMAT.md` now publishes the keys, as its README asked, and `check.ts` refuses a key table that differs from `keys.ts`, so a rotation cannot leave a stale key where third parties verify.

**Keys review (same Codex session, resumed).** Round 4: **conditional approve**, one should-fix: the table check matched rows anywhere and skipped rows it could not parse, so an unquoted row, a fenced copy or a newline in a `keyId` could pass. Fixed: only the one table under "Public keys", every data row must parse; regressions for each. Round 5: **conditional approve**, one should-fix: Markdown keeps a line without a leading pipe inside the table. Fixed: the capture runs to the blank line; two regressions. Round 6: **approve**, "No new material findings. Both continuation-row bypasses are refused; reverting the capture reopens both."

## Gate

`bun run --cwd infra/token-list test` (18 passed, 3 live skipped; the tree test now passes on the real keys), `deploy:dry`, `test:ci-gating` (535 pass), `lint:actions`, `lint`, `typecheck:all` and `check:plans` exit 0. The sign-cli round trip on a throwaway key is the tree test "accepts an envelope sign-cli wrote".
