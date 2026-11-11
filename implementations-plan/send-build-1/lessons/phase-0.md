# Phase 0: planning consults

- 2026-11-11: recon by three Explore agents (Sonnet): today's Send, the prototype against production, a reuse sweep. Findings in `recon.md`.
- 2026-11-11: plan audit round 1, Codex (GPT-6.1 Sol, high, read-only): reject. Blocking: the Teleport with a static selector and a toggled `disabled` throws on the first open on Vue 3.5.42 (reproduced: the deferred mount caches a null target); Same as last time in USD mode loses the amount; the review's arm and focus; red intermediate phases; gate commands (network retries twice unless `NULO_E2E_RETRY=0`); edited quotes; teardown authority. All adopted (plan § Audit verdicts).
- 2026-11-11: plan audit round 1, Opus 5.5 (Plan agent): conditional approve. Same Teleport defect (traced in `runtime-core`), plus e2e fixture gaps (eleven specs with `expect: "send"`, vacuous waits on `send-destination-field`, hidden-card visibility waits, the released build's Send in `update-in-place`), the testid list, the change map. Adopted except one redundant parse class.
- 2026-11-11: final fresh Codex pass (session resumed once): conditional approve, then approve after three local fixes.

## a1 build log

- Phase 1 gate green first time after a split for the cognitive budget (`parseSends` → `parseSend`).
- Phase 2 gate: `src/wallet/services/price/convert.test.ts` "the lowest band a list feed may name" timed out at vitest's 5 s once with the host at load ~250 on 188 cores; the file is untouched by this lane and passed alone and on the rerun of `bun run test`. Load-induced, not a defect of this change.
- The type-role inventory holds every new address site; a site's selector must be its own element's testid, so each half of the payee address carries one (`send-payee-half-first`, `-second`).
