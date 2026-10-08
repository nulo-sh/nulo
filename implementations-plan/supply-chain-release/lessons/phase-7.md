# Phase 7: release guards

- **The plans gate reads string literals in code as plan links.** A test fixture whose clean text was `implementations-plan/<name>/plan.md` failed `check:plans` inside `test:ci-gating` ("does not resolve at HEAD or under archive/"). Fixture text that names a path should name a neutral one. The gate reads the git index, so stage a fix before rerunning it.
- **Never chain `git add -p` with piped answers in an agent shell.** It waited on a terminal and hung the call; the `pkill -f` used to clear it matched the agent's own shell (the Phase 5 lesson again). Split hunks across commits by writing the intermediate file state and staging it whole.
- **On this host a commit hangs at signing while `SSH_AUTH_SOCK` is set** (after the hooks pass); `env -u SSH_AUTH_SOCK git commit` signs with the passphrase-less key file. Every arc 3 commit shows `G`.
- **The shell home-path guard knew only `/Users/` and `/home/`,** while the plans gate's `LOCAL_PATH_RE` also counts a home under a mount (`/mnt/<volume>/<user>`). Running the shell guard in CI made the gap matter (a `--no-verify` commit from a host whose home sits under `/mnt/` would pass); the guard now matches the same shape, `/root` still excepted for the container scripts.
- **F19 no longer held when the rule landed:** `dev` carries one subject naming a camelCase identifier (`grantPublicAuthwit`, #48). The lower-case rule refuses such a branch commit; squash subjects (PR titles) are not linted on `dev`, and commitlint is skipped on PRs to `main` and on the sync PR.

## Arc 3 review, round 1

- **Codex `approve with fixes` (1 Medium, 2 Low), Opus approve once its Medium is fixed (1 Medium, 3 Low); all accepted** (plan § Audit verdicts). The lesson worth keeping: under the isolated linker a typecheck can pass on a types package the workspace never declared, because a dependency's `.d.ts` imports it and the import resolves through the `node_modules/.bun/node_modules` hoist fallback. `tsc --traceResolution | grep "successfully resolved"` shows which copy a directive or import landed on.
