# wallet-bugs-2: owner asks

The lane brief's records cover #648's wrap and #654's sizes: those ship with before and after pictures in the PR, which the owner signs there. One ask remains.

## OA-1 (#615): the token-list sentence in the remote-code note

**Surface.** `apps/extension/store/remote-code.md` § The token list, the statement the store reviewer notes and the Chrome remote-code justification summarise. Store copy is the owner's.

**Today** the section says what a signed list can do (name a bundled token contract to track at an address) and ends: "So a list can name which bundled token contract to track at which address; it cannot supply bytecode, a script, or a host to call." It omits that a list can also flag a token.

**What ships now** (the PR carries it; the owner may reword it before the merge):

- New sentence, before the conclusion: "A list can also flag a token by network and address, whoever added it, and the wallet then marks that token as a scam on its token rows, in the token picker, on its page and on Send (`packages/token-list/src/parse.ts:148-168`); as with every list, the wallet takes no list below the one it keeps or below the sequence compiled into the build (`apps/extension/src/wallet/services/token-list/service.ts:186-189`, `packages/token-list/src/index.ts:30-58`)."
- The conclusion gains one clause: "So a list can name which bundled token contract to track at which address, and which tokens to warn about; it cannot supply bytecode, a script, or a host to call."
- The six stale line cites in the section point at today's lines (no wording change).

**Options.**
- A (recommended, ships now): the two edits above. The note then lists every effect a fetched list has.
- B: the new sentence alone, the conclusion unchanged. Shorter; the conclusion then names one of the two effects.
- C: the owner's own wording for either edit.
