# Store launch for Chrome and Firefox

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The repo half of both store submissions: the icon set and listing assets under `apps/extension/store/`, a Firefox reviewer source package (`apps/extension/store/SOURCE-BUILD.md`, `.github/workflows/source-rebuild.yml`), and opt-in publish jobs for both stores (`scripts/release/publish-chrome-store.ts`, `scripts/release/publish-firefox-amo.ts`, `.github/workflows/release.yml`, `.github/workflows/store-check.yml`).
- **Open items**: the account-side store steps (publishing the staged Chrome review once approved, the call to make the listing public after a security pass, and Mozilla's possible later review), now in `BEFORE-LAUNCH.md` § 2.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Build every input the two submissions consume inside the repo, and leave the account-side work (the first manual submission on each store, the cloud setup, the protected GitHub environments) to a session with access to both store accounts. Chrome publishes with no stored secret: GitHub OIDC exchanges into a Google Workload Identity Federation pool, which impersonates a service account linked to the publisher. Firefox uses Mozilla's API key pair in its own protected environment. Both publish jobs are opt-in inputs on `release.yml`, never automatic. The first Chrome upload is Unlisted.

## Why

A wallet listing is read by people deciding whether to trust it, so every claim has to match the code and the privacy policy, and a listing test checks permission coverage for both manifests against the policy. A long-lived store token in repository secrets is the exact exposure the keyless path removes, so the Chrome job refuses to run unless the tag's commit is on `main`, since a dispatch ref authenticates the workflow but not the tag that supplies the script. Mozilla's reviewers must rebuild the add-on from source, which means a source archive that installs outside any git checkout and a build that is byte-identical across two architectures. The credential-bearing jobs are also easy to get wrong in ways that cannot be tested live, so each has a dry run that makes no network call and a read-only check mode that proves a credential without uploading.

## What shipped

- Generated icons at the five required sizes with a drift check, one listing source with a section per store, a promo tile, screenshots, and a remote-code note that reports where the extension's content security policy bears on the privacy policy.
- The Chrome publisher: a preflight that refuses a wrong item, a taken-down or pending item, a version not above the current one, or an unknown revision state; bounded fail-closed polling; and secrets that never reach output on any error path. A refusal whose every warning is on a short pinned accepted list is retried once without blocking on warnings, and `apps/extension/src/manifest.test.ts` pins the host permissions behind it.
- The Firefox publisher: a short-lived signed token per request, refusal of a Chrome zip, a wrong add-on id, an unsettled data declaration or a source archive missing its build instructions or lockfile, all before any network call. If it fails after the version exists, it must not be re-run; the runbook gives the recovery.
- `store-check.yml` as a separate workflow so checking credentials can never touch release assets or notes, and a root `prepare` script that is a no-op outside a git checkout so the unpacked source archive installs.
- The landing footer links the privacy policy and terms.
