# Phase 7 — excludes out, full gates

- `bunfig.toml` restored to `dev`'s bytes (`git diff --quiet origin/dev -- bunfig.toml`); `bun install --frozen-lockfile --force` exit 0, `bun.lock` unchanged, residue check passes.
- Audit: `bun audit --audit-level=low --json` (exit 1), `audit-gate.ts --mode enforce`: 41 acknowledged, 0 unacknowledged, 0 stale, 0 unreadable. Two acks reopen on "the next Aztec bump"; both re-judged under rc.3:
  - **undici, busboy, ws, uuid.** undici 5.29.0 (with busboy) comes from `@aztec-labs/foundation@6.0.0-rc.3`, ws 8.18.3 from `@aztec/viem@2.38.3`, and uuid 9.0.1 from gaxios/teeny-request under `@google-cloud/storage`, which `@aztec-labs/stdlib@6.0.0-rc.3` depends on.
  - **OpenTelemetry 1.x and systeminformation**, from `@aztec-labs/telemetry-client@6.0.0-rc.3`.
  - Neither rc.3 build's `THIRD-PARTY-NOTICES.txt` lists any of them. Each reason now says "6.0.0-rc.3 line"; `revisit` stays "the next Aztec bump".
- Final review (Codex `01a13ca0`) found the pages' Presto status asking about `6.0.0-rc.3` while the SDK's prover sends its bb.js pin, `6.0.0-rc.6`, as `x-aztec-version`. Presto matches the string exactly, so with rc.6 cached, onboarding and Settings showed a pending download. Fixed with `__BB_VERSION__`; the regression test reads the Presto SDK's own bb.js pin. The version-mismatch copy now names the bb release, while About still shows the labs line.
- Merged `dev` at `50898ed8` (#433 moves the long shard-4 files into a heavy job, plus #426 and #435). The merged code keys on `CHAIN_IDS` only. The frozen install made no change and the residue check passed. `audit:vue`, `test:all`, `test:ci-gating`, `test:release` and `build-storybook` each exited 0. The audit gate (enforce) reported 41 acknowledged and 0 unacknowledged. `lockfile-exception-diff` against `dev` found 44 Aztec-scope moves (23 `@aztec-labs`, 19 `@aztec-foundation`, 2 `@alejoamiras`), with `exceptions`, `added` and `removed` empty.
- CI on `50898ed8`: all five required aggregators pass, with no reds. In the canary job (prover-ON, presto-server 1.1.3), Chrome and Firefox each logged "12 /prove requests, 12 successful proofs".
- `50898ed8` passed the whole e2e gate at retry 0:
  - smoke: Chrome 1388 s, Firefox 2073 s;
  - network, proverless: Chrome 6518 s, Firefox 7524 s;
  - canaries: 4/4 per browser, 6 proofs each.
- `dev` then moved: #437 changed `bun.lock`, and #436, #445, #453, #454 and #467 landed, among others. The PR still merged cleanly, but #453 and #454 touch profile creation and account files next to the export gate, so `dev` was merged again at `9e905c9b`. That merge left `bun.lock` unchanged under a frozen `--force` install and added no rc.1 literal (each hit predates it). `bunfig.toml` equals `dev`. The unit, release, Storybook, audit and lockfile gates repeat with the same results.
- Final head `9e905c9b`, every e2e suite at retry 0 (`e2e:agent` owns its services; one run at a time):

| Suite | Chrome | Firefox |
|---|---|---|
| Smoke (armed build) | 55 files, 238 tests, 1561 s | 57 files, 237 tests, 2193 s |
| Network, proverless | 118 files, 219 tests, 6558 s | 118 files, 217 tests, 7784 s |
| Canaries, prover-ON | 4/4, 253 s, window 10:08:54–10:13:07Z | 4/4, 303 s, window 10:13:07–10:18:10Z |

  - Canaries ran through presto-server 1.1.3 (private `PRESTO_HOME`, bb 6.0.0-rc.6 cached). Each window logs 6 "Requested Aztec version version=6.0.0-rc.6" and 6 "Proving succeeded", with no error and no failed proof. The server was stopped afterwards.
  - Skips are opt-ins or browser-specific and match `dev`:
    - smoke: `shipped-token-list` (it needs the live leg; M7 says it proves nothing here), the console-capture probe, and on Chrome the two Firefox-only files;
    - network: chaos, store captures, the standard-contracts opt-in that nothing sets, a probe, and on each browser the other one's file.
- CI on `9e905c9b` passes every required aggregator, and the canary job logs 12/12 proofs per browser.
- Per-browser wall-clock against `account-session-life-closeout` `d2a41ef6` (#467, whose squash is this merge's `dev` base). Figures are workflow wall-clock / summed job time; no e2e scenario is added:
  - Network Chrome: 1111 s / 7386 s here, 1069 s / 7202 s there.
  - Network Firefox: 1237 s / 8095 s here, 1243 s / 8253 s there.
  - Smoke Chrome: 697 s / 1605 s here, 655 s / 1587 s there.
  - Smoke Firefox: 981 s / 2030 s here, 943 s / 2002 s there.
- `reference/nulo-v6.1` re-resolved under its own gate at 12:22:41Z on 2026-10-15. The newest name in its graph is `@aztec-labs/simulator@6.0.0-rc.3`, published 2026-10-08T12:21:12Z, so it cleared the 7-day gate at 12:21:12Z. The lock was deleted, then `bun install` ran with no exclude and exited 0 (388 packages). `bun derive-vectors.ts` matches the committed `vectors.json` byte for byte. The `bunfig.toml` comment is now true as written.
- Against the bypass lock there is one move. `mime-db` resolves 1.54.0 for `compressible`'s `>= 1.43.0 < 2` range; it was published 2025-03-18, is data only (`db.json`), has no install hook and carries a registry signature. Its publisher, `wesleytodd`, is a listed maintainer. 1.52.0 nests under `mime-types`' exact pin.
- Against `reference/nulo-v6/bun.lock`, 19 third-party entries changed and 2 were added; all were published 2026-09-25..10-07 except the two `mime-db`s.
  - Each publisher matches the version it replaces, except `mime-db` (see above). The `@smithy/*` and `fast-xml-parser` versions carry provenance.
  - The only install hook is `lmdb`'s `node-gyp-build-optional-packages`, identical in 3.5.6. It loads the prebuilt `@lmdb/*` binaries from the same publisher, and Bun's default trust list runs it. protobufjs's postinstall stays blocked, as before.
  - None of the newly selected versions is in the root lock (the nested `mime-db@1.52.0` already is), and no workflow installs the reference project: they reach only a developer who regenerates the vectors.
