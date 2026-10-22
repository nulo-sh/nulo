# fpc-create-flake-1 phase 0: planning

## Probes (scratch, outside the repo)

- **Is Bun's WebCrypto off the main thread?** Yes, on Bun 1.4.2 and Node 24.21.0: a zero timer scheduled before a 64 MiB AES-GCM `decrypt` fired before the decrypt settled (Bun 74 ms, Node 95 ms). A 64-byte decrypt settled before the timer 200 of 200 times on Bun at load1 ≈ 93; Node 191 of 200. So the one-macrotask bound holds on an idle host and breaks only when the worker's completion is delayed.
- **Base copy run:** the file passed 14 of 14 in 6.4 s at load1 ≈ 93.

## Prototype on the base (applied, run, reverted; `git status` clean after)

The decrypt-delay spy for T3 (the prototype below installed it without the restore, so the delay also reached the later cases of that run, which passed with it):

```ts
// Before the `try`:
let spy: { mockRestore(): void } | undefined
// Directly before the sweep starts:
const decrypt = crypto.subtle.decrypt.bind(crypto.subtle)
spy = vi.spyOn(crypto.subtle, "decrypt").mockImplementation(async (...args: Parameters<typeof decrypt>) => {
	await new Promise((r) => setTimeout(r, 0))
	return decrypt(...args)
})
// First line of the `finally`:
spy?.mockRestore()
```

| Copy | Change | Result |
|---|---|---|
| base | spy in T3 | T3 red, `AssertionError: expected false to be true` at the `settled` assertion; 13 passed |
| fix (plan change map) | none | 14 passed |
| fix | spy in T3 | 14 passed |
| fix | `await this.lock.withLock(() => pxe.registerContract(…))` in `service.ts` | T1, T3, T6 `Test timed out in 5000ms`; 11 passed |
| base | the same lock mutation | T1, T3 red by assertion in milliseconds; T6 timed out; 11 passed |

## Consults

- **Codex r1** (`gpt-6.1-sol`, high, read-only, fresh session): `approve`, four lows. (1) The order proof holds; "never returns" overstated it, since the lock's watchdog frees a held lock after 5 min: reworded to "blocked past the 5 s deadline". The default timeout as the red signal is acceptable: no finite non-time observation proves a promise never settles. (2) F8 and F10 hold; it calls deleting T2's wait (and `macrotask`) a tiny optional simplification, and a reached deferred in the `addFpc` case optional hardening. Kept (D3): T2's wait makes both registrations overlap, the scenario the case names, and neither change answers a failure. (3) The spy is a sufficient reproduction, not proof of the historical cause; restore the spy in the case's `finally`, since `clearAllMocks` keeps a spied implementation: taken. (4) D6's trace is right; file it, and ask whether the second timer lets the case tell a serialized implementation from an unserialized one: taken into D6's issue body.
- **Opus Plan leg** (opus, parallel to Codex r1): `conditional approve` with three conditions, all taken: cite the lock watchdog in F3 (`lock.ts:5`, `service.ts:58`); a gate line proving no spy is left in the file; label step 6 a smoke run, since the base passes on an idle host and steps 2, 4 and 5 carry the proof. Also taken: F1 cites the call sites, F8 states that every interleaving meets T2's assertions, F10 lists `ensureInitialized` and `fromStringUnsafe`. Its residual (a wait bounded under 5 s passes the pins) became D7, a closed `known-limit` issue at close-out. Optional and kept: the `addFpc` reached deferred (D3).
- **Codex r2** (resumed): `conditional approve`. One medium, taken: the quoted `const spy` sat inside the `try` while its restore sat in the `finally`, out of scope; now `let spy` before the `try`. The `grep -c` gate reads the count, since `grep -c` exits 1 on 0. D7 confirmed a known limit; D3 settled.
- **Codex r3** (resumed): `approve`, no finding.
