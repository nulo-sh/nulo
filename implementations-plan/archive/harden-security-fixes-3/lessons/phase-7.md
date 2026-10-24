# Phase 7: a lock the wallet could not save (OA-4)

| When (2026-10-19) | Step | Outcome |
|---|---|---|
| 19:4x | Codex design consult (gpt-6.1-sol high, read-only): what a lock that could not be saved leaves, whether the wallet can retry itself, what a person would need | memory locks before the delete and the same worker never re-reads the row; a saved lock survives a restart of the wallet. One reattempt inside `close()`'s artifact section, no backoff (a `storage.session` removal has no quota or throttling path); the facade's announcement must not wait on the read-back. Two failed attempts still leave the lock unsaved, so a visible part remains (HS3-D10) |
| 19:5x | Built the reattempt and the announcement order | session-manager, fence and facade tests pass; each of the four new behaviour tests red with one attempt or the old order; the read-back test is a control |
| 20:1x | Visible part | OA-7 in OWNER-ASKS.md. Option A, the wallet restarting itself after the second failure, came from Chrome's documented clearing of `storage.session` on an extension reload; A's own tests must prove that on both browsers before it is built |
| 20:5x | Codex R1: the moved announcement could follow a successor's session when the facade's watchdog hands off | the fallback fires only while no session is published (`sessionHandle()`), which holds in every order; a test opens a session as `close()` returns and sees one announcement. Red without the guard |
