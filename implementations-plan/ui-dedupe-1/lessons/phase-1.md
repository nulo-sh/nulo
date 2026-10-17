# Phase 1 (arc A1): lessons

## A1.1 (#518)

- The capturing-logger test first failed on the service constructor's own "Service created" line; the events list is cleared after construction.
- commitlint's `subject-case` refused a camelCase identifier in the subject; it goes in backticks.

## A1.2 (#541)

- The export page was JavaScript; the composable is TypeScript. `appStore.profile` is `ProfileInfo | undefined`, and the page read it unguarded. One cast accessor keeps today's throw on a missing profile; optional chaining would have turned it into a silent `false` for `isPasskeyProfile` (D107).
- The first supersede table passed vacuously for `assertRunFence`: `assembleFullBackup` hashes through WebCrypto, which settles outside the microtask queue, so `flushPromises()` returned before the run reached the hold and the discard fell into the assembler's own abort. Each hold now signals when the run parks there and the test waits on that condition (`vi.waitFor`), with no timeout raised.
- Mutation check on the table: dropping openRun's fence check, the post-`assertRunFence` check, the seal check, or the `finally`'s latch guard each turns rows red (1, 2, 1 and 24 rows).
- The source pin counts 12 awaits, not the 11 first estimated: `openRun` also awaits the passkey acquisition.

## Review round 1 (2026-10-17)

- Codex (gpt-6.1-sol, high): `findings`. F1, the hop row (a reset inside the first client constructor) ran after `runBackup` resumed, so adding the missing check left it green: accepted, the row now discards in the hop itself and goes red when the check is added. F2, a comment at the kept gap: accepted. F3, comment trims: accepted for the script, rejected for the template (byte-identical rule).
- Opus (general-purpose): `findings`, and no behaviour difference against the base page (it compiled the SFC to check the destructured-ref bindings). F1, the successor row did not pin the `activeRun === run` guard: accepted, mutation-verified. F2, the CLAUDE.md line wrongly said the import side's scrub disconnects: accepted. F3, the hop row lost its passkey case: rejected (one shared line; the passkey key-export rows pin the dropped keys). F4, `?.client` would move an impossible failure into the wrong-password path: accepted as `!`. Four comment nits accepted.
- A source pin that counts a keyword must strip comments: a new comment saying "await" broke it.

## Review round 2 (2026-10-17)

- Codex resumed: `clean`. It verified the accepted fixes, found no regression, and confirmed the template and styles are byte-identical to base. The loop converged after two rounds.
