# service-structure-1: arc 1, phase 1 (#521)

## Implementation

- Popup import waits through `awaitProfileActivation`; `waitForProfileActive` and its test are deleted, and the build regenerated the two auto-import files (seven lines removed).
- `runFencedBootstrap` retires a record naming its own profile before the bootstrap's first await.
- Red proofs, base copies from 0fe841be: the import case "a failure recorded for the imported profile ends the wait at once" fails on base (the old waiter ignores the record and its only timer is faked); the entry-clear case fails with the clear removed.
- A first commit pair carried the twin's `git rm` in the wrong commit (staged earlier); re-cut before any push so each commit builds.
- Deviation: the template note at `import.vue:288-291` names the waiter rather than saying a failure ends it; the block comment above `completeImport` says it.

## Codex round 1 (gpt-6.1-sol, high, session 01a14b03)

- Verdict: findings, minor only. Accepted: the block comment claimed the listener "has given up" past a failure or the backstop, which a slow live bootstrap disproves; it now says recovery joins a same-profile bootstrap in flight. Two helper doc comments narrated their code; deleted.

## Opus review (alongside round 1)

- Verdict: findings, minor only. Accepted: the entry clear now checks `isCurrent()` itself, so its fence does not rest on the caller bumping the sequence in the same synchronous block (a test pins it); the same comment overstatement as Codex. Accepted as a gap: no test pins `app.vue`'s `readFailure` wiring (it would need a shell mount; `setFailure` is equally unpinned today).
