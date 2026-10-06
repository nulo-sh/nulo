# Dependency hardening

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the seven-day release-age gate in `bunfig.toml`, the advisory `bun audit` step in `.github/workflows/_lint-and-typecheck.yml`, the pinned Bun version in `package.json`, the policy and CVE runbook in `SECURITY.md`, and a pinned action in `.github/workflows/actionlint.yml`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Defend the install path against freshly published malicious packages, then bring the dependency tree current in risk-tiered steps:

- Block any package published within a minimum release age, and run `bun audit` in CI as an advisory check.
- Pin Bun to an exact version, with the version in the cache key, instead of `latest`.
- Sweep in-range patches first, then single-major bumps one at a time, ordered by blast radius.
- Leave all `@aztec/*` packages out, because they are exact-pinned and bumped by their own procedure.
- Keep the Node type definitions on the Node line CI runs.

## Why

Recent token-compromise attacks on popular npm packages were detected and pulled within hours to days, so a release-age window catches the publish-and-pull pattern with margin. An unpinned Bun lets a runtime regression break every pull request overnight.

The planned window was fourteen days. The Bun version then in use applied the gate to frozen-lockfile installs of versions already pinned in the lockfile, and seven days was the widest window that installed cleanly, so seven shipped. Widening it again is a deliberate policy change, not a side effect of a Bun bump.

Rejected or dropped because each needed real code rather than a version bump: moving the lockfile to text, which produced duplicate peer-resolved copies and broke type checking on that Bun version; Zod 4, a schema-layer rewrite; and the paired Vitest 4 and Vite 8 upgrade, which needed test-mock changes first. A puppeteer major could not resolve under the gate.

## What shipped

- **Gate and audit**: `minimumReleaseAge` in `bunfig.toml` with a documented bypass for CVE fixes, and a `bun audit` step that reports advisories without blocking and warns on unexpected tool exit codes instead of swallowing them.
- **Pins**: Bun pinned exactly in `package.json` and the setup action, with the version in the cache key.
- **Updates**: an in-range patch sweep, TypeScript ranges unified and moved up a major, and a sweep of plugin majors including jsdom, globals, commitlint, focus-trap, the static-copy plugin and the two unplugin packages.
- **Pipeline**: the actionlint download replaced by a SHA-pinned action.
- **Docs**: a Dependency policy section in `SECURITY.md` with the CVE runbook, mirrored in the repository rules.
