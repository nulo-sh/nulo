# token-skeleton-1 recon

Base: `origin/dev` at b6208221. One Explore pass (sonnet) plus direct reads. No commit since 60fde7e7, the base of the owner's pictures, touches `apps/extension/src/popup/windows/execute/` or `packages/design/src/ui/Skeleton.vue`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Grey bar, aria-hidden, reduced-motion safe | `packages/design/src/ui/Skeleton.vue` (`width`/`height` in px, `aria-hidden="true"`, animation off under `prefers-reduced-motion` and `.noanimations`, pinned in `Skeleton.test.ts:47-49`); resolved bare by `apps/extension/scripts/design-resolver.ts:25` | reuse as is |
| A loading region's accessible state | the element that holds the bars carries `aria-busy="true"`: `TokenCard.vue:90-97` (pinned `TokenCard.test.ts:82`), `BalanceView.vue:265` | reuse the pattern |
| Label and value row | `.prop` (`OperationCard.vue:736-747`): `space-between`, 12 px top padding, `> :last-child` right-aligned with `min-width: 0; overflow-wrap: anywhere` | reuse as is |
| Label role, value role | "From account:" row (`OperationCard.vue:448-454`): `label-section`/`secondary` label, `name`/`primary` value with `.name_size` (12 px) | reuse as is |
| The picture's markup | `~/.cache/nulo-backlog/shots-p65/local-edits.diff` (scratch, not in the tree): s2 rows with bars 40, 84 and 20 px wide, 12 px high | adapt (drop the option switch) |
| Holding the read for pictures | the same diff's wait in `prefetchTokenMetadata` and `shots-p65/specs/zz-shots-p65-execute.test.ts` (scratch) | adapt, scratch only, never committed |
| Component test harness | `OperationCard.test.ts:8-23` (pass-through `Flex`/`Text` stubs, `AddressDisplay` stub), `OperationCard.long-strings.test.ts` (`mountCard`, `declarationsOf`, `WRAPS`) | reuse; add a `Skeleton` stub |

No new component: `Skeleton` and `.prop` cover the rows (searched `packages/design/src/ui`, `apps/extension/src/components`, `grep -ri "skeleton\|shimmer\|placeholder"` over `apps/extension/src`).

## Consumers of the card's token rows

- `tests/e2e/network/register-token.test.ts:61-72`: waits for `register-token-symbol` visible, asserts non-empty text, asserts `register-token-address` exists, then `approveExecute`.
- `tests/e2e/network/type-roles-windows.test.ts:251,535`: `register-token-symbol` is the ready selector of two requests; the window sweep checks every text's computed role.
- `scripts/type-roles/identifier-sites.expected.json`: `op.address`, branch `!(isSendTx(op)) && op.kind === 'register_token'`, ordinal 2, selector `register-token-address`, state "a registerToken request (network)".
- `OperationCard.test.ts:136-153` (error lines and address), `OperationCard.long-strings.test.ts:184-212` (the symbol's `.token_meta` wrap; the error block outside `.prop`), `index.test.ts:493-497` (the parent's flag).
- No smoke e2e drives a `registerToken` request; no test reads `register-token-name` or `register-token-decimals`; no story renders the card.

## Collisions with other lanes (open PRs on 2026-10-19)

- #878 (a11y-errors-1) bans `--red` text; this card's error line is `orange` and stays.
- #743 (onboarding-3) edits `scripts/type-roles/exceptions.ts` and `surfaces.expected.json`; this lane edits neither.
- #877 (ui-picks-1, Send's amount card) and #859's lane (connect windows): no shared file.
- Closed known limits searched (`token metadata`, `register token`): #552 and #794 concern the read and the import title, not this card's layout.
