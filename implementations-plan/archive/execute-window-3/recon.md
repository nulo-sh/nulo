# execute-window-3: recon

Read at `993b3efc` (`origin/dev`). One Explore agent (Sonnet) ran the reuse sweep; the driver read the issues, the decision records, the pictures and the code. Paths are under `apps/extension/src/popup/windows/execute/` unless stated.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Unreadable-arguments warning and reason | `ArgsNotice.vue` (props `title`, `body`, `prefix`, `kind`, `advice?`; testids `${prefix}-${kind}-warning`, `-reason`, `-advice`, `${prefix}-interface-term`; a fragment, the caller wraps it). Sites: `CallArguments.vue:112` (labels), `:149` (unverified, `advice`), `SendTxSummary.vue:84` (`execute-op-summary`, `advice` at `adviceAt`) | reuse as-is for #777, under a new prefix |
| The words | `call-surface.ts:239` `RAW_TITLE`, `:241` `RAW_LINE`, `:249` `RAW_ADVICE`, `:258` `RAW_NOTICE` (footer tooltip) | reuse as-is; no copy changes |
| The one advice site | `OperationCard.vue:228-250` `adviceSite` (`call` / `grant` / `authwit`), `adviceOn`; `SendTxSummary` `adviceAt` | adapt |
| A refused request, as the card sees it | none: no prop means refused. `index.vue:179` `refusal` (scope refusal, fills `#fee`); `index.vue:136` `grantRefusal` (footer only); `fee/index.vue:107` `grantRefusal`, no scope refusal | build new: one `refused` prop |
| An authorization row's reading at rest | `SendTxSummary.vue` `authwits` prop already carries `{ authwit, surface }`; `authwitRows` drops `surface` | adapt |
| Call-row layout to mirror | `SendTxSummary.vue:68-87`: marker, then `Flex direction="column" gap="4"` with `item_body` | reuse the shape |
| Test fixtures | `execute.fixture.ts` (`fixtureOp`, `AUTHWITS`, `feeEstimateWith`, `decodeFixture`, `GRANT`, `VAULT_RAW_FACTS`, 32-byte `0x` fields); `tests/helpers/shown-text.ts`; `index.test.ts:178` stubs `OperationCard` as `<div><slot name="fee" /></div>` with no props | reuse |
| Picture recipes | scratch specs outside the repo: `~/.cache/nulo-backlog/shots-776/specs/zz-shots-776.test.ts` (rewrites a playground send's calls; a grant on a random contract), `~/.cache/nulo-backlog/execute-window-2/specs/` (a delegated send; the #832 refusal) | reuse, never committed |

## Absence trail

- No "refused" input to `OperationCard`: grep `refus` and `OperationCard` over `src`.
- No e2e asserts the advice, `-unverified-*` or `execute-discovered-authwit-line`: grep under `tests/e2e`. `type-roles-windows.test.ts:470-503` sweeps the at-rest execute window with a discovered authorization (roles, not words) and shoots `execute-op-summary-authwits-section`.
- No new `.vue` file, so no `scripts/type-roles/surfaces.expected.json` row; `SendTxSummary.vue` and `ArgsNotice.vue` already have one.
- `DottedTerm.scan.test.ts` checks keys, not instances per screen; `type-role-ban` and `copy-dash-ban` are untouched by a `body`/`tertiary` line and existing constants.
- Neither `OperationCard.vue` nor `SendTxSummary.vue` is in the complexity baseline manifest.

## Tests that assert the advice today

- `OperationCard.summary.test.ts:129-176`: once, inside call 2's row, details open or not. `:179-214`: the fallback to the last open unreadable authorization.
- `OperationCard.authwit.test.ts:104-121` and `:128-142`: under the second unreadable grant; per reason.
- `OperationCard.createAuthwit.test.ts:187-195`: under the intent's one call.

## Collisions

- Testid prefix `execute-discovered-authwit-*` is the details' `CallArguments` prefix (`OperationCard.vue:371`): the at-rest notice takes `execute-op-summary-authwit` so no testid repeats.
- Running lanes tx-record-1 and ui-dedupe-2 do not list the execute window's call list; merge `origin/dev` if one lands first.
- Open issues in the area: #776, #777 only (`gh issue list --search`); no closed `known-limit` matches.
