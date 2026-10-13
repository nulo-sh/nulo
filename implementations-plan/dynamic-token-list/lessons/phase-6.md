# Phase 6 — Disclosure and docs

## Deviations from plan.md (each with the reason)

- **Terms § 7.5 is amended inside 1.0, not shipped as a 1.0.1 patch.** Terms 1.0 has no effective date: it is a draft behind the DRAFT banner (`BEFORE-LAUNCH.md` § 3). A patch would archive a never-effective 1.0 at a permanent `nulo.sh/terms/v1.0/` permalink and move the launch checklist onto 1.0.1. The owner signs the text off in the arc 2 PR either way; the patch route stays open if the owner prefers it.
- **Privacy 1.2 is effective 13 October 2026, the drafting day.** A `«FILL»` would bring back the DRAFT banner on `/privacy`, which the stores read. The owner moves the date to the day the landing publishes it, if later, in the same PR.
- **The `Origin` is disclosed as possible.** P5 measured none on loopback for both browsers, which does not cover the HTTPS host, so § 5.11 says a browser may add one and that Firefox's names the installation (A4).
- **Stale citations repaired on the way.** `store/listing.md`'s `alarms` paragraph and `store/remote-code.md`'s two `legal/privacy.md` lines already pointed at the wrong lines on the base; they now name the live ones.
- **AMO's 3,000-character cap.** The reviewer notes were at 2,981; the token-list sentence fits by dropping the CSP string the notes repeated from the manifest (it stays in `remote-code.md`).

## Gate (2026-10-13)

- `bun run --cwd packages/legal test`: 59 passed. `bun run --cwd apps/extension test -- store-listing`: 8 passed. `apps/landing` tests: 60 passed.
- `bun run test:all`: every workspace exits 0 but `@nulo/token-list-host`, whose one red test is `tree.test.ts > has no finding`, listing only the two placeholder keys (red by design until the key ceremony). Re-run after the keys land.
- The Chrome legal smoke specs (`legal-acceptance`, `settings-routes`, 19 tests) and the full Firefox smoke ran on a build carrying privacy 1.2: green.
- `bun run lint`, `bun run typecheck:all`, `bun run check:plans`: exit 0.
