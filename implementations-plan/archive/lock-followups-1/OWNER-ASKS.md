# Owner asks: lock-followups-1

None. Neither arc changes what a screen shows.

- Arc 1 (#1281) changes which profile a lock screen ends on only in one ordering, to the profile every other window already shows. The issue's other ordering is a closed known limit (#1315): today's behaviour stays.
- Arc 2 (#1282) moves keyboard focus to Close after Disable auto-close and refuses a held Enter there. Focus and repeat keys are an accessibility call the panel makes under the owner's 2026-10-19 delegation (plan D3); the PR body states it.

What ships now: both arcs, as planned.
