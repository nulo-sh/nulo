# Phase 1: the service, the stores, the guard, the re-cut (the three maps)

OA-1 and OA-2 were still open when the arc started, so P1 first built the three maps and no pointer. The first proof below is that maps-only re-cut (three added ids). After OA-1 A the pointer's part re-ran steps 3 to 5: the last section is the proof of the tree as it ships, six added ids.

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

## § The gate change, steps 3 to 5 again, for the pointer's ids (OA-1 A, merge base `0514e413`)

The branch's merge base with `dev` is now `a2f9e7d0`. Its `snapshot.json`, `goldens.json` and `pins.ts` are byte-identical to `0514e413`'s, and `dev` changed nothing under `src/wallet/storage` between them, so the comparison is the same against either base.

After OA-1 A, the pointer's three goldens (`uiSelectedAccount.full` and `.minimal` plaintext, `.sealed` authored plaintext and sealed by the generator) were added by hand, `PINNED_STAMPS` emptied, `bun run baseline:storage -- --freeze` run (pin: stamp `66c69343…6ee9`, goldens `0d2ec784…3012`) and the pin pasted. The same proof with the pointer named (the script is the first proof's, plus `added_shape_names`):

```text
== merge base: 0514e4137a46f4202bcd0b5a6416f4a96c07dc8f (snapshot too large for --argjson's argv: --slurpfile, read as $x[0])
== 1. version, zod and every shape record but the four named are equal; the three maps differ only in encoding, sealed, legacy; the one new shape is uiSelectedAccount
{
  "stamps_old": 5,
  "stamps_new": 1,
  "version_equal": true,
  "zod_equal": true,
  "other_shapes_equal": true,
  "added_shape_names": [
    "uiSelectedAccount"
  ],
  "removed_shape_names": [],
  "maps_differ_only_in_encoding_sealed_legacy": true,
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
  },
  "selected_account": {
    "ref": {
      "kind": "root",
      "root": "nulo:ui:selectedAccount"
    },
    "encoding": "json",
    "read": "codec",
    "sealed": true,
    "legacy": null
  }
}
== 2. every old golden id keeps its decoded value
{
  "all_old_ids_decode_as_before": true,
  "old_ids": 122,
  "new_ids": 128,
  "added_expected": [
    "uiFeePicks.sealed",
    "uiPinnedTokens.sealed",
    "uiSelectedAccount.full",
    "uiSelectedAccount.minimal",
    "uiSelectedAccount.sealed",
    "uiSendFeePicks.sealed"
  ]
}
== 3. added golden ids exactly the six; none removed; every old golden record equal with stamp dropped; every stamp 0
{
  "added": [
    "uiFeePicks.sealed",
    "uiPinnedTokens.sealed",
    "uiSelectedAccount.full",
    "uiSelectedAccount.minimal",
    "uiSelectedAccount.sealed",
    "uiSendFeePicks.sealed"
  ],
  "removed": [],
  "old_records_equal": true,
  "every_stamp_zero": true
}
== 4. PINNED_BACKUPS and backups/ unchanged against the merge base
0
0
```

Step 6: `bun run baseline:storage` prints "stored shapes unchanged"; `src/wallet/storage` passes (10 files, 120 tests) with no rule edited.
