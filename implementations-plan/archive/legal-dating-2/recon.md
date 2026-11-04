# legal-dating-2: recon

One Explore agent (sonnet) at `fa6913668`, plus the planner's own reads. Read-only.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| The placeholders to fill | `legal/terms.md:3`, `:571`; `legal/privacy.md:3`, `:471`, `:472`; `legal/archive/privacy-1.2.8.md:3`, `:470`; `packages/legal/src/manifest.ts` `effective: null` for terms 1.2.1, privacy 1.2.8 and 1.2.9 | adapt (literal substitution) |
| The checklist | `BEFORE-LAUNCH.md` § 4, the first two boxes of the Terms 1.2.1, privacy 1.2.8 and privacy 1.2.9 entries (lines 206-207, 215-216, 228-229) | adapt (tick) |
| Manifest ↔ document agreement | `packages/legal/src/manifest.test.ts:42-47` (head header = manifest head), `:49-52` (history rows list the manifest versions, by version only), `:54-60` (each archived copy's header = its manifest entry) | reuse as is: it reds unless the manifest, `privacy.md` and `archive/privacy-1.2.8.md` agree |
| History-row dates | no test for `terms.md` or `privacy.md`; the only row-date test is `apps/landing/scripts/legal-pages.test.ts:227-231`, for the website notice. Searched `parseVersionHistory`, `effective`, `row` in `packages/legal/src`, `apps/landing/scripts` | not built (plan D3) |
| The main-PR blank check | `pr-quick.yml` `launch-legal` (PRs into `main` only): `NULO_LAUNCH_GATE=1 bun run test src/launch.test.ts` in `packages/legal`, which reads the root `package.json` version (1.1.0, so live) and refuses any `«FILL` line in `legal/terms.md` or `legal/privacy.md`; the release skill's unstick repeats the grep | reuse as is (run locally as G3) |
| A user-facing date in the extension | none. `apps/extension/src/utils/legal-about.ts`, `popup/pages/settings/about.vue`, `components/LegalAcceptanceSheet.vue`, `onboarding/pages/terms.vue` read versions only. Searched `effective` over `apps/extension/src` | not affected |
| The landing | `apps/landing/scripts/legal-pages.ts:165-196` prints each version's date (or "not yet effective" / "never in effect") and adds the DRAFT banner and `noindex` while a page holds `«FILL`. It deploys from `main` only | not affected (renders the new date) |
| Other restatements | none. Searched `«FILL\|1\.2\.1\|1\.2\.8\|1\.2\.9` repo-wide (minus `node_modules`, `implementations-plan/archive/`), and `effective\|undated\|not yet` in `apps/extension/store/` and `docs/`. The `1.2.1`/`1.2.8` strings in `stored-shapes/{goldens,snapshot}.json` and `tests/e2e/fixtures/update/v1.1.0.storage.json` are acceptance-record version stamps, not dates | not affected |
| Other archive blanks | `legal/archive/terms-1.0.md:3`, `:578`: 1.0 never took effect (`legal/README.md` § Placeholders) | left as is |

## Precedent

- `c96986491` (#1229) dated Terms 1.2 and privacy 1.2.6: version line, history row, manifest entry, and ticked the two matching boxes, the date in parentheses on the first.
- `9458838fd` (#893) dated the archived `privacy-1.2.2.md` and `privacy-1.2.3.md` in their version line and in their own history rows (25 October 2026).
- Date format: `D Month YYYY`, no leading zero (`6 October 2026`).

## Collisions

- PR #1538 (draft, branch `worktree-legal-dating-1`, checked out in another lane's worktree) dates Terms 1.2.1 to 3 November 2026. This plan supersedes it (plan D1).
- No other open PR touches `legal/`, `packages/legal/` or `BEFORE-LAUNCH.md`. No open or closed `known-limit` issue covers the legal dates.
- PR #1601 (`chore(main): release 1.2.0`) is open on `main`; the promote that carries this change lands before it merges.
