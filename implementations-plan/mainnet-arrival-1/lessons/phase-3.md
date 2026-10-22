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
