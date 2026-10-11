# Owner asks: ci-followups

One question. It does not block the arc: the arc ships option A, which is today's behaviour with the stale copy removed. Nothing in this lane changes a screen, makes a gate advisory, removes a required check or adds a bypass.

## OA-1: how removing `baseline:move-approved` revokes an approval (#250)

**Surface.** Your own review flow on a pull request that moves an accepted complexity function. No wallet screen changes.

**Today.** The ratchet in `quality-status` reads the label from the event that started the run. A re-run sees the label as it was at the last push, open or reopen. Applying the label and re-running may not show it; removing it may not revoke it until the next push.

**After this arc.** The unit-tests job reads the label live, directly before the ratchet, on every run and re-run of that job.

**Options.**
- **A (ships now).** Applying or removing the label takes effect when the unit-tests job next runs: re-run the failed job after applying it; re-run the job after removing it to revoke a green result. A run that already passed stays green until then. A label removed during a run, after the read, still counts for that run.
- **B.** Add `labeled` and `unlabeled` to `pr-quick.yml`'s triggers. Every label change on every pull request (including the e2e labels) then starts a full quality run, roughly 15 minutes of CI each time; the workflow's own comment rejects this today for that cost.
- **C.** A small workflow on `labeled`/`unlabeled`, filtered to this one label, that re-runs the latest quality run's unit-tests job. It needs `actions: write` and one more workflow to pin.

**What each looks like to you.** A: one manual re-run after you remove the label. B: automatic, at the cost of a full run per label event. C: automatic for this label only, with a new privileged workflow.

**Recommendation.** A. The label is yours and so is the merge; a manual re-run is the cheapest revocation that is correct, and B and C add cost or privilege for a rare event.
