# Recon — dependabot-subject-1

Base: `dev` at `78f5f9171`. One Explore sweep (sonnet) plus the driver's own reads, 2026-10-27.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| Skip the range lint for one kind of PR | `pr-quick.yml` `commitlint` job, step `Lint PR commits`: an in-step `if/elif` with two skips (base `main`; head `sync/main-to-dev*`), each echoing `commitlint: skipped on …` | adapt: a third `elif` |
| Keep `quality-status` exact | its aggregator expects `commitlint` = `success` on every `pull_request` (`ran "$pull_request"`); `aggregators.test.ts` models it through `quality(...)` | reuse as-is: an in-step skip leaves the job `success`; a job-level `if:` would need the aggregator and its test changed too |
| Name Dependabot in a workflow | `pr-supersede.yml` and `pr-retarget.yml`: `github.actor != 'dependabot[bot]'`, pinned with `expect(job.if).toBe(...)` in `behavior-gating.test.ts` | adapt: those test the actor for token reasons; this skip is about who wrote the commits, so it reads the PR author |
| Run a step's script under test | `scripts/ci-cd/gh-step-harness.ts` `runStep` (bash `-e -o pipefail`, binds every `${{ }}` in the step's env, a `gh` shim on PATH, `setup(dir)` may add more shims, `calls` log) | reuse as-is: `setup` writes a `bunx` shim |
| Pin the commitlint step | none: no test names the job, its `run:` text or either existing skip (searched `commitlint`, `Lint PR commits`, `sync/main-to-dev`, `BASE_REF`, `HEAD_REF` in `scripts/ci-cd/*.test.ts`) | build new, in `behavior-gating.test.ts` |
| Prove the rule still refuses an upper-case subject | `scripts/ci-cd/commitlint.test.ts` (refused + lower-case control) | reuse as-is, untouched |
| A PR-title lint | none (searched `pull_request.title`, `PR_TITLE`, `action-semantic-pull-request`); `behavior-gating.test.ts` "only pr-retarget.yml subscribes to `edited`" forbids any other `edited` listener | not built (decision ledger D2) |
| Where the title rule is written | `CLAUDE.md` § Branching + merging ("PR title becomes the squash commit subject", the 93-character rule, whose parenthetical lists the commitlint skips) and § Dependency policy (the Dependabot bullet); `CI.md` § `pr-quick.yml` commitlint bullet; `.github/PULL_REQUEST_TEMPLATE.md` | adapt the three doc sites; the template needs nothing |
| Dependabot's own config | `.github/dependabot.yml` (`commit-message.prefix: "chore(deps)"`), pinned by `scripts/ci-cd/dependabot.test.ts`, whose header says the prefix "keeps its pull request titles valid for commitlint" | adapt the header comment only: the prefix keeps the type valid, not the case |

## Findings that shape the plan

- **The cause is a heuristic in dependabot-core, not a change on Dependabot's side** (demonstrated).
  `MessageBuilder::TitleBuilder#build` capitalises the first word when
  `PrNamePrefixer#capitalize_first_word?` is true (dependabot-core `main`, `common/lib/dependabot/pull_request_creator/`,
  read 2026-10-27; last change to either file 2026-08-18). That method:
  1. copies the case of the last commit among the default branch's latest 100 whose author name contains `dependabot`
     (a substring match, not the app's identity), merge messages excluded, if there is one;
  2. otherwise returns true when every recent human Conventional Commit message matches `/:\s+\[?[A-Z]/` anywhere in its
     full message, body and trailers included, and false when every one matches the lower-case twin;
  3. only when neither holds does the commit-message prefix decide (upper case when it does not start with `[a-z]`).
  My replay below approximates GitHub's commit list with `git log <ref> -100`.
  When #1141 opened (2026-10-26 06:32 UTC), #844 (the last Dependabot squash on `dev`) sat 107 commits back, so
  step 1 found nothing. In step 2, all 94 Conventional messages in the window matched (their bodies carry lines such
  as `Co-Authored-By: Claude …`), so the title read `Bump`. At today's `dev` tip, 79 of 89 match, so the next PR may
  read `bump` again. The case flips with the repository's own history, week to week.
- **No Dependabot option sets the case** (docs.github.com, "Dependabot options reference", `commit-message`, fetched
  2026-10-27; the page shows no last-updated date): only `prefix`, `prefix-development` and `include: scope`, and
  nothing on the case of the message. Issue option 3 is out.
- **Only `subject-case` fails.** Local `commitlint` on #1141's commit message: one problem, `subject-case`; the same
  message lower-cased, and #844's and #327's, pass. The default `ignores` of `@commitlint/is-ignored` 21.2.2 hold no
  Dependabot pattern.
- **Dependabot titles also overflow the title budget** (92 characters while PR numbers have four digits: the squash
  appends ` (#NNNN)` and the header cap is 100). #327's and #1141's titles are 107 characters. #327
  landed on `dev` as `chore(deps): bump reviewdog/action-actionlint from 1.77.0 to 1.79.1 (#327)`, neither its
  title nor its commit headline: the merger already rewrites Dependabot's subject before the merge.
- **Facts on identity**: #1141's `user.login` is `dependabot[bot]` (`type: Bot`), head `dependabot/github_actions/…`;
  the failed run `40280467913` has actor and triggering actor `dependabot[bot]`; its only red jobs are `Commitlint`
  and `quality-status`. The repository squashes with `squash_merge_commit_title: PR_TITLE`.
- **Dependabot tokens**: a workflow triggered by Dependabot gets a read-only `GITHUB_TOKEN` by default, and the
  `permissions` key can raise it (docs.github.com, "Troubleshooting Dependabot on GitHub Actions", fetched 2026-10-27).
  A title-editing job would not need `pull_request_target`.

## Collisions

- `pr-retarget.yml` subscribes to `edited`; a title edit fires it, and its `if:` (`github.event.changes.base`) skips the job.
- No open issue besides #1264 covers this area (`gh issue list --state all --search dependabot`); no closed `known-limit`
  matches `dependabot commitlint`.
