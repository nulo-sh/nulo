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
