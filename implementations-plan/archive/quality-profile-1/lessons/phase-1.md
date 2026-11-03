# quality-profile-1: arc 1 (phases 1-3) log

## Phase 1: the wipe pin

- The table-driven pin passed at the base; with `exportMnemonic`'s `opened?.wipe()` removed it failed on that row (`expected [false,false,false]`), so it observes the wipe, not the refusal.

## Phase 2: the codec move

- Four blocks moved; a normalised comparison (visibility, `export`, the one `{@link}` target) found every block byte-identical in the codec.
- Commitlint's `subject-case` is `lower-case`: an identifier in a subject or PR title goes in backticks (D13).
- `test:all` caught what the profile directory's tests could not: `scripts/e2e/profile-chaos-model.test.ts` checks that each line the chaos model cites by number still holds its fragment. The move shifted 29 `service.ts` citations and moved two into the codec. Re-cited by a line diff from the base file (not by searching the fragment, which repeats), every fragment unchanged.

## Phase 3: one pairing predicate

- `entropyDerivesMaster` needed `Uint8Array<ArrayBuffer>` parameters: `getMnemonic` and `array_equals` take that, and the restore's decoded buffers are that type.

## Reviews at the arc boundary

- Codex r1 (gpt-6.1-sol, high): no material findings; one comment trimmed.
- Opus (general-purpose): no material findings. Deferred to arc 2, which edits the codec: the `assertEntropyMasterPair` doc's "Zeroizes its own scratch" now restates `entropyDerivesMaster`'s; the `unlocksWith` doc's "A key that is still has to open the slots" (garbled at the base) reads "A key that is for it still has to open the slots". Not acted on: the two commits before the re-cite fail the citation test (squash merge; no history rewrite); the restore's inputs are not wiped if the derivation throws (unchanged from the base; needs a failing WebCrypto).

## The merge and the arc gate

- `origin/dev` moved four commits during the arc; the merge conflicted only in `index.md` (both lines kept). The chaos model merged cleanly: dev's edits cite the account service, this arc's cite the profile service. The gate reran on the merged head: `audit:vue`, `test:all`, the smoke set on Chrome (22/22, 159 s) and Firefox (22/22, 227 s).
- Measure `audit:dup` from `git archive` exports of both commits, not the working tree against an export: the tree holds untracked files an export does not, so the file counts differ. Run the report with the export as the working directory and `TMPDIR` set; it reads `apps`, `packages` and `scripts` relative to the working directory.
- `audit:dup` against the merged dev commit: production unchanged (177 / 8,775), as expected for a move; `profile/service.ts` internal unchanged (4 / 46), since arc 2 removes those. One new test↔test clone (15 lines): the pin's spy setup copies the buffer test above it. That copy stays: sharing it would edit an existing pin, which the arc keeps unedited.
