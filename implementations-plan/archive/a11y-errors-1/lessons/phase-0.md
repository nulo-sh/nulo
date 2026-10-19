# Phase 0: planning consults

## Recon (Explore, Sonnet)

One reuse-and-inventory sweep at `60fde7e7`. It found the 7 `Text` sites and the 12 stylesheet sites, the shared reader `apps/extension/scripts/type-roles/source-scan.ts`, and no test that asserts red on any moved text. The driver verified every row (recon.md). The issue's "23 text sites" did not hold: 25 `color="red"` attributes, 7 on `Text`; the lock screen's "Wrong password" is red through a stylesheet, not a prop.

## Round 1: Codex and Opus, in parallel

- **Codex** (gpt-6.1-sol, high, read-only, session `01a155b6`): `conditional approve`. Three findings: the guard missed `class="color--red"` and a literal `:style` (demonstrated by feeding both through `parseSource`); Phase 4's probes, route roots and tokens could pass without measuring the element, and the verify refusal sits on the footer's `--nulo-surface`, not the root; 14 files, not 15, and restoring base copies over uncommitted edits could lose work.
- **Opus 5.5** (Plan): `conditional approve`. D10 was wrong: `dev` does not require an up-to-date branch, so an already green PR that adds red text, merged after this one, turns `dev` red; the template arm checked a static `style` (stories only) but not a bound `:style`; a plan id in a reviewed entry's `why`; F1 and Security wording; an explicit `POLICY`; ancestor `background-image` and `opacity`; a missing `lessons/phase-0.md`.
- Both found the inventory complete and the chip border inside the decision.
- Resolution: every finding accepted (plan.md § Audit verdicts). The phase order changed: the guard lands before the change (D11).
