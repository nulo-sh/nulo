# npm-release-1: recon

Base: `origin/dev` at `dda72e321` (2026-10-24). One Sonnet explorer (the reuse sweep) plus the
planner's own checks against npm and a scratch staging. No open issue other than #1109 joins the
scope; #1110 (zod, closed) is the record for the zod note below.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Stage the three packages at a version | `scripts/publish/stage.ts --all --version X.Y.Z` | reuse as is |
| Pack with the workflow's toolchain | `npm pack ./<dir> --pack-destination <dir> --ignore-scripts` under Node 24.12.0 (npm 11.6.2), Bun 1.4.2; `scripts/publish/README.md` § A later version | reuse as is |
| Bind the bytes | `scripts/publish/approved-digests.json` + `check-digests.ts` (a listed version binds exactly; the pack job and the publish job both check) | reuse as is: add a `"0.3.0"` block |
| Consumer-facing docs | `scripts/publish/readme/<dir>.md`, shipped as each tarball's README | adapt: the Aztec line, a `0.3.0` entry |
| Tarball contract | `scripts/publish/stage.test.ts` (run by `test:release`) | reuse as is: no edit |
| A drift check on `dev` between rehearsal and dispatch | none in PR CI (`check-digests.test.ts` checks only the file's format; `stage.test.ts` stages `0.1.0` and compares no digest). The dispatch's `pack` job refuses drift, fail-closed. Searched `approved-digests`, `check-digests` across `scripts/`, `.github/`. | build nothing (D5) |

## Findings the plan rests on

- **What 0.3.0 changes, measured.** Staged at `dda72e321` before any README edit and diffed file by
  file against `npm pack @nulo-sh/<p>@0.2.0`: only `package.json` differs, in `version` and in the
  exact peers (`6.0.0-rc.3` → `6.0.0`). Bundles, declarations, `LICENSE`, `NOTICE` and READMEs are
  byte-identical. The published 0.2.0 tarballs still hash to their approved digests.
- **README readers.** Only `stage.test.ts:382-385` reads a README: every patch method needs a
  `` | `method` | `` row in the schema-patch README. No test pins an "Aztec line" or a Changes entry.
- **Version literals.** `readme/wallet-crypto.md:21` and `readme/wallet-sdk-schema-patch.md:27`
  name `6.0.0-rc.3`; `readme/resolve-asset.md` has no Aztec line (no Aztec dependency). Only the
  schema-patch README has a `## Changes` section. History that stays: the `"0.2.0"` digest block,
  `CHANGELOG.md`, `check-digests.test.ts:38` (an arbitrary unlisted-version fixture),
  `reference/nulo-v6.1/*`. `.claude/skills/aztec-update/SKILL.md:58` and `scripts/publish/README.md`
  name no version.
- **Inputs that move the bytes** (the plan lists them in full). Entry sources and the `packages/*/src` files they import (inlined),
  each package's `tsconfig.publish.json` and its TypeScript, the workspace `package.json` pins and
  zod range, `packages.ts`, `readme/<dir>.md`, root `LICENSE` and `NOTICE`, Bun, and npm's packer.
  `stage.ts` must run from the repository root.
- **Workflow.** Node 24.12.0 in every job, Bun 1.4.2, `bun install --frozen-lockfile
  --ignore-scripts`; `pack` stages, packs and runs `check-digests.ts`; `publish` re-checks with
  `sha256sum -c --strict`, needs the `npm-publish` approval and refuses any version until `0.1.0`
  is on npm (it is).
- **Published surface.** `packages.ts` matches the entries `CLAUDE.md` § The wallet repo names:
  `public.ts` exports `deriveNuloAccountKeys`, `deriveSigningKeyFromSeed`, `EncryptionKey`, type
  `Passhash`; `resolve-asset/src/index.ts` five functions and three interfaces; `apply.ts`
  `applyNuloSchemaPatch`; `register.ts` a side effect only. No edit.
- **zod.** The staged schema-patch manifest copies the workspace range `^4.4.3`; the root
  `overrides.zod: "4.6.7"` never reaches it. The Aztec packages pin `zod ~4.4.3` (#1110).
- **Neighbours.** No open PR touches a staged input (2026-10-24). mainnet-seed-1 edits
  `apps/extension` and docs only (its lane brief).
