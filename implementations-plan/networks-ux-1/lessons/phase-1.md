# Phase 1: arc 1

## 1.1 `SettingItem` link row with controls

- Red at the base (`f94ca3331`, `origin/dev` merged): `bun --bun vitest run src/components/ui/Settings/Settings.test.ts`, 1 failed | 39 passed. The controls case failed on its first check, `expected 'A' to be 'DIV'`; the default-shape pin passed.
- Green after the change: 40 passed. Root `bun run lint` and `bun run typecheck:all` exit 0.
