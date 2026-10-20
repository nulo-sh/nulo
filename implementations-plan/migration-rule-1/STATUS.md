# migration-rule-1 status

- 2026-10-19 adopted the lane worktree at `60fde7e7`; recon done (3 Sonnet explorers).
- 2026-10-19 plan A and outline B drafted; dual audit next.
- 2026-10-19 round 1: Codex reject, Opus conditional approve; plan revised (hybrid registry, decoded goldens, unconditional pins, capture and replay, OA-1/OA-2 facts); final fresh Codex pass next.
- 2026-10-19 final fresh pass r1: Codex reject (described-schema drift, migrated shapes unchecked, MAC and key identity); all accepted (D19); resuming.
- 2026-10-19 final pass r2: Codex conditional approve; four conditions fixed (D20); resuming to verify.
- 2026-10-19 final pass r3: Codex approve. Plan committed; A1 next (branch `migration-rule-1-a1`), the Firefox mechanism spike first.
- 2026-10-19 A1 phase 1 green: stores built from `wallet/storage/stores.ts`, every key family in `stored-shapes.ts`, decoders exported, the scan (negative demo logged). A3 step 1 run: a relaunch reports `install` on both browsers, an in-session reinstall `update` (D21).
- 2026-10-19 A1 phase 2: emitter, baseline harness, generator (`bun run baseline:storage`), R1-R4, writer round trips; goldens being authored.
- 2026-10-19 A1 phase 2 green: 82 goldens, generator idempotent, every scratch-edit demo red where the plan says (lessons/phase-2.md). Gates and the review loop next.
- 2026-10-19 A1 review loop closed: Opus conditional approve, Codex r1 reject → r2 reject → r3 approve, every finding fixed (D22, D23); all gates green; draft PR next.
- 2026-10-19 A2 phase 5 built: the unchecked-passkey refusal ships OA-1 A; shots taken, the three-line clamp found and put to the owner in OA-1 (D added); gates and the review loop next.
- 2026-10-20 A2 review loop closed: Codex r1 approve (one P3) → r2 approve; Opus conditional approve, all applied (D-A2-3, OA-1R); shots retaken; Chrome smoke green at retry 0; Firefox smoke next.
