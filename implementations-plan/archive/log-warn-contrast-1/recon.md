# Recon: log-warn-contrast-1

One Explore sweep (Sonnet) at `24399338`, every row checked by the driver.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| The WARN line's paint | `.log-line-warn` in `createLoggerTheme`, `apps/extension/src/components/JsonViewer/creator.js:283-286`, the only reader of `--log-warn-color` and `--log-warn-background` | reuse as is |
| The token values | `packages/design/src/base.css:187-188` (`[theme="light"]`), `:203-204` (the later `[theme="dark"]`) | adapt: the light colour takes `var(--txt-warning)` |
| An AA warning text shade | `--txt-warning`, `base.css:163` (#7f6200, light), `:94` (`var(--yellow)`, dark) | reuse as is |
| A contrast gate on a log line's tint | the ERROR pair, `packages/design/src/theme-contrast.test.ts:239-243`, both themes | adapt: the same loop covers WARN |
| The base.css pin | `packages/design/src/base.css.test.ts:24` (sha256) and its comment of deliberate choices | adapt: new hash, one clause |
| A browser reading and the pictures | the scratch spec of the a11y-errors-1 lane (`readLogContrast`, `shoot`), recorded in [its plan](../a11y-errors-1/plan.md) | adapt: WARN spans, a nonce, local only |

No `build new`.

## Evidence

- Readers: `grep -rn 'log-warn\|log-line-warn'` outside `node_modules`: `creator.js:283-286`, `logs-decoration.ts:12` (the class name), `base.css`. The JSON viewer's `createTheme` (`creator.js:9`) has no `.log-line-*` rule; only `LogsViewer.vue` imports `createLoggerTheme`.
- Literal copies: `grep -rniE 'c38700|a99d5e|fff8e1|3a2a0f'`: `base.css` only. `#a99d5e` is also the dark `--json-property-name` (`base.css:197`), so a global replace would recolour the JSON viewer.
- Not generated: `token-contract.ts` and `tokens.ts` hold no `log-` name, so `gen:tokens` and the drift pins do not move.
- Other readers of `base.css`: `theme-contrast.test.ts` (palette drift on contract tokens only), `editor-shadow.test.ts` (the `MATCHED_SELECTORS` rules), `theme-vars.test.ts` (every referenced token is declared), `a11y-css.test.ts` (`--nulo-outline` text). None reads a log token's value.
- Paint over a WARN line (`LogsViewer.vue:250-257`): `highlightActiveLine()` is on, and `.cm-activeLine` sets `rgba(255, 255, 255, 0.05) !important` on the `.cm-line` element. The level class is a mark span inside that line (`logs-decoration.ts:24`), and the span's own background is opaque, so the text sits on `--log-warn-background` with or without the active line. Search matches sit under the WARN mark. `drawSelection()` is off, so a selection is native: `::selection` paints `--nulo-surface-highest` (`editor-shadow.css:33`) over the span while text is selected. `--log-inactive-filter` is declared and read nowhere.
- E2E: no spec reads a log colour. `viewers-csp.test.ts` opens the logs window (`openLogs`, `:277`) and pins the editor's adopted styles (`readEditorStyles`: display, font size, scrollbar), not colours.
- Docs: `packages/design/README.md:37-39` names `--log-error-color` in the error-text rule; `CLAUDE.md`, `ARCHITECTURE.md` and the `logging-policy` skill name no log token.
- CI: every e2e path filter lists `packages/design/src/**` (`pr-extension-smoke-e2e.yml:67`, `-firefox.yml:53`, `pr-extension-network-e2e.yml:73`, `-firefox.yml:60`), so the PR runs all four lanes.

## Open work and collisions

- `gh issue list --state closed --label known-limit --search "log viewer"`: none on this surface.
- No open PR (#893, #892, #891, #890, #889, #886, #882, #877, #743) touches `base.css`, `base.css.test.ts`, `theme-contrast.test.ts`, `creator.js`, `LogsViewer.vue` or `viewers-csp.test.ts` (2026-10-19).
- #849 (lane viewer-flake-1): the logs viewer's follow-and-hold checks on Firefox, in `viewers-csp.test.ts` and `LogsViewer.vue`. No shared file; a colour does not move a line.
