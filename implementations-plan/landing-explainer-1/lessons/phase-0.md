# Phase 0: planning consults

Every consult of the planning run, with its verdict. Transcripts stay local (`audit-*.md`, gitignored); this file and `plan.md` § Audit verdicts are the record.

## Recon (2026-10-17)

One Sonnet Explore agent at `2c0df3b9`: a nine-capability reuse sweep (CI, path filters, HTML pins, media, prior landing plans, previews, wallet links to `nulo.sh`, root scripts, page styles). The parent checked the preview question itself: `gh api .../commits/<sha>/check-runs` shows "Workers Builds: nulo-landing" on `main` only. Aztec claims were checked against `aztec-labs-eng/aztec-node` at tag `v6.0.0-rc.3` (`docs/docs-developers/docs/`), a sparse clone in the lane's scratch directory, and against the orchestrator's rc.3 privacy research.

## Round 1, Codex (2026-10-17)

`run-codex.sh` on gpt-6.1-sol, high, read-only (the host runs Codex in approve-for-me mode); session `01a14bca`. Verdict: reject, 9 findings, all accepted after checking each against the docs and the tree. The blocking two: the scripts overstated what rc.3 keeps private (OA-1 to OA-3), and the PR could go ready without the Cloudflare preview the owner asked for.

## Round 1, Opus Plan (2026-10-17)

`Agent`, `subagent_type: Plan`, `model: opus`. Verdict: conditional approve, 11 findings, all accepted. Verified before acceptance: `page.css:692-694` hides the header links at 900 px and narrower; `install.ts:28` does not match `HeadlessChrome/`; Vite 8.2.1 rewrites `video`, `source` and `track` asset attributes. The one that reshaped the plan: arc 2 depends on an open, paid owner decision, so the close-out may ship with arc 1 (D9).

## Rounds 2 and 3, Codex (2026-10-17)

Resumes of `01a14bca`. Round 2: conditional approve, 2 findings (the preview server's `cwd`; recon's unverified dashboard assertion), both accepted. Round 3: approve, no regression.
