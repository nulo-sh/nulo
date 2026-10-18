# Phase 2: #498, start on a dead custom node

- The two tolerant catches (start and the switch run) first pushed `useProfileBootstrap` over the 80-line and cognitive budgets. One shared helper, `composables/internal/default-account.ts` (outside the auto-import scan), serves both and removes the duplicated catch; no suppression.
- Mutation checks: making the helper rethrow reds the three new bootstrap and switch tests, and reds `start-dead-custom-node.test.ts` on Chrome (the chip never renders: `isLogined` stays false).
- `start-dead-custom-node.test.ts` measured: Chrome 11.1 s test (24 s run), Firefox 15.8 s test (25 s run), against an estimate of 25 s per browser.
- Gate: F exit 0; the new smoke green on Chrome and Firefox; `endpoint-refused-recovery.test.ts` (network, proverless, Chrome, retry 0) green, 24.8 s.
