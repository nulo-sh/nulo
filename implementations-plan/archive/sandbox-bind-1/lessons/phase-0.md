# Phase 0: planning consults

## Codex design consult (gpt-6.1-sol, high, read-only)

- Asked: how, or whether, to make the e2e node listen on loopback when Aztec 6.0.0 offers no listen address; plus the key and listener-check designs.
- Verdict: leave the node's address out (option B), high confidence. A preload that patches Node's `listen` inside the node is a runtime patch of a third-party process; the startup check would only detect a mismatch, not make the mechanism acceptable.
- Accepted: set `AZTEC_DISABLE_ADMIN_API_KEY=false` in the node's env (an inherited true wins over the hash); a startup check that a keyless admin call gets 401 and a keyed one a result; the key only on admin requests; the `/proc` reader must refuse a table it cannot read; reuse and adoption fail the mining hold clearly; the listener check is stated as Linux-only.
- Noted, not adopted: an exact wording for the README's binding sentence (rewritten in the plan's own words).

## Codex audit r1 (same session, resumed)

- Verdict: conditional approve. Accepted: committed wording describes the change, never the prior state of the node; the key's reach is every worker of the project; a three-stub test (pass, keyless answered, run's key refused); Docker at retry 0 on a named commit with a teardown, and an unrun Docker step is never a pass; the README sentences drafted in the plan. Its IPv6 and `/proc` points fell away with the listener check (D5).

## Opus Plan leg

- Verdict: conditional approve. Accepted: the wording, README and PR-body lines; the residual goes to the private record, not the PR; dropping the listener check (D5, against the design consult's anvil-only check, on the stronger argument: it fires only if someone edits the literal `--host`); the hash input stated; a named success log line; retry 0 on every run; a Firefox baseline; the Docker teardown.

## Baselines (the mining-hold file, proverless, retry 0, before the change)

- Chrome: 17 tests green; wall-clock 686 s for `bun run e2e:agent` (build included), vitest duration 669 s.
- Firefox: 17 tests green; wall-clock 765 s, vitest duration 750 s.

## Codex final pass (fresh session)

- Verdict: approve. D5 re-evaluated and kept: the anvil-only check would guard neither the node's ports nor adopted services. Nits folded: the Firefox baseline (above) and a fourth stub case in the key-check test.
