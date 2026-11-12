# Recon: token-icons-build-3

Base `dev` 1593cf027. One Explore pass on sonnet (the smoke suite's drivers for these rows), then a direct read of the shipped code. Paths are under `apps/extension/` unless they say otherwise.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| The list's picture by chain and contract | `usePrices(...).iconFor` → `utils/token-icon.ts` `tokenIconFor` (keys by `listKeyOf`, `tokenKey` lower-cases the contract) | reuse as is: `TokensView` already owns one `usePrices` and passes `prices.iconFor(row.entry)` to `TokenSeedRow` |
| The mark | `components/composite/general/TokenMark.vue` (`icon` → logo, else initials, "—" for a symbol with no letter or digit; a failed decode falls back to initials) | reuse as is; a parent's `:class` falls through to its root (`SendTxSummary.vue:169` does it) |
| A default's import slot knows its entry | `home-slots.ts` `homeSlots`: `{ kind: "import", op, entry }`, seeds filtered to the network's `chainId`, matched by lower-cased contract | reuse as is |
| A user import's chain | `TokensView.vue` `visibleTokenImports` keeps a record only when `journalRecordInScope` holds (`utils/activity-rows.ts:107`); `token/service.ts` `persistToken` always stamps `networkId` | reuse: the network's `chainId` is the record's chain |
| The stopped default's dim | `TokenSeedRow.vue` `.dimmed { opacity: 0.55 }` on the symbol; `TokenImportRow.vue` `.failed { opacity: 0.7 }` on the whole row | reuse `.dimmed` on the mark |
| The token row's cut | `TokenCard.vue` `.symbol`: `max-width: 160px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis`, both flex wrappers `min-width: 0` (`token-row.module.css` `.lead`) | adapt: the same three declarations on the import title, no px cap (D4); `.lead` is already on both of its wrappers |
| Unit harness for the view | `TokensView.test.ts`: shallow mount, `H.icons.current` feeds `tokenIcons`, `seedEntry`, a `token_import` op shape, store harness on `{ id: "net-1", chainId: 1 }` | reuse |
| Smoke driver for an import row | `tests/e2e/helpers/activity-seeds.ts:302` `seedTokenImport` (plaintext, in flight, no title); `type-roles.test.ts:874` `expectImportAndNewToken` seeds one after the worker's last start, in the seeded-wallet test (`listedExtensionPerTest`) | adapt: give the seed an optional `title`; no driver seeds a failed import or a titled one |
| Geometry in the smoke suite | `fixtures/type-roles.ts` `atWidth`, `NARROW_WIDTH = 240`, `expectFitsNarrow`, `NARROW_ACCEPTED` (`token-name` only); `drawsEllipsis` (line 166) counts a blockified flex item's ellipsis | reuse `atWidth`; no helper compares a title's edge with a sibling's (absence: grepped `getBoundingClientRect`, `scrollWidth`, `token-import` under `tests/e2e`), so the assertion reads boxes inline as `rows.test.ts` does |
| Pictures through the real worker | `rows.test.ts:718-769` asserts `token-mark-logo` on Activity rows from the held list's snapshot | covered: the snapshot-to-popup path needs no new e2e |
| Captures | `tests/e2e/fixtures/shots.ts` `shotSend(page, name, focus)` (light, then dark by `html[theme]`, gated on `NULO_E2E_SHOT_DIR`); token-icons-build-2's throwaway specs in the lane cache | reuse |
| Seed rows in a smoke run | held list (`fixtures/token-list.ts` `heldListStorage`) writes `nulo:e2e:token-seeds: []`, which seeds nothing; an absent key lets the list's two Testnet entries seed, and against the stand-in node (HTTP 400) they end `failed` about 75 s later (`tests/e2e/README.md`, the held and artifact runs) | adapt in the throwaway capture spec only; `rejected` needs a read that disagrees with the list, which the stand-in never answers |
| Smoke runner | `bun run test:e2e` (`vitest.e2e.config.ts`); each launch claims its egress-guard ports in `~/.agents/ports.md` (`fixtures/egress-guard.ts`) | reuse; `scripts/e2e/agent.sh` hard-wires `vitest.e2e.network.config.ts` (line 16) |

## Collisions

- `type-roles.test.ts`'s seeded-wallet test sweeps Home with its title-less import in flight, and that state's identifier site (`scripts/type-roles/identifier-sites.expected.json`, `TokenImportRow.vue` `title`) holds every visible `token-import-title` to `meta`; a named title is `row-title`, so a second row seeded before that sweep fails it (Codex). Its ellipsis is a drawn cut at both widths, so the layout and narrow gates see no new cut.
- A failed import leaves Home 30 s after `terminalAt` (`FAILED_RETENTION_MS`, 5 s tick), so a failed row seeded beside a sweep can vanish between the narrow gate's record and compare passes.
- #1799 (open): the reaper's sentence on an import caught by a worker restart. The captures seed terminal records with the worker alive, so they never show it; the reason line stays out of scope.
- #625 (closed known limit) carries token-icons-build-2's measurement of this title; its send and receive rows are untouched.
