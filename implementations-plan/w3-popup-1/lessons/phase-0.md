# w3-popup-1, phase 0: planning consults

## Codex plan audit R1 (gpt-6.1-sol, high), 2026-11-02

Verdict: reject (blocking: #1405 needs owner sign-off; the token query judged two ways; SearchField's composition commit path).

- Verified: `matchesQuery` (`utils/token-search.ts:8-15`) trims and lowercases but keeps a joiner, so an edge-trimmed `addCandidate` would offer Add token for a holding the list already has. Account import caps a name at 40 (`wallet/services/account/service.ts:805`) and `changeAccountName` stores any length, so F7's 25 is a UI cap only. The Header is the `v-else` of the takeover and arrival views (`popup/app.vue:661-663`).
- Accepted: #1405 to the owner (it changes which pasted text Send accepts, and unicode-1's ratified rule kept joiners); arc split; inner bidi and zero-width characters are removed by the existing rule, so the plan's "every inner character refused" was wrong; the composition commit path; colocated page tests with searchable fixtures; the extra helper rows; D1's restructure stated exactly, with an empty-answer test.
- Disputed, to resume: surfacing #1406 and D2's late verdict as owner asks too.

## Opus plan audit R1 (Plan agent, opus), 2026-11-02

Verdict: conditional approve (TokenList's match and add offer must read one term; SearchField must emit raw text while composing).

- Accepted: the same token-term finding as Codex R1 (traced to `TokenList.test.ts:224-229`'s rule); emit raw while composing and rewrite nothing; a `SearchField.test.ts`; D1's wording ("after the try" cannot cover a catch that pushes and returns); F2 restated (a drop while connecting rejects nothing); I2's smoke claim dropped (the smoke paste has no edge characters); test rows outside the BMP, a combining mark at an edge, empty and edges-only; the side effects of OA-1's option A; U+1680.
- Rejected: its finding 6, that #1405 needs no owner call. Codex R1 is stronger: the change widens what Send accepts and lets an edge joiner through, which unicode-1's ratified rule keeps.

## Codex final pass (fresh session, gpt-6.1-sol, high), 2026-11-02

Verdict: conditional approve, arc 1 may proceed (U+1680 undisclosed in OA-1; #1499's pre-list window unbounded; F7 and D5 overstated; SearchField's test shape).

- Verified: `submitWaitsForShow` (`composables/usePopupEntity.ts:34-40`, `:56`) is documented for entry checks that read a populated list and set by New FPC, New token, Edit FPC and Edit contact; New sender lacks it. Adopted (F8); the button's pre-list window stays a known limit, as on the siblings.
- Upheld round 1's rejection: #1406 and D2 apply existing rules, so neither is an owner ask.
- Resumed with the fixes: approve; arc 1 may proceed, arc 2 waits on OA-1.
