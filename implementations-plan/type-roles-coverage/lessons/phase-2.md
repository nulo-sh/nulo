# Arc 2 lessons

## Recount and probe (plan revision, A2)

- Merged `origin/dev` at 0fe841be. Only the arc 1 files conflicted, because the branch held #621's squash, and dev's side was taken. `bun install --frozen-lockfile` reported no change.
- Recount: 129 entries, 99 live.
  - 41 network-owned: 39 `(network)` and #594's two `(component test)`.
  - `type-roles-windows.test.ts` reads 17.
  - #649 moved 37 of the 41 from `data` to `meta`. No selector or state moved.
- The probe measured each producer before the revision named a cost.
  - It is the revision's flows written into the windows spec, with `performance.now()` stamps.
  - It is uncommitted; the diff is kept outside the repo.
  - It ran at retry 0, started at load1 < 150.
- Chrome run 1 (481 s wall, tests 269 s): 2 of 5 passed, and 35 of 41 sites were observed.
  - The rig test passed every new step. Its stamps, in s:
    - deploy 40.5
    - first delegated window 18.7
    - registerToken of the pull token 3.7
    - move window 8.9
    - account-sender transfer 2.1
    - senders 0.5
    - send form 0.3: the pull notes were already discovered, and the balance read at once
    - review sheet 0.3
    - notes 0.9
    - contracts 0.3
  - Execute requests, in s:
    - sendTx 6.7
    - call intent 2.7
    - inner hash 1.7
    - grant 1.4
    - registerToken, approved, 2.6
    - consume, unknown sender and nonce, 2.3
  - Failure 1: the second grant timed out waiting for its window. `pg-btn-consumeAuthwit` had set `authwitOwner` to the minter, and the grant reads the same input, so the playground asked for a grant owned by another address and no window opened. The request now names the owner.
  - Failure 2: the connected-app page never showed its authorizations switch within 15 s, after the `contractClasses-listed` grant (1.3 s). The rerun prints the hash, the page's testids and the stored session's grant types on a miss.
- Chrome run 2 (tests 1 and 2 only, 328 s wall): the execute test passed every request, including the grant on the registered token (1.2 s) and the trust prompt (1.2 s).
  - The capabilities test reached the connected app's page. Its testids show the account row, the grant toggles and `connected-app-authorizations`, but no switch: the authorizations row renders none for a grant with no call scope.
  - `openConnectedApp` now takes the testid it waits for.
- Chrome run 3 (full file, 436 s wall): 5/5 green, `live` = 41, nothing unobserved; the file took 208.3 s.
  - Per test: capabilities 20.1 s, execute 38.2 s, rig 108.4 s, raw 41.7 s.
  - Stamps, in s:
    - class grant 1.4, page 1.7
    - registerToken 5.8, consume 1.7, second grant 1.7, trust 2.3
    - pull registerToken 5.0, move 9.6, account transfer 1.9
    - senders 1.3, send 0.3, review 0.3, notes 1.7, contracts 0.3

## Review fixes and D9's pairs

- After both review legs: D17's press and re-read, D18's order, D16's inputs, the in-field seeds, the card kind in the expected file, and the trust wait.
  - Chrome run d of that draft: 5/5, `live` = 41, nothing unobserved and nothing read only as a name; 191.7 s.
  - Presses cost 0.03–0.36 s per state on Chrome and 0.18–1.5 s on Firefox.
- D9 pairs, each run started at load1 < 150, retry 0. The base is HEAD's spec over the head tree.

  | Run | Chrome file | Firefox file |
  |---|---|---|
  | base | 135.4 s (4/4) | 233.0 s (4/4) |
  | head | 202.3 s (5/5) | 293.0 s, 3/5 |

- Head Firefox failed at the trust step: `page.reload()` of the wallet tab hit the 30 s navigation timeout.
  - FIREFOX.md: a BiDi reload of an extension page crosses a process swap and strands the page. The seam test pins `reloadExtensionPage` as the only way.
  - The spec uses it now, and `browser-seam.test.ts` passes. The coverage test then named the one site that step owns, which shows the last test catches a state that never rendered.
- Codex's verification found that the trust wait could still lose the seed. `setArrivalFloor` rewrites the state it read after the `trusted` write, so the wait now also needs `arrivalFloor` or `arrivalFloorPending`. Head Chrome above ran the earlier wait; both head runs are repeated on the final draft.
- Final draft, head, retry 0, each started at load1 < 150. Firefox started at 149.6 and Chrome at 80.8.

  | Run | File | Capabilities | Execute | Rig | Raw |
  |---|---|---|---|---|---|
  | Chrome | 178.9 s (5/5) | 17.8 | 36.9 | 90.3 | 34.0 |
  | Firefox | 212.5 s (5/5) | 33.6 | 60.6 | 78.7 | 39.5 |

  - Both had `live` = 41, with nothing unobserved and nothing read only as a name.
  - Trust step: 1.6 s on Chrome, 2.6 s on Firefox.
  - Presses: 0.02–0.4 s per state on Chrome and 0.16–1.4 s on Firefox. The sendTx state is the dearest.
  - Firefox's head ran faster than its base (233.0 s), so host load swamps the added steps there. The local pairs are evidence of cost, not of the bound; CI judges A1.
