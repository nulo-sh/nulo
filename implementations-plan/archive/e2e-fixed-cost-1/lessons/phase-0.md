# e2e-fixed-cost-1, phase 0: measurement and consults

All runs: this host, retry 0, scratch instrument patch and probe spec (never committed), run data under the scratch run directory.

## Measurements

- `probe-chrome-1` (08:43Z, load1 43-54) and `probe-firefox-1` (08:46Z): five fresh launch+register+close cycles, then five copy+launch+unlock+close cycles over one template profile. Tables in recon.md § Probes. Finding: every launch over a reused profile burns the first-run-tab poll's full 5 s on both browsers.
- `import-1`, `import-2` (08:49Z): four forks importing `fixtures/aztec.ts`, today's inline: 25.3 s, then 4.0-4.9 s. `import-3-gs`: the same after `global-setup` imported it in the main process: 22.1 s, then 4.4-5.8 s (no warming). `import-4-narrow`: inline narrowed to `@aztec-labs/accounts`: 2.1-2.5 s, but such a narrowing cannot hold at run time (recon § The aztec.js import).
- `native-1` / `inline-1` (08:58Z, 09:03Z): `holdings`, `tx-sendTx-default`, `wait-for-tx-mined` through `e2e:agent`, Chrome; native loading with the JSON-attribute hook and no aliases versus today. Both 3 of 3 green; the fixture import 2209 ms against 5276 ms; vitest's summed import 15.8 s against 29.9 s.

- `relaunch-chrome-1`, `relaunch-chrome-2` (load1 165), `relaunch-firefox-1` (load1 159): fresh launch, then two relaunches over the same profile, with a probe `onInstalled` listener. `install` on every launch, both browsers; after each relaunch's settle a `type: "popup"` window on `#/popup/auth` stays open (recon § Every launch installs). This refuted the first draft's F4 ("a reused profile never fires install"), raised by the Opus leg.
- `import-5-optimizer`, `import-6-optimizer-node` (load1 224, 207): vitest's SSR dependency optimizer over the 17 entry points `fixtures/aztec.ts` imports. Bundled, then every fork failed on `buffer.constants` in pino's `thread-stream` (npm `buffer` bound in place of Node's); `platform: "node"` changed nothing. Two attempts, stopped.

## Consults

- **Codex round 1** (gpt-6.1-sol, high, read-only): the first run was killed by the 10-minute default timeout of a background shell before it answered; resumed from its thread id with a 60-minute timeout, it answered **reject**: the JSON-attribute hook is a monkey-patch of Node's loader; `alongside` cannot release what `launchOnLocalNetwork` and `createTestWallet` leak on their own failures; the isolation pin proves config values, not independence; the gates measured file durations, which exclude collection and import. Plus the F6 inventory, D1's wording, and the reused-profile skip as unsafe.
- **Opus Plan leg**: **conditional approve**: F4 false (confirmed by the relaunch probe), the Phase 1 unit test cannot spawn Node under `bun --bun vitest`, Phase 2 shares the fork's event loop with the guard's canary, gates to pair and interleave, the pin a change detector.
- **Codex round 2** (resumed): **conditional approve**: find the converted window by a channel Chrome exposes without the `tabs` permission (its `windows.getAll` tab URL is null); keep the fresh-install id requirement; name vitest's `import` as the summed collection; Chrome relaunches 7.6-8.8 s. `relaunch-firefox-2` (load1 188) then showed the popup as a Puppeteer page target on Firefox too (Chrome's already did), so the plan reads page targets, as `waitForPopup` does. All four conditions taken.
- **Final fresh Codex pass** (new session): **conditional approve**: confirm the popup close (BiDi `close()` swallows a failure; `closeConfirmed` exists), make the relaunch probe assert cleanup and timing with a negative control, correct the #991 quotations. All taken; the verification turn on the same session: **approve**.
- **Call:** the plan dropped native loading (a known limit: the hook needs an owner exception, the package patches too much mass, the optimizer fails), the concurrent setup and the pin; the first-run read now settles every launch on the tab or the window it became.

## Notes

- One recon explorer wrote and deleted a scratch file under the system temp directory despite its read-only brief; nothing reached the worktree.
