# deps-audit-1: phase 1 (the two bumps)

All commands from the repo root on branch `deps-audit-1-a1`, before 21:01Z, so both installs used the scratch config.

- Base `bun run test:all` at `ef5336bbc`: exit 0, 198 s. Pass counts: extension 14707 (5 skipped, 7 todo), wallet-bridge 805, design 534, extension-messaging 429, aztec-runtime 414 (2 skipped), wallet-core 317, wallet-crypto 123, token-list-host 85 (3 skipped), landing 79, third-party-notices 66, legal 59 (1 skipped), token-list 33, wallet-sdk-schema-patch 15, resolve-asset 14.
- Scratch config: a fresh `cp bunfig.toml` plus one `minimumReleaseAgeExcludes` line; `diff` against the tracked file shows only that line.
- `bun update follow-redirects`: exit 0. Override `8.2.4`, `bun install --config=<scratch>`: exit 0. Override and the three floors `^8.2.4`, `bun install --config=<scratch>`: exit 0. The resulting diff equals the planning probe's.
- Gate: bunfig and ack-file diff empty; `bun.lock` 6 lines changed (4 ranges, the vite and follow-redirects entries), no `@alejoamiras/*` line; one `vite` line per manifest; both integrity strings equal the registry's `dist.integrity`.
- `rm -rf node_modules apps/*/node_modules packages/*/node_modules infra/*/node_modules`, then `bun install --frozen-lockfile` with the tracked `bunfig.toml`: exit 0. The store holds `vite@8.2.4`, `follow-redirects@1.16.1` and no older copy of either.
- `bun audit --audit-level=low --json` (exit 1) into scratch, then `audit-gate.ts --mode enforce`: exit 0, `41 acknowledged, 0 unacknowledged, 0 stale, 0 unreadable`.
- `bun run lint` exit 0; `bun run typecheck:all` exit 0. Committed as `81e1e7303` (signed).
- Review round 1: Codex (session 01a15c4b) approve with fixes, Opus approve with fixes; records only, no dependency file changed (plan § Review verdicts).
- Review round 2: Codex approve; loop converged.

## OA-4 step 1: storybook 10.6.2 (2026-10-22, one core)

- Pin-then-restore: exact `10.6.2` in `apps/extension` (`storybook`, `@storybook/vue3-vite`) and `packages/design` (`@storybook/vue3-vite`), `bun install`, then `^10.6.2`, `bun install` ("no changes"). No age-gate refusal.
- `bun.lock`:
  - storybook, `@storybook/vue3-vite`, `vue3` and `builder-vite` move to 10.6.2;
  - `@storybook/csf-plugin`, its nested `unplugin@2.3.11` and vue3-vite's nested `typescript@5.9.3` leave, and a nested `magic-string@1.2.0` arrives;
  - `oxc-resolver` and its bindings go 11.24.2 → 11.21.2, storybook's exact pin; storybook is its only dependent.

  All 27 new integrity strings match the registry, and the four storybook packages carry SLSA provenance and no install script.
- `bun pm diff <pkg>@<old> <new>`'s side order is not fixed (Bun 1.4.2): storybook printed 10.6.2 on the `-` side, while vitest later printed 4.1.10 there. Read the direction from the `"version"` line. In storybook 10.6.2 the new `child_process`/`net` uses are:
  - the CLI tools SDK's `fork` of its own child host;
  - host-validation middleware (`net.isIP`);
  - a 127.0.0.1 loopback listener;
  - Windows-only `icacls` on `~/.storybook/instances`.
- Every `node_modules` removed, then `bun install --frozen-lockfile`: exit 0, and the store holds only the new versions. Audit gate: 41 acknowledged, 1 unacknowledged (`@vitest/mocker` 1242767), 0 stale, 0 unreadable.
- `build-storybook` (`apps/extension`; design has no script of its own): exit 0, with 217 index entries (182 stories, 35 docs) from all 36 story files, 8 of them design's.
- `typecheck:all` exit 0 covers the extension's 28 story files. Design's tsconfig excludes its stories and nothing checks `.storybook/*.ts`, so the build is their check.
- `lint` exit 0. Unit suites, one worker: design 538/538 (28 s); extension 906 files plus 3 skipped, 14996 passed, 5 skipped, 7 todo (1537 s).
- Codex r8: approve with fixes, records only.

## OA-4 step 2: vitest 4.1.12 (2026-10-23)

- `origin/dev` `0e4bec132` merged as `0fe71361a`: `index.md` is dev's file plus this lane's row, and dev's 21 commits change no dependency file, bunfig, vitest config or soak tool.
- Pin-then-restore over the 14 manifests that declare `vitest` (`^4.1.9` → `4.1.12` → `^4.1.12`), with no age-gate refusal and no exclude. The lock moves vitest and `@vitest/{expect,mocker,pretty-format,runner,snapshot,spy,utils}` 4.1.10 → 4.1.12 and nothing else. All 8 integrity strings match the registry, all carry SLSA provenance, none has an install script, and no 4.1.10 copy is left. storybook keeps its own exact `@vitest/*` 3.2.4.
- `bun pm diff`:
  - vitest: chunk renames plus a browser-mode Chromium GC workaround these suites never run;
  - `@vitest/mocker`: generated mock code escapes names with `JSON.stringify` (1242767), and a redirect must pass vite's `isFileLoadingAllowed` (1193683/1193684);
  - `@vitest/runner`: concurrent tests are capped at `maxConcurrency`, which reaches `proverless-guard.test.ts`'s `describe.concurrent`;
  - the rest: version only.
- The vitest entry leaves `audit-acks.json` (5 entries, 39 advisories) and its row leaves `SECURITY.md`. Every `node_modules` removed, then `bun install --frozen-lockfile`: exit 0. The gate in enforce mode reads 39 / 0 / 0 / 0. Committed as `b8f5c22fe`.
- The fixture-retry repro (e2e skill row 38) on 4.1.12 under Node fails both ways: the test-scoped retry reads `undefined`, and the file-scoped one rethrows the first error. #190 stays open (D14).
- Codex r9: approve with fixes, records only (plan reconciled, D14).

## Arc 2: the bumps on `e0faa7267` (2026-10-24)

- The base's frozen install passed. Its audit read 40 / 19 / 1 / 0. New since arc 1: vite 1242727/1242733/1242736, storybook 1242874, undici 1243078/1243081/1243113, fast-uri ×4 and zod 1243066. braces 1240992 is stale: its advisory was withdrawn on 2026-10-23.
- Arc 1's manifest edits, replayed pin-then-restore (vite, storybook, vitest), plus `bun update follow-redirects`.
  - No install was re-gated: the Aztec rc.3 pins are past the age gate, so no exclude was needed for them.
  - `bun.lock` came out byte-identical to arc 1's reviewed candidate (sha256 `c7578a98…cb6593`), and every manifest equals arc 1's. So arc 1's `bun pm diff` reviews and integrity checks hold unchanged.
- `bun update undici` moved only `jsdom/undici` 7.29.1 → 7.30.1. Its `bun pm diff` (scratch `pmdiff-undici.txt`) touches `lib/`, `types/` and docs; the manifest changes only `"version"`; the release is attested. It printed "undici 5.29.0 -> 7.30.1"; the lock shows only jsdom's entry moved, and no manifest gained a line.
- fast-uri 3.1.9 is younger than the gate, so it went through the CVE runbook. A scratch copy of the tracked `bunfig.toml` plus `minimumReleaseAgeExcludes = ["fast-uri"]`, passed as `--config=` to `bun update fast-uri`. Only its lock entry moved; the integrity equals the registry's; SLSA provenance; no install script; its diff touches `index.js`, `lib/utils.js`, tests, the README, its release workflow and `package.json`'s version. The tracked `bunfig.toml` never changed.
- The ack file: the vitest and braces entries removed; undici 1243078/1243081/1243113 added to the miniflare entry, the only copy left in their ranges. The gate reads 41 / 1 / 0 / 0, zod alone (D19, OA-6).
- #987's one-liner on dev's new call site (it gained `--source=` with #1103). The original test, under the Node launcher: 1 failed, 23 passed. The fix: 24/24 on node ×3 and on bun ×3.
- The frozen proof, with the tracked `bunfig.toml`: every `node_modules` removed, then `bun install --frozen-lockfile --force`. Exit 0, 996 packages; the store holds fast-uri 3.1.9 and undici 7.30.1. Then lint, `typecheck:all`, `test:ci-gating` (687 pass) and the token-list host tests (85 passed, 3 skipped) all exit 0.
- Review round 1: Codex (fresh session `01a16b57`) and Opus both `approve with fixes` (plan, Review verdicts). The Phase 3 base reference was collected in a scratch worktree at `e0faa7267`: 14 one-run summaries and passkey-rp's JUnit, all exit 0, tree clean. Codex r2 found the first scripts too lax: no exact workspace set, no provenance or per-summary consistency checks, and a collector that could leave stale passing output. Both were hardened. The base was re-collected into `inv-base2/`: DONE, clean, at `e0faa7267`, 14 summaries plus passkey-rp's 5 passed and 6 skipped. Self-tests: base against base passes, and nine seeded faults all fail.

## Arc 2: OA-6, zod forced to 4.6.7 (2026-10-24)

- **B withdrawn (D20).** The owner's first answer, B, carried a reason. The trace refuted it before any write: a schema the wallet parses dApp input with, and a node-reply schema, each hold a size-bounded collection. Codex (resumed `01a16b57`): stop and report, high. LEAD_BLOCKED to the orchestrator; the owner then chose A.
- **puppeteer `^25.14.0`, then root `overrides.zod` `"4.6.7"`.** One `bun install --config=<scratch>`, with the D18 fast-uri exclude, since fast-uri is still inside the gate. It moved eleven lock entries (D21). 25.14.0 is the newest puppeteer past the gate (25.15.0 is from 2026-10-20). Then every `node_modules` removed and `bun install --frozen-lockfile --force` with the tracked `bunfig.toml`: exit 0, 996 packages, the store holds `zod@4.6.7` alone. The gate reads 41 / 0 / 0 / 0. Lint and `typecheck:all` exit 0.
- **zod 4.6.7's provenance.**
  - The attested sha512 equals `bun.lock`'s integrity, and `npm audit signatures` (in a scratch project) verifies both the registry signature and the attestation.
  - The SLSA build ran `release.yml` on `refs/heads/main` at `b500a2ee`. That commit is GitHub-verified, the tag `v4.6.7` points at it, and it sits on today's `main`.
  - 4.6.6's notes say the six 2026-09-21 commits were reverted and removed from `main`'s history. 4.6.0-4.6.5 were published before they were pushed.
- **`bun pm diff` side order flips:**
  - `zod@4.4.3 4.6.7` printed 4.4.3 on the `-` side; all six puppeteer-family diffs printed the new version there.
  - `ws@8.21.3 8.22.0` compared the root's 8.21.3 with itself ("No differences"), because the new copy is nested (`puppeteer-core/ws`). Swapping the sides gave the real diff.
  - Read the direction from each `"version"` line.
- **The full reads**, six Opus readers over 64,698 zod lines and every executed puppeteer-family line: all clean, high confidence.
  - chromium-bidi 157 has no provenance: Google's `chrome-devtools-npm` publishes it from the Chromium tree, per its README. puppeteer-core 25.14.0, which is attested, pins it exactly, and 157 drops 17.0.2's `bidiServer` and `prepare` script.
  - zod's allowsEval probe is unchanged, and the extension's jitless pre-seed still applies.
- **Browsers.** Puppeteer's postinstall brought Chrome 155.0.8059.79. `bun x puppeteer browsers install firefox` brought stable_158.0. `PUPPETEER_REVISIONS` (namespace import, as `firefox.ts` reads it) names both.
- **Codex r4: fixes needed (two).**
  - zod 4.6's `.url()` strips tab, CR and LF from its value. That turned `RpcUrlSchema`'s later hidden-character check into a silent accept, so the check now runs first (D22). A scratch probe ran 15 inputs: the same verdict and popup line as on 4.4.3.
  - The override's removal condition is now "the six constraints admit one common patched zod", in the skill and D21.
- **R1 went red under 4.6.7.** The stamp pins the installed zod, so every zod bump appends a stamp. The five emitted-shape diffs were spelling (nullable `anyOf` → a type array; tuples state their length); R3 and R5 passed. `baseline:storage -- --additive` appended stamp 1, plus its pin (D23). Then a full `test:all` passed on every workspace (extension 15148 passed), before the candidate.
- **Signing hung on a stale `SSH_AUTH_SOCK`** (machine.md's gotcha). Commits and pushes now run under `env -u SSH_AUTH_SOCK`.
- **OA-7 A (D25).** zod has no switch back to UTF-16 counting, so `boundedString` keeps `.max()` (with `abort`, which also keeps `maxLength` in the emitted shape) and adds a labelled refinement on `string.length`. The stored-shape emitter throws on an unlabelled refinement, so the `.describe()` is required. A differential against 4.4.3 checks verdicts and issue text, not just pass or fail.
- **A puppeteer bump moves the browsers, and their own traffic and protocol limits with them (D26).**
  - Chrome 155 adds `redirector.gvt1.com`, past `--disable-component-update`.
  - Firefox 158 adds New Tab's train-hop download from `archive.mozilla.org`, off at its source with an empty `browser.newtabpage.trainhopAddon.xpiBaseURL`. It was found with `MOZ_LOG=nsHttp:3`, set on the e2e run, which geckodriver passes through.
  - Firefox 157+ refuses BiDi `activate` and `setViewport` on extension-process pages, by `isPrivilegedContext` in `RootBiDiModule._getNavigable`. To compare two Firefox revisions, read `chrome/remote/content/**` out of each `omni.ja` with `unzip -p`, ignoring its exit code, and run one spec under `FIREFOX_PATH`.
- **OA-8 A (D26).** The harness read Firefox's revision from `PUPPETEER_REVISIONS`, so a puppeteer bump moved the browser too, with no line of its own in the diff. The pin is now its own file, which the driver, the installer and CI's cache key all read. The test proving it installs puppeteer's own revision beside the pinned one, so a revert to puppeteer's revision fails by name.
- **Phases 2-3 at `9867ff523` (D27).**
  - A timeouts-only `audit:vue` red at load 250-320 passed on its one rerun at load around 150, and was filed (#1112). `waitload` now also gates `audit:vue`, not only the e2e steps.
  - The inventory compare must not depend on the checkout path. Some test names embed resolved file paths, so a base collected in a scratch worktree differs from the lane's by its root alone. Compare each side's own root rewritten to `<repo>`, and refuse a name that already holds the token (Codex r8).
