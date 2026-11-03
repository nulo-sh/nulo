# w3-ci-1 recon

Base: `origin/dev` at `b24357921`. One Sonnet explorer (reuse sweep over six capabilities) and three Docker reproductions in `ubuntu:24.04` with the runner's own pinned Bun 1.4.2 and Node v24.16.0, on a `git archive` copy of the base tree and a fresh lane-named Bun cache volume.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Parse a lane's dorny filter | `scripts/ci-cd/behavior-gating.test.ts` `filtersOf` (:48), `dornyFilters` (:56), `workflowOf` (:135) | reuse-as-is |
| Bind `${{ inputs.x }}` through a call | same file, `bind` (:172) with `Scope`; `laneCalls` (:213) reads a callee's declared defaults | reuse `bind`; adapt the defaults pattern |
| Split infrastructure entries from the build surface | same file, `LANE_INFRASTRUCTURE` (:860) | reuse-as-is (its comment is rewritten) |
| Walk `uses:` across reusable workflows and composites | none. Searched `scripts/ci-cd/*.test.ts` for `uses`, `.github/(workflows\|actions)`, `reachable`, `transitive`, `graph`. Nearest: `stepsOf` (:1654, one hop, no composites), `callsOf`/`laneCalls` (network suite only, throw on any unknown `if`), `bun-version.test.ts` `setupSites()` (lists steps, follows nothing) | build new, in the same file |
| Decide a step's `if:` on bound inputs | `CHAOS_PAIR` (:159) is a two-entry table for the lane's chaos jobs | build new (one expression shape); `CHAOS_PAIR` stays |
| Scripts a `run:` executes | `commandLines` (:77) drops comment lines | reuse-as-is |
| Install Puppeteer's browsers explicitly | `apps/extension/scripts/e2e/install-firefox.ts` runs the installed launcher by path (`--no-install … puppeteer browsers install firefox@<pin>`) | adapt the pattern (one shell line, no new file) |
| Pin the runner's content | `scripts/ci-cd/docker-ci-like-pins.test.ts` (`problems()`, :89-106) | adapt: one more assertion |

## #1419: what the runner does, traced

1. **Fresh tree, fresh volume, `ipv4first` set:** the runner's groups through `bun install --frozen-lockfile` print `999 packages installed` and nothing about Puppeteer, yet the container's `~/.cache/puppeteer` holds `chrome/linux-155.0.8059.79` afterwards. Bun runs `puppeteer`'s `postinstall` (it is on Bun's default trusted list; `bun pm untrusted` reports 0) and never prints a successful script's output. So the issue's "the log shows no Puppeteer postinstall" cannot tell the cases apart, and none of its three candidate causes (no `.git`, a fresh cache volume, Bun's trust handling) is the cause.
2. **The same tree again:** `bun install` prints `Checked 1028 installs … (no changes)`, runs no lifecycle script, and the container's `~/.cache/puppeteer` does not exist. The tree is bind-mounted, so `node_modules` outlives the container; the browser lands in the container's home, which `--rm` discards. **Demonstrated cause:** every run on a tree that already holds `node_modules` reaches no Chrome. That is every run after the first, and the first run on a contributor's own checkout, which is what the usage header mounts (`-v "$PWD":/work`). The `deps-ci-1` record matches: its run 2 reused run 1's tree.
3. **Without `ipv4first`:** Vite (`apps/playground/vite.config.ts`, `server.host: "localhost"`) prints `Local: http://localhost:5174/` and answers only on `[::1]`. A Node 24 `http.get("http://localhost:5174/")`, global-setup's `probeHttp` (`apps/extension/tests/e2e/global-setup.ts:167`), makes one attempt, to `127.0.0.1`, which is refused. The `connectionAttempt` events show it. The container's only IPv6 address is `::1` on `lo`. Node's client resolves with `ADDRCONFIG`, which drops `::1` when no non-loopback IPv6 address exists, while `listen("localhost")` takes the resolver's first answer, `::1`. With `ipv4first` both sides land on `127.0.0.1`. **Demonstrated cause:** bind and probe name the same host and reach different families. This host has no global IPv6 address either, which is why `apps/extension/tests/e2e/README.md:210,246` pass the flag; CI passes it nowhere.
4. `puppeteer browsers install` with no browser installs every pinned, non-skipped browser (Chrome and chrome-headless-shell, as the postinstall does). It throws when one fails (`@puppeteer/browsers` 3.2.5, `lib/CLI.js:173-195`) and returns early when the build is present (`lib/install.js:220-230`). The postinstall's `install.mjs` only warns on a failed download and exits 0.

## #1493: each lane's graph against its filter

| Lane | Reached (local `uses:`, `if:` decided on bound inputs) | Scripts its `run:` lines name | Filter holds, unreached | Reached, not in filter |
|---|---|---|---|---|
| smoke, Chrome | `_extension-smoke-e2e.yml`; `setup-bun`, `setup-puppeteer` | `live-labels.sh`, `e2e-decide.sh`, `e2e-aggregate.sh` | `_build-extension.yml` | `live-labels.sh` |
| smoke, Firefox | the same, plus `setup-geckodriver` | the same | `_build-extension.yml` | `live-labels.sh` |
| network, Chrome | `_extension-network-e2e-lane.yml`, `_extension-network-e2e.yml`; `setup-bun`, `setup-aztec`, `setup-puppeteer`, `setup-presto-server` | the three above, plus `assert-canary-results.ts` | none | `live-labels.sh`, `assert-canary-results.ts` |
| network, Firefox | the same, plus `setup-geckodriver` | the same | none | the same |

No composite action calls a local action today. `setup-presto-server`'s `if:` (`!inputs.disable_presto && !inputs.proverless`) is compound; the PR lanes run Presto in the canary job, so it counts as reached. `setup-aztec/install.sh` runs through `$GITHUB_ACTION_PATH`, inside the action's own glob. `assert-canary-results.ts` reads `canary-expectations.json` and imports `scripts/release/workflow-command.ts`. A script's own reads are outside what a lane's YAML names (plan, decision D3).

## Collisions and boundaries

- `behavior-gating.test.ts:723` ("each e2e lane's filter covers the gate scripts it runs") is containment only; the derived equality is strictly stronger and replaces it. `GATE_SCRIPTS` stays: `:1059` uses it.
- `behavior-gating.test.ts:996` (the twin test: Firefox filter = Chrome's, re-pointed, plus `setup-geckodriver`) holds unchanged under the derivation, because the geckodriver steps' `if:` is decided per lane.
- `firefox-driver.test.ts:149-153` and `behavior-gating.test.ts:1094-1115` pin `setup-puppeteer/action.yml`; this lane leaves that file alone.
- `docker-ci-like-pins.test.ts` refuses a `curl`/`wget` outside `fetch_pinned` and a `command -v bun|node` in a conditional; the Chrome line uses neither.
- Open issues: none collide (`gh issue list --state all --search "docker-ci-like OR ipv4first OR paths-filter"`). Closed known limits: none in this area.
- Observation, not taken: CI's `setup-puppeteer` restores the Chrome cache after `bun install` has already run the postinstall. The restore therefore saves no download; it only stands in when that download fails. The cost is a download per job. Nothing breaks.
