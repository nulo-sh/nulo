# Arc 1 (phases 1 and 2): implementation log

- The plan commit was rebased onto `dev` `c8aa0374` (#812 landed after planning); `index.md` conflicted on adjacent new lines and keeps both.
- An exported function under `src/utils/` is auto-imported, so the build regenerates `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json`; they are committed with the change (`fbc6f3d6`).
- Phase 2's new page case is red with `configService.onUpdate.add(onSettingUpdate)` removed (mutation check), so it pins the subscription the reorder moved.
- Rendered identity: the structure-2 capture spec, cut to the Developer page (Developer Mode off, then on). Base against head: 8 of 8 files byte-equal. Base against a second base run: one pixel of `developer-on-dark.png` (23,343; blue 8 against 14), the edge of the "1 recent failure" caption; the head equals the first base there. Text antialiasing on that run, not a change.
- Review loop: Codex r1 `findings: 1` (caller-naming doc comments, removed); Opus `changes requested` (an assertion that could not fail, removed; the passkey builder name; a TSDoc example), all applied in `893e9eb0`; Codex r2 `clean`.
