# Phase 0 (planning): consults and findings

## Recon

- Two Explore agents (sonnet): a call-site census of the seven roles and a map of the gates, generators and pins. Findings in [recon.md](../recon.md).
- The planner verified by hand: the guard drops an unknown `type--X` in `composes` and static classes (`type-role-ban.test.ts:177-184, 377-386`); the sweep refuses an unknown class (`fixtures/type-roles.ts:362-366`); the Firefox panel test's clip predicate (`type-roles.test.ts:582-590`); the six `fiat` sites at 11 px; `AmountCard.vue` `DERIVED_PX = 11`; #613's diff adds no retired role.
- No font tooling on the host (`fontTools` absent), so the `DetailsTable` head widths are an estimate (about 60 px for "TRANSACT" at 11 px against a 54 px track): plausible, unverified; Phase 3 measures them.

## Consults

### Codex audit, round 1 (gpt-6.1-sol, high, read-only; ran on the roster account the managed `CODEX_ACCOUNT=best` picked)

Verdict: **reject** (blocking: D6 suppresses regression checks; OA-1 bypasses the signed scale; the layout gate cannot prove its guarantees). Nine findings; triage and dispositions are in plan.md § Audit verdicts. Verified against the tree:
- `send-amount-exact.test.ts:315` pins the derived line at `toBe(11)`: demonstrated, recon missed it.
- `DetailsTable.vue:71` puts `.head` (the role) on the whole grid row; the head words are role-less spans in 54 / 34 / 54 px tracks, so a reading of the role element cannot see one word running into the next: demonstrated measurement gap.
- The claim that an override beside a composed role is a `tie` that no override silences does not hold for a compound selector: `ruleCarrier` finds no carrier for `.a.b` (`type-role-ban.test.ts:186-191`), so the size is judged `faceless`, which `OVERRIDABLE` covers (`:56`, `:225-227`).
- `.conversion` composes `type--meta` (`AmountCard.vue:614-617`), so the derived line sits inside a meta line, as its comment says.

### Opus Plan leg (claude-opus-5-5)

Verdict: **conditional approve**, twelve findings; dispositions in plan.md § Audit verdicts. Verified against the tree:
- `IdentityStrip.vue:86-94` caps the network name at 96 px in `meta`; JetBrains Mono advances 0.6 em, so "Local Network" (13 glyphs) is about 86 px at 11 px and 101 px at 13 px: demonstrated by arithmetic, now an OA-1 instance.
- `PublishStrip.vue:67-84`: `.cell` composes `tag`, `.name` composes `tag-name`; after the fold the facts are 11 px and the names 10 px: OA-4.
- `AddressDisplay.vue:125` sizes a contact name at 12 px beside `data` (12), as `.name_lead` (13) sits beside `data-lead`; `DetailsTable.vue:192` sizes contract names at 12 px: paired sizes, inside Phase 2b.
- `Header.vue` `.lock_chip` is fixed at 26 px and "drawn as the network chip beside it", whose height is `calc(1lh + 14px)`: a paired size.
- `typeRoles` sits at `token-contract.ts:129-158` (the plan said 137-166).

The two legs disagreed twice. On `data` (Codex: the brief supports retiring it; Opus: the signed words name only small caps): taken as OA-2, because a choice about what a person sees is the owner's when the signed words do not settle it. On OA-1's fallback (Codex: a monkey-patch; Opus: a legitimate "ships without"): taken to Codex round 2 with the code evidence.

### Codex audit, round 2 (resumed session)

Verdict: **conditional approve**; four conditions accepted and folded in (plan.md § Audit verdicts). Verified: `fixtures/type-roles.ts:442` is `recordTypography`'s own-text read, and `readHexText` (`:172-197`) returns text and testids only, so a layout read over own-text is a new read; `hasOwnText` (`:102-103`) needs a non-empty text child, so an input's value is not collected. Ruling on OA-1: the monkey-patch objection is withdrawn on the compound-selector evidence.

### Fresh Codex pass (new session), then one resume

Verdict: **conditional approve** (the union read flags Holdings search's native field; the commands lacked the armed smoke build and `NULO_E2E_RETRY=0`; OA-1's C could not ship a run-past). Verified: `global-setup-smoke.ts:34,63-74` refuses a missing or unarmed `dist/<browser>` and builds nothing; `vitest.e2e.network.config.ts:26` retries twice unless `NULO_E2E_RETRY` is set. Resumed on the one condition resolved differently (the predicate defined by kind for native fields and scroll containers): **approve**, "correct definition, not suppression".

## Arc 1, Phase 0 (2026-10-17)

- Merged `origin/dev` at 966bbde5 (#621, #613, #617, #603, #619). One conflict, `index.md` (both lines kept).
- Recount on the merged tree: `name-tag` 0/2/0, `tag` 2/20/0, `label` 68/42/1, `data` 42/29/2, `meta` 8/33/2, `nav` 0/1/0 (variant / composes / static class), the same as recon. #613's new Settings rows use `body`, `caption`, `row-title` only. `identifier-sites.expected.json`: 129 sites, 88 `data`, unchanged in count.

## Arc 1, resumed on decision page 34 (2026-10-17)

- Merged `origin/dev` at f695dea4 (ba12f8fd): #633 (Home's fixed hero, one-line activity rows), #641 (icons redrawn; `icons.json`, `MaterialIcon` and the material font retired, so the layout gate's icon-glyph rule went, 04a6776a), #642 (selectable text, `base.css` re-pinned). One conflict, `index.md`. `bun.lock` unchanged.
- Recount: `name-tag` 0/2/0, `tag` 2/20/0, `label` 70/41/1, `data` 44/29/2, `meta` 8/33/2, `nav` 0/1/0, `fiat` 0/7/0 (variant / composes / static class). `identifier-sites.expected.json`: 129 sites, 88 `data`.
