# chaos-4 phase 1: arc 1

## 1.1 The model

- The purity check's first regex, `[^;]*?from`, ran across statements in a file with no semicolons and swallowed a side-effect import into the next `from`; `[^;"]*?` keeps the clause inside its own statement. Its planted-import case caught it.
- The plan digest (seeds 1, 1001, 3001, 7001-7030, 7101-7105, 7201-7205; Chrome, Firefox and network caps; both starts) is identical at `2914b9699` and with `Caps.actions` absent.

## 1.2 The harness

- Seeds 8001-8012 ran green in process on the first pass, 2.7-7.8 s each at a host load near 113. The time is the drivers' password derivations: a `createPassword` costs about 0.8 s with its first sighting (seal, `exportPlain`, `exportMnemonic`), a `verifyAll` about 0.7 s per password profile; readings cost about 3 ms a step. A raw PBKDF2 at 600,000 iterations takes 70 ms on this host, about 240 ms inside a loaded run; the jsdom environment is not the cause (the node environment measured the same).
- Budget (D10): the break fixtures run on a passkey profile (no password derivation, about 0.1 s each) and the strict hand list on a passkey profile; the four hand lists then cover every action of the surface but `unlockPassword`, `secondWindow`, `changePassword` and `rename`. Seed 8001 covers the first three; `rename` joined the strict list. The fixed set is therefore {8001}: the fewest from 8001 upward that, with the hand lists, drive all 22.
- The stray-row fixture first copied a passkey row, which also carries its `prfSalt`, so O7 answered too; shaped as a retired row it isolates O2.
- Biome reads a helper named `after(...)` as a test hook (`noDuplicateTestHooks`); it is `faultAfter`.

## Review, round 1

Codex (reject, four false greens shown by planting each fault) and Opus (seven findings) overlapped; every finding was checked against the tree and accepted. Each fix has a fixture red on the harness before it and green after (nine; the O6 clause fixtures are coverage).

- O7 read only warn and error lines: the logger keeps info for every user, so every line is now kept and O4 alone filters to warn and above. `console.*` reaches the logger in every context, so the run routes it there as the worker's hook does.
- O6 read the session secret only at `verifyAll`, which locks first: a session secret changed under an open session went unseen. Each step that ends open now reads it against its first sighting, and the first sighting checks it is the master.
- A typed wrong password was no needle; each is now one, as is a phrase as a JSON array of words.
- O1 read the session row once a step ended: a bearer written under strict mode and overwritten in the step passed. Every logged session-row write is judged with the strict mode the worker held when it wrote.
- A changed credential or type refuses with the words a stale-row refusal after the slots opened uses; a refusal now counts only while no slot of the row opened, and the stale-snapshot fixture runs over all four fields with the refusal pinned.
- A dropped worker's write between two steps was cleared unreported; strays now stay until a step's check reports them. The fixture plants the stray at the next step's start: a real late write cannot be timed into that window.

## Review, round 2

Codex (resumed): conditional approve, three findings, all accepted, each fixture red on the round-1 harness and green after.

- The open session's secret was read after the write and log checks, so what that reading wrote or logged went unjudged; every reading now runs before the first check.
- A write's strict mode was read when the write was issued, before its awaited pre-read; strict turned on in that window let a bearer land unjudged. It is read once the pre-read returns, just before the write lands.
- The edited-row comment said "no slot opened"; the counter sees complete slot sets.

## Review, the fresh pass over the net diff

Codex (fresh session over `2914b9699..HEAD`): reject, two demonstrated false greens and a comment, all accepted, each fixture red before its fix and green after.

- The passkey drivers took `getPasskeyUnlockParams` for its input only and answered as the bound credential, so parameters naming another credential, which `auth.vue` hands its prompt, passed. Every parameter read now checks the credential is the profile's own (O2).
- A first sighting trusted the words `exportMnemonic` returned apart from the master; the words must now derive the master `exportPlain` returned (O6).
- A comment above the model test's surfaces restated them; deleted.

The resumed round approved with no new finding; the loop converged.

## The merge of `origin/dev`

- Dev split the `pre-update` start into `pre-update-retired` and `pre-update-unlocks`; the identity case loops dev's `STARTS`, 900 plan pairs. `plan()` costs the same at dev and here (300 seeds × 3 caps × 3 starts, 2.1-2.6 s on both); the model file's extra time is the new tests (about 3.7 s at a host load near 150).
- At host loads of 150-250 dev's "the counter moves by one exactly at a mint" takes up to 4.8 s at dev alone, against vitest's 5 s default, and timed out once in a two-file run here; it passed in every full-suite run.
