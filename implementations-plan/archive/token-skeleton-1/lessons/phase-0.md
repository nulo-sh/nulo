# Phase 0: recon, plan, panel

- **Recon.** One Explore agent (sonnet) over the card, its consumers, the design system's `Skeleton`, the type-role guards and the stories; direct reads of `index.vue`'s read, `token/service.ts`'s metadata getters, the network e2e and the pictures' scratch run (shots-p65: its markup diff, spec and box readings). Findings in [recon.md](../recon.md).
- **Claim that did not hold.** The lane brief names "the smoke e2e that drives a register-token request"; none exists. `register-token.test.ts` and `type-roles-windows.test.ts`, both network, drive it, so phase 2 runs those on both browsers.
- **Codex plan audit** (gpt-6.1-sol high, session `01a155ff-a185-78a3-96f0-d293c825a1d6`): conditional approve, C1-C4; all accepted (plan § Audit verdicts).
- **Opus 5.5 Plan lens:** conditional approve, O1-O13; all accepted but per-row `aria-busy`, superseded by Codex's C2 (`aria-busy` makes no live region).
- **Codex final fresh pass** (session `01a1560e-5292-7d43-8bbf-7d27124abb59`): conditional approve on F1 (the scratch picture spec waited on a row's `aria-busy`, which D2 never sets, and lacked the long case); fixed, then on resume approve.
