# Phase 2: #1391 password rule

- 2026-10-30 `utils/password.ts` counts graphemes with a module-level `Intl.Segmenter`; the loop counts segments without building an array. Nine cases pass on Bun 1.4.2; at the base copy five fail (four emoji, seven accented letters, seven ZWJ families, eight ZWJ families reading "Long enough" by units, and the strength unit case). Lint and `typecheck:all` exit 0.
