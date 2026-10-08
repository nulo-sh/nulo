# Phase 3: attestations and the verify text

- **git-cliff's `commit_id` is not the tag's commit under `--include-path`.** git-cliff 2.14.2 (what `orhun/git-cliff-action` v4.9.1 installs) rendered the newest commit the path filter keeps: a scratch rc tag at `50540c8` printed `3b80761`, a scratch stable tag at `5cadf9f` printed `e49e4ce`. `v0.30.2` is tagged on the repository's root commit, so its range is empty and told nothing; the renders ran on a scratch clone with scratch tags. The plan's fallback took over: `cliff.toml` prints `@SOURCE_COMMIT@`, `attach-assets-run.ts` replaces it with the tag's commit, and the substituted renders named `50540c8`, `5cadf9f` and (nightly) `5cadf9f`.
- **git-cliff for the renders** came from its own v2.14.2 release, checked with the release's `.sha512` and against GitHub's asset digest (`sha256:24f397c7…`), unpacked in the lane's scratch dir.
- **A mutation that hits a comment proves nothing.** The first "names git-cliff's commit" mutation replaced the first `@SOURCE_COMMIT@` in `cliff.toml`, which is in its header comment, so the check still passed; it now replaces the `--source-digest` occurrence.

## Post-implementation review, round 1

- **Codex round 1: `approve with fixes`, 4 accepted. Opus: 9 findings, 8 accepted, 1 no-change (S1 is applied before merge).** Fixes in `cf8ecb3`.
- **A third-party action's default `token` input is a credential handed over, not one it runs beside.** `oven-sh/setup-bun` defaults `token` to the job's `github.token`; the publish jobs' token can write releases. Read the action's `action.yml` at the pinned SHA before trusting "runs no third-party action but X".
- **A step that re-runs must see its own earlier work as success.** `auto-unstick` emitted `unstuck=true` only when it created the tag, so the documented "re-run the failed jobs" stranded a tag with no release.
- **`GET releases/tags/<tag>` never returns a draft**, which is the cheap way to ask "is this published" with a read-only token.
- **Round 2: `approve with fixes`, 1 accepted (`eb03f15`).** The retry fix had keyed on the label its own attempt changes. An idempotent step must recognise its own finished work by state it cannot half-write (the tag at HEAD), not by a label it flips along the way.
- **Round 3: `approve`, no new material findings.** Loop closed.
