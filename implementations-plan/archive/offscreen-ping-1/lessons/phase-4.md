# Phase 4: review loop

The diff reviewed is `5711a1bc3..HEAD` without the plan folder, after the Phase 2 commit `af337ad5`. The reviews ran beside the Phase 3 e2e runs; every change they caused is test-only, so the e2e dist stayed current.

## Codex r1 (fresh, gpt-6.1-sol, high, read-only)

**Approve, high confidence.** No blocking finding. Adversarial walk:
- (a) A replacement mid-call strands no re-send or broadcast (K1).
- (b) A stale Chrome READY or PONG can issue trust only inside a listener window (K4); the token does not solve it.
- (c) Firefox's frame generation keeps two documents from issuing trust; a second copy of the page opened by this extension's own code needs unsupported conditions.
- (d) No page or content script can issue or clear a token. A remote error settles as `rejected`, never `timeout_fired`.
- (e) Mixed deadlines are K3.
- (f) Stale terminals are handled by token equality.

`inner` is forwarded on every path, and readiness failures issue no tag.

1. *Demonstrated, non-blocking.* The busy reproducer made the document busy before A was sent. On base, A waited on its own ping and ran on the replacement, so `phase-1.md` overstated the evidence. **Accepted.** A now reaches the wire (asserted) and holds the thread. Re-run on base: red on `closeDocument` (`phase-1.md`, correction).
2. *Demonstrated, non-blocking.* Test comments narrated (`dropNext`, `refuseNext`, `pump`), and the inline marks were not sentences. **Accepted.** The three were deleted and the five marks now read `// A request to it went unanswered.`

## Opus r1 (fresh, general-purpose, opus), beside Codex r1

**Conditional approve.** No correctness bug.
- Its walk of (a)-(f) agrees with Codex's.
- The clear in `closeOffscreen` never matters today: every close follows a create's clear or runs with no token. It stays, since it states the invariant at the close.
- `onTerminal` runs before the caller's handlers, so a caller's immediate retry pings.

Findings:
1. *Demonstrated, non-blocking; the condition of approval.* No test covers the token clears. A trusted X leaves `getContexts`; Y is created, never sends READY and survives a failing close. Without the clears, Y inherits X's token and every request to it waits 90 s. **Accepted.** The new case "a successor that never sent READY does not inherit the trust its predecessor earned" is green on the fix and red with the three clears removed.
2. *Demonstrated, non-blocking.* Three wording fixes in `ARCHITECTURE.md` §6: "a slow answer is never evidence" contradicted the next sentence; "still carries it" becomes "the token it carries is still current"; "the two clears" now names `clearChainState` and `clearProfileState`. **Accepted.**
3. *Plausible but unverified, non-blocking.* A send still pending when the document is destroyed may reject early as `send_failed`, so in-flight requests fail "no later than" their deadline, not at it. That mark carries the old token and is harmless. **Accepted** in §6 and in K1's issue.
4. *Information.* The readiness-phase part of the failed-send case and the re-send counts are contract pins that no change to the override can break. Kept as pins.

The Opus leg ran its mutations on `offscreen.ts` while this session swapped the same file for a base run. Both restored their copies, and `git diff HEAD` on the two source files was checked empty afterwards. Next time, give a reviewer that mutates a scratch copy of the worktree.

## Codex r2 (resumed), on `345a6fdb0`

**Approve, high confidence; no new finding, blocking or not.**
- The tightened reproducer now proves its name on base: A is admitted, then holds the document, and B's expired ping closes it with A outstanding.
- The successor case pins the clears in aggregate, not each site on its own.
- The §6 wording is correct.
- The adversarial conclusions of r1 are unchanged, since this round changed no runtime code.

The loop converged at round 2 of 3.
