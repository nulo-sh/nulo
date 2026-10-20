# Phase 0: root cause and plan consults

## Probe (2026-10-20)

A throwaway smoke spec (`zz-tcf-probe.test.ts`, kept outside the repository and copied into
`apps/extension/tests/e2e/` for each run, removed after; never committed) seeds one cancelled
`dapp_execute` journal record (`helpers/activity-seeds.ts`), reloads, and waits for Home's terminal
card. Chrome, armed smoke build of 44bc391f, `--retry=0`, one run, exit 0, 4 tests, 36.3 s.

**Timeline of one Home → History swap.** A `MutationObserver` records, for each DOM mutation, the
hash, the number of `tx-terminal-card` nodes, how many sit inside `home-scroller`, and
`nav-activity`'s `aria-current`. The hash is set inside the same evaluate, which then checks the old
fixture's wait condition synchronously.

| Visit | Old wait holds right after the hash set | W1: History hash, Home's card | W2: no card | History's card |
|---|---|---|---|---|
| first (cold route chunk) | yes, `nav-activity` not current | 1.5 → 34.1 ms | 34.1 → 50.6 ms | 50.6 ms |
| second | yes | 1.7 → 9.1 ms | 9.1 → 37.7 ms | 37.7 ms |
| third | yes | 1.7 → 8.1 ms | 8.1 → 38.1 ms | 38.1 ms |

In every visit `nav-activity` turned `aria-current="page"` in the same mutation batch that removed
Home's card.

**The base fixture.**

- A card parked between the wait and the read (removed, put back 1.5 s later): throws
  `failed to find element matching selector "[data-testid="tx-terminal-card"]"`, the CI message.
- 20 natural Home → History calls: the first, on the cold chunk, threw that message; 19 passed.
- A card parked before the call: passes (its wait waits).

The CI red is consistent with this race: the wait met Home's card in W1, and the `$eval` landed in W2.
The issue's hypothesis (History re-rendered its row) did not hold: History's rows are keyed
`journal:<id>` (`src/utils/activity-rows.ts:122`) and the list stays mounted while it has rows.

**A first try at holding the router failed.** Capture-phase `popstate` and `hashchange` listeners on
the window with `stopImmediatePropagation` did not stop the swap on Chrome: the page reached History
(`nav-activity` current, no Home card), and the base fixture threw the CI message again, a second
natural reproduction at load 147. The plan holds the router with `pushState` instead (D6).

**Rebuilding the probe.** One smoke spec under `registeredExtensionPerTest`, kept at
`~/.cache/nulo-backlog/terminal-card-flake-1/repro/`. Seed: `readActivityScope`, then
`seedJournalRecord` with `{ id, kind: "dapp_execute", title: "transfer_public_to_public", subtitle:
"localhost", progress: { stage: "cancelled" }, errorKind: "user_rejected" }`, then
`seedUsdQuoteAndReload`, then wait for Home's `tx-terminal-card` subtitle. The base fixture is a copy
of the 44bc391f function with an optional hook between its wait and its read. To park a card: in one
evaluate, `remove()` it and `setTimeout` an `insertBefore` back to its old place. To time a swap: a
`MutationObserver` on `document.body` (child list, subtree, `aria-current`) that records the hash, the
card count, the cards inside `home-scroller` and `nav-activity`'s `aria-current`.

## Consults

**Plan audit round 1** (2026-10-20). Codex (gpt-6.1-sol, high, session 01a156a1-5e3d-7232-ac18-dcb8328ffe74):
conditional approve, 6 findings. Opus Plan leg: conditional approve, 8 findings. Every finding and its
disposition is in `plan.md` § Audit verdicts. Opus predicted the capture-phase block might not hold;
the run above confirmed it.

**Plan audit round 2** (Codex resume): conditional approve, 2 findings (case (b)'s timing floor; the
base sensitivity criterion), both accepted. **Round 3** (Codex resume): approve, high confidence.
