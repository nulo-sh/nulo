# quality-tooling-1 owner asks

## OA-1 — the sync job when GitHub cannot say which PR a release commit merged

- **Surface**: the `sync-main-to-dev` job of `release.yml` (no screen). After a stable release, it opens the `main → dev` sync PR, which the release runbook then merge-commits.
- **Today**: if `gh api commits/<sha>/pulls` fails (a network, auth or rate-limit error), `open-sync-pr-run.ts` reads the failure as "this is not a Release-PR merge", logs a skip and exits 0. The job is green and no sync PR opens. Its sibling `auto-unstick` fails the job on the same failure, on purpose, so a stuck release cannot look green.
- **Options**:
  - **A (today)**: keep the green skip. A person learns of the missing sync PR only when they look for it.
  - **B**: fail the job with the `gh` error, as `auto-unstick` does. A red job names the failure; a rerun opens the PR.
- **Recommendation**: B. A release step that silently does nothing is the failure `auto-unstick` already guards against.
- **What ships now**: A, unchanged. Arc 1's shared lookup throws, and `open-sync-pr-run.ts` catches it at its call site, so B becomes a one-line change there once decided.
