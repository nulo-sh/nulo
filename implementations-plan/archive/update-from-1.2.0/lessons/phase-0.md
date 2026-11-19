# Phase 0: planning consults

- 2026-11-05, recon: one Explore agent (sonnet) diffed `v1.1.0..v1.2.0` over the release path and the harness. It found both blockers independently of the planner: the candidate's version (F4) and the sponsor the sandbox no longer offers (F5). It left an empty scratch file outside the repository, since removed.
- 2026-11-05, v1.2.0's zips: downloaded into an empty scratch folder; `sha256sum -c` OK; equal to GitHub's asset digests; `gh attestation verify` exit 0 at the tag commit for both; `gh release verify` and `gh release verify-asset` exit 0. The Testnet host was read from `assets/seeds-DCho9F74.js` with every URL cut to its host.
- Pitfall met again: in zsh, `$t:apps/...` applies the `:a` modifier; write `${t}:path` (archived `release-prep-1.2.0` lessons).
- 2026-11-05, Codex plan audit (gpt-6.1-sol, high, read-only): `conditional approve`, high confidence in D2. P2: Phase 3's rerun rule excluded `apps/extension/tests`, so a merged test change could escape the tested-commit claim. P3: the red control contradicted the clean-tree preflight. Both accepted.
- 2026-11-05, Opus Plan leg: `conditional approve`. The same rerun rule; the runtime line could not be measured before `T`; the review loop belonged before the builds; the exact expected red; Mainnet's host by blob id; a like-for-like runtime statement; why the chaos start is not run. All accepted; the wait's bound moot once #1677 merged.
- 2026-11-05, #1677 merged at 17:15Z while the audit ran; the plan moved to `c4767e8e7`.
- 2026-11-05, final Codex pass (fresh session): `approve`, no new findings.
