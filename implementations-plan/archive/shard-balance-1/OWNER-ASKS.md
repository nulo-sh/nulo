# shard-balance-1: owner asks

None blocks A1, and none concerns a surface a person sees. The PR itself is the owner's review: it is
a draft with `Refs #972` and merges only on the owner's word. The two items below are CI cost choices
the measurement surfaced. A1 ships without them and changes no shard count or dedicated job.

## OA-1: one network runner fewer at today's wall-clock

- **What the numbers say.** One matrix serves both browsers (`_extension-network-e2e-lane.yml:50-55`).
  At four balanced shards, Chrome ends near today's five-shard envelope (4001 s of file time / 4 +
  ~110 s fixed ≈ 1110 s, against 1090 s now). Firefox ends later than today (4568 / 4 + ~110 ≈
  1250 s, against 1143 s). It saves one runner per lane run on each browser.
- **Options.** (a) Keep five shards and take the time gain (what A1 ships). (b) Go to four: fewer
  runner minutes, Chrome at about today's wall-clock, Firefox about 100 s slower than today. That is
  a matrix edit in `_extension-network-e2e-lane.yml` plus its pin.
- **Recommendation.** (a). (b) only if runner minutes matter more than Firefox wall-clock.

## OA-2: the heavy-long job back into the pool

- **What the numbers say.** `snack-placement` + `failed-send-check` got their own job because the
  SHA-1 split once put both on one shard. A balanced pool would weigh them like any file. The pool
  would grow by about 13 min of file time on Firefox, and the lane would drop a runner. The network
  floor would then be the pool alone.
- **Options.** (a) Keep the dedicated job (what A1 ships). (b) Fold it back in, in a follow-up that
  re-measures.
- **Recommendation.** (a) now; (b) only with its own measurement, since the job also keeps two long
  files off a shard whose 30-minute limit they once reached.

What ships now: A1 as planned, five network shards, every dedicated job unchanged.
