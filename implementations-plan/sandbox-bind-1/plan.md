---
plan: sandbox-bind-1
tier: light
status: plan approved by the final Codex pass; arc 1 in progress
issues: none (the PR closes nothing)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high design consult + audit round trip + final fresh pass; Opus Plan leg
base: origin/dev at 7bde519db
trunk: dev
post_implementation_hardening: not scheduled
---

# sandbox-bind-1: the network e2e node's admin RPC takes a per-run key

The network e2e setup starts a local Aztec node and an anvil for each run. This plan replaces the node's `--disable-admin-api-key` with an admin key drawn for each node the setup starts, shares it with the mining hold through vitest's provided context, and checks at startup that the node enforces it. The node's listen address waits for upstream CLI support (D1). Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md).

## Outcome & Quality Bar

- **For whom**: a contributor or CI runner running `bun run e2e:agent`, and the next person who edits the setup.
- **Excellent**: (1) every node the setup starts executes an admin call only with the run's key, and a node that answers a keyless admin call fails the run before any test; (2) the mining hold keeps working on both browsers, and the key never travels to the main port, a log, a command line or a file.
- **Good enough**: the node's listen address stays as Aztec 6.0.0 sets it (D1). A bare run that reuses or adopts a node gets no key, and the mining hold refuses there (D4).

## Scope against the lane brief

| Brief item | Disposition |
|---|---|
| Node main and admin ports listen on `127.0.0.1` | **Left out** (D1): Aztec 6.0.0's `aztec start` takes no listen address (F2). |
| Anvil listens on `127.0.0.1` | Already true (F1); verified on a real run. |
| Per-run admin key passed to its one caller | Phase 1. |
| Startup assertion on a non-loopback listener | **Left out** (D5): it names the node's two ports, which D1 leaves as they are. |
| README, one sentence each on the binding and the key | Phase 2, in § Running locally (the brief's "§ Running the network suite" does not exist; that text lives there). |

## Assumptions

- **Facts**: F1 anvil starts with `--host 127.0.0.1` (`global-setup.ts:421-423`), and a real run's `ss -ltnp` showed it on `127.0.0.1`. F2 Aztec 6.0.0's `aztec start` has no listen-address flag or env var (recon). F3 `--admin-api-key-hash <64 lower-case hex>` makes the node check the key's hash and persist nothing; the node hashes the header's string as UTF-8 (`api_key_auth.js:11,42`), so the argument is the SHA-256 of the hex string. The disable option is read before the hash and takes an env default (`AZTEC_DISABLE_ADMIN_API_KEY`, where `"false"` parses to false), so the spawn sets it explicitly. F4 the admin middleware takes `x-api-key`, answers 401 without a valid key and passes `GET /status` (`api_key_auth.js`). F5 the only admin caller is `fixtures/mining-hold.ts`, used only by `network/same-token-concurrent-sends.test.ts`; its `rpc()` also serves the main-port `pendingTxCount`. F6 a provided value reaches every worker of the project (`global-setup.ts:909-916`). F7 `assertNodeStoresInRunDir` runs after `markBootReady()`, so its failure is a real failure, never the retried exit 86. F8 the Docker CI-like runner forwards only a file path, and `NULO_E2E_RETRY` sets the retry count (`vite.shared.ts:117`).
- **Inferences**: I1 an agent run always starts its own node (it adopts nothing: `global-setup.ts:336` requires no run id, and `mayAdopt` refuses an agent run), so every CI run knows its key.
- **Asks**: none for the owner. Two outward items go to the orchestrator in the final report: the upstream request for a listen-address option, and the private record of what D1 leaves.

## Architecture & Implementation

- **Key** (`global-setup.ts`): a module constant `ADMIN_KEY = randomBytes(32).toString("hex")` (`node:crypto`); one setup process starts at most one node. The node spawn passes `--admin-api-key-hash <SHA-256 hex of ADMIN_KEY's string>` in place of `--disable-admin-api-key`, and its env sets `AZTEC_DISABLE_ADMIN_API_KEY: "false"`, so the spawn enables key checking whatever the parent environment holds (F3). `finishBoot` provides `aztecAdminKey` only when `weStartedNode`; `ProvidedContext` gains `aztecAdminKey?: string`. The key stays in the setup's and the workers' memory.
- **Startup key check** (`boot-guard.ts`, which unit tests can import, unlike `global-setup.ts`): `assertAdminKeyRequired(url, key)` posts `nodeAdmin_getConfig` to `http://127.0.0.1:<admin>` twice, each bounded by `AbortSignal.timeout`. Without a key it must get HTTP 401; with `x-api-key` it must get HTTP 200, no JSON-RPC error and an object `result`. Its errors name the port, never the key. `finishBoot` awaits it after `markBootReady()` when `weStartedNode`, then logs `[e2e-setup] admin RPC: a keyless call is refused, the run's key is accepted`.
- **Mining hold** (`fixtures/mining-hold.ts`): `rpc()` takes optional headers; `adminRpc` reads `inject("aztecAdminKey")`, throws naming the cause when it is absent (only when a hold is asked for, never at import), and adds `x-api-key`. `pendingTxCount` stays keyless, so the key never goes to the main port.
- **Change map**: `apps/extension/tests/e2e/global-setup.ts`, `tests/e2e/boot-guard.ts`, `tests/e2e/fixtures/mining-hold.ts`, `tests/e2e/README.md`, `scripts/e2e/boot-guard.test.ts`. Nothing in `src/`, `.github/` or `scripts/ci-cd/`.
- **Alternatives**: D1 to D5 below.

## UI impact

None. The change is test infrastructure; no screen, copy or row changes.

## Security & Adversarial Considerations

- **Invariant**: a node the e2e setup starts executes an admin RPC call only when the call carries that run's key, and the setup fails the run when the node answers a call without it.
- **Threat model**: any caller of the admin port. The key is 32 random bytes from `node:crypto`; the node compares hashes with `timingSafeEqual` (F4). The key is shared with the project's vitest workers (F6), which run the repo's own tests; a local process of the same user can read their memory, and that boundary is out of scope.
- **Least privilege**: only admin requests carry the key; the main-port helper never does; no log line, error, lock file or command line holds it.
- **Left out**: the node's listen address (D1), tracked privately; this plan files nothing public.
- **Supply chain / crypto**: no new dependency; `node:crypto` only.

## Arc 1: phases

### Phase 1: the per-run admin key ✓

1. In `global-setup.ts`, add `ADMIN_KEY`, the `--admin-api-key-hash` argument, the env setting, the `aztecAdminKey` provide and its type.
2. In `boot-guard.ts`, add `assertAdminKeyRequired`. In `finishBoot`, await it after `markBootReady()` and log the success line.
3. In `mining-hold.ts`, add `adminRpc` and the header. Rewrite the module comment, which says the admin port serves keyless calls.
4. In `boot-guard.test.ts`, add one test over four stub admin servers shaped like the node's middleware. The one that refuses a keyless call with 401 and answers exactly the run's key passes. These fail, each naming the port: one that answers a keyless call; one that refuses the run's key; one that answers the key with HTTP 200 and a JSON-RPC error.

**Validation gate**: `bun run lint && bun run typecheck:all && bun run test` exit 0, with the new test green. Layers: lint, typecheck, unit.

### Phase 2: docs, browsers, CI-like runner

1. In `tests/e2e/README.md` § Running locally, add these two sentences: "Anvil listens on `127.0.0.1`; the node's listen address is Aztec's own, since 6.0.0's `aztec start` takes none." and "Each node the setup starts takes an admin key drawn for that run: the setup checks that the node refuses an admin call without it, and shares the key with the tests through `inject("aztecAdminKey")`, which only the mining hold reads."
2. Run the mining-hold file on both browsers: `cd <worktree> && NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/same-token-concurrent-sends.test.ts`, then the same with `NULO_E2E_BROWSER=firefox`.
3. Commit, then run the Docker CI-like runner on that file (Chrome only; the image installs no Firefox):
   - Export the commit with `git archive <sha>` into `~/.cache/nulo-backlog/sandbox-bind-1/docker-src`, and record the SHA in `lessons/phase-2.md`.
   - Run the usage line of `docker-ci-like.sh` from that dir, with volumes `sbind-bun-cache` and `sbind-aztec`, a container name `sbind-ci`, and `-e NULO_E2E_PROVERLESS=1 -e NULO_E2E_RETRY=0 -e NODE_OPTIONS=--dns-result-order=ipv4first`.
   - Tear down: remove the root-owned copy with `docker run --rm -v <dir>:/w ubuntu:24.04 rm -rf /w/docker-src`, then `docker volume rm sbind-bun-cache sbind-aztec`.

**Validation gate**: both browser runs pass at retry 0, each setup log carrying the success line. The Docker run passes; if the infrastructure cannot run (image pull, Chrome launch), record that in `lessons/phase-2.md` as unrun, never as a pass. A test failure there blocks the arc. `bun run test:all` exits 0, and `bun run check:plans` exits 0 after staging. Record the wall-clock of the file per browser, before (`lessons/phase-0.md`) and after. Layers: unit, network e2e (both browsers), CI-like.

## Decision ledger

| Id | Decision | Rejected |
|---|---|---|
| D1 | Leave the node's listen address to upstream CLI support (Codex: high confidence; Opus agrees) | A preload that sets a host on `net.Server.prototype.listen` inside the node: a runtime patch of a third-party process, the monkey-patch the owner's rule bans, even if a check makes it fail closed. A network namespace: the browser could no longer reach the node, and it needs privileges. A launcher that re-implements `aztec start`: a copy of upstream internals. The upstream container image published on loopback: it would replace the harness's process ownership (markers, `/proc` store checks, run dirs) and put Docker in every lane. |
| D2 | The startup check asks for a 401 without the key and a result with it; its test covers both refusals and the pass (Codex) | Relying on the mining-hold e2e: a keyed call that works cannot show a keyless call is refused, and it runs in one file only. |
| D3 | A module constant key (Codex, Opus) | A key drawn inside the spawn: one setup starts one node, so it adds nothing. |
| D4 | No key on reuse or adoption: the mining hold throws when asked to hold | Persisting the key for reuse: new persisted state for a bare-run convenience no caller uses (I1). |
| D5 | No listener check (Opus) | Codex: check anvil only. Anvil's host is a literal beside its spawn, `aztec.sh`'s second anvil fails its bind on the held port, and an adopted anvil is never checked. So the check fires only if someone edits that literal. It costs a second refusal policy on the shared `/proc` reader and an address decoder, and the brief named the node's ports for it. |

## Review verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex design consult | B (leave the node's address out) | the explicit disable setting; D2; the key only on admin requests; reuse fails clearly | its anvil-only listener check (D5) |
| Codex audit r1 | conditional approve | 1 wording (plan, recon, README drafted); 2 key reach stated as every worker; 4 three-stub test; 5 D3 and placement kept; 6 Docker retry 0, named SHA, teardown, unrun is not a pass; 7 README sentences drafted | 3 and the IPv6 listener cases: moot once D5 drops the check |
| Opus Plan | conditional approve | 1 wording, README and PR body; 2 the residual goes to the private record; 3 D5; 4 hash input stated (F3); 5 success log line, retry 0 on all runs, Firefox baseline, Docker teardown | none |
| Codex final (fresh session) | approve | nits: the Firefox baseline before Phase 1 (taken); a fourth stub (HTTP 200 with a JSON-RPC error) and an exact header match in the pass stub | none |

## Delivery

- One arc, branch `worktree-sandbox-bind-1`, one PR to `dev` with `gh pr create`, opened ready after the Codex loop converges and the gates pass, with no labels. The path filter runs the network lanes for `apps/extension/tests/e2e/**`.
- Title: `test(e2e): the sandbox node's admin rpc takes a per-run key` (59 characters).
- Body: what changed and why; the line "The node's listen address is unchanged: Aztec 6.0.0's `aztec start` takes none."; the gates with outcomes; the file's wall-clock per browser before and after; no `Closes` or `Part of` line. The close-out lands as the PR's final commits.

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `7bde519db`, with these values:

- Step 1 is absent (`code_review: off`).
- Step 2: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` on the arc's diff against `7bde519db`, resumed with `resume-codex.sh`. Both verbatim rules and the adversarial ask go in every prompt. One Opus `general-purpose` review runs beside round 1. Hard stop at three rounds.
- Steps 3 and 4 as written; the close-out moves this folder to `archive/sandbox-bind-1/`.
- Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/sandbox-bind-1/plan.md`, then `agent-worktree done sandbox-bind-1 --merged`. The orchestrator's session notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds (not run; orchestrator-owned)

- `/goal` Phases 1-2 ✓ in implementations-plan/sandbox-bind-1/plan.md, each gate passing in the transcript; the Codex loop converged on the arc's diff (a resumed pass with no new material finding, quoted); a ready PR to dev; `bun run test` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/sandbox-bind-1 from plan.md and lessons/: next unchecked phase, its gate, the Codex loop, delivery; never merge.
