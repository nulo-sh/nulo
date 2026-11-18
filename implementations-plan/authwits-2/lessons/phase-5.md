# authwits-2, phase 5: Revoke hands off; the rows carry its state (B)

- The journal record cannot carry the chip (D7): it names only the primary call's contract and argument count, and turns `succeeded` when the node accepts, before the registry read. The worker's `RevokeAuthwitsContent` task spans the request to `verifyRevoked` and fails on any throw, so the chip reads it.
- A `ServiceClient` posts a request synchronously only while its port is Ready; otherwise it waits for Ready, and a `disconnect()` rejects what waits. So the hide keeps the client while a revoke request is out, and the popup gates Revoke on Ready (the Codex fix, phase 6).
- Gate: first `bun run lint` failed on cognitive complexity 17 in the composable's `states` computed (extracted `stateOfTask`, no suppression) and two formats; first `typecheck:all` failed on a spy typed `never`. Both reruns exit 0; 9 files, 205 tests and the three bans pass.
