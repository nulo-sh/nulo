# Phase 0: planning

Every consult of the planning run, with its verdict.

## Recon

- Two Explore agents on sonnet: a batched reuse sweep (focus rings, keyboard activation, live regions, `aria-hidden`, contrast helpers, Tab-order helpers, theme switching) and an e2e-hook mapper (screens, testids, screenshot machinery, Firefox notes). Both completed; their findings are in `recon.md`, checked by direct reads.
- The contrast ratios in the plan were computed with the repo's `contrast()` helper (`packages/design/src/theme-contrast.ts`) from a scratch script outside the repo; they match the follow-ups' figures to two decimals.

## Round 1 audit

- **Codex** (GPT-6.1 Sol, `high`, read-only), session `01a11f8d-2a88-74a2-b35d-a3eb4ab0de59`. Verdict: reject, three High findings (option C's press lifecycle, the recipient's document-wide Enter, Tab-walk targets that do not exist). Every finding checked against the code before it was accepted; dispositions in plan.md § Audit verdicts.
- **Opus 5.5** (Plan agent, fresh context). Verdict: conditional approve, six conditions. Two of its facts checked and confirmed by direct reads: `base.css.test.ts` pins `base.css` by SHA-256, and 36 files hold 51 `:focus-visible` rules, 18 of them the same accent ring.
- Checked after the round, not raised by either reviewer: the destination's suggestion list is absolutely positioned over the token card (`RecipientField.vue`, `.contacts_wrapper`), so a reproduction that pressed the token card under the open list would have thrown in `pointerClick` (it refuses a covered centre). Phase 1.3 now measures coverage instead (plan I6).
- PR #58's copy differs from `dev`'s ("Connection verification" becomes "Connection check", "Always trust" becomes "Skip this check next time"); the decision pages use #58's, stated where they do.

## Final fresh Codex pass

- **Codex** (GPT-6.1 Sol, `high`; the host ran it in approve-for-me mode with `read-only` requested; it modified nothing), new session `01a11fa5-5b43-7922-b017-1d6b32a63b54`, given the consolidated plan, the ledger, the round-1 packet and the full ask packet. Verdict: reject, three blocking findings (the recipient Enter's target check was too wide, option C's record/hold/refocus lifecycle, smoke runs on a stale bundle and network runs with retries), four more Med. Each was checked against the code (`RecipientCard.vue:46-60`, `Flex.vue:11,79`, `global-setup-smoke.ts:7-9,36-38`, `vitest.e2e.network.config.ts:39`, `send.vue:426`, `send.test.ts:81-85,153`) and accepted; dispositions in plan.md § Audit verdicts, Round 2.
- Gotcha worth keeping: the smoke suite never builds, and `e2e:agent` writes its network build into the same `dist/<browser>`, so a smoke gate run after a network gate tests the network build of the previous commit. Every smoke gate builds first.
- Resumed the same session on the fixes: conditional approve, three conditions (an earlier blur's timer could still close a held suggestion; an inherited `EXTENSION_PATH` outranks the fresh build; options.md lagged the guard). All three fixed; resumed once more: approve.
