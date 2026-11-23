# Phase 1 — extract

- Recon (one Sonnet explorer): the smoke specs that reach `finalizeRestore` are `backup-imported-account`
  (the only one with imported keys, so the only one that consumes a rewrap context), `passkey-backup`,
  `import-paths` and `restore-outcome`. A phrase import goes through `importMnemonic`, not `restore`.
  Only the network `profile-chaos` reaches a lock between `restore` and `finalizeRestore`, through
  its `restoreHeld` action; a delete can meet a held restore only at `account-state`, after finalize.
- The chaos hand list was found by searching planner seeds for the shortest prefix that reaches
  `restoreHeld` with each competitor, then joined and checked with `planFromList` on both caps sets.
