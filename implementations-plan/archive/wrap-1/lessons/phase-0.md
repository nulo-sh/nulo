# wrap-1: phase 0 (planning)

## Measurement

- The issue's premise did not hold: a full backup carries no network rows (`reseedNetworksStage`), so a name in these texts is a seed or a name the person typed through a 25-character field. Measured with names the field accepts instead of the brief's 60-character run, which no supported path stores; the 60-character run was measured too and is recorded.
- The capture drove SE2's path in a real build (local node refused, rename through `appStore.renameNetwork` via the page's pinia, then the banner, Restore again, restore, Retry), measuring each text's last line box against its box's content edge at 360 and 240 px. The document never scrolls sideways, so an overflow is clipped, not scrollable.
- A trial of D1-D3 (built, measured, reverted) contained every name and left seed-name layouts identical to the pixel.

## Consults

- **Codex, gpt-6.1-sol, high, read-only (session 01a18d49), plan round 1: conditional approve.** Its findings:
  - a backup's held-account name (≤32 cleaned characters) reaches the warning;
  - "widest name" is false (U+FDF2 passes the sanitizer);
  - I1 needs scoping;
  - SE1's existing 240 px check should carry a 25-character name.

  All accepted.
- **Opus 5.5 (Plan), plan round 1: conditional approve.** Its findings:
  - the held-account path (the same as Codex's);
  - the caller-guard evidence (`isTrustedInternalSender`, not missing external listeners);
  - `restoreAgainFailedText` unnamed;
  - recon's file count;
  - mount controls tautological in `restore-again.test.ts`;
  - the Firefox bar;
  - picture links after the archive move;
  - an owner ask for sign-off.

  All accepted except the owner ask: the lane brief rules on it and the dissent is recorded. Also rejected: dropping the mount controls in the form and the banner.
- **Codex, resumed, round 2: conditional approve.** Two documentation fixes: recon's leftover "widest", and `held32` checked in the warning only. It endorsed both Opus rejections.
- **Codex, resumed, round 3: approve.**
