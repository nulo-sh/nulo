# Phase 3: discovery request shape (C3), and PR A's review loop

- The SDK's content script forwards the page's parsed JSON whole as `content`, so the own-key check runs at both levels on the raw value. Red proof: with the key check reduced to a type check, the six key-refusal cases fail.
- The control drives the real `ExtensionProvider.discoverWallets` against a stubbed `window` and validates what it posts (66-character chain fields).

## Review loop (PR A, #578)

- Codex round 1 (gpt-6.1-sol, high, session 01a14526): approve with five comment findings (a memory claim, the UUID arithmetic, two cost comments, a header phrase, two narrating helper comments); all applied.
- Opus diff review: logic correct; the tsc break, a 1 s abort timer under 32 MiB pins (a loaded runner could fire it first and turn the oversize case retryable), the adapter fake's `ok` flag, a stale alias, the wallet-core file map; all applied.
- Codex round 2 (resume): approve, no new material finding.
