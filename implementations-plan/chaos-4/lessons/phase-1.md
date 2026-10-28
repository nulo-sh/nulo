# chaos-4 phase 1: arc 1

## 1.1 The model

- The purity check's first regex, `[^;]*?from`, ran across statements in a file with no semicolons and swallowed a side-effect import into the next `from`; `[^;"]*?` keeps the clause inside its own statement. Its planted-import case caught it.
- The plan digest (seeds 1, 1001, 3001, 7001-7030, 7101-7105, 7201-7205; Chrome, Firefox and network caps; both starts) is identical at `2914b9699` and with `Caps.actions` absent.

## 1.2 The harness

- Seeds 8001-8012 ran green in process on the first pass, 2.7-7.8 s each at a host load near 113. The time is the drivers' password derivations: a `createPassword` costs about 0.8 s with its first sighting (seal, `exportPlain`, `exportMnemonic`), a `verifyAll` about 0.7 s per password profile; readings cost about 3 ms a step. A raw PBKDF2 at 600,000 iterations takes 70 ms on this host, about 240 ms inside a loaded run; the jsdom environment is not the cause (the node environment measured the same).
- Budget (D10): the break fixtures run on a passkey profile (no password derivation, about 0.1 s each) and the strict hand list on a passkey profile; the four hand lists then cover every action of the surface but `unlockPassword`, `secondWindow`, `changePassword` and `rename`. Seed 8001 covers the first three; `rename` joined the strict list. The fixed set is therefore {8001}: the fewest from 8001 upward that, with the hand lists, drive all 22.
- The stray-row fixture first copied a passkey row, which also carries its `prfSalt`, so O7 answered too; shaped as a retired row it isolates O2.
- Biome reads a helper named `after(...)` as a test hook (`noDuplicateTestHooks`); it is `faultAfter`.
