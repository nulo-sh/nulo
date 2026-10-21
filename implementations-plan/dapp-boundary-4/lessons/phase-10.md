# Phase 10: arc 2 gate and review loop

- Arc review round 1: Codex `reject` (two P2, two P3), Opus `conditional approve` (two lows matching Codex's P2s, nits); all applied (plan § Review verdicts, D12). Both P2s got a regression red against the pre-fix sources: the rejected-read case and the deletion-overtaken composition case.
- Chrome e2e on the pre-review head: `senders-advanced`, `contracts-register`, `data-registerSender` green at retry 0; re-run on the final head.
- Arc review round 2: Codex `reject` (one P2, two P3); all applied. The re-import regression is red without the dispatcher's fence forward. `dispatcher.ts` changed again, so the type-roles inventory's three digests were re-attested and re-pinned and the quoted evidence line updated.
