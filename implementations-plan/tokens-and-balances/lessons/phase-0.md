# Phase 0 — planning consults

Every consult of the planning run, including failed ones. Transcripts stay local (`audit-*.md`, gitignored);
verdicts and findings live in `plan.md` § Audit verdicts.

- 2026-10-10 — recon: two Explore agents (sonnet). One batched reuse sweep over seven capabilities; one map of
  the token service's write paths (#94, #105) and of the #98 overlap. Both completed; findings in `recon.md`.
- 2026-10-10 — audit round 1, Codex (gpt-6.1-sol, high, read-only, default login): `reject`. Ten findings; the
  three #94 blockers (unfenced compare-and-delete, an existing-row exit without the fence, a nested re-entry that
  journals after its ticket ends) share one cause: a released add kept acting on its own authority. Fixed by an
  attempt loop that does nothing by id without an owned ticket. The #93 incarnation finding was rejected with
  reason (D1). Dispositions in `plan.md` § Audit verdicts.
- 2026-10-10 — audit round 1, Opus 5.5 (Plan agent): `conditional approve`. Same two #94 holes from another
  angle (a same-contract restore under a reused profile id; the `findToken` hit at `:373`, a gap base already
  has). Its move-the-fetch-out-of-the-lock proposal was rejected (parallel same-contract fetches, the ordering
  pin rewritten).
- Lesson: a "compensate only your own row" rule needs the same ticket the write had. Identity checks made after
  the lock was lost race the purge and the next write, however exact the identity.
- 2026-10-10 — final pass round 1, Codex (gpt-6.1-sol, high, fresh session, default login; read-only asked, the
  host's sandbox file runs it as approve-for-me, and the tree was unchanged after): `reject`. Nine findings, all
  accepted (two in part). The deepest: an "owned" step that awaits anything before it mutates is no longer owned
  (R1), and a released holder's in-flight write must land before a successor reads (R2), which retires the
  dispatch-order inference.
- Lesson: "check ownership" means a synchronous check after the last await, never a phase label; and a liveness
  check that reads after it tests a flag must test the flag again after the read.
- 2026-10-10 — final pass round 2, Codex (same session, resumed): `reject`. Eight findings, all accepted: a hit path
  that emitted where base journals only, a success exit without the fence, a single-snapshot drain, a drain that
  outlived its ticket, untracked restore writes, no counter baseline for `isChainLive`, an extra liveness read
  that a base test counts, and an undisclosed success-to-error change.
- Lesson: when a redesign keeps "every existing test green unchanged", read the tests that count calls or writes
  before adding an await; they pin more than the outcome.
- 2026-10-10 — final pass round 3, Codex (same session, resumed): `reject`. Accepted the displaced restore and
  deletion fence (R5) and the wording fixes; rejected for this plan the chain sweep's id-reuse race (pre-existing,
  needs no watchdog release, outside the lane's issues), routed to an issue.
- 2026-10-10 — final pass round 4, Codex (same session, resumed): `reject` on the purge exemption (a deletion
  authorized before the lock can free an id a displaced purge still holds); accepted, with two disclosures. The
  reviewer accepted the sweep race's routing.
- Lesson: an exemption that argues "nothing else can free this id" must check every caller that authorizes
  before it takes the lock.
- 2026-10-10 — final pass round 5, Codex (same session, resumed): `conditional approve`, two wording conditions,
  applied without a further round. Five final-pass rounds in all; every round after the first found a real
  defect in the previous round's fix, and each fix was smaller than the last.
