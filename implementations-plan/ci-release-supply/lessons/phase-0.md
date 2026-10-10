# Phase 0: planning consults

## Recon (2026-10-09)

- Three Explore agents (sonnet): a batched reuse sweep, a workflow mapper, a release and scripts mapper. Findings in `../recon.md`.
- Registry check: `@alejoamiras/presto-banners` 1.2.0 published 2026-09-25T21:39Z. Tarball diff against 1.1.0: one rendered change for Nulo, `STRINGS["permission-blocked"].title`; the banner stylesheet changed, but the extension CSP allows inline styles, so no hash moves.
- Web evidence for #168: GitHub community discussion 26822 (comment of 2025-02-26) reports that re-running one matrix job after several failed folds the matrix result to success. Discussion 52505 reports that "Re-run failed jobs" in a matrix that calls a reusable workflow re-runs the failed jobs but not their dependents. Neither has a GitHub reply. Both are inputs to the probe, not facts about this repository.
- Web evidence for #178: GitHub's immutable-releases docs disagree across versions on whether a tag can be removed after its immutable release is deleted (OA-2).

## Store copies measured (2026-10-10, for #179)

Public endpoints, no credentials. Chrome: `clients2.google.com/service/update2/crx?response=redirect&prodversion=140.0&acceptformat=crx3&x=id%3Djlmiaokmjoicmclelpiiocdhncddkdmc%26uc` answered 200 with a 36,680,569-byte CRX3 (magic `Cr24`, version 3, 1,310 header bytes). AMO: `api/v5/addons/addon/wallet@nulo.sh/` lists `current_version` 0.30.2.0 with `file.url` and `file.hash` (`sha256:e394…37ad`), and the downloaded file matched that hash.

Against the v0.30.2 release zips (both matched `SHASUMS256.txt`), unpacked and compared tree to tree:

- Chrome store copy: adds `_metadata/verified_contents.json`; drops `.gitkeep` (an empty file the release zip carries from `apps/extension/public/.gitkeep`); `manifest.json` differs in bytes and, as parsed JSON, only by an added `"update_url": "https://clients2.google.com/service/update2/crx"`. Every other file is identical.
- AMO copy: adds `META-INF/cose.manifest`, `cose.sig`, `manifest.mf`, `mozilla.sf`, `mozilla.rsa`; keeps `.gitkeep`; `manifest.json` differs in bytes but is equal as parsed JSON. Every other file is identical.
- Both stores serve manifest version `0.30.2.0` for tag `v0.30.2`.
- `gh attestation verify nulo-chrome-0.30.2.zip --repo nulo-sh/nulo` answers 404: v0.30.2 was published before the attested flow reached `main`, so the live copies today can only be compared against the digest-checked release zip.

## Dual audit, round 1 (2026-10-10)

- **Codex** (gpt-6.1-sol, high, read-only, `env -u CODEX_ACCOUNT`, fresh session): **reject** with blocking findings on the supersede race, the per-job API rule's scope and the verifier reuse. Ten findings; dispositions in `../plan.md` § Audit verdicts. Notable: the supersede job read the live head before listing runs, so a push between the two calls would have cancelled the current head's runs; `runVerifyPublished` hashes rebuilt assets and edits the release, so it cannot verify a store copy as-is; the scoped API rule as drafted would have gated on nightly's advisory jobs.
- **Opus Plan agent** (same family, read-only): **conditional approve**, eleven findings. It found the same read-order race independently, the probe's missing reusable-call job shape, the live-label notice contradicting its own ban with a fail-open default, and #183 binding `dev` after launch.
- Rejected with reasons: `queue: max` (duplicates runs; cannot pair with dispatch's cancel); a preflight before `auto-unstick` tags (a refusal there leaves a merged, untagged Release PR).
- Lesson: a "read state, then act on a list" job must list first and read the state second, or the read goes stale against the list. Both legs caught it; the draft did not.

## Final fresh Codex pass (2026-10-10)

- Codex gpt-6.1-sol, high, fresh session `01a1233b-3f22-7141-a6a4-c5c083f0f8e1`, `env -u CODEX_ACCOUNT`, ran first time. Verdict **reject** (launch-gate bypass, probe acceptance). Eight findings, all verified against the tree and accepted; dispositions in `../plan.md` § Audit verdicts.
- Notable: `pr-quick.yml` does not run on `edited`, so a retargeted PR can carry a green `quality-status` from a `dev`-based run into `main`; that reversed round 1's rejection of the `auto-unstick` preflight. A force-push rewind defeats list-then-read alone; revalidating before each cancel narrows it to one call.
- Lesson: a PR check keyed on `github.base_ref` is only as fresh as the last event that ran it; any guard that must hold at release belongs at the step that creates the tag, too.
- Resume of the same session (checking the fixes): **reject** on one High: my first verifier fix checked `SHASUMS256.txt` by content only and changed the publish path's download order. Final form leaves `runVerifyPublished` unchanged and composes the exported `fetchVerified`. Five tightenings accepted (recovery version check, checker-job `if`, revalidation per retry, immutability claim, `test:release` in phase 2.1's gate).
- Lesson: when a fix "extracts unchanged" helpers from a security path, diff the publish path's behaviour, not just the new caller's, before calling the extraction neutral.
