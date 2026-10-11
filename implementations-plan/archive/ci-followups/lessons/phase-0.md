# Phase 0: planning log

## Probe

Does Bun 1.4.2 auto-install, and which control stops it?

Planning-time probe, run in a scratch directory outside the repository with no `node_modules` anywhere above it. A loopback Bun server stood in for the registry (`BUN_CONFIG_REGISTRY=http://127.0.0.1:<port>/`) and logged every request; each case imported the bare specifier `left-pad-nulo-probe-zz`.

| Case | Registry requests | Result |
|---|---|---|
| `bun s.ts`, no `bunfig.toml` | 1 (`GET /left-pad-nulo-probe-zz`) | `Cannot find package` after the fetch failed |
| `bun --no-install s.ts` | 0 | `Cannot find package` |
| `bun -e 'import("…")'`, no `bunfig.toml` | 1 | fetch attempted |
| `bun --no-install -e 'import("…")'` | 0 | refused |
| `[install] auto = "disable"` in the working directory | 0 | refused |
| same `bunfig.toml` in the parent directory (beside a `package.json`), working directory one level down | 1 | **not honoured: Bun reads `bunfig.toml` from the working directory only** |
| working directory holds the `bunfig.toml`, script in a subdirectory | 0 | refused |
| working directory holds the `bunfig.toml`, script in a sibling directory | 0 | refused |

The first probe used an unreachable registry (`127.0.0.1:9`) and printed the same `Cannot find package` in every case: the error text cannot tell a refused install from a failed one. Only a request log distinguishes them, so the committed test observes requests, not messages.

## Consults

### Round 1, Codex (gpt-6.1-sol, high, read-only), 2026-10-10

Session `01a1282e-51fd-7a82-a68c-8eeb9d785707`. Verdict: **conditional approve** (close D2's coverage gaps, resolve historical-checkout coverage, repair the audit validation commands, make the registry test hermetic). Six findings; dispositions in plan.md § Audit verdicts.

Finding 1 checked before answering: the only stable tag is `v0.30.2`; it and `origin/main` (`80890f3`) carry no bare import in `scripts/release/` (`git show <ref>:<file>` over every non-test file; the tag list from `gh api repos/nulo-sh/nulo/tags`, since `git fetch --tags` failed in the sandbox).

### Round 1, Opus (Plan agent, read-only), 2026-10-10

Verdict: **conditional approve** (fix the audit command; correct "no e2e suite is affected"; catch a `cd` before `bun` and tighten the job selection; say the store publishers read the tag's `bunfig.toml`; isolate the behaviour test from `HOME`). Nine findings; dispositions in plan.md § Audit verdicts. Finding 7 checked: `scripts/ci-cd/live-labels.sh` is absent on `origin/main` and was added by #252, so a post-release sync PR's head would fail an unguarded live step.

Plan v2 folds in both legs: the three other-revision jobs take `--no-install` (replacing v1's sparse-list change), the pin checks each Bun call's control, the behaviour test is hermetic, the live step is guarded on the script's presence, and OA-1 records the revocation choice.

### Final fresh Codex pass (gpt-6.1-sol, high, read-only, new session), 2026-10-10

Session `01a1283c-c981-7061-9ea9-00efa5946a7d`. Verdict: **conditional approve** (repair D2's selection and control checks, correct the sparse-checkout mutation, make the red-on-base procedures executable). All six findings verified and applied as v2.1; dispositions in plan.md § Audit verdicts.

## Rule prototype

To check that D2 v2.1 is implementable, a throwaway script outside the repository applied the selection and the per-call rule to the workflows at `af4afcc` (setup-bun's own steps skipped, other local composites expanded, cone-mode sparse lists treated as including root files).

- Selected: fourteen jobs, the twelve of recon.md plus `source-rebuild.yml#rebuild-x64` and `#rebuild-arm64` (no Bun call in YAML).
- Flagged: exactly four calls, all "another revision without `--no-install`": `preview-comment`'s `bun -e` and `bun scripts/ci-cd/preview-comment.ts`, and the two store publishers' lines. These are the four lines Phase 1 changes.
- No false match: the other fifteen calls passed on the file path; `verify-store-copies.yml`'s call passed on the flag path; no `echo` or `runs-on` text matched.

### Resumed final pass (same session), 2026-10-11

Verdict: **approve**. Two Low documentation corrections (the Phase 1 mutation count, the prototype's call count), both applied.
