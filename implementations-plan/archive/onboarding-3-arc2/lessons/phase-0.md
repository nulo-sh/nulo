# Phase 0: consults

Every panel consult of the arc 2 plan, in order. Transcripts stay local; the verdicts and each finding's disposition are in plan.md § Audit verdicts.

## 2026-10-19: dual audit of the plan

- **Codex** (gpt-6.1-sol, high, read-only, session `01a154e8`): approve with changes. Seven findings. Demonstrated: the tokens-menu Refresh forces no gas read; M15's step cannot show F; OA-19 C contradicts Hide for passkey; the balances mock is not reactive. Plausible: the reset's gas cache (the FPC purge invalidates; checked). Recommends A on OA-18 to OA-20, and O1 on OA-17 with a flat 12/16 px variant.
- **Opus 5.5 Plan leg**: approve with changes. Nine findings. The `fee-methods` step cannot work as written (a cached positive read, `get-started-hide` in the selector, the banner from tokens). The mock is not reactive. M15's cache (no direct hook). The Security claim is false for passkey Hide. M10/M12 wording. F6. The `import-paths` step is redundant. Timing should cover the suite. Repo rules: no UI impact line, a non-trunk citation, the capture spec's `::after`. Recommends A on OA-18 to OA-20 and O1, replacing O2, O3 and O4.
- Dispositions: plan.md § Audit verdicts and D27 to D32.

## 2026-10-19: final fresh Codex pass

- Codex (gpt-6.1-sol, high, read-only, new session `01a154fa`): approve with changes. S1a needs Home before Hide. I3 overstated the bound. M4 "already covered", which was this arc's own new case in the tree it read. The edited files' runtimes were not planned. D27, D30 and D32 stand. Dispositions: plan.md § Audit verdicts.
