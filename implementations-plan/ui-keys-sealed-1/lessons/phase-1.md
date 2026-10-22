# Phase 1: the service, the stores, the guard, the re-cut (the three maps)

OA-1 and OA-2 were still open when the arc started, so P1 built the three maps and no pointer: no `uiSelectedAccount` shape, root, claim or purge. The re-cut below folds stamps 1-4 with the three map `.sealed` goldens; the pointer's part re-runs steps 3-5 on this branch once OA-1 is answered (A or B: three more ids; C: none).

## Attempts

- `jq --argjson old "$(git show <merge>:snapshot.json)"` fails with "argument list too long": the base snapshot is 17 000 lines. The proof reads both files with `--slurpfile` and indexes `$x[0]`, the same comparison (the concern behind Opus r2 U4 was `--slurpfile`'s array wrapping, which the index removes).
- `fpc/service-create.test.ts` ("a network reset that completes during a registration leaves NO row") failed twice in the full suite at load 280 and passed alone and in the full suite at load 75: it expects a WebCrypto-backed sweep to settle within one `setTimeout(0)`. Unrelated to this arc's code (no FPC path changed).
- The log viewer's source filter (`useLogFilters.ts`) gains `ui-preference` and `ui-preference-client`: `useLogFilters.scan.test.ts` requires a row for every registered service and its client. A row in a developer filter list, named in the PR's UI impact.

## § The gate change, step 5 (merge base `0514e413`)

```text
== merge base: 0514e4137a46f4202bcd0b5a6416f4a96c07dc8f (snapshot too large for --argjson's argv: --slurpfile, read as $x[0])
== 1. version, zod and every shape record but the four named are equal; the three maps differ only in encoding, sealed, legacy
{
  "stamps_old": 5,
  "stamps_new": 1,
  "version_equal": true,
  "zod_equal": true,
  "other_shapes_equal": true,
  "same_shape_names": true,
  "maps_differ_only_in_encoding_sealed_legacy": true,
  "maps_before": {
    "uiPinnedTokens": {
      "encoding": "structured",
      "sealed": null,
      "legacy": null,
      "read": "described"
    },
    "uiFeePicks": {
      "encoding": "structured",
      "sealed": null,
      "legacy": null,
      "read": "described"
    },
    "uiSendFeePicks": {
      "encoding": "structured",
      "sealed": null,
      "legacy": null,
      "read": "described"
    }
  },
  "maps_after": {
    "uiPinnedTokens": {
      "encoding": "json",
      "sealed": true,
      "legacy": "structured",
      "read": "described"
    },
    "uiFeePicks": {
      "encoding": "json",
      "sealed": true,
      "legacy": "structured",
      "read": "described"
    },
    "uiSendFeePicks": {
      "encoding": "json",
      "sealed": true,
      "legacy": "structured",
      "read": "described"
    }
  }
}
== 2. every old golden id keeps its decoded value
true
{
  "expected_old": 122,
  "expected_new": 125,
  "added_expected": [
    "uiFeePicks.sealed",
    "uiPinnedTokens.sealed",
    "uiSendFeePicks.sealed"
  ]
}
== 3. added golden ids, and each old golden record equal to its base with stamp dropped
{
  "added": [
    "uiFeePicks.sealed",
    "uiPinnedTokens.sealed",
    "uiSendFeePicks.sealed"
  ],
  "removed": [],
  "old_records_equal": true,
  "every_stamp_zero": true,
  "count_old": 122,
  "count_new": 125
}
== 4. PINNED_BACKUPS and backups/ unchanged against the merge base
backups/ diff lines: 0
PINNED_BACKUPS: no change
```

Step 6: `bun run baseline:storage` prints "stored shapes unchanged"; every test under `src/wallet/storage` passes with no rule edited.

The folded stamps' reasons (for the CLAUDE.md note):

- stamp 1 (journal, txs): "journal and txs rows are sealed per profile; a plaintext row still reads through the dual read and is sealed at its profile's next unlock"
- stamp 2 (authRegistry, authRegistryEnabled, incomingArrivals, incomingBalanceOutbox, incomingPublicCursors, incomingTransfers, incomingTrust, tokenBalances): "tokenBalances, authRegistry, authRegistryEnabled and the five incoming roots are read through the dual read: a stored plaintext row still reads at its key and is sealed at its profile's next unlock, so every stored row reads as it did"
- stamp 3 (uiGetStartedPrestoOpened): "a new per-profile Get started flag, prestoOpened; no stored row reads differently"
- stamp 4 (accounts, dappRegistrations, fpcs, importedAccountKeys, networks, tokenSeeded, tokens): "accounts, imported keys, tokens, the seeder marker, networks, fee payers and dApp registration counts are sealed per row: a plaintext row still reads through the dual read and is sealed at its profile's next unlock"
