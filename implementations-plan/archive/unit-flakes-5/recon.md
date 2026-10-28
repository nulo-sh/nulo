# unit-flakes-5 recon

Base: `dev` at `17f35c504dacfadf49e4291c496054252b5594b2`. Host: 188 cores, Bun 1.4.2, vitest 4.1.12, TypeScript 6.0.3, `@vue/compiler-core` 3.5.42 (decodes with `entities` 7.0.1). One Explore sweep (sonnet) plus the planner's own measurements and prototypes. Scratch scripts stayed outside the repo.

## Measurements

Each file alone, `bun --bun vitest run <file> --retry=0 --reporter=verbose`, three runs, load 73 to 123. Only tests at 300 ms or more are listed.

| Test | ms (3 runs) |
|---|---|
| stored-shapes.scan › EntityStorage/ValueStorage built by the factories | 1395, 1313, 1178 |
| stored-shapes.scan › every nulo: literal is registered | 1084, 899, 920 |
| stored-shapes.scan › every registry entry is named | 1148, 1125, 1311 |
| stored-shapes.scan › every useSyncedRef key | 612, 555, 548 |
| stored-shapes.scan › the scan is not vacuous | 543, 543, 517 |
| useLogFilters.scan › every source resolves to a row | 1285, 1159, 1113 |
| log-payload-ban › no sensitive identifier is flattened | 1829, 2381, 1572 |
| copy-dash-ban › no text a screen shows joins two clauses | 1150, 1251, 1184 |
| type-role-ban › no pick outside a role or a reviewed entry | 2084, 1488, 1688 |
| icon-names › every glyph name is drawn | 738, 673, 510 |
| useFullBackupImport › a body nested past the engine's stack | 1080, 1508, 1349 |
| useRestoreAgain › a body nested past the engine's stack | 947, 986, 1471 |

Interleaved A/B, three rounds at load 132 to 222, worst tree test per run, base → prototype: stored-shapes 1826/1903/3246 → 609/775/904; useLogFilters 2074/2644/1766 → 864/662/900; type-role 2154/3117/1285 → 1076/959/911; copy-dash 2074/1506/2467 → 1591/798/1497; log-payload 2196/1812/1458 → 1388/1128/1409. useLogFilters at load 150 to 170 with one fix only: the memo alone 1016 to 1528, the pre-check alone 799 to 1645.

## Where each cost sits

- **stored-shapes.scan**: `scriptsOf` (`stored-shapes.scan.test.ts:144-149`) runs `parseSource` and a parented `ts.createSourceFile` per file, and the five tree tests call it through `nuloLiterals`, `syncedRefKeys`, `strayConstructions` and `strayStoreImports` about seven times over 1076 files. 178 files spell one of the triggers in plan D1.
- **useLogFilters.scan**: `sourceExprs` (`:234-251`) runs `callsTo` on all 1080 files (648 ms of a 1006 ms instrumented run). `constantValue` (`:84-92`) scans all 1080 texts with a fresh regex on each of its 153 calls (390 ms). 193 files spell a callee name.
- **log-payload-ban**: `codeLines` on 1063 files. The 337 files that spell a denied name, the `secretkey` suffix, `message` or `stack` carry 975 of its 1124 ms. The window and hazard passes take about 240 ms.
- **copy-dash-ban**: script parses dominate (1374 of 1818 ms instrumented). The 427 script blocks that spell `—` or `\u` cost 997 ms; the other 6042 chunks (most of them template expressions) cost the rest. The em dash sits mostly in comments of large files, which only the parser can tell apart from strings.
- **type-role-ban**: `scanScript` parses all 851 files' scripts. Of the 576 `.ts`/`.js` files, 47 spell `font`, `letter` or `transform` (any case) or a backslash.
- **icon-names**: `parseSfc` plus a parented parse per `.vue` (252). Its maximum of 738 ms gives 3.3 s at #1112's 4.5× factor.
- **Deep-nesting pair**: building the 1,000,000-deep array takes 62 ms. The cost is JavaScriptCore's own `JSON.stringify` (`useFullBackupImport.ts:165-170`). Plain Bun: depth 25,000 takes 2 ms, 30,000 takes 653 ms, 39,999 takes 1242 ms and succeeds, 40,001 takes 1270 ms and throws `RangeError`, and 1,000,000 takes about 1.2 s and throws. Nested objects behave the same. `JSON.parse` accepts 1,000,000-deep text in 182 ms, so the hostile file of #671 reaches the stringify.

## Facts the triggers rest on

- TypeScript cooks escapes: `StringLiteral.text`, template pieces and `Identifier.text` hold the decoded value (`\x6e`, `\u006e`, `\u{6e}`, a line continuation). Every such escape starts with `\`. U+2014 has only `\u2014` and `\u{2014}` as escapes.
- Vue decodes character references in template text, attribute values and directive expressions (`exp.content`) but not in `<script>` content. Of the 2231 HTML5 named references, only `&mdash;` decodes to an em dash and only `&fjlig;` to ASCII letters (`fj`). `&period;`, `&quest;`, `&lowbar;`, `&UnderBar;` and `&colon;` decode to `. ? _ :`, so a trigger read off raw `.vue` text holds letters only.
- A `callsTo` callee in a script is `getText()`, its source text verbatim (`source-code.ts:166`); in a template it is decoded code.
- `codeLines` blanks characters to spaces or `\0` and never adds one, so every name `occurrences` matches spells the same characters in the raw file.
- The prototypes of plan D1 and D2 give byte-identical tree findings with and without each check: 129 key literals plus 1 `useSyncedRef` key, 238 log sources, 37 dash hits, 24 type-role findings, 0 log offenders.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Skip a file before the parse | `css-v-bind-ban.test.ts`/`amount.callers.test.ts` on PR #1269's branch; nothing on `dev` (sweep grepped `includes(`/`.test(` before `parseSource`/`callsTo`/`codeLines`/`parseSfc` in every scan test) | adapt the method, per guard |
| Compute once per test file | `once` (`useLogFilters.scan.test.ts:103-109`), `treeHits ??=` (`copy-dash-ban.test.ts:320`), `let tree` (`type-role-ban.test.ts:587`) | reuse the idiom; a keyed `Map` for `constantValue` |
| A corpus shared across test files | none (no `globalSetup`/`provide` in the unit configs; `inventory.test.ts:152` is `beforeAll(…, 120_000)`) | not built (plan D6) |
| Test timeouts | none in `vitest.config.ts`/`vitest.base.mts` or the eight files; vitest's 5 s default applies | unchanged |

Other whole-tree tests not in #1270 (sweep): `DottedTerm.scan`, `css-v-bind-ban`, `red-text-ban`, `amount.callers`, `toast-call-sites`, `profile-ui-keys.scan`, `price-refresh-ban`, `storage-facade-ban`, `a11y-css`, `useConfirm`, `service.fence-entry`, `legal/call-sites`, `expiry-deferral.pins`, `scripts/type-roles/inventory`. Out of scope.

## Issue claims checked

- Held: the nine tests and their order of cost; template code is entity-decoded; the method of #1269.
- Understated: stored-shapes has five slow tests, not three. useLogFilters has a second cause, `constantValue`'s rescans, about 40% of its time.
- Did not hold: "`type-role-ban` and `log-payload-ban` have no such condition, because every file can hold a finding". `type-role-ban`'s scripts need `font`, `letter` or `transform` (47 of 576 script files), and `log-payload-ban`'s files need a denied name, `secretkey`, `message` or `stack` (337 of 1063). For `log-payload-ban` those 337 files carry about 87% of the parse time, so its cost stays close to proportional.
- Did not hold: "the scans read through `source-scan.ts` and `source-code.ts`". stored-shapes, copy-dash, type-role and icon-names build their own `ts.createSourceFile`.
- Collisions: PR #1269 (open) touches other test files. Only `implementations-plan/index.md` and `archive/index.md` can conflict, at close-out.
