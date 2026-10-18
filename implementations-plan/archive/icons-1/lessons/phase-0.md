# Phase 0: planning consults

## Scratch evidence

- Stroke sheets (`~/.cache/nulo-backlog/icons-1/shots/stroke-{light,dark}-dpr{1,2}.png`, Chrome headless): the 58 Tabler picks at 14, 12, 10 and 9 px, stroke 2 beside `max(2, 24/size)`. At 1x the 10 and 9 px glyphs at stroke 2 read visibly fainter (the `public` mark's dashes nearly vanish at 9 px); at 2x the two are close. At 12 px and up the two are identical by construction.
- Scanner count: 18 of 169 Tabler paths match `\b[MA][0-9]+\.[0-9]+\b`; a space after `M` clears every one.
- Integrity: the showcase tarball's sha512 equals the registry's; tag v3.49.0 LICENSE and the 58 icons' path data equal the tarball's.
2026-10-18 icons-1 I1: nonzero vs evenodd, 0 differing pixels of 37201/39310/21591 inked at 10x (square-check, square, filter)

## Consults

- Codex R1 (gpt-6.1-sol high, session 01a14f13-dc29-7501-b943-33f2e6c9a45c): conditional approve. Key: the floor departs from the signed pictures (owner's), the glossary claim is a judgement, the no-op box breaks a literal bare-path rule, `@tabler/icons/package.json` maps to `icons/package.json` through the wildcard export. Confirmed I1 and Biome from the workspace.
- Opus R1 (Plan): conditional approve. Key: root-attribute allowlist, the version route through design's own manifest, bumps as UI changes, the raw URL for `cmp`, 19 tags under 12 px. Argued the floor stays in budget; its pixel read of the public mark at 10 px 1x (gaps close with the floor) decided against it.
- Codex final (fresh, gpt-6.1-sol high, session 01a14f28-43a5-73a2-b0d1-0c17dbc061b3): conditional approve, three conditions applied; resumed: approve. Node probe: vitest's `import.meta.resolve` searches from its own chunk under Node (breaks `test:watch`); use `createRequire(import.meta.url).resolve`.
