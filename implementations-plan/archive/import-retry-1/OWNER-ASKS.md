# import-retry-1 owner asks

The arc ships without waiting on any of these; each says what ships now.

## OA-0. The sentence (the decision page)

- **Surface:** Home's (and Holdings') token import row, after a worker restart ended the import.
- **Options:** W1 "The wallet restarted while adding this token." (built) or W2 "Adding this token was interrupted." (captured through a throwaway patch).
- **What ships now:** W1, with RETRY. A W2 pick is one commit before landing.
- **Recommendation:** W1: it names the cause, so the person knows Retry is safe.

## OA-1. The other failure texts on the same row

- **Surface:** the same row, when the import failed for any other reason: the reaper's stall text ("Job declared lost: simulating stage exceeded grace window (…)", reachable when the import's read hangs ten minutes or it waits two behind another import), and the engine's own messages (a node or simulation error).
- **Options:** keep them (today); or show the row's existing fallback "Couldn't add token" for every reason the wallet did not write itself.
- **What ships now:** unchanged. This is the copy decision page 128 holds (P128-12), which was skipped.
- **Recommendation:** the fallback for the stall text at least; it is the same engine sentence #1799 complains about.

## OA-2. How long a failed import stays on Home

- **Surface:** the failed import row, which hides itself 30 s after it failed (`FAILED_RETENTION_MS`), Retry with it.
- **What ships now:** 30 s, as today. A restart ends the session, so the failure is swept at the unlock and the row shows while the person looks at Home.
- **Recommendation:** keep 30 s unless the decision page shows the person missing it.
