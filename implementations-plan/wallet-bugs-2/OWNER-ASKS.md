# wallet-bugs-2: owner asks

The lane brief's records cover #648's wrap and #654's sizes: those ship with before and after pictures in the PR, which the owner signs there. One ask remains.

## OA-1 (#615): the token-list sentence in the remote-code note

**Surface.** `apps/extension/store/remote-code.md` § The token list, the statement the store reviewer notes and the Chrome remote-code justification summarise. Store copy is the owner's.

**Today** the section says what a signed list can do (name a bundled token contract to track at an address) and ends: "So a list can name which bundled token contract to track at which address; it cannot supply bytecode, a script, or a host to call." It omits that a list can also flag a token.

**What ships now** (the PR carries it; the owner may reword it before the merge):

- New sentence, before the conclusion: "A list can also flag a token by network and address, whoever added it, and the wallet then marks that token as a scam on its token rows, in the token picker, on its page and on Send (`packages/token-list/src/parse.ts:148-168`, `packages/token-list/src/index.ts:41`, `apps/extension/src/utils/token-flag.ts:1-17`, `apps/extension/tests/e2e/token-list.test.ts:144`); as with every list, the wallet takes no list below the one it keeps or below the sequence compiled into the build (`apps/extension/src/wallet/services/token-list/service.ts:186-189`, `packages/token-list/src/index.ts:30-58`)."
- The conclusion gains one clause: "So a list can name which bundled token contract to track at which address, and which tokens to warn about; it cannot supply bytecode, a script, or a host to call."
- The six stale line cites in the section point at today's lines (no wording change).

**Options.**
- A (recommended, ships now): the two edits above. The note then lists every effect a fetched list has.
- B: the new sentence alone, the conclusion unchanged. Shorter; the conclusion then names one of the two effects.
- C: the owner's own wording for either edit.

## OA-2 (#654, found while measuring): Home's ghost token rows

**Surface.** Home's token card while it waits blank: the three ghost rows (`TokensView.vue`, `tokens-skeleton-row`).

**Today** both of a ghost row's columns ask for `gap="5"`, which is no `Flex` gap token (the scale has 4 and 6), so each pair of bars touches. A ghost row is 16 px of padding plus a 25 px column (14 + 11 after this PR), about 41 px; a loaded token row is 53 px.

**What ships now.** Only D7's bar heights (9 → 11 px). The gap and the row's height are unchanged: either would change how the waiting card reads, outside the plan's UI-impact line.

**Options.**
- A (recommended): give the ghost row's right column the loaded box (gap 2, `min-height: 37px`) and its left column gap 2, so a ghost row stands as tall as the row that replaces it. A follow-up issue with before and after pictures.
- B: a valid gap only (4 or 6), the height unchanged.
- C: leave it.
