# prover-warm-1, phase 0: planning consults

## Recon (2026-11-05)

- One Sonnet explorer, eight capabilities (execute-window path, SW→offscreen RPC, Presto prediction, prior warm-ups, isolation, the privacy clause, the prover-ON e2e path, option pins). Persisted in [../recon.md](../recon.md).
- Prior art reused: pxe-limits-1's scratch-instrument method (records in the PXE page, a CDP or frame-sandbox drain, a PSS sampler over the browser's process tree), adapted, never committed.

## Codex round 1 (gpt-6.1-sol, high, session 01a1ada7)

Verdict: **reject** (decision authority, biased measurements, unsupported Presto exclusion, insufficient cache guard). Eight findings; the dispositions are in plan.md § Audit verdicts.

## Opus 5.5 leg (Plan agent, round 1)

Verdict: **conditional approve**. New beyond Codex: the Send review sheet opens only for private sends the account pays, so the trigger moved to the review-time estimate methods (D7); `vi.mock` does not reach bb.js inside bb-prover (T1 spies instead); bb.js's log merges thread start and the CRS load; 188 cores hide contention (the constrained run); the memo pin; a failed-init leak (a residual). Rejected: ship at ≥ 1 s on either browser; a journal read for D3.

## Codex round 2 (resumed)

Verdict: **conditional approve**: preview-only `default_entrypoint` sends, warm-up inside admission, R3 with overlap, D4's read inside H, I5's claim. All accepted.

## Codex round 3 (resumed)

Verdict: **approve**; one low wording fix to I5, applied.
