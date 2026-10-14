# Phase 7 — excludes out, full gates

- `bunfig.toml` restored to `dev`'s bytes (`git diff --quiet origin/dev -- bunfig.toml`); `bun install --frozen-lockfile --force` exit 0, `bun.lock` unchanged, residue check passes.
- Audit: `bun audit --audit-level=low --json` (exit 1), `audit-gate.ts --mode enforce`: 41 acknowledged, 0 unacknowledged, 0 stale, 0 unreadable. Two acks reopen on "the next Aztec bump"; both re-judged under rc.3:
  - **undici, busboy, ws, uuid.** undici 5.29.0 (with busboy) comes from `@aztec-labs/foundation@6.0.0-rc.3`, ws 8.18.3 from `@aztec/viem@2.38.3`, and uuid 9.0.1 from gaxios/teeny-request under `@google-cloud/storage`, which `@aztec-labs/stdlib@6.0.0-rc.3` depends on.
  - **OpenTelemetry 1.x and systeminformation**, from `@aztec-labs/telemetry-client@6.0.0-rc.3`.
  - Neither rc.3 build's `THIRD-PARTY-NOTICES.txt` lists any of them. Each reason now says "6.0.0-rc.3 line"; `revisit` stays "the next Aztec bump".
- Final review (Codex `01a13ca0`) found the pages' Presto status asking about `6.0.0-rc.3` while the SDK's prover sends its bb.js pin, `6.0.0-rc.6`, as `x-aztec-version`. Presto matches the string exactly, so with rc.6 cached, onboarding and Settings showed a pending download. Fixed with `__BB_VERSION__`; the regression test reads the Presto SDK's own bb.js pin. The version-mismatch copy now names the bb release, while About still shows the labs line.
