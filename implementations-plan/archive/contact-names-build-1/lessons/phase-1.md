# Phase 1: build

- `scripts/type-roles/identifier-sites.expected.json` keys each identifier site by its template branch: an identifier moved to another branch of its template gets a new key and fails `inventory.test.ts` until its entry moves with it.
- A component test that mounts the real `Input` and `Text` from `@nulo/design` drops their keys from the file's stub map; `stubs: { Input: false }` beside `components: { Input }` rendered nothing ("missing template or render function").
- Frames: the first capture of New contact differed from the signed frame by 3 px, `Text`'s `lh--150` against the inherited `normal`; the frame's markup removed it.
- Diff review, Codex `gpt-6.1-sol`, session `01a20e33`: round 1 changes required (one material, reproduced: an import row matched by name writes the saved spelling, which the rule must judge); round 2 approve.
- Address-book delta and wording, Codex `gpt-6.1-sol`, session `01a20e33`, round 3: two wording points accepted (a transition word inside a quoted pick becomes a marked elision); the code approved.
