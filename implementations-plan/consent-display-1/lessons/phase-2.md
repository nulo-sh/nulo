# Phase 2: token text cleaned at every write

- 2026-10-18: `buildToken`, `restoreRow` and both import-title writes clean name and symbol with `sanitizeWireString` at the seeder's bounds, now exported from `token/seeder.ts`. With the four calls removed, both new cleaning cases fail; the plain-text control passes either way.
- 2026-10-18: the worktree's install was stale after branching from a newer dev (`@aztec-labs/standard-contracts/auth-registry/constants` unresolved): `bun install --frozen-lockfile` fixed it.
