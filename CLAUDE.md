# CLAUDE.md

Operating rules for AI assistants (and any contributor) working in this repository. This file is the **ruleset**, not the architecture. For architecture, read [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Pointers — read these once before you start

- [`BEFORE-LAUNCH.md`](./BEFORE-LAUNCH.md) — what is still blank in the legal documents and **when** each blank is due (before v1.0.0, at the store listing, on the v1.0.0 promote, on every later promote). Check it before any `release: promote dev → main`.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — process boundaries, message flow, storage versioning, offscreen lifecycle, session model, concurrency, account contract, fee model, test taxonomy.
- `packages/<name>/README.md` — per-package purpose, file map, scripts, testing, key invariants.
- **The any-ERC-20 bridge and its tools app live in [`alejoamiras/unleashed`](https://github.com/alejoamiras/unleashed)**, not here: its `packages/bridge-core` (the generation model, the conductor + verifier scripts, the salt/leaf/portal invariants), `contracts/bridge` (the factory / clone / router threat model, the hub, the split Noir/JS toolchain) and `apps/tools` (the tools app + Send wizard). **§ The wallet repo** below says what crosses the repo line.
- [`apps/extension/tests/e2e/README.md`](./apps/extension/tests/e2e/README.md) — e2e suite layout, parallel-safe agent runner, helper conventions.
- [`apps/extension/tests/e2e/FIREFOX.md`](./apps/extension/tests/e2e/FIREFOX.md) — how the e2e suite drives Firefox, every behaviour that differs from Chrome and where the suite absorbs it, and the rule that a browser difference lives on `BrowserDriver`. Read before touching `tests/e2e/fixtures/browser/` or debugging a Firefox-only failure.
- [`apps/extension/tests/COMPOSITION-TESTS.md`](./apps/extension/tests/COMPOSITION-TESTS.md) — **normative** rules for the `*.composition.test.ts` layer (drive the real service graph in-process against dumb fakes): when to use it, the hard limits (shallow PXE **and** bb-free **and** no simulate/prove), the failure taxonomy. Read before adding a composition test.
- [`implementations-plan/README.md`](./implementations-plan/README.md) — the planning standard: what a plan commits and what stays local, how a plan closes, the portable rules. Read [`implementations-plan/lessons.md`](./implementations-plan/lessons.md) before starting a task.

## The wallet repo — the bridge lives in `alejoamiras/unleashed`

This repo ships **one product, the Nulo wallet** (`apps/extension`), plus what serves it: the generic test dApp [`apps/playground`](./apps/playground/README.md), the landing (`apps/landing`) and the `packages/*` layers. The any-ERC-20 bridge, its tools app, their CI and their plans live in [`alejoamiras/unleashed`](https://github.com/alejoamiras/unleashed).

- **`apps/extension` is a wallet.** It must work with **every wallet-sdk dApp** in the Aztec ecosystem, so its e2e drive it against `apps/playground` — a deliberately generic dApp — never against a product dApp. The Nulo-custom RPCs (`registerToken`, `isTokenRegistered`, `grantPublicAuthwit`, via `@nulo/wallet-sdk-schema-patch`) are optional enhancements: a dApp calling them must **fail open** on a wallet that lacks them, and the standard surface (`requestCapabilities`, `registerContract`, `executeUtility`, `simulateTx`, `sendTx`, `createAuthWit`) never depends on them.

Rules that follow:

- **The playground stays generic.** It reaches the wallet only through `@aztec-labs/wallet-sdk` (plus the fail-open custom RPCs) and never imports from `apps/extension/src`; the extension never special-cases it. Otherwise a green e2e proves the pair, not the wallet.
- **No gate depends on another repo.** No test here boots, builds, installs or selects the bridge dApp; the extension driving it is a manual pre-release smoke, not a CI gate.
- **Nothing here imports, fetches or reads unleashed; what crosses the line is data.** Chain identity: each repo keeps its own constants (here `apps/extension/src/utils/chain-ids.ts`). The PrivateFPC canonical address: pinned wallet-side by `apps/extension/src/wallet/services/fpc/protocol-fpcs.test.ts`; the contract is initializerless and private-only, so nothing deploys it, and unleashed's manifest must name the same address. The default tokens (Test USDC, USDT, EURC and GBPC on Testnet) mirror the L2 tokens unleashed's testnet generation pre-creates (`bridge.tokens[].l2Token` in its `apps/tools/public/testnet-bridge.json`). They live once, in the signed token list's source, `infra/token-list/list.source.json`, with their price ids; wallets fetch the published list from `tokens.nulo.sh`, so a change reaches them with no release, and the `aztec-update` skill's reset step publishes a list keyed on the new chainId when that generation moves. User-facing links, both the owner's choice: the landing links no tools app, and the fee card's `FEE_JUICE_BRIDGE_URL` default is unleashed's testnet app, `https://testnet.app.unleashed.systems`, one link for every network. Changing a list entry or a link is an owner UI decision.
- **Three packages are also staged for npm** by [`scripts/publish/`](./scripts/publish/README.md) as `@nulo-sh/wallet-crypto` (key derivation + `EncryptionKey` only), `@nulo-sh/resolve-asset` and `@nulo-sh/wallet-sdk-schema-patch`: the surface unleashed consumes. The workspaces stay `private` under their `@nulo/*` names; every published entry (`packages/wallet-crypto/src/public.ts`, `packages/resolve-asset/src/index.ts`, `packages/wallet-sdk-schema-patch/src/{apply,register}.ts`) and `scripts/publish/packages.ts` is an npm API, so widening one is an API change. Publishing is `publish-packages.yml`, owner-approved, provenance-attested and tokenless.
- **Shared code lives in a package, never in another app.** `@nulo/design` and `@nulo/legal` serve the extension and the landing, `@nulo/wallet-sdk-schema-patch` the extension and the playground; each is a workspace package with its own tests, and an app importing from another app's `src/` is a layering violation.

## Skills own their domains — route new lessons to them

Project skills in [`.claude/skills/`](./.claude/skills/) are the source of truth for their domain's procedure + accumulated know-how. This file is the ruleset + index; the depth lives in the skill. **When you learn a durable lesson, write it into the owning skill — not an inline comment, not a new paragraph here.**

| Learned something about… | Update this skill |
|---|---|
| Bumping the Aztec line (`@aztec-labs/*`, `@aztec-foundation/*`) — rc bumps, protocol forks, testnet resets | [`aztec-update`](./.claude/skills/aztec-update/) |
| Anything bridge-side — a generation (factory + router + hub), its contracts, the tools app | not this repo: [`alejoamiras/unleashed`](https://github.com/alejoamiras/unleashed), which owns the bridge generation runbook, the Noir contract surface and the bridge drift detectors |
| Writing/running E2E — fixtures, flake root-causes, selector rules, the parallel-safe runner | [`e2e-testing`](./.claude/skills/e2e-testing/) |
| Debugging the extension — popup/offscreen/SW, DevTools-MCP techniques, network/console gotchas | [`chrome-extension-debug`](./.claude/skills/chrome-extension-debug/) |
| How CLAUDE.md itself is maintained | [`update-docs`](./.claude/skills/update-docs/) |
| The **release** process — cut/unstick/publish/deploy/sync, a new failure mode | [`release`](./.claude/skills/release/) |
| Complexity budgets — a `biome-ignore lint/complexity` directive, the baseline manifest, a Biome bump's re-stamp, the duplication trend | [`complexity-budgets`](./.claude/skills/complexity-budgets/) |
| Logging — what may reach a log line, the redactor and its guard, log levels and flags, the log viewer | [`logging-policy`](./.claude/skills/logging-policy/) |

**Routing for anything you learn:** a *rule/policy* → here; a *durable domain procedure/technique* → the owning skill above; a *cross-task gotcha* → [`implementations-plan/lessons.md`](./implementations-plan/lessons.md), one line linking its evidence; an *open follow-up* → a GitHub issue; a *suspected exploitable weakness* → a private draft security advisory (§ [Where open work lives](./implementations-plan/README.md#where-open-work-lives)); a *plan-specific debugging log* → `implementations-plan/<plan>/lessons/`. Re-check this table when you add or rename a skill.

## Working in this repo

- **Bun** is the package manager. No yarn/npm/pnpm. Pinned to `1.4.2` via `package.json#packageManager` + `setup-bun` action. **Local minimum is 1.4** — the parallel scripts (`audit:vue`, `dev:full`) use `bun run --parallel`. `bun.lock` is `lockfileVersion: 2` (regenerated under the isolated linker), which **Bun ≤1.3 cannot read** — every host that installs must run ≥1.4: local, CI (`setup-bun`), and the Workers Builds of the `nulo-landing` and `nulo-tokens` Workers (`BUN_VERSION` build variable — the build image honors no version file).
- **The linker is `isolated`** (`bunfig.toml`; `globalStore` deliberately off — opt in per user via `~/.bunfig.toml` on a trusted single-user machine only). A workspace's source resolves ONLY what its `package.json` declares, plus the root devDependencies. A third-party package also reaches Bun's store fallback (`node_modules/.bun/node_modules`), which links one copy of every package name in the store, so it can import what it never declares and still resolve (why the fallback stays, and the importers that need it: [#172](https://github.com/nulo-sh/nulo/issues/172)). Workspace source never resolves through it, but its typecheck sees the ambient types a dependency's `/// <reference types="node" />` pulls in: a workspace that uses `Buffer` or `node:*` declares `@types/node` and lists `node` in `types`. Declare every package a workspace imports, including type-only imports and build-plugin-injected specifiers (`vite-plugin-node-polyfills/shims/buffer` is injected into every transformed module; alias it to the app's own copy, as `apps/extension` does), and list every Node builtin a bundle needs at run time in its app's `nodePolyfills` `include`: one left out silently binds whatever npm package of that name the fallback holds, or becomes an empty stub with only a build warning. **A tree keeps what an earlier install linked**: Bun 1.4.2 does not prune a removed dependency, so a leftover import passes locally and fails on CI's fresh install: prove a removal on a fresh install ([evidence](implementations-plan/archive/vitest-vite8-dedupe/plan.md#fresh-install)). `bunx <tool>` takes the tool from `node_modules/.bin` in the working directory or any parent, else installs npm `@latest` into its own cache, past the lockfile and the age gate: at the root, where only root dependencies are linked, use workspace scripts (1.4.2, [evidence](implementations-plan/archive/plans-scaffolding/plan.md#root-bunx)). The git hooks and `scripts/` never call `bunx`: they run the worktree's own installed launcher by path on Bun (the hooks as `bun --no-install ./node_modules/.bin/<tool>`), so before `bun install` they stop instead of fetching (`scripts/ci-cd/githooks.test.ts`). Never walk `node_modules` by hand to find another package's files: use [`@nulo/resolve-asset`](./packages/resolve-asset/README.md), which resolves from the CALLER's location on any layout. Source-level sweep: `bun scripts/phantom-sweep.ts` from the repo root; CI's clean-room builds are the authority for injected ones.
- **Biome** handles lint + format. Layer-import rules are enforced via `noRestrictedImports` overrides in [`biome.json`](./biome.json); violations fail `bun run lint`.
- **Unit/component tests run on the Bun runtime.** Every workspace `test` script but three (and the extension's `test:components`) is `bun --bun vitest run …`: vitest's launcher AND its workers execute on Bun 1.4, so CI's test runtime is the pinned Bun, not the runner's ambient Node. `infra/passkey-rp`'s and `infra/subscribe`'s `test` is `bun test`. `packages/resolve-asset`'s plain `vitest run`, the Puppeteer e2e layer (extension `test:e2e`/`test:e2e:all`, `e2e:agent`) and `packages/design`'s `test:watch` stay on Node. Every unit/component vitest config (not the three Node e2e configs) spreads `sharedTest` from the root [`vitest.base.mts`](./vitest.base.mts): its `deps.interopDefault: false` is a **stopgap** for vitest 4 — Bun's ES-module namespaces answer `"__esModule" in ns`, which vitest 4's interop mistakes for CJS and drops named exports (zod's `z`); fixed upstream in vitest ≥ 5.0.0-beta.3 (vitest-dev/vitest#10363) — delete the key and re-run the soak matrix once the installed vitest has it. Never set `experimental.viteModuleRunner: false` (needs `module.registerHooks`, absent on Bun). A test-runtime change has one of two bars, the owner's decision of 2026-10-23 (D17 in the deps-audit-1 plan's decision ledger). **An engine change** (a Bun version bump, a suite flipped between Node and Bun, retiring the `deps.interopDefault` stopgap) passes the fail-closed soak matrix in `scripts/ci-cd/test-soak/` (30 retry-0 runs per suite on both engines at ONE clean commit after `bun install --frozen-lockfile`, inventory-exact compare except the reviewed Bun-only files `BUN_ONLY_FILES` pins in its `lib.ts`, which the Node reference skips and whose every test must pass every Bun run, `test:all` ×5, a `workflow_dispatch` of `pr-quick.yml` bound to that commit) — see `implementations-plan/archive/vitest-on-bun/`. **A same-engine dependency bump** (vite, vitest, their plugins) passes, at ONE clean commit after `bun install --frozen-lockfile`:
  - `bun run test:all` three times, every run green at retry 0, each workspace on the runner its `test` script names;
  - a test inventory identical to the base commit's. It is read for each vitest workspace from a one-run `cli.ts soak --runtime script` summary, and for `infra/passkey-rp` and `infra/subscribe` from their `bun test` JUnit reports. Every test both commits hold must match exactly. The only allowed difference is a test the change itself adds or renames, listed in the PR;
  - a `workflow_dispatch` of `pr-quick.yml` bound to that commit, green.

  Every red run is filed and diagnosed, never retried. At this tier, a red that reproduces at the base commit is pre-existing and does not block. Any other red is fixed at its cause, and the bar reruns at the fixed commit.
- **Commitlint** enforces Conventional Commits (`feat:`, `fix:`, `chore:`, …). Subject line must be lower-case (`subject-case`); name an identifier in backticks or quotes, which commitlint does not case-check.
- **Pre-commit hook** (`.githooks/pre-commit`) runs `biome check --staged`, `scripts/check-no-local-paths.sh` (absolute home-directory path guard; CI runs it too, through `test:ci-gating`, so a `--no-verify` commit cannot land a home path) and the complexity scan (`scripts/complexity-baseline/check.ts --staged`). **Commit-msg hook** validates the message. Each runs the worktree's installed Biome or commitlint and, until `bun install` has run in that worktree, refuses with one line. `core.hooksPath` is shared by every worktree of a clone; each worktree runs the hooks its own checkout carries. Both auto-install on `bun install` via the `prepare` script, which is a no-op outside a git checkout so the source archive Mozilla reviewers rebuild installs cleanly (`apps/extension/store/SOURCE-BUILD.md`).
- **`bun run audit:vue`** is the one-shot pre-PR gate. It runs `typecheck:all`, `test`, and `lint` CONCURRENTLY (`bun run --parallel`, Foreman-prefixed output), then `build` after all three pass. It does NOT run e2e — those are separate (`test:e2e` for smoke, `e2e:agent` for network).
- **`noExplicitAny`** is enforced as an error. Use `unknown` and cast at usage sites. Suppress with `// biome-ignore lint/suspicious/noExplicitAny: <reason>` only at genuinely untyped boundaries.

## UI changes need explicit owner sign-off

Any change to what a user sees — a screen's layout, its copy, which rows it shows or hides, how a value is formatted — is a product decision, and only the owner makes it. This holds inside security, refactor and dependency work too: a remediation may *add* information to a screen, but it may not change how the screen reads without the owner seeing it first. (An approval-card regression came from a security batch that replaced the parsed payload with raw 32-byte fields and untruncated addresses; every audit approved it, nobody looked at it.)

- **Plans call it out.** A `/blueprint` plan lists every user-visible surface it touches under a `UI impact` line, with a before/after description or mockup. No line, no UI change.
- **Sign-off is explicit and recorded** — a message from the owner naming the surface, quoted in the plan or the PR body. A reviewer's or audit's `approve` is not a sign-off; a passing test is not a sign-off.
- **Wire-shaped fixtures for dApp-facing surfaces.** A component test for anything that renders dApp data (the execute / connect / sign windows) feeds at least one fixture shaped as the wire carries it — `aztec_sendTx` arguments are `0x` + 64 hex fields, never `5n` — so a rendering that only works on friendly test values cannot pass.
- **Screenshots close the loop.** A PR that changes a popup surface attaches a screenshot or artifact of the result; the smoke e2e counts rows, it does not read them.
- **No em dash joins two clauses in user-facing copy.** A full stop does; the empty-value "—" stays. `apps/extension/src/utils/copy-dash-ban.test.ts` fails on the forms it can read (string and template literals, template text and attributes, outside log calls), and its header lists the ones it cannot; text no screen shows, or an empty value inside a label, goes on its reviewed list with a reason.
- **Error and refusal text is `txt-danger`, never `--red`**, which reads 3.56:1 on the light page; `red` paints glyphs, fills and borders. `apps/extension/src/utils/red-text-ban.test.ts` fails on a `color`, class or style naming red on anything but a glyph, and on a stylesheet `color` naming `--red`; large text, a glyph or a recorded decision goes on its reviewed list with a reason.

## Tooltips and the glossary

- Two kinds of tooltip only: the label of an icon-only button, or the definition of a dotted
  term. A warning or a choice is never a tooltip; it is visible text.
- Every definition lives in one module (`apps/extension/src/utils/glossary.ts`),
  which Settings → Glossary renders. A dotted term takes a glossary key, never its own text,
  so the tooltip and the glossary cannot disagree; a test fails on a key with no entry.
- A new dotted term or a changed definition is a UI change: owner sign-off, and the glossary
  entry lands in the same PR.
- At most two dotted terms per screen; one sentence, 100 characters at most.

## Branching + merging

- `dev` is the **default branch** and the integration lane. Feature work happens on short-lived branches off `dev` (named `feat/...`, `fix/...`, `chore/...`, `refactor/...`, `docs/...`, `test/...`, `deps/...`) and lands via **squash-merge** PRs — dev's history stays essentially linear, one commit per merged feature PR. **The one exception is the post-release `chore: sync main → dev` PR, which is MERGE-committed** (not squashed) so `main`'s release commit stays in `dev`'s ancestry — the prerelease version-anchor needs it. So `dev` carries a periodic sync merge commit; everything else is a squash.
- `main` is the **stable branch**. main advances via two PR types — both use a **merge commit** (not squash):
  - `release: promote dev → main` PRs land the next release-candidate set of features.
  - `chore(main): release X.Y.Z` PRs are opened by **release-please** after every push to main. Merging one starts the release: the workflow tags the merge commit, builds and checks the artifacts, and publishes the GitHub Release with them and the git-cliff notes. The landing (`nulo.sh`, the `nulo-landing` Worker) is redeployed by Workers Builds from pushes to `main`, not by the release workflow. The token list (`tokens.nulo.sh`, the `nulo-tokens` Worker) is redeployed by Workers Builds from pushes to `dev`, so merging a publish PR is what publishes a list.
  Read main's own timeline via `git log main --first-parent`.
- **Merge type is enforced per branch via GitHub rulesets**: dev allows `squash` **and** `merge` (merge is reserved for the post-release sync PR — see above; feature PRs still squash by convention + the merge-button default), main allows only `merge`. The repo-level toggle has both enabled, and the per-branch ruleset narrows what's selectable at PR-merge time. (dev allows `merge` because a squash-only ruleset HARD-blocks the history-preserving sync — not bypassable by `--admin` or a bypass actor; see `implementations-plan/archive/release-prerelease-fix/`.)
- Both branches require **signed commits** (SSH or GPG — the merge's squash commit is GitHub web-flow-signed, CLI or UI). **Both branches require five status gates — `quality-status`, `extension-network-e2e-status`, `extension-smoke-e2e-status`, `extension-smoke-e2e-firefox-status` and `extension-network-e2e-firefox-status`** (the *produced* check-run names — a GitHub Actions normal job's check-run is named its bare job `name:`, with no `Workflow /` prefix), each app_id-pinned to GitHub Actions in `required_status_checks.checks`. Smoke and the Firefox network lane are **required** on both, not advisory; only the owner changes a branch's required set, a promotion through the same runbook (`scripts/ci-cd/required-checks.sh --add … --branch <branch> --expect <snapshot>`; the script adds and renames checks, it never removes one). **Check names say what they gate** (`extension-*`; `quality-status` is repo-wide) — a renamed aggregator job blocks every merge on that branch until the protection is repointed, so renames ship with the runbook: `scripts/ci-cd/required-checks.sh print --branch dev --json > <file>` (review it), then, right before merging the rename, `scripts/ci-cd/required-checks.sh --apply --branch dev --expect <file>`; `main` gets the same two steps at its next promote. `scripts/ci-cd/behavior-gating.test.ts` pins each PR workflow's aggregator name to the list the runbook renames onto.
- **Branch-up-to-date is NOT required on `dev`** (legacy branch protection's `strict` flag is off; `main` keeps `strict: true`). A new dev commit does not invalidate your PR's green CI, so you don't need to re-run the 25-min Extension network e2e every time someone else merges. The required checks only have to be green on your PR's own commits.
- **Force-pushes and branch deletions are blocked.** Use a feature branch + PR for everything.
- **Merging needs no `--admin`.** Two independent gates protect both branches: the required status checks above, and `required_signatures`. For a **self-authored** squash GitHub signs the squash on your behalf, so a green self-authored PR merges with a plain `gh pr merge --squash`. Keep your branch commits signed anyway (a dropped SSH agent → unsigned → can still block non-author merges). `--admin` (and the raw `PUT .../merge` API) bypass **both** gates — emergency/admin-only, never a routine path. When you genuinely must bypass: `gh pr merge <n> --squash --admin --delete-branch` (the squash still lands `verified=true`). (Why a required context must be the bare check-run name and never `Workflow / Job`: `implementations-plan/archive/required-check-mismatch/`.)
- **PR title becomes the squash commit subject on dev.** Write PR titles as real Conventional Commits — `feat(send): ...`, `fix(passkey): ...`, `chore(deps): ...`. The PR body becomes the commit body.
- **PR-title length: keep the title ≤ 92 chars.** On squash-merge GitHub appends ` (#NNNN)` to the subject, which must fit `commitlint`'s `header-max-length` (100): `len(title) + len(" (#NNNN)") ≤ 100`. CI lints a PR's commits (`base..head`; skipped on PRs to `main`, on the main → dev sync PR and on Dependabot's PRs), never its title, so a title that breaks the rule lands on `dev` as written and only a history rewrite (force-push, blocked on protected branches) fixes it. Every commit subject on a PR's branch stays ≤ 100 as well: the range lint reds on one, and fixing it means amending + force-pushing that branch, which is only an option on non-protected branches.
- **Promote PR naming**: `release: promote dev → main` followed by a short content summary in parentheses, e.g. `release: promote dev → main (biome schema bump, lockfile refs migration)`. Becomes the merge commit subject on main — write it like a release note.

## Dependency policy

See [`SECURITY.md`](./SECURITY.md) "Dependency policy" for the full version. TL;DR:

- **`minimumReleaseAge = 604800`** (7 days) in `bunfig.toml` — blocks fresh npm publishes. CVE bypass: edit `bunfig.toml` `minimumReleaseAgeExcludes`, install, then delete the exclude again **in the same PR** (a frozen install never re-gates; prove it with `bun install --frozen-lockfile --force`). Until that version is 7 days old, a `package.json` edit in a workspace that reaches it re-gates it and fails the install — wait, or resolve with an uncommitted local exclude (SECURITY.md, runbook step 4).
- **Dependabot updates GitHub Actions only** (`.github/dependabot.yml`, pinned by `scripts/ci-cd/dependabot.test.ts`): one grouped weekly PR after a 7-day cooldown, titled `chore(deps): …`. It cannot read Bun's lockfile, so npm dependencies, Bun, Biome and the Aztec line are bumped by hand. Dependabot guesses the case of `bump` from `dev`'s recent history, so its commits are not linted (CI.md § `pr-quick.yml`); its titles can also pass 92 characters, so the merger fixes the subject that lands: right before merging, rewrite the title as a lower-case Conventional Commit of at most 92 characters (`gh pr edit <n> --title "chore(deps): bump …"`), then squash, never a merge commit. A Dependabot push may rewrite the title, so recheck it after an update.
- **`bun audit`** runs at every severity in CI (`_lint-and-typecheck.yml`, through `scripts/ci-cd/audit-gate.ts`). A PR whose dependency files change beyond `"version"` lines fails `quality-status` on an advisory with no matching entry in `scripts/ci-cd/audit-acks.json`, on an entry no advisory matches, or on an audit result the gate cannot read; Release PRs, the sync PR, push, nightly and release only report. Fix before acknowledging; an entry needs a reason and the event that reopens it (SECURITY.md).
- **The age gate holds transitives on `bun update --latest` too** (Bun ≥ 1.4; probe evidence in `implementations-plan/archive/bun-1.4-bump/plan.md#age-gate-probe`). `bun update` and frozen installs never re-gate an already-locked version (evicting one = deliberate lockfile regeneration); a manifest edit does, for the edited workspace's tree. Review every bump with `bun pm diff`; triage advisories with `bun audit fix --dry-run` (full workflow in SECURITY.md).
- **`@aztec-labs/*` and `@aztec-foundation/*` outside the policy** — exact-pinned on one version line, bumped manually. **Any Aztec version bump follows the `aztec-update` skill** ([`.claude/skills/aztec-update/SKILL.md`](./.claude/skills/aztec-update/SKILL.md)): it classifies the bump first (version-only vs a NETWORK RESET, which moves the wallet's chain identity), then walks the full pin surface (`@alejoamiras/presto`, `@aztec-foundation/aztec-standards` and `@alejoamiras/private-fee-juice` + patches + min-age excludes), the drift detectors and the execution canaries, and — on a reset — the wallet side only: the chainId cascade and the client-side reset (storage baseline, per-chain purge). The bridge's generation redeploy belongs to `alejoamiras/unleashed`. The running list of types coupled to the Aztec packages' shape is logged in [`UPDATE.md`](./UPDATE.md).
- **Every dependency the extension bundles must pass the third-party notices policy.** The build emits `THIRD-PARTY-NOTICES.txt` from what it actually rendered (main + worker builds) and REFUSES a licence outside the allowlist, a package with no licence metadata or no licence file, a stale or unused override, and an unclaimed compiled asset or font (a font claim is bound to the file's SHA-256 and judged by `FONT_ALLOWED`, so replacing a font in `@nulo/design` means re-reviewing its record) — see [`packages/third-party-notices/README.md`](./packages/third-party-notices/README.md). Loosening `ALLOWED` or `FONT_ALLOWED`, or adding an `OVERRIDES` / `VENDORED` record without a tagged upstream source, is weakening a quality gate. The generator never writes a copyright line; neither do you.
- **A Bun-version bump needs a manual sync**: changing `package.json#packageManager` does NOT change `.github/actions/setup-bun/action.yml` (the version input + its two cache-key occurrences), nor the five `bun-version:` literals outside it (`release.yml`'s `publish-chrome-store` / `publish-firefox-amo`, `store-check.yml`'s two jobs, `publish-packages.yml`'s `pack` job, which skips the composite to stay off the shared cache), nor the exact `@types/bun` pins in the root and `apps/extension` `package.json` (the types the root and extension `scripts/` are checked against), nor the local Docker runner's two pins (`apps/extension/scripts/e2e/docker-ci-like.sh`'s `BUN_VERSION`, and the Bun line of `docker-ci-like.pins.sha256`, re-pinned from the release's `SHASUMS256.txt`), nor the out-of-repo sites: the `BUN_VERSION` build variable on the Workers Builds of the `nulo-landing` and `nulo-tokens` Workers — dashboard-only. CI catches only the Docker runner's pair (`scripts/ci-cd/docker-ci-like-pins.test.ts` fails until both match `packageManager`) — review the bump's diff for every other site and keep all the sites on one line. A Bun bump also requires the machine-wide local bun ≥ the pinned line before merge (the `--parallel` scripts need it, and the v2 lockfile needs ≥1.4).

## Account-address freeze (production invariant)

Account addresses are a **frozen, versioned artifact of the address regime the build binds**, not a side effect of whatever `@aztec-labs/accounts` ships. The full freeze surface lives in `packages/aztec-runtime/src/account/`: the vendored `artifacts/SchnorrAccount.json` (byte-exact, provenance in `artifacts/PROVENANCE.md`), `frozen-artifact.ts` (sha256 + loaded-class-id pins), `instantiation-descriptor.ts` (frozen ctor name/args/salt/immutablesHash/deployer, consumed by BOTH the address derivation and the first-tx ctor call), and `address-freeze.ts` (the regime record). Rules:

- **Append-only regimes; each build binds exactly one, the last.** `REGIMES` in `address-freeze.ts` is an append-only historical record; a build binds at compile time to exactly one entry (`V6_REGIME`), the last one appended. Editing or removing an entry, or binding an earlier one, is forbidden — the paired test (`address-freeze.test.ts`) independently hardcodes every entry, asserts the bound entry is the last, and reds on any of it.
- **The vendored artifact + descriptor are never bumped with the Aztec line.** A bump must leave the KAT (`derivation-vectors.test.ts`) and every freeze test green with zero vector/pin edits. If a bump reds them, upstream moved a protocol-level input: hold the bump, or rotate the regime on the owner's recorded decision — append an entry, re-vendor the artifact with its provenance, and regenerate the vectors from the independent generator (`reference/<regime>/`). A pin is never edited to match a red test.
- **Every Aztec bump PR runs both execution canaries prover-ON, on Chrome and on Firefox** (`bun run e2e:agent tests/e2e/network/frozen-account-canary.test.ts tests/e2e/network/passkey-execution-canary.test.ts`, then the same under `NULO_E2E_BROWSER=firefox` — see the `aztec-update` skill; in CI they are the `canary` job of both network lanes). The address KAT cannot see execution breakage (frozen bytecode vs newer simulator/prover/node); the canaries are the only gate that does. **A red canary on either browser BLOCKS the bump** — both lanes are required on `dev` and `main`: **default response is HOLD the Aztec line**; a regime rotation (below) is the deliberate alternative.
- **Rotation: in place off Mainnet, a new extension on Mainnet.** A non-Mainnet derivation change ships in place as an update: the same major re-binds to the appended entry, accounts derived under the earlier one meet the per-chain classification below, and an imported one becomes unusable on its own; an account file names its regime and is refused by a build bound to another. A Mainnet-serving build never re-binds: its rotation ships a new extension major as a separate extension ID + store listing, coexisting with the old one, whose recovery is a seed import deriving the new regime's accounts; an old major's backups are never imported as old-regime accounts. Nulo V6 reused V5's store items, renamed, a one-off before 1.0.0 that held only because V5 never had users; the backup compat epoch refuses V5 backups. Stored accounts are never ambiguous: a build derives every account under its one bound regime.
- **A mismatch is classified per chain, never a bare throw.** The integrity coordinator re-derives every stored account and classifies each chain (`apps/extension/src/wallet/services/stale-network/classify.ts`). A mismatch confined to one chain quarantines that chain: its rows are never shown or used, and every service chokepoint refuses it with `ChainNotSupportedError`. A non-Mainnet chain whose seeded identity or every derived address moved is offered an in-place reset (`NetworkResetService`) by a full-screen takeover that never solicits the recovery phrase; Mainnet is quarantined with no reset. Any other mismatch withholds the session behind `AccountIntegrityBarrier`, which offers no CTA, with the typed `AccountAddressInconsistencyError`. Deletion stays a deliberate settings flow.

## Complexity budgets

Biome enforces per-function complexity budgets at **error** severity, everywhere Biome runs (editor, pre-commit `--staged`, `bun run lint`, `quality-status`). The full rules, their four enforcers, the Biome-bump procedure and the duplication trend (`audit:dup`) are the [`complexity-budgets`](./.claude/skills/complexity-budgets/SKILL.md) skill: read it before you add, move, re-stamp or delete a `biome-ignore lint/complexity` directive, regenerate the manifest, or bump `@biomejs/biome`.

- **Cognitive complexity ≤ 15** (`noExcessiveCognitiveComplexity`), **≤ 80 non-blank lines per production function** (`noExcessiveLinesPerFunction`), **`describe()` nesting ≤ 5** (`noExcessiveNestedTestSuites`).
- **The baseline only shrinks — NEVER add a complexity suppression.** A NEW acceptance is a blueprint with owner sign-off, never a PR nit. **The generator (`bun run baseline:complexity`) never writes an acceptance for you.**
- Raising the ceilings in `biome.json`, loosening the override globs, or hand-editing `manifest.json` (it is only ever written by `bun run baseline:complexity`) all count as weakening a quality gate — see the gates warning below.

## Package boundaries

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) §2 for the layer hierarchy. Short version:

```
wallet-core  →  wallet-crypto  →  extension-messaging  →  aztec-runtime  →  wallet-bridge  →  extension
```

Each package can import only the layers below it. `wallet-bridge` deliberately does NOT depend on `aztec-runtime`. `wallet-core` has `chrome.*` banned via biome `noRestrictedGlobals`.

### Custom RPC schema patch (`registerToken`)

`registerToken` (plus `isTokenRegistered` and `grantPublicAuthwit`) is added to `@aztec-labs/wallet-sdk`'s `WalletSchema` at runtime by the **single private package [`@nulo/wallet-sdk-schema-patch`](./packages/wallet-sdk-schema-patch/README.md)**. Both apps activate it the same way: `import "@nulo/wallet-sdk-schema-patch/register"` as the **first import** in the module that constructs the wallet-sdk client (extension `wallet-sdk/background.ts`, playground `lib/wallet.ts`). The package also exports `./apply` (`applyNuloSchemaPatch(schema)`), the pure patch body, unit-tested in `packages/wallet-sdk-schema-patch/src/apply.test.ts`; the bridge applies it to its own private copy of `WalletSchema` for the dispatch-time parse of every dApp call (`packages/wallet-bridge/src/wallet-schema-args.ts`), so that parse depends on neither import order nor the `register` side effect. (With one source there is no copy to drift, so no copy-identity pin exists.) The reachability guarantee (the patch actually extends `WalletSchema` and the dispatcher routes the methods) is pinned by [`packages/wallet-bridge/src/dispatcher.test.ts`](./packages/wallet-bridge/src/dispatcher.test.ts). When adding a new Nulo-custom RPC, edit the ONE source in `@nulo/wallet-sdk-schema-patch`, add a paired reachability assertion, and list the method in the npm package's README (`scripts/publish/readme/wallet-sdk-schema-patch.md`; `scripts/publish/stage.test.ts` fails until you do). See [`packages/wallet-bridge/README.md`](./packages/wallet-bridge/README.md) "Custom RPC methods" for the full contract.

## Persisted-storage shape changes (migrations)

The extension has a data-preserving storage-migration framework — engine in `@nulo/wallet-core/migration`, registry at `apps/extension/src/wallet/storage/migrations/`, full mechanics in [`ARCHITECTURE.md`](./ARCHITECTURE.md) §5. **From 1.0.0 every change to what a stored key may hold, or to how the wallet reads it, ships a numbered migration or a reviewed additive mark.** The shapes 1.0.0 stores are the baseline: stamp 0 of `stored-shapes/snapshot.json`, pinned in `stored-shapes/pins.ts`. Stamp 0 was re-cut once, on 2026-10-22, before any stable release carried a later stamp, when the pin and fee-pick maps and the selected account moved behind the worker sealed (#1051); the owner: "wouldn't it make sense to do #1051 and re-shape, or 're-reset' (I don't know the term) of #865 since we haven't actually done any release nor the 'final shape' has hit any users yet?" The four stamps it folded were additive: journal and transaction rows, then the balance, authwit and incoming roots, sealed with a dual read that seals a plaintext row at its profile's next unlock; a new Get started flag (`prestoOpened`); accounts, imported keys, tokens, the seeder marker, networks, fee payers and dApp registration counts, sealed the same way. Stamp 0 was re-cut a second time on 2026-10-26, when passkey profiles moved to a sealed recovery phrase; the owner: "And yes, I understand we will need to re-do the task that froze the local storage schema (I can't recall how we called that feature) so this is the new full base." 1.0.0 reached no store. A pin is removed only on the owner's recorded decision, as these were. Rows written before 1.0.0 get no migration; before each promote the update replay updates the last release's recorded rows in place and reads every one (the [`release`](./.claude/skills/release/SKILL.md) skill, step 1).

- **Every stored key is registered, and the snapshot guards its shape.** Each `chrome.storage.local` key family has an entry in `apps/extension/src/wallet/storage/stored-shapes.ts` (its ref, encoding, schema and read code); the wallet builds its stores only through `wallet/storage/stores.ts`'s factories, and `stored-shapes.scan.test.ts` refuses an unregistered `nulo:` key or a local store built elsewhere. `stored-shapes/snapshot.test.ts` fails a PR that changes a registered shape (R1) until `bun run baseline:storage` appends a stamp the change is justified by (R2); every golden in `stored-shapes/goldens.json` must still read to the value its stamp pinned (R3); the stamps and goldens are append-only (R4); and the two full backups pinned at the freeze (`stored-shapes/backups/`) must still open, validate, migrate and read (R5). The snapshot sees a refinement or transform by its label, so a changed body is caught only by a golden that exercises it: add one on the value it changes (#935). A pin is never edited and is removed only on the owner's recorded decision, and `snapshot.json` is written only by the generator. A new key family adds its entry and a `full` and a `minimal` golden, with a stamp like any other change.
- **A change that leaves every stored row reading as it did** (a new optional field, a new key family): `bun run baseline:storage -- --additive "<why every stored row still reads>"` appends a same-version stamp; add the pin it prints. The reason is reviewed like code.
- **Any other change to a persisted shape REQUIRES a numbered migration.** "Persisted shape" = anything in `chrome.storage.local`: EntityStorage rows (`${root}@${id}`) and ValueStorage keys. Procedure: copy `migrations/template.ts` → `NNN-*.ts` (NNN = last real migration + 1; the e2e fixtures' 9001 sentinel doesn't count), **prefer the backup-safe declarative form** (`defineRowMapMigration` — a finite data-only DSL, so the SAME object also migrates imported full-backups; do NOT add callback fields to it — a callback cannot be replayed against an imported backup, which is the whole point of the DSL), fall back to imperative `defineMigration` only when the transform doesn't fit the DSL (that BLOCKS backup import at the covered versions — `footprint-coverage.test.ts` makes you acknowledge it in `services/backup/import-blocking-ack.ts`, and R5 then expects the pinned backups refused), declare the EXACT read/write footprint (derived automatically in the declarative form; the engine snapshots only that into the pre-migration backup — an undeclared write is rejected at commit), keep `up()` idempotent + treat its input as HOSTILE (backup blobs are attacker-controlled; presence-guard everything), register it in `migrations/index.ts`'s `realMigrations`, and ship a colocated test with seeded pre-shape fixtures (the registry's empty-store run-twice check is a safety net, not the proof). Then `bun run baseline:storage` appends the stamp the migration justifies, whose footprint must cover every shape it changes; add the pin it prints. One stamp holds one migration. `breaking: false` only if the new code genuinely tolerates the old shape — and know it only takes effect when the migration is the tail (a mid-chain failure escalates to blocking regardless).
- **Out of a migration's reach**: a `structured`, `engine` or MAC-checked (`authenticated`) shape takes no migration (R2 refuses it). The engine reads and writes JSON strings only, and a MAC-checked row fails its MAC once rewritten, so such a change stops for a plan of its own and the owner's decision.
- **Guardrails that fail CI if you get it wrong**: version contiguity + authored-but-unregistered file scan (`migrations/registry.test.ts`); raw `chrome.storage.local` inside a migration (must use the staged `ctx` — storage-facade-ban DENYLIST); the run-twice idempotency harness; test-fixture leakage into prod builds (negative bundle-grep in `_build-extension.yml`); backup-path coverage + row-locality (`src/wallet/services/backup/footprint-coverage.test.ts` — registry-covered footprints, the metamorphic per-row invariance, the non-forgeable `backupSafe` brand).
- **Backup-import migration is LIVE** (shipped from [`implementations-plan/archive/storage-migration-backup/`](./implementations-plan/archive/storage-migration-backup/plan.md)): importing a full backup exported at an older `backup-schema-version` migrates its slices in-memory through the real engine before restore — see `apps/extension/src/wallet/services/backup/README.md` for the slice registry, the trust-gate order (checksum → compat-epoch → version range), and the block-listed roots (`nulo:core:profiles`, `nulo:core:auth-registry-enabled`).
- **Never migratable — don't try**: sealed roots (the `STORES` entries marked `sealed`: every profile-scoped root but the profile row, so contacts, dApp sessions and their registration counts, the operation journal, the transaction history, accounts and imported keys, tokens and the seeder's marker, networks, fee payers, token balances, the authwit registry and its enable flags, the five incoming roots, the pinned-token and both fee-pick maps, and the device's selected account; a new key family is sealed or stands on the reviewed plaintext list in `wallet/storage/root-census.test.ts`), whose rows open only under an unlocked profile's row keys, so the pre-unlock engine cannot read them; the stored-shape registry refuses a migration that names one, and a shape change there converts at unlock, as a crypto change does (ARCHITECTURE §5). Crypto/KDF/vector rotations (the migrator runs pre-unlock and has no password to re-encrypt with — re-encrypt-on-next-unlock or a documented reset; see [`packages/wallet-crypto/README.md`](./packages/wallet-crypto/README.md)); `chrome.storage.session` (ephemeral); the PXE's OPFS stores (Aztec-owned, protocol-reset concern; `account-state` backup slices are the non-storage carve-out — their wire shape is versioned by `aztec-version`, not the storage schema).
- **Related standing rule**: UI code (popup / onboarding / stores / composables) accesses `chrome.storage.local` ONLY through the migration-aware facade (`@/utils/storage`) — never raw. Enforced by `storage-facade-ban.test.ts`; the barrier it provides is what stops a page opened mid-migration from corrupting the transform.

## Terms acceptance (the wall, the record, the documents)

The Terms and Privacy Policy live in [`legal/`](./legal/README.md); their versions, which ones are material, and the consent wording live in [`@nulo/legal`](./packages/legal/README.md), whose tests fail when the package and the documents disagree. Rules:

- **One broadcast line, one guard.** `ExecutionCoordinator.sendTxTask` holds the only `node.sendTx` under `src/wallet`, and `await this.legal.assertCurrent()` sits immediately before `assertLive()` there — nothing may be awaited between `assertLive()` and the send. `wallet/services/legal/call-sites.test.ts` pins both facts and the exact set of files that may call `assertCurrent` (the coordinator, `ExecutionService`'s three broadcasting entry points, the dApp ingress in `wallet-sdk/background.ts` and its discovery in `wallet-sdk/discovery-flow.ts`). A new way to broadcast goes through `sendTxTask`; a new caller of the guard edits that pin deliberately.
- **Declining never locks a person out.** View, every export (recovery phrase, account file, full backup), backup import, profile and account management, lock and reset are never gated, and the acceptance sheet may never cover `/popup/settings/security/export/**`, `/popup/legal/**`, a `windows-*` route, or any route reachable while locked (`utils/legal-sheet.ts`). Terms § 20 promises this; `legal-acceptance.test.ts` S5/S6/S8 prove it with hit-tested pointer input.
- **`LegalAcceptanceService` is the sole writer** of `nulo:legal:accepted`, keeps no cache, never replaces a newer accepted version with an older one, and fails closed: unreadable, corrupt or missing is "not accepted". The record is device-local, survives a profile reset, and is never part of a backup. **Never log it**, and log a refusal at `debug` only — a connected dApp polls.
- **Status derives from the Terms alone.** Terms § 23 says accepting them is not privacy consent, so a privacy-only change never blocks; the record keeps `privacyVersionShown` as evidence and Settings → About shows a non-blocking notice.
- **A material change is a `minor` bump** in `legal/*.md` AND its `@nulo/legal` manifest entry with a human-written `changes` list (that list is what the re-acceptance sheet shows); a patch bump never asks again. `packages/legal/**` is in the smoke and network e2e path filters, so a version bump alone runs the suites that prove re-acceptance.
- **The consent control starts unchecked, always** — never restored from a prop or storage — and its label and button text come from `CONSENT_LABEL` / `CONTINUE_LABEL`, which a package test pins against Terms § 3. Links open the **versioned permalink** (`openLegalDocument`), never the moving `/terms` page.

## Logging policy (what may reach a log line)

`console.*` is **not** the browser console. It is globally hijacked (`utils/console-sniffer.ts`) in
all four contexts and funnels into `LoggerStore`, which buffers, persists to
`chrome.storage.session`, feeds the log viewer, and is CSV-exportable. So an ordinary
`console.warn` has the same reach as `this.logWarn`, and "it's just a debug line" is never a reason
to log something sensitive.

The full policy (the redactor, its static guard, the two flags, retention, the log viewer) is the
[`logging-policy`](./.claude/skills/logging-policy/SKILL.md) skill: read it before you add or
change a log line, a redaction key or the log viewer.

- **Pass the value as an object property NAMED for what it is.** The only redaction is `trim()`
  (`wallet/logger/utils.ts`), an object walker. It redacts **by key name**, so `{ password }` is
  safe and `{ value: password }` is not. **A finished string is opaque to it** — `` `k=${x}` ``
  can never be redacted — and neither can `"k=" + x` or a bare `x` string argument. A caught
  error is passed the same way, under a named key (`{ error }`; `trim` projects an `Error` to a
  capped `{ name, message }` with no stack), never flattened first by a helper or a `.message` /
  `.stack` read.
- **Never log**: decrypted note contents, simulation/utility return values, contact name or
  address, page or navigation URLs, balances, whole RPC envelopes (`params`/`result` carry
  passwords and export returns), or whole backup rows.
- **Pick the level by REACH, not by tone.** `LoggerStore.log` drops only `level < logLevel`, and
  `logLevel` is `Info` unless `debugMode` is on — so **`warn` and `error` are captured for every
  user with every toggle off**, and land in the buffer the log viewer renders and exports. A line
  you would not want in a stranger's bug report belongs at `debug` or nowhere.

When adding a sensitive field to a type, add its name to `REDACTED_KEYS` in
`wallet/logger/utils.ts` — in camelCase *and* the kebab-case spelling used by exported backup JSON
(the scanner reads `${row["master-key"]}` too). The static guard imports that set, so it extends in
the same commit. Names ending in `secretKey` are covered by suffix in both.

## Extension component model (L0–L6)

Six layers, low → high. A layer can import only from layers below it. Enforced via `biome.json` `noRestrictedImports` overrides.

**L0–L2 are externalized to `@nulo/design`** (see `implementations-plan/archive/design-system-externalization/`). The framework-/host-agnostic primitives live in the shared package and are consumed by the extension via a custom `unplugin-vue-components` resolver (`apps/extension/scripts/design-resolver.ts`), so templates use `<Flex>`/`<Text>`/`<Badge>` unchanged. `src/design/tokens.ts` re-exports `@nulo/design/tokens`, and the wallet's base stylesheet is `@nulo/design/base.css`. The package has NO auto-import, so its SFCs use explicit imports. **Resolver discipline:** a name enters `NULO_DESIGN_COMPONENTS` only when its extension-local SFC is DELETED; the four host-coupled holdouts (`Button` → RouterLink, `SubPageHeader` → router/history, `ToastManager` → app-shell toast root, `RowTarget` → RouterLink) keep a thin LOCAL extension component; the first three wrap the package base (`Button`/`SubPageHeaderBase`/`ToastManagerBase`), so their bare tags resolve to the wrapper, NOT the resolver. The `toast`/`outside` composables live in `@nulo/design/composables/*`; the extension keeps `composables/{toast,outside}.js` as named re-export shims so its explicit + auto-import call sites are untouched.

```
[L0] design tokens     @nulo/design (token-contract.ts → generated tokens.ts + utilities.css,
                       the 24 type roles included; hand-authored base.css + fonts).
                       Extension src/design/tokens.ts re-exports the package.

[L1] core primitives   @nulo/design/core: Flex, Icon (a glyph of core/glyphs.ts), Text (variant =
                       a type role).
                       No chrome.*.

[L2] ui primitives     @nulo/design/ui — ALL migrated: Badge, Banner, BrutalistTitle, Button,
                       Checkbox, Input, LoadingState, Popover, RowAction, SectionLabel, Spinner,
                       SubPageHeaderBase, Toggle, Tooltip, ToastManagerBase.
                       The 4 host-coupled ones live LOCALLY in src/components/ui/: Button,
                       SubPageHeader, ToastManager (thin wrappers rendering the package base) and
                       RowTarget (a row's link or button, stretched under its nested controls).
                       Cannot import service clients, stores, or @/utils/core.

[L3] composites        src/components/composite/
                       FormPopup, EntityForm, RecoveryPhraseGrid, AmountCard, ...
                       Same ban as L2 — no service clients, stores, or @/utils/core.

[L4] feature modules   src/popup/components/modules/
                       BalanceView, FeeSettingsCard, TokenCard, ContactRow, ...
                       modules/holdings/TokenList — presentational over rows the page hands in.
                       Service-bound. Cannot import L5 pages or L6 windows.
                       Token-row policy lives in pure helpers under src/utils/ (token-amount,
                       token-order, token-aggregate, token-fold, token-search, token-flag): Home,
                       Holdings and the Send picker all order rows through orderTokenRows and never
                       parse a balance or match a flagged pair themselves.

[L5] popups + windows  src/popup/components/popups/, src/popup/windows/
                       Orchestration. May own service-client lifecycle.

[L6] pages             src/popup/pages/
                       Orchestration. May own service-client lifecycle.
```

**A face, letter spacing or upper case comes only from a type role** (`typeRoles` in `@nulo/design`'s contract; the rules are in [`packages/design/README.md`](./packages/design/README.md) § Type roles): `<Text variant>`, `composes: type--<role> from global` first in the element's own module rule, or a static `type--<role>` class. `apps/extension/src/utils/type-role-ban.test.ts` refuses any other pick, and a size or weight outside a role, against a content-keyed baseline that only shrinks; the e2e sweep (`tests/e2e/fixtures/type-roles.ts`) checks the computed values in both browsers. Every address, hash and id renders in a mono role.

Service-bound visual components (Header, AddressDisplay, GlobalLoader, NotificationManager, Popup, PopupCard, JsonViewer, LogsViewer, PasskeyCeremonyDialog in `components/passkey/`) live flat in `src/components/` or in their own subdir, NOT in `core/`, `ui/`, or `composite/`. Cross-shell ones (e.g. `PasskeyCeremonyDialog`, consumed by both the popup and onboarding shells) MUST live under `src/components/`, never `src/popup/**`, so onboarding can import them without crossing the `@/popup/**` layer ban.

## Composables (C0 / C1)

```
[C0] pure utilities    src/composables/  (no chrome.*, no service clients)
                       useTicker, syncedRef, ...

[C1] service hooks     src/composables/
                       useFormState, useEntityCrud<T>, useFeeEstimation,
                       useDappInteractionPayload, useSecretCountdown, ...
                       Receive a connected client (or "do-the-thing" fn) from the parent.
                       NEVER call .connect() / .disconnect() themselves.
                       Expose dispose() that the parent calls in onBeforeUnmount.
```

**When to extract a composable vs a pure helper:**

- Pure function with no Vue reactivity → `*.ts` helper colocated with the parent.
- Reactive state, computed, watch, or service subscriptions → composable in `src/composables/`.
- Owns a service-client connection? Composable receives the *connected* client; the parent owns connect/disconnect.
- **Exception, backup runs**: a full-backup run owns the clients it opens, built when the run opens and disconnected in its `finally` (the export's scrub also closes the in-flight run's), so a dropped run can never share or close another run's connections (`useFullBackupImport`, `useFullBackupExport`).

## Vue component test conventions

- Colocate `<Name>.test.ts` next to `<Name>.vue`. No `__tests__/` dirs.
- Mount via `@vue/test-utils`'s `mount`; stub auto-registered children (`Spinner`, `Icon`, etc.) via `global.stubs`.
- For store consumers, `createTestingPinia()` from `@pinia/testing`.
- `tests/vitest.setup.ts` stubs `chrome` before every test with working `runtime` ports and message listeners, but `storage` is an empty object: a test whose code reads or writes storage stubs `chrome` itself (`vi.stubGlobal`).
- Send a user event through `trigger` or `sendEvent` (`tests/helpers/send-event.ts`), never a raw `click()` or `dispatchEvent`, when it must reach a Vue listener that is not the first on its path: a click inside a `Popup` or `Tooltip` meets their capture listener first, and an ancestor's listener comes after the target's own. Vue drops a raw event at every later listener attached in its millisecond, so such a test passes or fails by the clock. Both send nothing to a control with its own `disabled` attribute, so a press a test expects refused checks it was sent (`sendEvent`'s return, or `enterOn`).

**Coverage minimums:**

- L1 / L2 primitives: ≥5 cases (props, events, slots, edge cases).
- L3 composites: ≥10 cases.
- Composables: ≥10 cases (lifecycle, error paths, dispose).
- L4 / L5 / L6: not required (covered by e2e + manual smoke). Optional for complex pieces.

**Pre-existing bug pinning:** when extracting a function or component, preserve any pre-existing buggy behavior verbatim. Document via a test pin if the bug is behaviorally surprising:

```ts
test("(BUG PIN) replaces only the FIRST underscore in operation kind", () => {
  // humanize.ts has a single .replace("_", " ") which leaves later underscores.
  // Preserved verbatim during the extraction; tracked separately for fix.
  expect(humanize("aztec_get_chain_info")).toBe("aztec get_chain_info")
})
```

Run component tests via `bun run test:components` (filtered to `src/components/`); they also run via `bun run test`.

## testid preservation rule

Every extraction preserves all `data-testid` attributes verbatim. New components inherit testids from the parent template — they are NOT invented during structural moves. e2e selectors depend on exact testid stability.

When adding new interactive elements, add a `data-testid` rather than relying on placeholder, label, or role queries. Querying by placeholder is a common source of e2e flake.

**E2E selector rule (strict):** e2e tests select **only** by `data-testid`. Never by `aria-label`, text content, role, placeholder, class, or DOM structure. If an element doesn't have a testid, add one BEFORE writing the test. Text-based selectors look fine until copy changes, i18n lands, or a Vue refactor reshuffles the tree — then every test that touched the element breaks at once. Two explicit exceptions: the `waitForToast` helper (toasts are intentionally text-asserted as a content check, not a click target), and the logs and JSON viewers' editors, which CodeMirror builds inside their host's shadow root: a spec reaches the host by its testid and below it only CodeMirror's documented `cm-` classes (the `e2e-testing` skill, § Selectors).

## Keyboard & focus order

The primary Tab sequence must follow the visual/DOM order of the *fields*. A few hard rules (a positive `tabindex` anywhere on a screen silently corrupts the WHOLE document's tab order into two passes — every implicit-0 field becomes reachable only after every positive one):

- **Never use a positive `tabindex`.** Focusable custom widgets (a `<div role="...">` like `Toggle`, `DropdownItem`) get `tabindex="0"` (or `-1` when disabled/locked), never `"1"`. A `<div>` needs an explicit `tabindex` to be focusable at all — so change `"1"`→`"0"`, don't *remove* it.
- **Custom focusable widgets need keyboard activation.** A `<div @click>` is mouse-only; add `@keydown.enter.prevent` + `@keydown.space.prevent` (and `role`/`aria-*`) so it's operable by keyboard, matching click.
- **Secondary in-field controls are `tabindex="-1"`.** A show/hide-password button, a clear (`×`) button, an inline copy — anything that sits *between* two logical fields in the DOM — must be out of the Tab path (still mouse/AT-clickable) so Tab flows field → field. (Icon-only `<Icon @click>` SVGs are NOT tabbable, so they need no fix; only real `<button>`s do.) This is a **deliberate, owner-accepted tradeoff**: the show/hide-password toggle is `tabindex="-1"` (mouse + screen-reader reachable, not Tab-reachable) — a known WCAG-2.1.1 gap accepted in favor of the field→field flow. Don't "fix" it by restoring positive/0 tabbing without re-confirming. **Exception, the owner's call:** on Send's amount card the unit switch and Max are Tab stops after the amount field, being the only way to type an amount in USD or fill the balance; Max is disabled, and so out of the path, while there is no balance.
- **Grouped mutually-exclusive choices use a roving tablist**, not N separate tab stops: `role="tablist"` + each option `role="tab"` with `:tabindex="active ? 0 : -1"`, and ←/→ switch + move focus. This collapses a segmented control (e.g. the create-profile Password/Passkey toggle) to ONE Tab stop between the fields around it.
- **Never key navigation off a `tabindex` literal.** `DropdownRoot` selects items via a stable `[data-dropdown-item]` attribute, NOT `[tabindex="1"]`, so changing an item's tabindex can't silently break arrow-nav.
- **Escape closes the top popup — the keyboard twin of tapping outside.** Every `Popup` does it by default (`closeOnEscape`), only the topmost one answers, a menu open inside a popup closes first, and focus returns to the element that was focused when the popup opened (recorded before a child's queued focus runs; if that element is gone by the close, nothing receives focus). Nothing is ever approved by Escape. Whatever acts on an Escape marks it handled (`preventDefault()`): Chrome closes the whole toolbar popup on an Escape the page leaves unhandled, and a tab never shows it. A prompt that must be answered by a control passes `:closeOnEscape="false"` — the trap then ignores Escape and keeps the keyboard inside — and must block the outside tap too, or the two exits disagree.
- **A popover's panel keeps the Tab order it would have right after its trigger.** `Popover` teleports its panel out of DOM order, so it stitches the order back: opened from its focused trigger, focus moves in (to an autofocused field, else the first control); Tab past the last control goes on from the trigger, Shift+Tab before the first closes back onto the trigger, and focus leaving both closes it, as a press outside does. A panel holds no hidden control, or that edge escapes the hand-off.
- **A popup that sends a transaction or signs has no document-level Enter:** its confirm button is the keyboard path and ignores a repeat or composing Enter (`isRepeatOrComposing`).
- **A control a key's handler focuses receives that key's auto-repeat.** Focus moved inside a keydown's own dispatch (a pick that swaps a field for a card, for one) is where a held Enter repeats, so that control refuses a repeat Enter (`refuseRepeatEnter`).
- **A page's Enter shortcut answers only a field of that page:** it listens on the page's root, not `document`, returns unless `isPopupSubmitKey` holds and no child handled the key, and each control it names ignores a repeat or composing Enter (`refuseRepeatEnter`). A focused button, link or tab keeps its own activation.

## Cleanup order in `onBeforeUnmount`

Do NOT reorder these:

```ts
onBeforeUnmount(() => {
  profileService.disconnect()
  interactionService.disconnect()
  executionService.disconnect()        // ← BEFORE timer clear
  feeEstimation.dispose()              // ← composable's dispose, AFTER service.disconnect()
  for (const t of Object.values(estimateTimers)) clearTimeout(t)
  window.removeEventListener("beforeunload", reject)
})
```

Composables MUST NOT own their own `onUnmounted`. They expose `dispose()` that the parent calls in the existing slot. **Carve-out:** scope-tied cleanup of NON-SERVICE resources (DOM listeners, timers) via `onScopeDispose` is allowed — such cleanup participates in no order-sensitive teardown sequence, and Vue runs `onBeforeUnmount` hooks BEFORE scope disposal, so parent-owned service teardown always sees the resource still live. Service clients stay parent-disposed, always.

## Vue SFC ordering convention

<!-- This section and "Common patterns" are modified from Azguard Wallet's CLAUDE.md (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0. -->

Components follow execution-order-based ordering. Code reads in the order it runs.

**Block order:**

```vue
<route lang="json">        <!-- 1. Route meta (pages only) -->
</route>

<script setup>             <!-- 2. Script -->
</script>

<template>                 <!-- 3. Template -->
</template>

<style module>             <!-- 4. Styles -->
</style>
```

**Inside `<script setup>` — ordered by execution flow:**

```javascript
/** 1. Imports (grouped with comment headers) */
/** Services */
import { TokenServiceClient } from "@/wallet/services/token/client"

/** Components */
import Navigation from "./Navigation.vue"

/** Utils */
import { formatAddress } from "@/utils/string"

/** 2. Macros (compiler-processed first) */
const emit = defineEmits(["update:modelValue"])
const props = defineProps({ ... })
defineExpose({ inputEl })

/** 3. Store instantiation */
const appStore = useAppStore()
const cacheStore = useCacheStore()

/** 4. Composables */
const { openToast } = useToast()
const { handleExternalLink } = useExternalLink()

/** 5. Router/Route */
const route = useRoute()
const router = useRouter()

/** 6. Reactive state (refs, reactive, computed) */
const isLoading = ref(true)
const items = ref([])
const itemCount = computed(() => items.value.length)

/** 7. Service clients + event subscriptions */
const tokenService = new TokenServiceClient()
tokenService.onTokenAdded.add(onTokenAdded)
function onTokenAdded(token) { ... }

/** 8. Functions/Handlers */
const handleClick = () => { ... }
const handleSubmit = async () => { ... }

/** 9. Watchers (watch, watchEffect) */
watch(() => props.modelValue, (val) => { ... })
watchEffect(() => { ... })

/** 10. Lifecycle hooks (in execution order) */
onBeforeMount(async () => { ... })
onMounted(() => { ... })
onBeforeUnmount(() => { ... })
onUnmounted(() => { ... })
```

This order mirrors Vue's execution flow: imports → macros → setup deps → state → external subs → handlers → watchers → lifecycle.

## Common patterns

**Route meta for auth:**

```vue
<route lang="json">
{ "meta": { "isAuthRequired": true } }
</route>
```

**Config service for settings:**

```js
const configService = new ConfigServiceClient()
const value = await configService.getValue("externalLinks")
await configService.setValue("stealthMode", true)
```

**Confirmation dialogs:**

```js
const { requestConfirm } = useConfirm()
requestConfirm({
  title: "Confirm Action?",
  description: "Description text",
  confirm_text: "Yes",
  callback: () => { /* action */ },
})
```

Each request replaces the whole previous one; never write into `cacheStore.confirm` (`useConfirm.test.ts` fails on a write to `cacheStore.confirm` or an `open("confirm")` outside the helper).

**Toast notifications:**

```js
const { openToast } = useToast()
openToast({ kind: "success", label: "Address is copied" })
```

A success closes itself after 2 s, or 6 s when it carries an `action`; an info or an error stays until closed. A call passes one object literal with a literal `kind`, and no `icon`, `color` or duration (`utils/toast-call-sites.test.ts`).

**Auto-imports** (vite config) — no explicit imports needed for: Vue APIs (`ref`, `computed`, `watch`, lifecycle hooks), Vue Router (`useRoute`, `useRouter`), composables in `src/composables/`, stores in `src/stores/`, components in `src/components/`.

## Code-comment style

- **Default: no comment.** Identifiers carry intent. If removing a comment wouldn't confuse a future reader, don't write it.
- **Add a comment when removing it would surprise a reader** — a hidden constraint, a subtle invariant, a workaround for a specific bug, behavior dictated by an external spec.
- **Comments explain WHY/INVARIANT, not WHAT.** "Re-derive the passhash here because the session was closed during restore" — yes. "This is the password hash." — no.
- **No milestone, plan, PR, phase, or stage tags.** Not `M4.10`, `A11.1`, `pre-A11`, `phase 4b`, `PR-2`, `Stage D`. Inline code talks about live behavior, not history.
  - **A security decision is stated as the invariant it protects**, in one sentence at the code it guards, and paired with a test that proves it. It never carries a finding id or points at an audit report.
  - **Exception** — `phase N` documentation that describes live runtime behavior (`packages/wallet-core/src/base/`, service startup phases) stays. The ban is on milestone vocabulary, not on the word "phase".
- **Cite a live doc or a permalink, never a plan path.** A plan is archived when it closes, so a comment you write names a live doc (`apps/extension/tests/e2e/PRF-NON-PORTABLE.md`, for one) or a permalink ([`implementations-plan/README.md` § The gate](./implementations-plan/README.md#the-gate)). An existing plan path may stay until its comment is rewritten, as long as it resolves at HEAD or under `archive/`.
- **TSDoc shape for public APIs** — `/** ... */` block above exports. One-line summary, optional follow-up paragraph. `@param` only when the parameter name doesn't say it. `@returns` only when the return type doesn't say it.
- **Inline comments are full sentences** with terminal punctuation. Soft cap 100 chars; break at sentence boundaries.
- **`// biome-ignore`** in handwritten code must carry a reason: `// biome-ignore lint/X: <reason>`. Suppression without a reason is a lint warning; generated files (e.g. `src/types/auto-imports.d.ts`, `src/types/components.d.ts`) carry bare `// biome-ignore lint: disable` headers — leave those alone.
- **No factual descriptions of what the code does.** Well-named identifiers cover that. Comments describe *why*, *invariants*, or *external constraints*.
- **No referencing the current task, PR, or caller** ("used by X", "added for the Y flow", "handles issue #NN"). That belongs in the PR description and rots in the codebase.

## Implementation plans

Plans under [`implementations-plan/`](./implementations-plan/README.md) are committed artifacts. They get read by future contributors and future agent sessions that have no idea who you are or where you cloned the repo. That README is the standard (layout, proportion, the post-implementation standard a plan cites at a named commit instead of restating it, closing a plan, the portable rules, the gate, where open work lives), and its rules bind every session: read it before you write, close or archive a plan. Read [`implementations-plan/lessons.md`](./implementations-plan/lessons.md) before starting a task.

- **Proportion.** A finding becomes a change only once its path is written and its consequence matters; one that needs conditions the wallet does not support is a closed `known-limit` issue. [`implementations-plan/README.md` § Proportion](./implementations-plan/README.md#proportion) is the one authoritative statement.

### Where open work lives

No file in this repository holds a backlog. Open work lives in GitHub issues; a suspected exploitable weakness lives in a private draft security advisory. Until publication its finding never appears in a committed plan, a PR body or a test name. The fix may land first; its PR and tests describe the change, not the weakness (`SECURITY.md` § How findings are tracked). Read [`implementations-plan/README.md` § Where open work lives](./implementations-plan/README.md#where-open-work-lives) before filing an issue, a known limit or an advisory.

## Quality gates — local and CI

### Locally (before opening a PR)

| When | Command |
|---|---|
| After any code change | `bun run lint` + `bun run typecheck:all` (the pre-commit hook lints staged files; it does not typecheck). |
| Before opening any UI PR | `bun run audit:vue` (typecheck ∥ unit + component tests ∥ lint, then build). |
| When editing the popup, contracts, or anything user-visible | `bun run test:e2e` (smoke; no Aztec sandbox). |
| When touching dApp / network / PXE behavior | `bun run e2e:agent` (network suite; owns anvil + aztec + playground per worktree — parallel-safe). |
| When touching `tests/e2e/fixtures/**` or anything a browser could disagree on (focus, user activation, WebAuthn, window handling) | The same two suites on Firefox: `NULO_E2E_BROWSER=firefox bun run test:e2e` / `NULO_E2E_BROWSER=firefox bun run e2e:agent` (needs `geckodriver` + the pinned Firefox, `bun scripts/e2e/install-firefox.ts` from `apps/extension`; see [`FIREFOX.md`](./apps/extension/tests/e2e/FIREFOX.md)). |
| When editing Storybook stories or component visuals | `bun run --cwd apps/extension build-storybook`. |

`audit:vue` excludes e2e tests (the `tests/e2e/**` entry in `apps/extension/vitest.config.ts`'s `exclude`). Smoke and network e2e are separate gates.

**E2E has a runtime budget, not a file quota.** Each added e2e scenario names the distinct failure mode it proves, why a cheaper layer (unit, component, composition) cannot establish it, and its estimated then measured runtime; the PR body states the per-browser suite wall-clock before and after. File count is diagnostic only: merging files to hit a number saves nothing. A timeout stays visible in the numbers. How to measure both: the [`e2e-testing`](./.claude/skills/e2e-testing/SKILL.md) skill, § Runtime budget.

### In CI (server-side enforcement)

Configured in [`.github/`](./.github/). The full contributor guide is at [`CI.md`](./CI.md); the quick reference is at [`.github/WORKFLOWS.md`](./.github/WORKFLOWS.md). Read `CI.md` before you change a workflow, a gate or a lane: what each one runs, Presto in CI, the Firefox lanes, the chaos seeds and `nightly.yml` live there.

- **Required checks** (the produced bare names, § [Branching + merging](#branching--merging)): `quality-status`, `extension-smoke-e2e-status`, `extension-network-e2e-status`, `extension-smoke-e2e-firefox-status` and `extension-network-e2e-firefox-status`, on both branches.
- **The e2e lanes** run on a PR to `dev` or `main` when their path filter trips or their label is set (`e2e:extension-smoke`, `e2e:extension-network`); a promote's diff is everything since the last one, so a promote that leaves the extension alone skips them. Each aggregator passes when its lane is skipped.

> **⚠️ The quality gates are non-negotiable.** Unit tests (inside `quality-status`), `Extension network e2e`, and `Extension smoke e2e` are the safety net that lets this repo move fast without shipping breakage, so a red check is never worked around — not by making it advisory (`continue-on-error`, `neutral`, `|| true`, success-on-failure), not by removing it from a branch's required set, not to dodge a `--admin`. A red check means one of two things: a **genuine flake**, which you re-run, or **real breakage**, which you fix. Smoke is required on both branches and its fixtures can flake; it gets the same treatment.

### Release runbook

A **stable release** turns the current `main` into a published `vX.Y.Z`: a GitHub Release with the built Chrome and Firefox zips and `SHASUMS256.txt`, and a `main → dev` back-sync PR. A **prerelease** (`vX.Y.Z-rc.N`) is cut from `dev` on purpose. [`release.yml`](.github/workflows/release.yml) automates most of it: with auto-unstick on, a stable release is four steps by hand (promote `dev → main`, merge the Release PR, merge-commit the sync PR, never squash, and publish any fixed advisory).

The runbook is the [`release` skill](./.claude/skills/release/SKILL.md): the per-release procedures, the manual unstick that stays the permanent fallback, the troubleshooting table and the [Staged-rollout switches](./.claude/skills/release/SKILL.md#staged-rollout-switches). **Update the skill when the process changes**: a new failure mode, a changed step, a flipped switch.

## What this file is NOT

- Not the architecture overview — see [`ARCHITECTURE.md`](./ARCHITECTURE.md).
- Not the per-package surface — see each `packages/<name>/README.md`.
- Not the e2e infrastructure doc — see [`apps/extension/tests/e2e/README.md`](./apps/extension/tests/e2e/README.md).
- Not the planning standard or the plans themselves — see [`implementations-plan/README.md`](./implementations-plan/README.md).
