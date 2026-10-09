# Terms, acceptance record and third-party notices

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the published documents and versions in `legal/` and `packages/legal/`, the acceptance service in `apps/extension/src/wallet/services/legal/`, the onboarding gate and re-acceptance sheet in `apps/extension/src/onboarding/pages/terms.vue` and `apps/extension/src/components/LegalAcceptanceSheet.vue`, the landing pages built by `apps/landing/scripts/build-legal.ts`, and the notices generator in `packages/third-party-notices/`.
- **Open items**: a dApp refused for want of a current Terms acceptance opens nothing in the wallet, and no release step refuses a stable publish while a `«FILL»` placeholder survives in `legal/`; both are tracked in #125 and #183. The refusal is a typed error to the dApp, so the person learns of it only there, and showing the acceptance sheet would be a UI decision. The release gap is a manual checkbox in `BEFORE-LAUNCH.md`, and the landing only marks its page as a draft.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Publish the Terms and Privacy Policy, record acceptance of the Terms on the device, and ship third-party notices, in three arcs.

- **Source of truth.** A leaf package, `@nulo/legal`, holds the version manifest, the status logic and the consent wording. The landing builds `/terms` and `/privacy` from the markdown at build time, with a permalink per version.
- **The wall is at broadcast.** Acceptance is enforced in the service worker on the one line every broadcast crosses, `ExecutionCoordinator.sendTxTask`, with a refusal before it for dApp requests and new dApp connections. A person who declines can still view, export everything, import a backup, manage profiles, lock and reset.
- **Status derives from the Terms alone.** A privacy-only change never blocks. A material change is a minor or major bump with a human-written change list that the re-acceptance sheet shows.
- **Notices.** The build emits a notices file from the modules it actually rendered, and refuses a licence outside the allowlist, a package with no licence metadata, and an unreviewed vendored asset.

## Why

A consent record is not access control against the device owner. The real risks were locking a person out, and a broadcast that escapes the guard. The first design guarded the entry points it had found, and review found a third path, through the authwit registry, that reached a send without passing any of them. Moving the guard to the single broadcast line makes the property structural, and a test pins both that the send occurs once and that the guard precedes the liveness check, since nothing may be awaited between that check and the send.

Never locking anyone out is made structural too: the acceptance sheet is excluded from every export route, lock-screen route, legal page and dApp window, which matters most for the passkey full backup whose ceremony runs in the page. The consent control starts unchecked and is never restored. Its label and the continue button's text are the Terms' own wording, pinned by a test.

Status ignores the privacy version because the Terms say that accepting them is not consent to processing. The manifest's invariants make a material patch bump impossible, so comparing major and minor can never swallow one. A record newer than the manifest, as after an extension downgrade, counts as current and is never overwritten by an older one. The record is device-local, survives a profile reset and is never part of a backup. The service is its sole writer and keeps no cache.

The notices generator reads rendered chunk modules rather than walking package owners, because that walk misses embedded code and tree-shaken exclusions. It handles SPDX `AND` and `OR`, never synthesizes a copyright line, and is registered for worker builds too.

## What shipped

- `@nulo/legal` with manifest invariants and a pin tying its versions to the version line under each markdown file's title, so the legal text needed no plumbing edits.
- The acceptance service, the typed refusal that dApps receive, and the structural pins on who may call the guard.
- The onboarding gate as an allowlist, so only welcome and terms are open without a current record, plus the re-acceptance sheet, the declined screen, the send banner that pauses fee estimation, and Settings → About rows for the accepted version, the notices and a non-blocking privacy notice.
- The landing build of the two pages and their versioned permalinks, with a draft banner and `noindex` while any placeholder survives. The extension opens the versioned permalink, never the moving page.
- The notices generator wired into both browser builds, with an expected-minimum list asserted against both browser builds.
- E2E coverage with a fixture option to seed a current, missing, stale or corrupt record, hit-tested pointer proofs that export still works while declined, and path filters so a version bump alone runs the suites that prove re-acceptance.
