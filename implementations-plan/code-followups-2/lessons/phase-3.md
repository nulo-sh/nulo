# Arc 3 (Phases 3.1-3.5): lessons

Base: `origin/dev` `629c367` (Arc 2 merged as #234), on branch `code-followups-2-ci`. Every new
test was run against the base copy of the code it covers and failed there before it passed here.

## 3.1 The dead salt

- The reusable workflow's `secrets:` block held only the salt, and every caller's `secrets:` block
  held only the salt pass, so each block went whole (21 removals: the declaration, the env export,
  20 passes). `behavior-gating.test.ts` compares the Firefox jobs' `secrets` with the PR pool's;
  both are now absent, so the comparison still holds with no edit.
- Gate: `git grep SPONSORED_FPC_SALT -- .github` empty; `apps`/`packages` hold only the two `0n`
  constants and no `env` read; `lint:actions` 0; `test:ci-gating` 413/413.

## 3.2 Pinned bootstrap

- The pins come from the publishers' `SHASUMS256.txt` (Bun's release, nodejs.org) and equal
  `sha256sum` of the downloaded artifacts; the Bun one also equals the release asset's GitHub
  digest.
- `bun-linux-x64.zip` holds one member, `bun-linux-x64/bun`; the script extracts that member only
  and adds the `bunx` link the upstream installer makes (`scripts/complexity-baseline` spawns
  `bunx`).
- Both archives are fetched and checked before either is extracted, so an altered Node pin leaves
  nothing installed even though Bun's check passed first.
- `[ a ] && [ b ]` under `set -e` does not stop the script when the first test fails (errexit
  ignores a failure inside an `&&` list except its last command); the version check is an
  explicit `if … then exit 1`.
- The test reads the script with backslash continuations joined: the `apt-get install` list starts
  a physical line with `curl` (the package), so a download is matched only in command position.
- Gate: `docker-ci-like-pins.test.ts` 7/7, its success case red at base with seven problems;
  shellcheck clean; three `ubuntu:24.04` container runs of the bootstrap groups alone: pinned Bun
  1.4.2 and Node v24.16.0 from `/opt/docker-ci-like`; the same with a fake `bun` and `node` already
  on `PATH` still resolves the pinned ones; an altered Node pin exits 1 with `/opt/docker-ci-like`
  never created. `test:ci-gating` 420/420, lint 0.

## 3.3 One escaper

- Entry 142 is tracked privately since #236: GHSA-6cj6-wp78-52mc. Per `SECURITY.md` § How findings
  are tracked, this log, the commits, the test names and the PR body describe the change only.
- The plan's gate grep (`` `::(error|warning|notice|add-mask):: `` over the TypeScript scripts)
  matches one doc comment, `scripts/release/resolve-tag.ts:33`, which names the command in
  backticks and prints nothing. Excluding comment lines, the grep returns nothing. The comment is
  left as it is.
- `audit-gate.ts` no longer exports `command`/`plain`: its test was the only outside user, and its
  escaping case moved to `workflow-command.test.ts` with its body unchanged.
- The Firefox script routes every ordinary line through `say`, as the Chrome script does, not only
  the four lines the plan named: `upload ok` prints AMO's upload id, and the local-input lines cost
  nothing to route the same way.
- `test:release` needs `zip` on `PATH` (`zip-reproducible.test.ts`), which this host lacks; the gate
  ran with Ubuntu's `zip` package extracted into the lane's scratch tools directory and put first on
  `PATH`, nothing installed system-wide. CI's runners carry `zip`.
- Gate: the four new runner cases red at base; `test:release` 228 pass, 9 skip, 0 fail;
  `test:ci-gating` 419/419; lint 0; the refined grep empty.

## 3.4 Workflow-reference guard

- The guard reads tracked files with `git ls-files` and matches JavaScript regexes instead of
  `git grep -E`: POSIX ERE leaves `\b` to the platform's regex library, so one pattern would read
  differently on a macOS checkout and on CI (D-arc3-2).
- It found seven comments at base, among them `agent.sh`'s and two in `global-setup.ts`; each now
  states the invariant alone. A bare `phase N` stays allowed: `packages/wallet-core/src/base/`
  names live startup phases that way.
- Gate: `workflow-refs.test.ts` 22/22, its scan red at base with the seven hits; `test:ci-gating`
  441/441; `network/incoming-transfers.test.ts` through the edited `agent.sh` and
  `global-setup.ts`, retry 0: Chrome 2/2, Firefox 2/2, no anvil left listening after either run.

## 3.5 Docs routing

- #236 retired `follow-ups.md` while this arc ran; origin/dev was merged and its wording kept on
  every docs conflict, with this phase's routing on top. The plan's link to the retired file became
  plain text, since `check:plans` refuses a link to a missing file.
- Every routed line cites its archived record, and each was read against that record before it
  landed.
- Gate: `check:plans` 0 (run after staging: it reads the index), each routed phrase present in its
  owner.

## Arc gate and review

- Arc gate on `ca2f447`: `audit:vue` 0 (715 files, 10,667 tests), `typecheck:all` 0,
  `test:ci-gating` 443/443, `test:release` 228 pass / 9 skip / 0 fail, `lint:actions` 0,
  `check:plans` 0.
- An `::add-mask::` value is registered as the runner decodes it, and a `::` line parses before the
  legacy `##[` form is sought, so rewriting `##[` in a mask's data masks a different string. The
  escaper keeps a mask's data exact and still neutralises `##[` in every other command.
- A static check that a checksum command is present proves nothing about whether its failure stops
  the script: `|| true` keeps it present. The test now requires the check to end its statement,
  under `set -euo pipefail`, with no `||`, condition or assignment around it.
- Negative controls that hardcode the current version break on a correct bump: they now derive
  the script's `BUN_VERSION` and use the next patch.
- A shell download matcher must accept every command position: after `if`, `elif`, `while`,
  `until`, `else` and `!` as well as `;`, `&&`, `|`, `(`, `then` and `do`. Missing one let an
  unpinned tarball fetched inside a condition pass.
- Review round 1: Codex and Opus each `approve with fixes`; all eleven findings accepted (plan.md §
  Audit verdicts). `test:all` green on `951f706`.
