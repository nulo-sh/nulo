# Phase 1: build

- Red at the base, green after: `service.test.ts` "refuses a name that reads as an address on add and on update…", `recipient-search.test.ts` "a term written like an address matches no name or initials…", `RecipientField.test.ts` "an Enter on the first characters of an address picks nothing, though a name holds them".
- `scripts/type-roles/identifier-sites.expected.json` keys each identifier site by its template branch: moving the Recent row's short address out of a `v-else` changed its branch to `recents.length` and failed `inventory.test.ts` until the entry moved with it.
- A component test that mounts the real `Input` and `Text` from `@nulo/design` drops their keys from the file's stub map; `stubs: { Input: false }` beside `components: { Input }` rendered nothing ("missing template or render function").
- Frames: the first capture of New contact differed from the signed frame by 3 px, `Text`'s `lh--150` against the inherited `normal`; the frame's markup removed it.
- Diff review, Codex `gpt-6.1-sol`, session `01a20e33`: round 1 changes required (one material, reproduced: an import row matched by name writes the saved spelling, which the rule must judge); round 2 approve.
