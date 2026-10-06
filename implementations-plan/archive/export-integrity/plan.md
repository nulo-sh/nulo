# Export integrity

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The full-backup export page cannot be re-entered or left stranded and seals its checksum over the exact bytes it ships (`apps/extension/src/popup/pages/settings/security/export/full.vue`, `assembleFullBackup` in `apps/extension/src/utils/full-backup-helpers.ts`), and file readers refuse oversized or decompression-bomb input (`apps/extension/src/utils/files.ts`).
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

One arc of the production-ready audit remediation (see [production-ready-audit-remediation](../production-ready-audit-remediation/plan.md)), taken at the middle tier. Extract the backup assembly into a pure function and put a latch, an error boundary and a run fence into the export page in place, rather than rewriting the page. Put byte caps at the real choke points of file reading.

## Why

The export page had no re-entry latch, no error boundary and a window in which the checksum could go stale, so a double Enter could produce a backup that the importer rejects as self-inconsistent, or leave the screen on a blank page. Backup and account file readers had no size cap, so a mis-picked huge file or a gzip bomb could crash the popup.

## What shipped

- **Assembly.** `assembleFullBackup` takes the envelope and duck-typed slice sources, rejects an envelope that already carries a checksum, serializes once, hashes those bytes, and derives both the compact and pretty outputs from that same serialization. It is unit-tested against fakes with no mounting.
- **The page.** A busy latch set synchronously, status flipped before the key-derivation awaits, a generation fence checked after every await, and per-run service clients that are always disconnected, one at a time so a bad disconnect cannot block the rest. A failed run resets the agreement for passkey profiles so they do not land on a blank screen. Encrypt and download follow the same latch discipline, and Enter only acts in the states where it should.
- **Teardown.** Unmount bumps the generation, disconnects the run's clients so an in-flight call unwinds at once, and scrubs the payload, ciphertext and password fields.
- **Export size gate.** A backup too large for the importer fails loudly at export, and the cap constant is shared between both sides and pinned equal. It is 64 MiB, since a fresh wallet's encrypted artifact already measured over 22 MiB and an earlier 16 MiB guess fired on legitimate backups.
- **Readers.** `decompressData` streams with a running byte total and cancels past the cap; `pickFile` takes a fourth `maxBytes` argument and rejects with `FileTooLargeError` explicitly, since a throw inside its change callback would leave the promise pending. The backup import flow surfaces it as "Backup File Too Large", account files carry a coarse 256 KiB gate, and the contacts picker passes its existing cap.
- **Out of scope.** The seed export page and import-side refactors.
