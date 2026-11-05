# wallet-bugs-3 status

- 2026-11-05 recon done; #1627 demonstrated by a scratch test at base 4b250dfe4; #1653 and #1535 hold by code.
- 2026-11-05 plan drafted; panel (Codex audit + Opus Plan leg) running.
- 2026-11-05 panel round 1 folded in (Codex and Opus both approve with changes); Codex resumed for the verdict.
- 2026-11-05 Codex R3 approve; no owner ask; auto-continue into arc 1.
- 2026-11-05 Phase 1 gate green: token-balance suite 162/162, new test red on the base source, lint and typecheck:all clean.
- 2026-11-05 smoke base proof: send-keyboard red at the new priority check (focus never reaches Fast).
- 2026-11-05 Phase 3 gate (smoke): send-keyboard green on Chrome (40.6 s; base file 39.6 s) and Firefox (67.4 s; base file 66.4 s) after one rework of the new check; FeePriorityRow suite 9/9, send suite 458/458.
- 2026-11-05 Phase 2 gate: execute suite 414/414; network `type-roles-windows` + `popup-escape-layered` green on Chrome and Firefox, the new checks red at the base source. Sweep wall-clock: Chrome 219.6 s before, Firefox 277.0 s before / 306.8 s after.
- 2026-11-05 Review loop converged (Codex R1 clean + comments, Opus clean + tests, Codex R2 clean).
- 2026-11-05 final head: audit:vue and test:all green; network (Chrome, 192.0 s) and smoke send-keyboard (Chrome 40.7 s, Firefox 69.4 s) green; the Firefox network run was on identical code. Screenshots committed for the PR.
