# Phase 8: bumps, classification, gate

- **The backlog matched the plan on the day:** 72 advisories in 21 packages. `bun audit fix --ignore 1193683 --ignore 1193684` (vitest's two ids) fixed 30 in 10 packages; `ws` showed under both "fixing" and "blocked" and did not move, because the only vulnerable copy is the exact pin in `@aztec/viem`. The `vue` bump cleared one more: 41 left in 12 packages, none of them in either zip.
- **`bun pm diff` works on Bun 1.4.2 with both versions named** (`bun pm diff axios@1.19.0 1.20.0`); only the bare form fails (phase 6). Every bump was read that way and its added lines grepped for install scripts and process, network or vm imports. Two hits, both benign: pbkdf2 3.1.7 adds an npm `dependencies` lifecycle script (npm runs it for a root project only; Bun never does), and source-map-js 1.2.2 adds a `new Function` probe that falls back when a CSP forbids eval.
- **A raised range resolves to the newest version the age gate allows, not the one asked for.** Setting `^3.5.42` resolved vue 3.5.43 (21 days old), a dozen runtime changes past the fix. A wider CLI gate (`--minimum-release-age`) re-gates the edited workspace's tree and refused the young Aztec rc packages. What worked: `bun add vue@3.5.42` in the workspace (it pins the lock and rewrites the manifest with exact pins and sorted keys), restore the manifests, raise the floors to `^3.5.42` by hand, then `bun install` keeps the locked 3.5.42.
- **That bump left six nested 3.5.41 copies** (vue-tsc's `@vue/language-core` and storybook's `vue-docgen-api` kept their old `@vue/compiler-dom` resolution). Deleting those lock entries and running `bun install` re-resolved them onto the hoisted 3.5.42; `bun install --frozen-lockfile --force` then passes.
- **`bun audit --json` on a clean tree prints `{}` and exits 0**, so the gate can require the exit code and the report to agree.
- **`**/package.json` matches the root `package.json` under picomatch 4** (dorny's matcher), so the `deps` filter needs one pattern; git needs the `:(glob)` magic for the same.
- **`main` has one starting commit**, so no real Release PR exists to replay; the Release-PR test builds the diff from the tree's files with `lockWithVersion`, the function the release workflow writes the lockfile with.

## Arc 4 review, round 1

- **Codex `approve with fixes` (3 Low), Opus two Medium and four Low; all accepted** (plan § Audit verdicts). The lessons worth keeping: a textual "only version lines changed" rule must pin the indentation of the field it exempts, or a dependency named `version` passes as one; and a step that computes a gate's mode must degrade to the strict mode when its input is unavailable, never fail the job, since a failed `changes` job skips every gate behind it.

## Arc 4 review, round 2

- **Codex `approve`, no new findings; the loop closed in two rounds.**

## Final cross-arc pass

- **Codex `approve with fixes` (2 Low), both accepted.** Escaping CR and LF is not enough for a log line that carries outside text: the runner's legacy parser reads `##[` anywhere in a line. And a later arc that turns a path off (release-please's tagging) leaves operator-facing strings in older steps pointing at it; read the error text, not just the logic.
