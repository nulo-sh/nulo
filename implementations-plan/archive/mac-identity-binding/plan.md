# MAC identity binding

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the row-identity binding in `packages/wallet-core/src/storage/entity_storage.ts` (the opt-in `requireKeyIdentityMatch` guard, enabled in `apps/extension/src/wallet/services/profile/repository.ts` and the other keyed repositories), and the post-unlock navigation fixes in `apps/extension/src/popup/auth-guard.ts` and `apps/extension/src/popup/route-guard.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

The envelope MAC binds the row's own storage id and the plaintext wallet fingerprint, and every verify site uses the id it was asked for, never one read from the row. Entity storage gets an opt-in guard that requires a row's embedded id to match its storage key, with a string mode and a numeric mode, enabled per storage root. The passkey flow checks its fingerprint at unlock and export, and takes a consistency snapshot at finalize (type, credential id, sealed key, generation, fingerprint) against what restore stashed. The previous MAC grammar was deleted outright.

The same arc fixed four navigation races after unlock, because a red smoke gate blocked it and the races were real bugs on any slow machine.

## Why

Binding the profile id into the MAC preimage is not enough on its own. An attacker who writes another profile's row verbatim, embedded id included, under this profile's storage key passes every check that reads the embedded value. The anchor has to sit outside what an attacker can swap together: the storage key itself, or an id the caller supplies.

A universal guard did not generalize: it broke tests across five roots, because some roots key rows by something other than an id and numeric ids coerce differently (`1` and `"1"` differ, and a very large number's string form aliases). So the guard is opt-in with an explicit mode, and the suite is the oracle for which roots can enable it.

## What shipped

- The MAC format change, the opt-in guard with strict semantics (missing and non-string ids are rejected; numeric mode accepts only positive safe integers), and the passkey checks above.
- Four fixes to unlock-time navigation: the router guard consults the authoritative active-profile read instead of a flag that lags the accepted unlock, a sequence token stops a stale lock event from ejecting a newer unlock, the export deep-link preselect is re-applied when account rows arrive, and the auth page navigates first and warms up afterwards, advancing only while still on the auth screen. The guard retries a rejected read across a short backoff for a respawning background and degrades to pass, since unknown is not locked.
- Tests for each, including swap and aliasing cases that assert the observable outcome.

## Lessons

### MAC scope

A MAC binds only what it names, and anything stored on the row travels with the row. Anchor identity on the storage key or a caller-supplied id, refuse on a MAC failure instead of self-healing, and write the test to assert the observable state with a setup that matches its name.

### Navigation race

Attribute a navigation race by wrapping the router's push and replace with stack capture in a throwaway probe, then match the recorded chunk file and byte offset to the built bundle. Guessing from symptoms produced wrong fixes; the capture produced four right ones. A CPU-restricted run reproduces it, because the race window is milliseconds on a fast machine and seconds on a starved runner.

### Boot route race

An async route-guard lookup on the cold-boot path fires before the ports are ready, rejects, and its optimistic degrade redirects before the profile load has chosen a destination, stranding the boot at the bare index route. So the early decision stays synchronous and flag-only, and only the later, awaited checks use the authoritative read.
