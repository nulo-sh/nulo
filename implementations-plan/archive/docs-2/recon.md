# docs-2 recon

Read at `17f35c504` (`origin/dev`). One Explore sweep (sonnet) plus the planner's own greps, over tracked files,
`implementations-plan/archive/` and `bun.lock` excluded.

## Reuse map

| Need | Found | Verdict |
|---|---|---|
| The manual-bump policy, stated once in full | `SECURITY.md` § Dependency policy: the age gate (line 519), the Dependabot paragraph (548-551), the `bun pm diff` review workflow (594-601) | adapt: the Dependabot paragraph cites the two sections it already sits between |
| The TL;DR of that policy | `CLAUDE.md` § Dependency policy, Dependabot bullet (line 106), which already says "See SECURITY.md ... for the full version" | adapt: one sentence |
| The config's why | `scripts/ci-cd/dependabot.test.ts` header (lines 2-3) | adapt: one clause and a cite |
| The PR-title cap with its arithmetic | `CLAUDE.md` § Branching + merging (line 98): "≤ 92 chars", ` (#NNNN)`, `len(title) + len(" (#NNNN)") ≤ 100` | reuse as-is; already correct since `17f35c504` (#1265) |
| The cap in the plans standard | `implementations-plan/README.md` § Post-implementation standard, step 3 (line 109): "at most 93 characters (the squash appends ` (#NN)` ...)" | adapt: 92, ` (#NNNN)`, eight characters |

## Claim A: "Dependabot cannot read Bun's lockfile"

Stated at exactly three sites: `CLAUDE.md:106`, `SECURITY.md:550`, `scripts/ci-cd/dependabot.test.ts:2`. Not to be
confused with `CLAUDE.md:49` and `SECURITY.md:592` (Bun ≤ 1.3 cannot read the `lockfileVersion: 2` lock), which
stay. Search trail: `dependabot` (case-insensitive, whole tree); `cannot read|can't read|unreadable|by hand|manual(ly)?
bump|bun's lockfile|security updates|version updates|package-ecosystem` over `*.md`, `.claude/skills/**`, `.github/**`,
`scripts/**`, package READMEs, `scripts/publish/readme/**`; no Renovate config (`git ls-files | grep -i renovate`).
Other Dependabot mentions (`CI.md:31,107,111`, `pr-quick.yml:225-230`, `pr-retarget.yml`, `pr-supersede.yml`) concern
commitlint and tokens only.

External source, fetched 2026-10-27: GitHub Docs, "Dependabot supported ecosystems and repositories"
(`docs.github.com/en/code-security/dependabot/ecosystems-supported-by-dependabot/supported-ecosystems-and-repositories`).
Bun row: YAML value `bun`, supported versions `>=v1.1.39`, version updates Supported, security updates Not supported,
private repositories and registries Supported, vendoring Not supported. Its Bun section: "Dependabot supports the current
default text-based `bun.lock` file, but not the legacy binary `bun.lockb` file. The `bun.lock` file is supported in
version 1.1.39 and above." The page names no `lockfileVersion` and shows no last-updated date.

## Claim B: a PR-title cap other than 92

One wrong site: `implementations-plan/README.md:109` (93, and the suffix written ` (#NN)`). `CLAUDE.md:98` and `:106`
already say 92. `CI.md:31` says "100-char header cap" (consistent). `.commitlintrc.json` sets no `header-max-length`;
the installed `@commitlint/config-conventional` 21.2.2 sets it to 100. Search trail: `\(#NN+\)`, `~?9[0-9]\b.*(char|title)`,
`(title|char).*\b(9[0-9]|100)\b`, `header-max-length`, `squash`, and `.commitlintrc.json` and `package.json` read whole.

## Claim C: tests that pin the wording

None. No test reads `CLAUDE.md`, `SECURITY.md`, `implementations-plan/README.md` or the header of
`dependabot.test.ts`; `dependabot.test.ts` reads only `.github/dependabot.yml`. The plans gate checks structure, links
and permalinks in the plans tree, not prose. Keep the "Dependency policy" headings unchanged (linked from
`dependabot.test.ts:6`, `pr-quick.yml:229`, `CI.md:31`, `bunfig.toml:37`). Search trail: `readFileSync|Bun\.file`
beside `(CLAUDE|SECURITY|README)\.md` over `*.ts`, `*.js`, `*.sh`, `*.yml`, `package.json`.

## Open work

`gh issue list --state all --search "dependabot bun"`: #1267 only. Closed known limits on `dependabot`: #1266 (nothing
lints a squash subject), unrelated to either claim. Prior record: `archive/dependabot-subject-1/plan.md` (it filed #1267
and named the README's 93 as outside its scope).
