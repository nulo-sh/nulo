# Phase 0 — planning log

Every consult, including failed ones, with its verdict.

## Recon (2026-10-09)

- R1, R2, R3: three Explore agents (sonnet), read-only, at `61060c0`. R1 swept entries 1–100, R2
  101–195, R3 deep-dived 14 candidates and built the reuse map. All three returned in full.
- `origin/dev` moved to `f557e20` during recon (#56, #74). The driver fast-forwarded, renumbered the
  file (202 entries) and re-read every built entry at the new base.
- Claims that did not hold: the brief's "175 entries" (195, then 202); entry 107's `addToken` example
  (fenced since the first commit); entry 183 (resolved by #36); entry 26's `change-password.vue:229`
  (now `:214`); entry 150's "next free rows" (row 47 now).

## Dual audit, round 1 (2026-10-09)

- Codex `gpt-6.1-sol`, high, read-only, default login: launched with the shared packet
  (`_audit-prompt.md` in the lane's scratch directory).
- Opus Plan agent: launched with the same packet.
- Codex round 1 returned (session `01a120f7`; the runner upgraded read-only to this host's
  `approve-for-me` sandbox; the tree was unchanged afterwards): **reject**, blocking on Phase 1.5
  (entry 34). Ten findings: 1 blocking, 8 material, 1 minor. The driver's verdicts are in plan.md
  § Audit verdicts.
- Opus round 1 returned: **conditional approve**, 15 findings (6 material conditions). Every finding
  of both legs was verified against the tree and accepted; the merged effect: entry 34 parked,
  entry 125 cut to its in-run teardown half, the 1.5 log-level and Send-label fixes, the escaper
  widened to twelve sites, and the probe, pin and test gaps closed. plan.md § Audit verdicts has
  the table.

## Final fresh Codex pass (2026-10-09)

- Codex `gpt-6.1-sol`, high, fresh session, given the consolidated plan and the decision ledger.
- Final fresh Codex pass returned (session `01a12115`): **conditional approve**, five findings, all
  verified and accepted (AMO ordinary lines through `plain`; 172 and 186 cleanup bullets built in a
  new Phase 2.5; D22's own debug branch; two recon reuse-map rows; Phase 3.5's wording).
- Driver slip, logged: a block-replace script matched a `| 2.3 |` / `| 3.3 |` row in the wrong table
  (§ What this lane builds instead of § File-level change map). Found on re-read and fixed. Lesson:
  anchor table-row edits on the whole row, inside the section, never on a bare cell prefix.
- Confirmation round: the same Codex session resumed with the revision.
- Confirmation round returned: **approve**, one minor wording finding (UI impact still named the
  Terms branch), accepted and fixed. Panel converged: no open finding.
