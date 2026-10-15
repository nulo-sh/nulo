# Phase 2: arc 1's gate and review loop

## Codex round 1 (gpt-6.1-sol, high, session 01a141b2)

Ran on the default `~/.codex` login (`CODEX_ACCOUNT` unset). Verdict: conditional approve.

1. Medium, the fee row's hover fades the moved dollar figure under 4.5:1. **Verified, left out as an owner ask (SA-2):** `disclosure_toggle` (`tx-shared.module.css`) sets `opacity: 0.8` on hover; `--nulo-secondary` at 80% over `--app-bg` reads 3.51:1 light, 4.42:1 dark (a scratch run of `theme-contrast.ts`). The fade predates the arc and already dims the row's label and estimated value, which were secondary before it; removing it changes a hover a person sees, outside P18-06.
2. Low, `walkDecls("color")` misses `COLOR:`. **Accepted:** `/^color$/i`; a scratch mutation of `glossary.vue` to `COLOR: var(--nulo-outline)` turned the sweep red, then was reverted. No committed self-test: it would need the collector lifted out of the test for one probe.
3. Low, `source-scan.ts`'s header counts its readers, and it already missed three. **Accepted:** one sentence with no list (supersedes the plan's "the header lists the new reader").
