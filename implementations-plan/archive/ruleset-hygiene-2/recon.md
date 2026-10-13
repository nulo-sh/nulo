# ruleset-hygiene-2: recon

Base: `origin/dev` at `dd9228237a5115c2d39f7def1e79a3ab69119580`. One Explore agent (sonnet) swept references; the claim maps below were read by hand. Line numbers are `CLAUDE.md` at the base.

## Sizes

`CLAUDE.md` is 86,744 bytes. The four sections: § Quality gates 10,422 (the "In CI" bullets `:542-547` about 5,900), § Implementation plans 8,402, § Complexity budgets 7,433, § Logging policy 4,881.

## Blocks that move

| Block | Lines | New home |
|---|---|---|
| § Complexity budgets | `:115-127` | `.claude/skills/complexity-budgets/SKILL.md` |
| § Logging policy (what may reach a log line) | `:165-225` | `.claude/skills/logging-policy/SKILL.md` |
| The three path bullets | `:494-496` | `implementations-plan/README.md`, nested under portable rule 9 |
| ### Where open work lives | `:498-519` | `implementations-plan/README.md`, `## Where open work lives` |

## § Implementation plans against the README (`:486-496`)

| CLAUDE.md bullet | Already in the README | Moves |
|---|---|---|
| Intro: committed artifacts, read by sessions that do not know you | intro, "Start here" | stays as the pointer's first sentence |
| Proportion | § Proportion, authoritative | nothing |
| Verdicts inline, transcripts local | § What lives in an active plan directory | ", never re-cut as `plan-v2.md`" |
| Uncommitted means disposable | rules 3 and 4 | the URL form, `permalink-bases.json` (still `{}`), "starts empty" → § The gate |
| Closing a plan | rules 5 and 6 | "until then a running `/loop` only babysits delivery" → rule 5 |
| The curated layer has a budget | rules 1, 5, 8 | nothing |
| The gate | § The gate, the same list | nothing |
| No personal / no machine-specific paths / outside repos by name | rule 9, one line | the three bullets |

## The "In CI" bullets (`:542-547`) against `CI.md`, `.github/WORKFLOWS.md`, `FIREFOX.md`

| Claim | Home today |
|---|---|
| `quality-status` aggregates the gates as an exact state machine; bare check-run name, `Quality / Status` phantom | CI.md § `pr-quick.yml` |
| Branch-up-to-date not enforced on `dev` | CLAUDE.md § Branching + merging |
| Smoke and network triggers, filters, labels, pass-when-skipped, required on both branches | CI.md § `pr-extension-smoke-e2e.yml`, § `pr-extension-network-e2e.yml` |
| Presto: prover-ON only, pinned tarball and binary, single-member archive, `PRESTO_ALLOW_ALL=1`, required mode, fallback phases throw, `PROVE_SUCCESS=0` reds the canary, HTTPS-only production, rollback flags | CI.md § Presto in CI; WORKFLOWS.md `:50` |
| Presto on plain HTTP at `127.0.0.1:59833` | not in CI.md (e2e README `:47`, SECURITY.md `:635`) → carried to CI.md |
| The canary asserts the awaiting card's `Proving with Presto ✦` | CI.md names "the exact subtitle", not its text → carried to CI.md |
| Two fixed chaos seeds, retry 0, replay, rotation | CI.md § `pr-extension-network-e2e.yml` |
| Firefox: twins, filters plus own files, drafts, `CHROME_ONLY`, five canary files, `Assert canary results`, required on `dev`, advisory network on `main`, release and nightly wiring, the two pinning tests | CI.md § Firefox workflows; BiDi in WORKFLOWS.md and FIREFOX.md; `stopBackground` in the e2e skill § 3 |
| Nightly: version scheme, hard gates, chaos replay, quiet day, `force` and `dry_run`, retry policy | CI.md § `nightly.yml` |
| "the only scheduled workflow besides the weekly `source-rebuild.yml`" | **stale**: `verify-store-copies.yml` is scheduled weekly too; CI.md's "the repo's only nightly workflow" is right |
| actionlint + shellcheck | CI.md § `actionlint.yml` |

## What reads the moved text

- No test pins the prose that moves; `check:plans` reads these files only for their links (`links.ts:146-152`). `commitlint.test.ts:3`, `behavior-gating.test.ts:88`, `complexity-rescore.test.ts:8` and `workflow-refs.test.ts:3` name CLAUDE.md in comments; `plans/links.test.ts` and `plans/permalinks.test.ts` build synthetic `CLAUDE.md` fixtures.
- Strings that name a moved section: `scripts/complexity-baseline/check.ts:77` (error text), `scripts/ci-cd/plans/structure.ts:329` (a finding's fix text). No test pins either.
- `check:plans` scans root `*.md`, `.claude/skills/**`, `.github/WORKFLOWS.md` and the plans tree for links to missing files (`scripts/ci-cd/plans/links.ts:33-40`); it strips `#fragments` (`:160-163,194`), so a broken anchor passes it.
- Anchor links: `CLAUDE.md:43` and `:491`, `implementations-plan/README.md:9` and `:84` target `#where-open-work-lives`; `README.md:49` and `e2e-testing/SKILL.md:248` target `#quality-gates--local-and-ci` (kept). No link targets `#complexity-budgets`, `#logging-policy-…`, `#implementation-plans` or `#in-ci-…`; the archive has none.
- Prose "§" references: `CLAUDE.md:477` "(§ Implementation plans)" for the permalink rule; `nightly.yml:265` "CLAUDE.md § Complexity"; eight active plans name "§ Logging policy" or "§ Where open work lives" eleven times. No issue body links the anchor (`gh search issues`).
- No path filter matches `CLAUDE.md`, `CI.md`, `.claude/**`, `implementations-plan/**` or `.github/WORKFLOWS.md`; only `pr-quick.yml`'s unconditional gates run.
- `update-docs/SKILL.md` names no moved section; it reads only CLAUDE.md's headings, so it would route a change to `scripts/complexity-baseline/` back into CLAUDE.md.
- Biome has three complexity ceilings (`biome.json:58-66`), not four. The manifest holds 23 acceptances, as the section says.
- No root `AGENTS.md`; skills are discovered from `.claude/skills/` (five today).
