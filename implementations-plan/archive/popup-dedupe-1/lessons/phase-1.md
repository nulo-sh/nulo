# Phase 1: Send's side rule (#1470)

- D3's check: a scratch harness (under `~/.cache/nulo-backlog/popup-dedupe-1/`, not committed) transcribed the base's inline rule (`send.vue:188-215`, `:625-629`; `SendTypesCard.vue:15`, `:22` at `4b250dfe4`) and compared it with the helper composition over the 16 flag sets plus `{}`, both starting sides, both opening sides, three preselects and both `keepSide` values: 1632 comparisons, 0 mismatches. The committed table matches the base harness's rows.
- The move went in its own commit (a pure rename), ahead of the helper's additions, so `git log --follow` keeps the file's history.
