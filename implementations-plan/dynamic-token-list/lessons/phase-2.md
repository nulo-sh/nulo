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
