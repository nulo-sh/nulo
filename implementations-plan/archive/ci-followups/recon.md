# ci-followups recon

Base `origin/dev` at `af4afcc`. Two Explore agents (sonnet): a batched reuse sweep and a map of the jobs that run Bun with nothing installed. One local probe on Bun 1.4.2 (`lessons/phase-0.md` § Probe). Open PRs at planning time: #271 (`tokens-and-balances`), which touches none of these files.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Refuse Bun's runtime auto-install | Nothing sets `install.auto` anywhere. `verify-store-copies.yml:55` runs `bun --no-install …`, pinned positionally in `scripts/ci-cd/behavior-gating.test.ts:936-938` | adapt: one `[install]` key in `bunfig.toml`; the existing `--no-install` line stays |
| Pin a property of every credentialed or no-install job | `scripts/ci-cd/release-integrity.test.ts`: `loadTree()`, `jobs()`, `step()`, `mutated()`, `unset()`, the `CLEAN` list and `cleanFindings()` (lines 147-182), the clean-tree test plus a `test.each` over mutated copies (386-419) | reuse-as-is: a new finding function in the same shape beside `cleanFindings` |
| Parse `bunfig.toml` | Nothing parses it. `audit-gate.test.ts:215` string-replaces `minimumReleaseAge = 604800` in a copy; `audit-gate.ts:198` lists it in `DEPENDENCY_PATHSPECS` | build new: `Bun.TOML.parse` in the pin (a built-in, no dependency) |
| Read a pull request's live labels | `scripts/ci-cd/live-labels.sh <label>...` writes `label-hit=true|false`, `base`, `read-attempt`; one retry on 403/429/5xx; fails a superseded head. Called by the four e2e lanes' `changes` jobs with a pinned five-key `env` (`behavior-gating.test.ts` § live labels, with a `gh` shim harness `runLive`) | reuse-as-is: a fifth caller in `_unit-tests.yml` |
| Ban reads of an event's label snapshot | `behavior-gating.test.ts` "no workflow or action reads an event's label snapshot" scans YAML only | adapt: the ratchet stops reading `GITHUB_EVENT_PATH` labels, and a test proves the snapshot is ignored |
| Decide a moved acceptance | `scripts/complexity-baseline/scan.ts:361-370` (`MOVE_APPROVED_LABEL`, `ratchetViolations(diff, { movesApproved })`); `complexity-baseline.test.ts:337-355` (`pullRequestEvent`, private `movesApproved(eventPath)`), single caller at ~410 | adapt: `movesApproved` reads the live value from the environment |
| Pin the Docker runner's Bun | `scripts/ci-cd/docker-ci-like-pins.test.ts` already fails when `docker-ci-like.sh`'s `BUN_VERSION` or the pins file's Bun line differs from `packageManager` | reuse-as-is: #239 needs only the CLAUDE.md bullet |

## Jobs that run Bun with nothing installed (12 in scope)

All run from the checkout root; none sets `working-directory:` on a Bun step; no `defaults.run` anywhere.

| Job | Setup | Credential | Checkout |
|---|---|---|---|
| `release.yml#auto-unstick` | composite, `install: "false"` | release App token | own revision, full |
| `release.yml#attach-assets` | composite, `install: "false"` | `contents: write`, `id-token: write`, `attestations: write` | own revision, full |
| `release.yml#sync-main-to-dev` | composite, `install: "false"` | release App token | own revision, full |
| `release.yml#publish-chrome-store` | bare `oven-sh/setup-bun` | WIF access token | `ref: resolve.sha`, full |
| `release.yml#publish-firefox-amo` | bare | AMO JWT secrets | `ref: resolve.sha`, full |
| `nightly.yml#publish-nightly` | composite, `install: "false"` | as `attach-assets` | own revision, full |
| `_release-pr-lockfile.yml#lock-version` | bare | App token, `contents: write` | own revision, full |
| `store-check.yml#chrome`, `#firefox` | bare | WIF token / AMO secrets | `main`, full |
| `verify-store-copies.yml#compare` | composite, `install: "false"` | `attestations: read` | full; already `--no-install` |
| `pr-quick.yml#changes` (audit-mode step) | composite, `install: "false"` | `pull-requests: read` | merge commit, full |
| `pr-quick.yml#preview-comment` | bare | `pull-requests: write` | head, **sparse: `/package.json`, `/scripts/ci-cd/`, `/apps/extension/package.json` — no `bunfig.toml`** |
| `source-rebuild.yml#rebuild-*` | bare | none | installs inside its script, in a `git archive` copy; out of scope |

Import graph of every entry script (transitively): relative, `node:` and `bun` only. No bare specifier, no `pkg@x` specifier, no spawned `bun` process, no `process.chdir`. Nothing relies on auto-install today. Search trail: `from "…"`, `import "…"`, `import(…)`, `require(…)`, `@[a-z0-9-]+/[a-z]|npm:|\w+@[0-9]`, `\[\s*"bun"|process\.execPath|Bun\.which` over each entry and its relative imports.

Elsewhere: `scripts/dup-trend/report.ts:135` (`bunx jscpd@…`), `pr-quick.yml:221` (`bunx commitlint`), `setup-puppeteer` (`bun x puppeteer …`) run in installed jobs; `scripts/ci-cd/test-soak/cli.ts` already passes `--no-install`.

## Bun 1.4.2 behaviour (probe, not only docs)

The shipped docs (`bun-types/docs/runtime/bunfig.mdx:482-498`, `runtime/auto-install.mdx`, `snippets/cli/run.mdx:160,303`) define `install.auto` (`auto` default, `disable`), `--no-install`, and `--config` defaulting to `$cwd/bunfig.toml`; they do not say whether a runtime command reads `[install].auto` or whether Bun walks up for `bunfig.toml`. The probe settled both against a loopback registry that logs requests:

- No `bunfig.toml`, no `node_modules`: `bun s.ts` and `bun -e 'import(…)'` each request the bare package from the registry.
- `--no-install`: no request, for `bun <file>` and `bun -e`.
- `[install] auto = "disable"` in the working directory: no request, including for a script outside that directory.
- The same `bunfig.toml` one directory above the working directory (beside a `package.json`): the request is made. **Bun reads `bunfig.toml` from the working directory only.**
- No env var controls runtime auto-install (searched `BUN_CONFIG_*`, `BUN_INSTALL`, `NO_INSTALL`, `AUTO` in the docs).

## Live labels and the ratchet

- `test:ci-gating` runs in `_unit-tests.yml` (job `unit-tests`, step "Run CI-gating guard test"), called by `pr-quick.yml:235`, `release.yml:246`, `nightly.yml:181`. The reusable workflow has no `permissions:` block, so it inherits the caller's: `pr-quick.yml` grants `contents: read` and `pull-requests: read` at workflow level.
- `pr-quick.yml` runs on `[opened, reopened, synchronize, ready_for_review]`; its comment (lines 16-20) says "nothing in this workflow reads labels", which is false today: the ratchet reads the event's labels.
- A "Re-run failed jobs" re-runs the failed job and its dependents, never a succeeded dependency, so a label read in `changes` would carry its old value into the re-run (`ci-release-supply` solved the same for the e2e lanes with `read-attempt`). A read inside the `unit-tests` job is redone on every re-run of that job.
- Off a pull request (`release.yml`, `nightly.yml`, dispatch) `GITHUB_BASE_REF` is empty and the ratchet returns before deciding moves.

## Bun-bump sites (#239)

`CLAUDE.md:103` lists the composite, the five `bun-version:` literals, the two `@types/bun` pins and the landing Worker's `BUN_VERSION`; its counts match the tree. It omits `apps/extension/scripts/e2e/docker-ci-like.sh:50` (`BUN_VERSION=1.4.2`) and the Bun line of `docker-ci-like.pins.sha256:8`. `SECURITY.md:432` and `:716` defer to the CLAUDE.md list; `SECURITY.md:585-588` already names the Docker pins and their test. No test reads CLAUDE.md's text.

## Collisions

- `bunfig.toml` is in `pr-quick.yml`'s `deps` and `root-config` filters: the PR runs the audit gate in enforce mode and the full builds.
- `audit-gate.test.ts:215` needs the literal `minimumReleaseAge = 604800` to stay.
- `behavior-gating.test.ts:936-938` pins `verify-store-copies.yml`'s third step positionally.
- `release.yml`, `nightly.yml` and the store workflows belong to `ci-release-supply` (arc 5 held): the plan edits two `release.yml` lines (`--no-install` on the store publishers' Bun lines) and nothing else there.
