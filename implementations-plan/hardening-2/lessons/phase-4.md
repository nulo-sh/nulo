# Phase 4: tombstones keep their reservation and their identity (Arc 2)

## Implementation (2026-10-09)

- `TombstoneRepository` decodes through one private `decode(id, raw)`: valid only when the schema parses and `profileId` equals the key's id. `get`, `validPayloads` and `corruptIds` all use it, so a misfiled row is corrupt: reserved under its key's id (raw keys, unchanged), counted by `corruptIds()`, never hydrated, never resumed.
- `clearIfSame(id, epoch): Promise<boolean>` reads the raw key: absent resolves `true`; a valid row of `epoch` is removed and resolves `true`; anything else (corrupt, misfiled, another epoch) is kept and resolves `false`.
- `ProfileService.clearTombstoneAndRelease(id, epoch)` serves both phase-3 sites (live `deleteProfile`, boot resume) under the facade lock and releases only on `true`. A live deletion whose tombstone was corrupted during the purge still resolves for its caller (the purge did run); the id stays reserved until manual recovery, and the next boot's `corruptIds()` telemetry names it.
- The plan's line refs (`:1517-1520`, `:1587-1590`) had drifted by a few lines after the `dev` merge; the code was as described.

## Red on base

- Base copies of `tombstone-repository.ts` and `service.ts` from `e9a538a`: 7 new tests fail. Behavioural: the corrupted-during-purge row (`isReserved` false: base releases), the misfiled-boot row (`isReserved(named)` true: base hydrates the named profile), and the repository's misfiled row (base returns it as a valid payload). The four `clearIfSame` rows also fail there, because base resolves `undefined`; their behavioural halves (kept or removed) match base except for the corrupt case, where the base also kept the row but released the id. The clean-purge control passes on both.

## Gate (2026-10-09, `26d8c94`)

- `bun --bun vitest run src/wallet/services/profile/ src/wallet/services/profile-deletion/`: 14 files, 362 tests pass.
- `bun run lint` (exit 0; the one warning in `profile/` is pre-existing, `passkey-recovery-coordinator.ts`), `bun run typecheck:all`: pass.
