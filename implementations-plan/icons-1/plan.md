---
plan: icons-1
tier: mid
status: approved by the panel (final Codex pass: approve), arc 1 next
issues: "#764 (closed by the one arc)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); dual audit (Codex gpt-6.1-sol high, Opus Plan); one fresh Codex pass
base: origin/dev at 9470d4e9
trunk: dev
post_implementation_hardening: not scheduled
---

# icons-1: the wallet's 58 glyphs drawn from Tabler Icons

One arc, one PR against `dev`, `Closes #764`. Every glyph in `packages/design/src/core/glyphs.ts` becomes the Tabler Icons 3.49.0 icon the owner signed on decision page 48; glyph names and every call site stay as they are. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Issue claims that did not hold

- **"The glyphs draw at 9 to 24 px"** (lane brief): sizes run 9 to 48 px (`lock` 48, `app` 40, `PasskeyScreen` 36, `history` 32; recon Fact 9). Nothing changes for it: one viewBox serves every size.
- **"The libraries use circle, rect, line and polyline"** (showcase report § 3): not for Tabler's 58 picks, which are 169 `<path>` elements and nothing else (recon Fact 1). The `Glyph = { s?, f? }` shape carries them unchanged.
- **"The state pairs (… `square-half` …) use Tabler's native outline and filled variants"** (lane brief): the signed pick for `square-half` (waiting) is Tabler's outline `hourglass`, not a square. It ships as signed.

## Outcome & Quality Bar

- **For whom**: a person using the wallet on Chrome or Firefox, on a 1x or a 2x display, and the maintainer who adds the next glyph.
- **Excellent looks like**:
  1. Every glyph is a Tabler icon as Tabler publishes it, and a test fails if one path differs from the pinned release. Nobody hand-draws or hand-edits a glyph again.
  2. Each screen reads as the signed pictures did: same icon per site, same size, same colour, same stroke. The PR shows the glyphs under 12 px at 1x and 2x, on Chrome and Firefox, so the owner sees them where they are thinnest.
  3. The shipped notices name Tabler Icons with its MIT text and the release it came from; the build refuses nothing and loosens nothing.
  4. A maintainer adds a glyph with one line and one command.
- **Good enough**: the five near rows ship the signed picks; no new glyph, size or layout.

## UI impact

- **Every icon on every screen** becomes its Tabler drawing. Signed, P48-01 (2026-10-18 12:38Z, #764): *"option C: Tabler 3.49.0 (MIT): 53 exact, 5 near; outline and filled sets, maintained"*, on the pictures named in `program-2/shots/manifest.json` (`p48-icons-*`).
- **Stroke and size** (lane brief, the plan's to settle): *"The plan states the stroke width and viewBox the table binds and proves every size in the inventory still reads … No stroke tuning per glyph unless the plan names the glyph and shows why."* The table binds viewBox `0 0 24 24` and stroke 2 with round caps and joins at every size, as signed: no floor, no per-glyph tuning (D3). The 19 tags under 12 px (`open`, `copy`, chevrons, the marks, `warning`, `square-check`) draw 0.75 to 0.92 px lines, as on the signed pictures; the PR shows them at 1x and 2x.
- **The marks** (lane brief): *"a private balance is a solid square, a public one is the square you can see through."* Tabler's filled `square` and outline `square-dashed`, as signed.
- **Near rows** (lane brief): *"where the showcase lead's choice reads wrong on the real screen, the plan may swap to another Tabler icon with a picture."* No swap (D5).
- **Not changed**: names, sizes, colours, `aria-*`, tooltips, layout, copy, the glossary text (D6).
- The PR body carries before and after pictures (Phase 3).

## Assumptions

**Facts** (recon.md, by number): all picks are path-only beside Tabler's no-op box (1); tarball and tag integrity (2); 3.49.0 past the age gate (3); 18 paths trip the milestone scanner (4); the root `fill` is pinned by e2e (5); the unit pins on the old drawing (6); no CSS reaches inside an icon (7); orientation of `chevron`, `more`, `forward` (8); the size inventory (9); the glossary text (10); the docs that become false (11); the `DERIVED` contract (12); `boundary.test.ts` bans `v-html` and `@nulo/*` in `packages/design/src` (14). Tabler's three filled picks paint the same pixels under `nonzero` and `evenodd` (0 of 98 102 inked pixels differ at 10x, Chrome, confirmed by Codex; `lessons/phase-0.md`).

**Inferences**:
- I1. At 1x, glyphs under 12 px look fainter at stroke 2 than with a 1 px floor (peak darkness 142-168 of 224 against 171-193 at 10 px), but no fainter than 12 px diagonals at stroke 2 (51-65 %), which nobody disputes. Measured on scratch sheets, not a contrast test (`lessons/phase-0.md`).
- I2. The wallet-bugs-2 arc lands first or near this one. Its marks move 9 → 12 px; this lane's pictures are taken after merging `dev`.

**Asks**: none open. A1 (a stroke floor) is settled as stroke 2 at every size, as signed (D3). A2 (the glossary) is settled as no change (D6); Phase 3's 1x crop of a 10 px public mark is the check.

## Architecture & Implementation

**Proposed architecture.** The token pattern, applied to glyphs (recon reuse map):

- `src/core/glyph-sources.ts` (new, hand-edited): each glyph name → its Tabler icon, `"coins"` for an outline icon or `"filled/square"` for the solid variant. The only file a maintainer edits.
- `src/internal/render-glyphs.ts` (new, pure): `tablerGlyph(svg, filled): Glyph` parses one published SVG and refuses anything `Icon.vue` cannot draw. It reads the whole document. It first drops the exact no-op box element every published file carries (`<path stroke="none" d="M0 0h24v24H0z" fill="none" />`). It then throws on a root attribute outside Tabler's set (`xmlns`, `width`/`height` `24`, `viewBox` `0 0 24 24`, `class`, and the paint attributes), on an outline root whose paint is not `fill="none"`, `stroke="currentColor"`, `stroke-width="2"` with round caps and joins, on a filled root whose fill is not `currentColor` or that carries any stroke or `fill-rule` attribute, on a child that is not a bare `<path d>`, on a duplicate `d` (a Vue key), on an empty icon, and on any other content: no transform, paint override or element is dropped in silence. A strict string parser in small functions (no `DOMParser`, which Bun's node environment lacks), inside the complexity budget. It writes a space after each `M` or `A` that precedes a number (recon Fact 4). Outline paths go in `s`, filled in `f`.
- `scripts/gen-glyphs.ts` (new, Bun CLI, outside `src/` like `gen-tokens.ts`) and `"gen:glyphs"` in `packages/design/package.json`: resolve each source with `createRequire(import.meta.url).resolve("@tabler/icons/<variant>/<name>.svg")` and write `src/core/glyphs.ts`, every string through `JSON.stringify` as `render-tokens.ts` does; the script entry chains `biome format --write src/core/glyphs.ts` (Biome is on PATH only under `bun run`).
- `src/core/glyphs.ts` (generated): header (generated from `glyph-sources.ts`; Tabler Icons 3.49.0, MIT, recorded in the notices; paths as published but for a space after `M`), `Glyph`, `glyphs` (`as const satisfies Record<string, Glyph>`), `GlyphName`. Same names, same shape, same exports.
- `src/core/glyphs.drift.test.ts` (new, `@vitest-environment node`): `glyphs` deep-equals `tablerGlyph` over `glyphSources`, each SVG resolved with `createRequire(import.meta.url).resolve("@tabler/icons/<variant>/<name>.svg")`, anchored at the test file (vitest's own `import.meta.resolve` searches from its chunk under Node, which breaks `test:watch`), and its key set equals `glyphSources`'. It asserts design's `package.json` declares `@tabler/icons` exactly `3.49.0` (the root manifest is not exported; a frozen install makes declared equal installed); the failure message says a bump edits the `DERIVED` record and is a UI change needing pictures and owner sign-off. A deep-equal, not the token byte pin, so Biome owns the formatting.
- `@tabler/icons` `3.49.0`, exact, a **devDependency** of `@nulo/design`: no runtime import, nothing new in the extension bundle but the 58 path strings.
- `src/core/Icon.vue`: root keeps `fill`/`stroke` `currentColor` (Fact 5) and the single root; `stroke-width="2"`, `stroke-linecap`/`stroke-linejoin` `round`, all static; `f` paths drop `fill-rule="evenodd"` (D4).
- `third-party-notices`: one `DERIVED` record, `{ name: "Tabler Icons", version: "3.49.0", license: "MIT", source: "https://github.com/tabler/tabler-icons/blob/bbed884d15354b5cebf2493371f20dc2d5e83eaf/LICENSE", texts: ["tabler-icons.MIT.txt"], note }` (the commit, since a lightweight tag can move). The note names `glyphs.ts`, tag `v3.49.0`, the npm sha512 and the `M` spacing. `texts/tabler-icons.MIT.txt` is the tag's `LICENSE`, byte for byte. `expected-minimum.txt` gains `Tabler Icons` beside `Azguard Wallet`.

**Data and control flow.** Build time only: `gen:glyphs` → `glyphs.ts` (committed). Test time: the drift test re-derives and compares. Run time: `Icon.vue` reads `glyphs[name]` as today.

**File-level change map.**

| File | Change |
|---|---|
| `packages/design/package.json`, `bun.lock` | `@tabler/icons` `3.49.0` devDependency; `gen:glyphs` script |
| `packages/design/src/core/glyph-sources.ts` | new: 58 rows |
| `packages/design/src/internal/render-glyphs.ts` | new: `tablerGlyph` |
| `packages/design/scripts/gen-glyphs.ts` | new: writes `glyphs.ts` |
| `packages/design/src/core/glyphs.ts` | regenerated |
| `packages/design/src/core/glyphs.drift.test.ts` | new |
| `packages/design/src/internal/render-glyphs.test.ts` | new: one refusal per class (D7) |
| `packages/design/src/core/Icon.vue` | weight, caps, joins, fill rule, comment |
| `packages/design/src/core/Icon.test.ts` | rewritten to the new contract |
| `packages/design/src/core/Icon.stories.ts` | sheet sizes 24, 14, 12, 10, 9 |
| `packages/design/README.md` | § Icons: source, weight, adding a glyph |
| `packages/third-party-notices/src/policy.ts`, `texts/tabler-icons.MIT.txt`, `expected-minimum.txt` | the record |
| `implementations-plan/icons-1/screenshots/` | before and after pictures |

No file under `apps/` changes. `send-outcome-rows`, `icon-names`, `PermissionRow`, `mount-all` hold unchanged (Facts 5, 6).

**Trade-offs and alternatives.** Outline B and the plain copy are in the ledger (D1). Keeping the `{ s, f }` shape over a new `{ d, filled }` shape: Tabler icons never mix the two, but the old shape costs nothing and keeps every reader as it is.

### Outline B (competing): resolve glyphs from the package at build time

`@tabler/icons` becomes a runtime dependency of `@nulo/design`. `glyphs.ts` maps each name to `import x from "@tabler/icons/outline/coins.svg?raw"` (58 imports). A small parser turns each SVG into `{ s, f }` at module load. The notices walk attributes the package by itself (MIT, ships `LICENSE`), so no `DERIVED` record exists. Exact by construction, no generator, no drift test. Costs: 58 raw SVGs in the bundle (about 24 kB, against 9 kB of paths); a parser in shipped code; a version bump redraws every glyph with no failing test and no path in the diff. (Attribution would work: the notices walk strips the `?raw` query and finds the package's manifest, traced by Codex.)

## Decision ledger

- **D1. How the paths enter the tree: generated table, drift test, devDependency** (Proposed, recon reuse map). *Rejected*: the plain copy (no dependency, no test): it is the cheapest, but the next hand edit or wrong paste passes every gate, the failure the owner named in #764. *Rejected*: Outline B: it ships a parser and the raw files, and a bump changes every glyph silently; the generated table ships data only and fails loudly. *Rejected*: `@tabler/icons-vue`: a component per glyph, its own root attributes, and a runtime dependency for 58 paths. *Rejected*: Tabler's `tabler-nodes-*.json`: not exported, and they drop the root attributes the parser checks. Cost accepted: each install adds 11,446 files (11.3 MB) for 6.8 kB of path data.
- **D2. The `M` spacing**: a space after each `M`/`A` before a number, written by the renderer and named in the record's note. *Rejected*: storing paths as `.json` (skipped by the scanner): one more file and a JSON import for the same data. *Rejected*: exempting `glyphs.ts` from the scanner: it loosens a gate.
- **D3. Stroke**: 2 units at every size, round caps and joins, static attributes: what the owner signed and what Tabler draws. *Rejected* (Opus for, Codex against): a 1 CSS px floor, `Math.max(2, 24 / size)`. It changes only the 19 tags under 12 px, by 9 to 33 %, which no signed picture shows. Opus's own pixel read decides it: at 10 px on a 1x screen the floor closes the gaps of the `public` mark's sides (`+-=--=-+` at stroke 2, `*-====-*` with the floor), the one glyph whose meaning is its gaps. The faintness it would fix is no worse than 12 px diagonals at stroke 2 (I1). *Rejected*: today's 1.5 px floor (`36 / size`): it thickens every 14 and 12 px glyph past the signed pictures.
- **D4. Fill rule**: `f` paths use the SVG default `nonzero`, as Tabler draws them. *Rejected*: keeping `evenodd`: it paints the three picks alike (Facts), but would hollow any future filled icon built from overlapping subpaths.
- **D5. Near rows, as signed**: `private` → `filled/square` (a solid square, the wall); `public` → `square-dashed` (the square you see through); `mail-lock` → `mail` (Tabler has no padlocked envelope; "See private events" carries the meaning); `faucet` → `droplet` (no tap in Tabler); `network-edit` → `world-pin` (no globe with a pencil). *Considered*: `world-cog` for `network-edit` (network settings rather than a place). Not taken: `world-pin` does not read wrong under "Selected network for editing", and the owner saw it.
- **D6. Glossary unchanged**: no wording change is proposed, so none needs the owner. "A solid square" is what `filled/square` draws. For "a dotted square" the panel records a judgement, not a proof: `square-dashed`'s sides are round-capped 1-unit dashes (3 by 2 units, 2-unit gaps) with curved corners; at 12 px and at 2x the pixels show separate dots (Opus). Phase 3 crops a 10 px public mark at 1x and gates on a gap per side. If it reads as a plain outline, the crop goes to `OWNER-ASKS.md` (the mark against the text) and the arc stops before its PR until the owner answers: no wording is chosen here, and no swap fixes it, since `square-dashed` is Tabler's only see-through square.
- **D7. Tests**: the drift test (every glyph is the pinned release's, and the declared version); `render-glyphs.test.ts` with one case per refused class (a non-path child, a child attribute, an extra root attribute, a wrong paint attribute, a duplicate `d`, an empty icon) beside one accepted outline and one accepted filled icon, each fixture carrying the no-op box. Fixtures use no decimal glued to `M` (the milestone scanner reads tests too); the spacing is proven by `test:ci-gating` over `glyphs.ts`. `Icon.test.ts` rewritten (D8). No new e2e scenario: the smoke suites on both browsers gate the sizes, and Fact 5's pin proves the root paint. *Rejected*: a path-grammar regex on `d`: a `d` reaches the DOM as an attribute, so it guards nothing the element allowlist does not.
- **D8. `Icon.test.ts` after the change**: stroked paths are unfilled, the stroke is 2 at 24 and at 9 px, caps and joins are round; a filled glyph's path has no stroke and no `fill-rule`; the root keeps `fill`/`stroke` `currentColor` and `role="img"`; `private` is one filled path, `public` stroked paths only, neither equals `lock`; `rotate` and the unknown-name cases (`check` draws one path, which also catches a kept no-op box) are unchanged. The old `square-check` two-subpath case goes: the drift test pins that path.
- **D9. Order**: build on `dev` as it stands; merge `dev` and retake the mark pictures if wallet-bugs-2 lands first. Neither lane edits the other's files.
- **D10. Bumps are UI changes**: `README.md` § Icons and the drift test's failure message say a Tabler bump or a regeneration that changes a path is a UI change: pictures and owner sign-off, and the `DERIVED` record edited in the same PR. A mapping edit in `glyph-sources.ts` is one too; review is its guard (Codex, Opus).

## Security & Adversarial Considerations

- **Threat model.** The new input is third-party data (path strings) that every screen renders, including the approval windows, where a wrong picture could mislead a decision. An attacker would need to change Tabler's files: a compromised release or registry, or a hand edit in a PR.
- **Supply chain.** `@tabler/icons` is a devDependency, exact, 13 days old (6 past the 7-day gate), sha512 recorded in `bun.lock` and the record's note; CI installs frozen. It has no dependencies and no install scripts. The extension bundle gains no package, only data the drift test ties to the pinned release. A future bump is a deliberate PR whose diff shows every changed path and needs the owner's pictures (D10). The generator and the drift test share one parser, so both could agree on a wrong extraction: the allowlist refuses what it does not know, and the Phase 3 pictures are the independent check.
- **Injection.** Paths reach the DOM as the `d` attribute of Vue-rendered `<path>` elements, never through `v-html` (`boundary.test.ts`). The generator refuses any element or attribute beyond `<path d>`, so no `<script>`, `<foreignObject>`, link or event attribute can enter the table, and the table cannot change without the generator and the drift test agreeing.
- **Misleading pictures.** Names and meanings stay; the `lock` glyph still never stands for a private balance (`Icon.test.ts`). The approval windows keep their colour tokens.
- **Least privilege, cryptography, secrets.** None touched.
- **Licence.** MIT is on `ALLOWED`; nothing in the allowlist, `FONT_ALLOWED`, `OVERRIDES` or `VENDORED` changes.

## Phases

### Phase 1: the set from Tabler ✓

1. Run `cd packages/design && bun add -d --exact @tabler/icons@3.49.0`. Read `bun pm diff` and the lockfile hunk: one package, the recorded integrity.
2. Write `glyph-sources.ts`, `render-glyphs.ts`, `scripts/gen-glyphs.ts` and the `gen:glyphs` script. Run `bun run gen:glyphs`.
3. Write `glyphs.drift.test.ts` and `render-glyphs.test.ts`.
4. Change `Icon.vue` (D3, D4) and its comment; rewrite `Icon.test.ts` (D8); set the sheet story's sizes.

**Validation gate.** Commands: `bun run --cwd packages/design test`, `bun run lint`, `bun run typecheck:all`, `bun run test:ci-gating`, `bun run test:all`. Pass: every command exits 0; the drift test's key set equals `glyphSources`' 58 names; `test:ci-gating` passes `workflow-refs`; a scratch edit of one path in `glyphs.ts` makes the drift test fail, and reverting it passes. Layers: lint, typecheck, unit.

### Phase 2: attribution and docs ✓

1. Fetch `https://raw.githubusercontent.com/tabler/tabler-icons/bbed884d15354b5cebf2493371f20dc2d5e83eaf/LICENSE` into `texts/tabler-icons.MIT.txt`. Add the `DERIVED` record and the `expected-minimum.txt` line.
2. Rewrite `packages/design/README.md` § Icons: the source and its record, the weight (2 units, round), adding a glyph (one `glyph-sources.ts` line, `bun run gen:glyphs`, the sheet at 24, 14, 12, 10 and 9 px in both themes), and D10.

**Validation gate.** Commands: `bun run --cwd packages/third-party-notices test`, `bun run --cwd apps/extension build:full`, `bun packages/third-party-notices/bin/check-minimum.ts both apps/extension/dist`, `curl -sfL https://raw.githubusercontent.com/tabler/tabler-icons/bbed884d15354b5cebf2493371f20dc2d5e83eaf/LICENSE | cmp - packages/third-party-notices/texts/tabler-icons.MIT.txt`. Pass: all exit 0; each build's `THIRD-PARTY-NOTICES.txt` lists `Tabler Icons@3.49.0` under MIT. Layers: unit, build.

### Phase 3: proof on both browsers ☐

1. Check `uptime`: the one-minute load is under 150. Merge `origin/dev` first if it moved, and record its SHA as the baseline.
2. Build armed, then run the smoke suite: `cd apps/extension && VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome`, then `env -u EXTENSION_PATH NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --retry=0`. Repeat with `build:firefox` and `NULO_E2E_BROWSER=firefox`.
3. After both smoke runs, run the windows sweep on both browsers: `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/type-roles-windows.test.ts`, then the same with `NULO_E2E_BROWSER=firefox`. Never run smoke and network at once in this worktree.
4. Take the pictures with the showcase's scratch specs, reduced to one variant, copied in for the run and deleted after: on this head ("after") and on the recorded baseline SHA ("before": the same `dev` with none of this lane's commits), built in a scratch worktree under `~/.cache/nulo-backlog/icons-1/` after `bun install --frozen-lockfile`, removed after; both SHAs go in the PR body. Remove the showcase specs' library switch and its assertion. Rebuild armed before each smoke capture that follows a network run, under `env -u EXTENSION_PATH`. Add a capture of the send review's publish strip, which the showcase specs do not take. Home, the token page, Settings, the execute and connect windows; light and dark; 360 px popup, 400 px windows, device scale 2. The `Core / Icon` sheet from `build-storybook`: Chrome and Firefox, 1x and 2x, both themes. Cropped at 1x and 2x, scaled 4x nearest-neighbour: the marks at 9 to 12 px (Home's token row, the token page, the publish strip at 10 px), and one 10 px site that is no mark (`open` or `copy`). Commit them under `screenshots/`.

**Validation gate.** Commands: the four runs above, `bun run audit:vue`, `bun run --cwd apps/extension build-storybook`, `bun run check:plans` after staging. Pass: all exit 0 at retry 0 (`audit:vue` runs the extension's tests; design's ran in Phase 1); no glyph renders blank on any picture; the 1x crop of a 10 px public mark shows a gap on each side (D6), or the owner has answered the ask that check opens; the scratch specs are absent from `git status`. Layers: e2e (smoke both browsers, network windows both browsers), build.

## Delivery

Single arc, single PR against `dev` (the orchestrator's D-orch-1: no stack). Branch `icons-1-a1` off `origin/dev`, carrying the plan commit. Title: `feat(design): draw the wallet's glyphs from tabler icons 3.49.0` (63 characters). Body: what changed and why; P48-01 and the lane brief's records quoted; the pictures; the validation runs with outcomes; e2e wall-clock unchanged (no scenario added); `Closes #764`. Open without labels; the path filters already trip every e2e lane (`packages/design/src/**`). The close-out lands as the PR's final commits. Parallelism: none; the phases are sequential.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at 9470d4e9. Specific to this plan:

- `code_review: off`: no diff review.
- The review loop: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, over the arc's net diff from 9470d4e9 (plan commit excluded), after Phase 3 is green, with the standard's two rules verbatim and the adversarial ask. Resume with `resume-codex.sh`. Hard stop at three rounds. One Opus review (`Agent`, `model: "opus"`, `general-purpose`) runs beside round 1.
- Delivery as above, then `gh pr checks <n> --watch`.
- Close-out per the standard's step 4: the Outcome, lessons promotion, open items (#654 stays wallet-bugs-2's; the store captures under `apps/extension/store/` still show the old glyphs: an issue, deduped first, unless a store step already retakes them), `STATUS.md` deleted, `git mv` into `archive/`.
- Teardown per step 5, trunk `dev`, slug `icons-1`.

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session 01a14f13): *conditional approve* (stroke 2 as signed unless the owner approves a floor; correct the glossary rationale; the no-op box and the version lookup). Accepted: R1 (D3: no floor), R2 (D6: a judgement, not a proof), R3 (the exact no-op box, recon Fact 1), R4 (no root-manifest import; route below), R5 (the subpath count; the case then dropped per Opus), R6 (Outline B's attribution works; its rationale corrected). Codex confirmed the fill-rule fact at 240 px (0 differing pixels) and Biome from the workspace (2.5.13).

**Round 1, Opus** (Plan, opus): *conditional approve*. Accepted: the root-attribute allowlist and whole-document parse (P1); the declared-version assertion with a message naming the record (P2, route a); D10 (P3); the raw commit URL for `cmp` (P4); Fact 1 (P5); 19 tags under 12 px including `open`, and a 10 px non-mark crop (P6); the `square-check` subpath case dropped (P7); no glued `M` decimal in fixtures (P8); Biome chained in the script entry (P9); the install footprint in D1 (P11); "6 past the gate" (P12); a Tabler line in the generated header (P13); the commit permalink as `source`; the armed smoke build and `env -u EXTENSION_PATH`; the base build in a scratch worktree; store captures at close-out. Rejected: keeping the 1 px floor (A1): its own pixel read shows the floor closing the public mark's gaps at 10 px, 1x (D3). Rejected: a path-grammar regex (D7). P10 (the public mark at 10 px, 1x) stays a Phase 3 check under D6.

**Final pass, Codex** (fresh session 01a14f28): *conditional approve* (conditions: the before and after pictures on one integrated `dev` baseline; D6's failure branch gated; caller-anchored resolution that works under Node `test:watch`). All three accepted (Phase 3, D6, the drift test and generator). Also accepted: `JSON.stringify` for every generated string; variant-specific root checks (a filled root with a stroke or `fill-rule` refuses); a string parser, no `DOMParser`; a frozen install in the scratch worktree; armed rebuilds after a network run; the showcase specs' switch removed; the publish strip captured; `OWNER-ASKS.md` no longer claims glossary wording for the panel. It found no rejected alternative better and no open disagreement. Resumed to verify the five edits: *approve*, no regression.

## Seeds

Recommended: `/goal`. Use exactly one per session.

```
/goal Every phase in implementations-plan/icons-1/plan.md is marked ✓, each backed by its validation gate reported passing in the transcript; LESSONS_FILE=implementations-plan/icons-1/lessons/phase-N.md printed per phase; the Codex fix loop over the net diff from 9470d4e9 converged (a resumed pass with no new material finding, quoted); one PR against dev with `Closes #764`, opened only after that, whose final commits archive the plan (`git show --stat` of the move); `bun run test:all` and `bun run lint` exit 0.
```

```
/loop 15m Drive implementations-plan/icons-1 forward per its plan.md: reality check (plan, lessons, git status, PR checks); next pending phase; run its gate; on all ✓ run Post-implementation; decide with Codex, never wait; stop at the merge check and tear down per the plan.
```
