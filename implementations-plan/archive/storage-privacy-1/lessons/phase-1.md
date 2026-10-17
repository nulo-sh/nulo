# Phase 1 and 2 — implementation log

## Phase 1: note rows keyed by the unique note hash (`5b47bcd2`)

- **Fixture defaults.** The scenario suite's `noteRecord()` defaulted `txHash` to `"0xtx"` and `note()` to `"0xtx1"`. Once a move compares `txHash` (D8), two scenarios saw every seeded row as moved. One default (`"0xtx1"`) fixed both; no assertion changed.
- **The never-happens check runs after every scan, not at the end.** Red proof: `buildRecord` spreading the wire note's nullifier into the row. With the check only after the restart, the test stayed green: settling rewrites the row from its decoded copy, and the codec drops unknown keys, so the field was gone by the end. Checked after scan 1, it fails there (`service.composition.test.ts`, the first `expectNoNullifier`) with the success controls green. A second variant, keying the row by the nullifier, fails the id control first.
- **D8 red proof.** Without `txHash: note.txHash` in `moveNoteRow`, the re-mine row "a new transaction hash" fails; restored, green.
- **Rejected reads.** Both a rejecting unspent read and a rejecting spent-or-unspent read leave the row in place over two verified scans; the block's first test is the control (the same row with an empty read is deleted on the second scan).
- **`getNotesRaw` unit test.** `@aztec-labs/stdlib/hash` is mocked with `importOriginal` and the two helpers replaced by fakes that name their inputs, since Barretenberg does not load under vitest.
- **e2e seeds.** `ReceiptSeed` takes `uniqueNoteHash` (the plan said `noteHash`; the record already has a `noteHash` field, the inner hash, so the seed names the key for what it is).
- Gates: lint, `typecheck:all`, the scoped unit run (470), `bun run test` (13403), `test:all`: exit 0. The smoke and network e2e ran on the build carrying both phases (below): host load stayed above the e2e ceiling between the phases.

## Phase 2: local storage for trusted contexts (`d265abf6`)

- `restrictToTrustedContexts` takes `Partial<Pick<chrome.storage.StorageArea, "setAccessLevel">>`: `chrome-types` declares `AccessLevel` as a string union, so the browser's own area type fits without a cast.
- A synchronous throw from the method lands in the same catch; its `console.warn` runs before the worker's console hijack exists, and the sniffer buffers it until the hijack does.
- Tests: present, absent (no warning), rejected and thrown (one warning each), and a source pin on `src/wallet/index.ts`.
- Gates: lint, `typecheck:all`, `bun run test` (13408): exit 0.

## Codex fix loop

- Round 1 (fresh session, gpt-6.1-sol, high, read-only, over `3e365e83..d265abf6`): `approve — required changes: none`. It checked the hash against the pinned PXE's own computation, the id matching and the D8 rewrite's fence, the invariant's sinks (records, arrivals, outbox, logs, popup events), the tests' failure modes, the start-up call on both browsers, and the committed text. Static review: it ran no test.
- Opus diff review (general-purpose, alongside round 1): `approve`. It ran 23 files (746 tests) green, traced the leaf against the PXE, the id matching, the D8 rewrite's fence and emit, the invariant's sinks, the access-level call against the built content script and the e2e fixtures, and red-checked the new tests by reading. One nit, taken: a scenario comment still said "the SAME nullifier".
- Round 2 (resumed, verifying `280b29c4` and the e2e results): `approve — required changes: none`.
- Round 3 (resumed): the post-implementation standard requires two rules verbatim in every review prompt, first and resumed; rounds 1 and 2 lacked them, so round 3 carried them over the whole diff. `approve — required changes: none`, with five low-severity comment nits, each checked against the tree and taken (`108cddf1`).

## e2e

All at retry 0, on the build carrying both phases.
- Smoke `rows.test.ts`: Chrome 9/9 (80 s; started at load 154.7, over the 150 ceiling, after the wait loop had released at under 150); Firefox 9/9 (136 s). After merging `dev` (`848c5327`): Chrome 9/9 (67 s).
- Network through `e2e:agent`: `incoming-transfers` 3/3 (206 s). `incoming-arrival` and `account-switch-isolation` carry `@requires-proverless`; the runner's guard refused them without `NULO_E2E_PROVERLESS=1` (the plan's command lacked it), and with it they ran 7/7 (584 s) and 2/2 (329 s).
- Real PXE notes reach rows only through the worker's hash, so the network runs prove D2 end to end.
- After the merge of `dev`: lint, `typecheck:all`, `bun run test` (13445) and `test:all`: exit 0.
