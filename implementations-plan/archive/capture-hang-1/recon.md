# capture-hang-1: recon

One Explore agent (sonnet), read-only, against the worktree at base 24399338. Paths are repo-relative; `e2e/` means `apps/extension/tests/e2e/`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Make a page the shown one | `page.bringToFront()`, about 30 sites (`e2e/fixtures/wallet-pages.ts:60,145`, `e2e/fixtures/send-burst.ts:33,114`, `rows`, `snackbar`, `cap-window`, `snack-placement` specs). `send-burst.ts:28-30`: "a background tab never finishes the token sheet's close transition" | reuse-as-is in the spec |
| Read page visibility | `document.visibilityState` reads at `e2e/fixtures/browser/chrome.ts:20`, `e2e/fixtures/widgets.ts:48`, `e2e/fixtures/browser/firefox.ts:473` | reuse the read; the guard is new |
| Browser-specific page prep | `BrowserDriver.prepareClick` / `prepareKeys` (`e2e/fixtures/browser/index.ts`): Chrome no-ops (`chrome.ts:256-259`), Firefox `bringToFront` (`firefox.ts:408,443-447`) | not used: visibility is not browser-specific, so no driver member |
| Capture helper | `shotSend` and `settleThemeTransitions` (`e2e/fixtures/send-page.ts:210-251`); the only writer to `NULO_E2E_SHOT_DIR`. `e2e/fixtures/journal-page.ts:26,55` call it; `network/type-roles-windows.test.ts` forwards to it | adapt (`shotSend` gains the guard) |
| Unit tests of e2e fixtures | `apps/extension/scripts/e2e/*.test.ts` import `tests/e2e/fixtures/**` (`chrome-driver`, `page-errors`, `poll`, `egress-guard`, …); run by `bun run test` (`apps/extension/vitest.config.ts` includes `scripts/**/*.test.ts`) | reuse the layer for the guard's test |
| Docs | `e2e/README.md:273` lists `shotSend`; `.claude/skills/e2e-testing/SKILL.md` says nothing about capture mode or hidden pages; `e2e/FIREFOX.md:33` (a Firefox tab may never be visible: no frames) | adapt the README row; one skill line |

## Callers

- `shotSend` sites: 21 smoke specs and 17 network specs, plus `network/legal-acceptance-wall.test.ts` and `network/scope-refusal.test.ts` through `journal-page.ts`.
- The traced hidden-page site: `network/connect-verify-mismatch.test.ts:81` (`wallet` from `openPopup`, then `openPlayground`'s tab, no `bringToFront`). The explorer sampled the others and did not enumerate every caller's open order; most shoot a page opened just before, a popup window, or a page brought to front first.

## Search trail for absences

- No `Target.activateTarget`, `Emulation.setFocusEmulationEnabled` or `Page.setWebLifecycleState` in `apps/extension/tests` or `.claude/skills`.
- No lesson on a screenshot hanging: `grep -rniE "visibilityState|renderer-backgrounding|background tab|throttl|screenshot.*hang|SHOT_DIR|capture mode"` over `implementations-plan`, `.claude/skills`, `CLAUDE.md`, `e2e/*.md`, `e2e/fixtures`, `e2e/helpers`.
- `NULO_E2E_SHOT_DIR` appears in no workflow or script (`grep -rn SHOT_DIR .github scripts apps/extension/scripts`: none).

## Open work

- `gh issue list --state closed --label known-limit --search "screenshot OR capture OR background tab OR shot"`: none on this subject.
- Open issues on shots or capture: #885 only.
- Collision: PR #886 (connect-split-1) edits `connect-verify-mismatch.test.ts` line 48 (case 1's title) and deletes `network/connect-one-window.test.ts`. This plan edits case 2 only; no shared lines.
