# Phase 1: no auto-install in no-install jobs (#260)

## Implementation notes

- **A shared global regex is stateful.** The first draft declared the Bun-call matcher with the `g` flag and reused it in the tests' step finder (`RegExp.prototype.test`) and in `String.prototype.matchAll`. `test()` advances `lastIndex`, and `matchAll` clones the regex *with* that `lastIndex`, so six mutations found nothing. Fix: the constant is non-global, and `autoInstallFindings` builds a fresh `new RegExp(BUN_CALL, "gm")` per step.
- **Selection matches the prototype.** The clean tree selects exactly the fourteen `NO_INSTALL` jobs and examines twenty Bun calls: fifteen pass on the file path, five on the flag path (the four new `--no-install` calls and `verify-store-copies.yml`'s). No false match.
- **Own-revision check also refuses `with.repository`.** Same class as `ref` and `path` (another tree's `bunfig.toml`, or none at the root); the plan named only the two.
- **`install: false` read as a string.** The composite's input is compared with `String(...) === "false"`, so an unquoted YAML boolean still selects the job.

## Red on the base (step 7)

Work committed first (`c003f4a`), then the base copies of `bunfig.toml`, `.github/workflows/release.yml` and `.github/workflows/pr-quick.yml` written over the tree.

- Clean-tree test fails on its own assertion, listing exactly: `bunfig.toml: Bun may auto-install a missing import`, and "runs Bun without --no-install where its own revision's bunfig.toml may be missing" for `pr-quick.yml#preview-comment`, `release.yml#publish-chrome-store` and `release.yml#publish-firefox-amo`.
- Behaviour test (refusal), base `bunfig.toml` only: exit non-zero, then fails on `expect(requests).toEqual([])` with `["/left-pad-nulo-probe-zz"]`.
- Restored with `git checkout HEAD -- <the three files>`; `git status --short` empty; the file again 49 pass, 0 fail.

## Job probe (step 8)

`git archive HEAD` exported to a scratch directory outside the repository (no `node_modules` in any ancestor); `import "left-pad-nulo-probe-zz"` added as the first import of `scripts/release/lock-version-run.ts`; `bun scripts/release/lock-version-run.ts` run from the copy's root with `HOME`, `TMPDIR` and `BUN_INSTALL_CACHE_DIR` in a scratch directory and `BUN_CONFIG_REGISTRY` at a loopback server that logs each request and answers 404.

| Copy's `bunfig.toml` | Registry requests | Exit |
|---|---|---|
| committed (`auto = "disable"`) | 0 | 1, `Cannot find package 'left-pad-nulo-probe-zz'` |
| `auto` line removed | 1 (`/left-pad-nulo-probe-zz`) | 1, same message |

The copy was deleted afterwards.

## I2 and I3 (step 10)

- `BUN_INSTALL_CACHE_DIR=<fresh dir> bun run audit:dup`: exit 0; the fresh cache held `jscpd@5.0.16` afterwards, so `bunx` still fetches cold under `auto = "disable"`.
- `audit-gate.ts mode --base af4afcc --head HEAD`: `audit mode: enforce (bunfig.toml changed)`.
- `bun audit --audit-level=low --json` (exit 1) through `audit-gate.ts --mode enforce`: `41 acknowledged, 0 unacknowledged, 0 stale, 0 unreadable`, exit 0.
