# heavy-pool-1: the docs-only close and its review

- Phase 3b rewrote heavy-long's reason at its three sites; gate green (lint, lint:actions, test:ci-gating 651 pass, check:plans).
- Codex round 1 (`gpt-6.1-sol`, high, session `01a15f51-a8de-7360-9793-8776e9144763`): two low findings. The new prose stated a one-pair futility stop as a lasting prediction, and the index line was stale. Both fixed in e896c1773.
- Opus 5.5 diff review beside it: nothing medium or high. It ran `assignShards` on dev's record with the folded pool. The two files have no cost there, so a fold today would price them at the median: they land on separate shards but are not spread, and one shard carries about 500 s extra. The first wording ("spread over five shards") was true only after a regeneration; the observed-result wording drops it.
- Codex round 2 (resumed): clean.
