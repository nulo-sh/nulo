# Firefox as a first-class target

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A browser seam under the e2e fixtures in `apps/extension/tests/e2e/fixtures/browser/`, the Firefox smoke and network lanes in `.github/workflows/pr-extension-smoke-e2e-firefox.yml` and `.github/workflows/pr-extension-network-e2e-firefox.yml`, the passkey fallback in `apps/extension/src/wallet/utils/passkey-ceremony.ts`, and the Firefox manifest items in `apps/extension/manifest/manifest.firefox.config.ts`; the browser differences are written up in `apps/extension/tests/e2e/FIREFOX.md`.
- **Open items**: the Firefox lanes' post-merge checklist is met in CI and the staged switch it unlocks is undecided, and the two local-run skills disagree on concurrent network runs; both tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Firefox gets the treatment Chrome has: the same smoke and network suites against the Firefox build, per PR, nightly and in the release chain, all advisory until promoted. The browser is a seam under the existing fixtures, so test bodies are shared and only launch, disposal and discovery differ. Chrome's target-based logic moved behind the seam unchanged. Tests that kill or reach into the background script stay Chrome-only as whole files.

## Why

- A separate small Firefox suite would have been safe for Chrome but would fork the helpers within days. Selenium would have added a second fixture stack for nothing the hybrid driver could not do.
- One user-facing Firefox bug surfaced on the way: passkey profile creation failed, because the create-time result carried no key-derivation output.
- Network e2e runs in full on Firefox, including real-proving canaries, since a thin canary would not prove the lanes a release depends on.
- The bundle has to pass `web-ext lint`. An oversized offscreen file the linter refuses to parse forced a build change instead of a lint exception.

## What shipped

- The driver starts geckodriver detached with ports allocated just before spawn, installs the add-on over a classic session with a pinned extension origin, and attaches Puppeteer over BiDi. Every launch writes an ownership record with the process start time, and one disposer ends every launch, so a recycled pid is never signalled and a profile directory is removed only when the launch created it.
- Passkey creation falls back to a `get` restricted to the created credential, asserts the same credential id, and returns the caller's user handle, so no second profile identity can be minted. The Firefox manifest declares no data collection and a minimum browser version.
- The lanes are advisory by construction: they live in separate workflow files whose aggregators are in no branch's required set, and in the nightly and release workflows they sit outside the aggregate and the asset-attach dependencies. A Firefox run never emits a required check name.
- The bundle is split into chunks under the linter's parse limit, with a build-time guard that fails any parsed file near the limit and a plugin that strips the embedded Noir debug source from the aliased artifacts without changing their class ids.
- The toolbar popup's height on Firefox was fixed with one declaration after measurement showed the percentage chain was indefinite in a panel, and the scrollbar rule gained the standard property beside the WebKit one.
- Promotion of a Firefox check to required follows staged switches written into the runbook, each gated on a run of green nightlies.

## Lessons

### Base copy

A red-then-green proof must take its old copy from a named base ref, never from `HEAD`: a re-proof that read the stylesheet from `HEAD` after the fix landed ran green both times and proved nothing. A red that looks environmental is rerun on the base before blaming the machine.
