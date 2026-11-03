# Phase 3 — store answers, SHASUMS and the arc 1 review

- 2026-11-03: Codex r1 showed the fake `gh` matched a substring (`commits/<sha>/pulls`), so a dropped `--jq` or another repository kept every pin green. It now matches the whole argument string and fails any unmatched call; the empty lookup is a named fixture.
- 2026-11-03: mutations against the tightened pins, each red: no `--jq` (2), another repo (2), a blanket catch around open-sync's parse (1), an eager `parsePulls` (2), lock-version's default Accept switched to raw (1).
- 2026-11-03: Opus r1 approve with three small items, all taken. Codex r2 (resumed) approve, no finding.
