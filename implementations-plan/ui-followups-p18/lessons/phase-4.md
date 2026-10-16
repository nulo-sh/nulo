# Phase 4: the signed set, SA-2, and arc 2's review loop

## SA-1 = A, SA-2 = B

Merged origin/dev at `c5e9c8e8` first; nothing touched `apps/extension/store` after the capture at `71f98db4`. Copied `S/new/` into the store; `sha256sum -c` against SA-1's block printed 11 OK, and 10 paths changed (the tile is byte-identical). SA-2: the sweep in `a11y-css.test.ts` was red on `.disclosure_toggle:hover` and `.fee_row_static:hover`, green after the two rules went. The fade's `transition: opacity` went with it, since nothing else animates opacity there.

## Codex round 1 (gpt-6.1-sol, high, session 01a144d6)

Ran on the default `~/.codex` login (`CODEX_ACCOUNT` unset). Verdict: approve, no material finding. It checked the cursor on both composers and `cursor: default` on the static row, the chevron's inline transition, focus styles, the 11 hashes, PNG chunks and trailing bytes.

## Opus 5.5 diff review (general-purpose, alongside round 1)

Verdict: approve. Four low points:
1. The test comment said the fade fails "in the light theme", but SA-2 records 4.4:1 in dark too. **Accepted** (demonstrated): "in both themes".
2. The sweep flags any `:hover` opacity in a composer file, not only on the toggle. **No change:** it fails closed and names the file and selector.
3. The composer regex misses `composes: a disclosure_toggle from …`. **No change:** that needs a second class in `tx-shared.module.css`, which has none, and the two composers are asserted by name.
4. The SA-2 gate was not finished. **Process:** it is recorded in STATUS before the PR.

## Codex round 2 (resume)

Verdict: approve. It verified the comment fix, judged (a) demonstrated but failing closed and (b) needing conditions the wallet does not support, and found no regression. The loop converged at two rounds.
