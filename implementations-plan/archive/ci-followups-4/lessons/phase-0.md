# Phase 0: planning consults

- 2026-10-14: recon by three sonnet explorers (#365's e2e pieces, #172's resolution surface, the lessons budget); findings in [recon.md](../recon.md).
- 2026-10-14: scratch probe of `hoistPattern` on Bun 1.4.2 in a two-package fixture outside the repo: the fallback holds only the named package; the lockfile is byte-identical; an existing tree keeps every old link through `bun install`, `--force` and `--frozen-lockfile --force`, and only a fresh install applies the pattern.
- 2026-10-14: Codex round 1 (gpt-6.1-sol, high, read-only; session `01a13c15-b102-7653-8d29-79750d778ff1`). The script ran on the `alejo-icloud` home because the session environment sets `CODEX_ACCOUNT=best`; this lane set none. Verdict: reject, seven findings; the dispositions are in plan.md § Audit record.
- 2026-10-14: Opus Plan lens on v1: conditional approve, twelve findings; it agreed `hoistPattern` is the best architecture and pointed at #172's last comment ("a reviewed per-package hoist entry"). Dispositions in plan.md § Audit record.
- 2026-10-14: Codex round 2 (resume of `01a13c15`) on plan v2.
- 2026-10-14: Codex round 2: conditional approve, three findings, all accepted (smoke refuses an unarmed build, `global-setup-smoke.ts:34-73`; the declined branch kept approved-branch policy; the identity baseline's suites were ambiguous). It confirmed `hoistPattern` over public hoisting with high confidence once A1 authorises it.
- 2026-10-14: Codex round 3 (verify, resume): approve; no regression in v3.
