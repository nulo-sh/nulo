# Isolated linker store

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The isolated linker in `bunfig.toml` (with `globalStore` deliberately unset), the layout-agnostic resolver package `packages/resolve-asset`, the executable identity guarantees in `apps/extension/scripts/layout-identity.test.ts`, and a dependency lockfile regenerated under the real 7-day release-age gate.
- **Open items**: `hoist = false` is still not set, and the e2e gotchas the lessons rewrite retired still need routing into the `e2e-testing` skill, both tracked in #172 and #185.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Adopt Bun's isolated linker, consumers first. Layout-sensitive tooling was made layout-agnostic while still on the hoisted layout, through a new bottom-layer package, `@nulo/resolve-asset`, that replaced six drifting copies of a root-walking resolver. Then the linker was flipped on the unchanged lockfile, so layout was the only variable, and the lockfile was regenerated afterward as its own reviewed event. The regeneration followed a dry run reviewed record by record, with the aged-out release-age exemptions removed first so the gate meant something. The committed default is the isolated linker without the global store.

## Why

Phantom dependencies were a demonstrated failure mode: a shipped production asset's source package was declared by no workspace and resolved only through hoisting luck. The payoff is correctness, not speed. A fresh-checkout install took about the same time as hoisted with the committed default, and about four times faster with the opt-in global store. The bridge-first alternative (a hoist pattern that recreates the phantom API) lost because it left the drift and the phantoms in place.

## What shipped

- The resolver scans `require.resolve.paths` for the first directory whose manifest names the package, ignores exports maps on purpose, rejects paths escaping the package root, and normalises dev-server `/@fs/` anchors in one place.
- Eight phantom dependencies were declared, two of which fed shipped assets. A permanent identity test pins realpaths, patch markers and lockstep between the extension's sqlite asset and the copy its key-value store uses.
- The lockfile moved to the v2 format, so every host that installs needs Bun 1.4 or newer.

## Lessons

### Global store

`install.globalStore` is off by default under the isolated linker, and when on it lives inside the install cache (`links/`), which CI's cache restore would bring back across jobs. So the repo leaves it unset and it stays a per-user opt-in for trusted single-user machines. Probes of six-way concurrent installs, a kill mid-install and two different patches of one package showed no corruption or cross-contamination; that is risk acceptance, not an atomicity proof.

### Asset walkers

Six copies of a loop walking up looking for `node_modules/<pkg>` had drifted apart: some assumed a hoisted root, one used a hardcoded relative path to a renamed package, and one served a shipped sqlite asset from a package no workspace declared. `@nulo/resolve-asset` replaced them with one resolver anchored on the caller's own location.

### Exit 130

When one leg of `bun run --parallel` fails, Bun interrupts the others, so `audit:vue` can exit 130. The real failure is the leg that printed `Exited with code N`; in practice it was a formatter error in new files.

### Hoist

`hoist = false` stays out until it has its own gate after a soak. An undeclared `require` inside the Aztec transitive graph would fail at run time, and the hoist fallback that lets a phantom dependency resolve locally stays until then.

### Dev server dist

Under the extension build plugin, `bun run dev` overwrites `dist/chrome` with loaders that import from the dev server. A later `test:e2e` then loads an extension whose service worker cannot boot and times out in every file. Run a dev-server smoke before the production build the e2e consumes, or rebuild after it.
