# dynamic-token-list-2: recon

Base: `origin/dev` at `116974dc`. Two Sonnet explorers (a reuse sweep over the format, signer, host and service; a map of the wallet's flag path and token surfaces), checked by the planner against the tree.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Parse a new top-level payload key | `record()` checks unknown keys only in `strict` (`packages/token-list/src/parse.ts:62-69`); `PAYLOAD_KEYS` (`:30`); `checkEntry`'s chainId and address rules (`:98-99`) | adapt: add `flagged` to `PAYLOAD_KEYS`, a `checkFlagged` that shares the chainId and address rules |
| Old wallets ignore `flagged` | `parse.test.ts:95` proves wallet mode ignores an unknown top-level key; the planner ran the base `readTokenList` over a signed payload carrying `flagged` and it verified and parsed (`lessons/phase-0.md`) | reuse-as-is; one test on the current parser lands first |
| Source and signing | `checkSource` takes `{tokens}` only (`parse.ts:146`); `signList` reads `{tokens}` and builds the payload (`sign.ts:56-66`); `tokensSha256` digests the tokens only (`sign.ts:30`) | adapt: source `{tokens, flagged}`, payload carries `flagged`, the digest covers both |
| Approver's summary | `tokenDiff`/`keyOf` diff by `chainId:address` (`infra/token-list/scripts/summary.ts:32-46`); `cell()` escapes; `publishedTokens` reads the served payload (wallet mode) | adapt: a flag diff through the same `keyOf` and `cell` |
| Tree invariants | `treeFindings` (`infra/token-list/scripts/check.ts:82-91`), `envelopeFindings` parses strictly; `keyFindings`/`formatFindings` check a compiled constant against tree data | adapt: a `floorFindings` beside them |
| Unverified payload readers | `publishedSequence` (`sign.ts:36`), `envelopeMeta` (`open-publish-pr.ts`), `publishedTokens` (`summary.ts`) | reuse; no fourth reader. `open-publish-pr.ts` imports node builtins only (`bun --no-install`, no install in `publish-pr`) |
| Publish commit | `runPublish` commits one file through `createCommitOnBranch` (`open-publish-pr.ts`); it never reads the served envelope | adapt: read the envelope at `baseSha`, add the floor file to the same commit when the list delists or flags |
| Compiled trust constant read at verify time | `readTokenList(text, keys = PINNED_KEYS)` (`packages/token-list/src/index.ts:34`); the service passes `source.keys` (`service.ts:141,182`) | adapt: a third parameter `floor = SEQUENCE_FLOOR` |
| Refusal paths in the service | a throw in `readTokenList` is `refused` on fetch (`service.ts:183-185`); on boot it discards the stored envelope and clears `nextAttemptAt`, so boot refetches (`service.ts:136-148`) | reuse-as-is |
| Snapshot | `TokenListSnapshot = {sequence, keyId, entries}` (`spec.ts:10`), built by `toSnapshot` (`service.ts:235`) | adapt: carry `flagged` |
| Seeding, "Nulo knows", prices | all read `snapshot.entries` only (`token/default-tokens.ts:31` `seedsFromList`, `price/price-map.ts:43` `pricedTokensOf`) | reuse-as-is: a flagged pair is never an entry (disjointness), so it is never seeded, named or priced |
| JSON data compiled into a package | `frozen-artifact.ts:17` imports a JSON artifact; `resolveJsonModule` is on in the extension tsconfigs | adapt: enable it in `packages/token-list/tsconfig.json` |
| Warning primitives (for OWNER-ASKS only) | `Banner` (`info|warning|error|done`, neutral surface, icon tint); `Badge` (`error` = `--red` fill, `--txt-inverse` text); in-row red captions (`TokenSeedRow` `.reason`, `TokenCard` `token-balance-failed`); `--txt-danger` (`#ff534b` dark, `#b3261e` light) | no change in this arc |

## Collisions and absences

- **Test sequences below the floor.** `service.composition.test.ts` signs sequences 5 to 99, `sign.test.ts` signs 1_760_000_000; a floor of 1792014908 refuses all of them through `readTokenList`'s default. The e2e fixtures sign at `Date.now()` (`tests/e2e/fixtures/token-list.ts:95-109`) and the artifact run's held list is the committed envelope, equal to the floor.
- **Signer closure.** `import-closure.test.ts:49` pins `sign-cli.ts`'s closure; a floor module imported only by `index.ts` and the host scripts leaves it unchanged.
- **Workflow pins.** `scripts/ci-cd/behavior-gating.test.ts` pins the sign command, `EXPECT_TOKENS` and the `tokens_sha256` output; `release-integrity.test.ts` pins the jobs. Keeping the digest's flag and output names leaves `publish-token-list.yml` untouched.
- **No popup channel exists for the list.** `TokenListService` is not an RPC service; prices reach the popup through `PriceSnapshot.pricedTokens` (`price/spec.ts:44`). The warning's channel belongs to the warning PR.
- **Absent: a release step for the token list.** `.claude/skills/release/SKILL.md` names none (searched `token-list`, `tokens.nulo.sh`, `floor`). `aztec-update` § 3 rewrites the source on a reset (`.claude/skills/aztec-update/SKILL.md:159`).
- Closed limits in the area: #385 (leaked key), #386 (freeze and fresh-install rollback; reopens when #383 lands), #387 (leaked-key rows; reopens when #383 can mark them). Open neighbours: #382 (live entry checks), #384 (published verifier). None collides.
