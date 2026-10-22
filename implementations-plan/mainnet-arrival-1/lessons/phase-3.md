# Phase 3 (A3): the real update

## Design consult, 2026-10-21

The design as first drafted: the arm (D26), and the scenario in the network suite through `agent.sh`, case (a) populating a custom network on the run's sandbox with Testnet deleted, case (b) the takeover.

- **Codex** (`gpt-6.1-sol`, high, session `01a160bc`): two medium findings.
  1. The armed builder left an armed `dist/<browser>`, which a later smoke or artifact run loads. Fixed: the builder removes it on exit.
  2. One candidate cannot serve this scenario and the other update scenarios. Fixed: the candidate records its kind and each scenario refuses the other (D28); the README says to run this one by file.
  Also: count the takeover's nested progress screen as the takeover, and count arrival mounts by element (D30).
- **Opus** (Plan agent): no production path for the arm.
  1. (high, traced) The Terms sheet reads its status once, as the popup mounts, so the older Terms planted through the open popup could miss it. Fixed: plant through a scratch page before the popup opens (D29).
  2. (medium) (a) needs a sandbox the release can talk to, which the release-day rerun may not have. Fixed: (a) is node-free (Testnet active, Local Network deleted).
  3. (medium) Once the real Mainnet seed ships, an armed build seeds two of its kind. Fixed: a pin in `config.test.ts`.
  4. (medium) The plant of a moved Testnet throws once the seed has moved. Fixed: planted only while it has not.
  5. (medium) Move (b) into the arrival smoke. Rejected, with Codex: it would add per-PR runtime, and the lane brief puts the takeover's precedence in the real update.
  6. (low) The smoke setup should refuse the stamp too; the wrong candidate failed on a hidden Header. Both fixed.
- **Codex, resumed:** agreed with each disposition. On the fork the node-free scenario opened, its call: "architecturally (ii)", the smoke lane beside the replay, "booting a sandbox adds cost and an unrelated failure dependency without strengthening their evidence". Taken, and the gate amended (D27). It also asked to compare accounts across chain scopes in (b), since a natural seed move changes their keys. Taken.

## Implementation notes

- The stored-shape registry needed nothing: the extra seed writes a `networks` row and the offer record, both registered, and `mainnet` is already a `ChainKind`.
- The reset's "is ready" toast sits over the Terms sheet's consent box for its 2 s (the shell raises toasts above the sheet). The first Chrome run of (b) caught it with `pointerClick`'s cover check. The test now waits for the toast to close (D31).
- `pkill -f "<a commit's message>"` matched the agent's own shell, whose command line held the same text, and killed it. Kill by pid.

## Proof of the scenario, Chrome, 2026-10-22

Each mutation of the candidate's source, built and run at retry 0, turns the named cases red (each reverted after):
- M1, the gate ignores the Terms verdict: (a) `shown: [sheet+arrival, arrival]`; (b) `[takeover, arrival, sheet+arrival, arrival]`.
- M2, `KINDS_SEEDED_BEFORE_RECORD` emptied: both, "Local Network is in your wallet" (the deleted default came back and announced).
- M3, `answerNetworkArrival` writes nothing: both, the record keeps `announce` after Stay.
- M4, the Terms sheet no longer waits for the takeover: (b) only, the one case with a takeover.

## Review round 1, 2026-10-22

- **Codex** (`gpt-6.1-sol`, high, session `01a160eb`): `clean`. "No material correctness or security findings." One low: a doc comment narrating the wait below it. Removed.
- **Opus** (diff review): `findings`, all low, each checked against the tree.
  1. The header claimed ordering against the barriers, which neither case raises. Reworded: "with no barrier raised".
  2. The measured runtime was in no committed file. Added to the header and the plan.
  3. Case (b)'s account check proves the scope move, not names or visibility (one default account). The plan's wording narrowed; the replay proves what the reset carries.
  4. The README's "no other build" overstated: `test:e2e:all` loads `dist/` unchecked. Narrowed to the three refusals that exist; the builder's exit trap already removes the armed `dist/`.
  5. Two comments: the arm's "both flags required" restated the throw; `openAndUnlock`'s doc narrated its body. Both cut to the invariant.
- Gates before round 1: `test:all`, `typecheck:all`, `test:ci-gating` exit 0; the release Chrome and Firefox builds hold neither the stamp nor the seed's chainId or node; with the marker removed from `_build-extension.yml`, `build-env-guard.test.ts` fails on the new stamp. Chrome smoke at retry 0, `network-arrival`, `stale-network`, `legal-acceptance`: 19 pass (242 s).

## Review round 2 and the final gates, 2026-10-22

- **Codex** (resumed `01a160eb`): `clean`, "no new findings or regressions". The loop converged.
- Head `4be04289` (`origin/dev` at `60ecd6cc`): lint, `typecheck:all`, `test:all` (extension 903 files, 14969 tests), `test:ci-gating` (687) exit 0.
- Candidates of `4be04289`, retry 0: Chrome, the scenario 36 s (21.7 s and 14.3 s) and `network-arrival` green; Firefox, the scenario 46 s (22.3 s and 24.1 s), `network-arrival`, `stale-network` and `legal-acceptance` green (21 tests, 319 s). Without the opt-in the file reports both cases skipped. `update-replay.test.ts` given the extra-seed candidate refuses it: "build it without --extra-seed".
