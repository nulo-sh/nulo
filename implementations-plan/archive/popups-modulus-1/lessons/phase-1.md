# popups-modulus-1: phase 1 (shared primitives)

- `isValidHex` removal: the two generated auto-import files (`types/auto-imports.d.ts`, `types/.eslintrc-auto-import.json`) only regenerate through a vite build (`bun run build:chrome`); the extension's vitest config sets `dts: false`. Each lost exactly the `isValidHex` lines.
- Gate: lint, typecheck:all, `bun run test` and `bun run test:all` green at the first run; package suites and the extension paths green at retry 0. No red to record.
