# Phase 2: arc 1's gate and review loop

## Codex round 1 (gpt-6.1-sol, high, session 01a141b2)

Ran on the default `~/.codex` login (`CODEX_ACCOUNT` unset). Verdict: conditional approve.

1. Medium, the fee row's hover fades the moved dollar figure under 4.5:1. **Verified, left out as an owner ask (SA-2):** `disclosure_toggle` (`tx-shared.module.css`) sets `opacity: 0.8` on hover; `--nulo-secondary` at 80% over `--app-bg` reads 3.51:1 light, 4.42:1 dark (a scratch run of `theme-contrast.ts`). The fade predates the arc and already dims the row's label and estimated value, which were secondary before it; removing it changes a hover a person sees, outside P18-06.
2. Low, `walkDecls("color")` misses `COLOR:`. **Accepted:** `/^color$/i`; a scratch mutation of `glossary.vue` to `COLOR: var(--nulo-outline)` turned the sweep red, then was reverted. No committed self-test: it would need the collector lifted out of the test for one probe.
3. Low, `source-scan.ts`'s header counts its readers, and it already missed three. **Accepted:** one sentence with no list (supersedes the plan's "the header lists the new reader").

## Opus 5.5 diff review (general-purpose, alongside round 1)

Verdict: no bugs; traced the fills of `Input` (every caller), `SearchField`, `AccountSelectRow`, `.kv_key`, the notes viewer, `IdentityStrip`, `.step_num`, `DappSessionVerification`, the connected-apps empty state, `.stalled_line` and `ListStatusMessage`: all on the four pinned fills or `--dropdown-bg`. `enclosingRule`'s widening changes no caller. Three low points, all accepted:
1. The value regex was case-sensitive (`VAR(--nulo-outline)` is valid CSS): `/i`.
2. The blind-spot comment missed an alias custom property: named.
3. The equality proves only that `apps/extension/src` was read: one `arrayContaining` over a design SFC and a `.module.css`.

## Codex round 2 (resume)

Verdict: conditional approve; round 1's fixes and the Opus fixes verified (the 256-file sweep returns the two icon keys; both coverage paths present; `COLOR` and `VAR` caught; SA-2 settled). One low finding, **rejected**: the `/i` also flags `color: var(--NULO-OUTLINE)`, a different custom property. That needs a token nobody defines, and it fails closed (a red test someone reads), so the precise `[vV][aA][rR]` pattern buys nothing worth its readability.

## Codex round 3 (resume)

Verdict: approve; withdrew round 2's finding (no differently cased token exists; the false positive fails closed with its location). Loop converged.

## Smoke e2e, Chrome

`build:chrome` with the four armed flags, then the full suite at `--retry=0`: 56 files passed, 5 skipped; 244 tests passed, 13 skipped, 0 failed; 1484 s (22:33-22:58Z, load1 53 at start). No e2e scenario added.

## Smoke e2e, Firefox

`build:firefox` with the four armed flags, then the full suite at `--retry=0` (the orchestrator raised the load threshold to load1 < 150 for this host's 188 cores): 58 files passed, 3 skipped; 243 tests passed, 14 skipped, 0 failed; 2650 s (23:11-23:56Z, load1 95-206).

## Screenshots

Two throwaway specs, deleted before commit: a smoke spec seeding a token row, a priced transfer with fee, gas and block, and the quotes (the tx page with the fee breakdown open, Contacts empty, New contact, Connected apps, Glossary); and a network spec through `e2e:agent` (proverless, retry 0) opening the connect window with Details and its contract row open. Proving's resting state shows no step numbers, so it has no shot. A hash set right after `reloadExtensionPage` is overridden by the start-up navigation to Home: wait for Home's row first.
