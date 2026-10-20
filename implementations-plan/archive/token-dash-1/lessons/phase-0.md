# Phase 0: recon, plan, panel

- **Recon.** One Explore agent (sonnet) over the preview's callers and renderers, the stored token's surfaces, the empty-value dash and the card's tests; direct reads of `decodeUtf8`, `stripWireControl`, the approve payload and the add's comparison. Findings in [recon.md](../recon.md).
- **Probe.** Bun 1.4.2, the sanitizer's strip regex then `.trim()` over the wire shapes: empty, spaces, tab and newline, U+200B and U+FEFF go blank; U+00A0 and U+3000 go blank only through `trim()`; U+3164, U+2800 and a lone U+0301 survive both (plan Fact 6).
- **Claim that did not hold.** The lane brief's "find where [the dash] lives and reuse it; never a second copy": the wallet has no shared dash, only 24 inline literals. D2 settles it.
- **Codex plan audit** (gpt-6.1-sol high, session `01a158df-d15c-75c3-b9ce-8a75348c2d0b`): conditional approve, C1 accepted, C2 (a shared constant) argued on resume and withdrawn; on the same resume it checked the scratch picture scripts and asked for three spec fixes, all made.
- **Opus 5.5 Plan lens:** conditional approve, O1-O7, all accepted.
- **Codex final fresh pass** (session `01a158ed-40ee-7ac1-9d6a-d4aadb97e703`): approve, no finding.
