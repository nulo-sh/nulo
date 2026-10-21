# block-time-1 owner asks

None at planning time. The lane changes no surface a person sees; arc 2, if it runs, changes only the e2e sandbox's env and harness.

Standing rule for this lane: if phase 1 or 3 shows that a **production** wallet interval (the 1 s receipt worker, the 1 s balance tick, the 30 s incoming scanner) dominates a lane's longest CI job, that change is a behaviour a person notices (how soon a receipt or an incoming transfer shows, how often the wallet calls the node). It is written here as an ask, with the surface, the options, what each would look like and a recommendation, and arc 2 ships without it. **What ships now:** the production intervals stay as they are.

## OA-1 · The incoming scanner's 30 s tick sets the network lane's longest job

**Surface:** how soon an incoming transfer shows (the incoming scanner) and when a mined row reads Finalized (the finality re-read), in production builds.

**Why it is asked:** the standing rule above fired. On CI, `incoming-arrival` is 345 s of the critical network shard's 952 s of file time (Chrome; 320 of 1119 s on Firefox), the lane's largest file; locally 173 s of it on Chrome is waiting for the scanner's next tick (119 s over five polls for the record, 54 s for the received notice); the 60 s finality re-read adds about 3.5 min across `snack-placement` and `failed-send-check`.

**Options:** keep the intervals and balance shards (#972); an e2e-only build constant (faster suites, less fidelity, a flag a release must keep off); a refresh a person can also trigger (a product change); shorter production intervals (visible, more node calls). Tracked in #992.

**Recommendation:** keep the intervals; balance the shards first.

**What ships now:** the production intervals stay as they are; no arc depends on the answer.
