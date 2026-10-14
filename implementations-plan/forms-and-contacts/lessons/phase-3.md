# Phase 3: arc 3a

Base `7e9eb0f` (`origin/dev`, arcs 1 and 2 merged as #255 and #282).

## Re-check of § Arc 3 against the tree

The tree wins; each disagreement is also in `plan.md` (§ Assumptions, "Arc 3 re-check").

- F18, F19, F20 and F22 hold at moved lines (listed in the plan). H6's one `setExpiryDeferral` caller is `execution/service.ts:305`.
- No 500-row file exists in `contacts-import.test.ts`; 3.3 generates one.
- Arc 1 pinned the re-open gap but no network-name behaviour; 3.9 adds tests.
- #287 already gave the account popups the blank-name refusal 3.9 follows.
- G1 (#169) merged: no host `flock` for `e2e:agent`.
- `useContactImportExport.pins.test.ts:146` pins "contact before sender"; 3.1 inverts it.

## Consults
- 2026-10-14: plan revision review, Codex gpt-6.1-sol high, session `01a13bee` on the default `~/.codex` home. Round 1 reject (5 findings, all accepted), round 2 conditional approve (1 accepted), round 3 approve. Verdicts in `plan.md` § Audit verdicts.
- 2026-10-14: found while waiting on round 1: `Skeleton.vue` already is the shared shimmer (F30); 3.7 reuses it (D-arc3-7), which round 2 judged sound.

## 3.2 the running state

- Mutation check on `useLockWallet`: dropping the confirm's named-imports check, the post-read hold check, or the import count each reds the new cases. Dropping `lockWallet`'s own hold check reds nothing: a hold starts only when the set goes from empty to one, so the import that holds is never one the confirm named, and the named-imports check abandons first. Kept as the last-line invariant, cheap and order-independent.
- Complexity: `importContacts` (16) and `lock` (17) went over budget with the hold; `applyHoldingLock` and `decide` carry the new branches.

## 3.3 end to end

- First network run of `contacts-import-stop` failed in 30 s on a puppeteer launch timeout, all three attempts: a smoke build in the same worktree rewrote `dist/chrome` while `e2e:agent`'s fixture launched from it (F23). Smoke builds and `e2e:agent` are serialized from here on; smoke runs use a copied dist, but their build step still writes `dist/<browser>`.
- `navigateToSettings` needs the bottom nav, which Contacts (a sub-page) does not render; the hold scenario leaves Contacts by `subpage-back`.
- Measured on Chrome (this host): the hold scenario 8.2 s, the auto-lock scenario 8.7 s, the network stop 29.7 s in the test (121 s wall with the node setup). Red checks: with the import on the page's contact client, the hold scenario fails at the chip check after leaving Contacts (the import died with the page). The network scenario is the real-PXE run of sender-first, not a deterministic red: whether a stop lands between a row's two writes is timing; the composition stop table is the deterministic proof.
- Firefox, same file: the hold scenario 18.9 s, the auto-lock scenario 12.0 s; all seven pass.

## 3.7 motion

- Chrome probe (one-off, headless, each build's CSS in a blank page): AmountCard's 72×10 and the fee 60×12 skeletons match the parent build in display, size, gradient, background size, 1.5 s ease infinite and keyframes; `flex-shrink` goes 1 → 0, as reviewed. `.noanimations` on the root: before, both kept animating; after, `none`. Emulated reduced motion: `none` in both builds.
- The extension's vitest has no design resolver: a test that renders `<Skeleton>` registers it (`stubs: { Skeleton }`). Without that, `<skeleton>` renders as an unknown element and a `/skeleton/` html match still passes.

## Arc 3a review loop

- Codex round 1 (gpt-6.1-sol, high, read-only): conditional approve, four findings, all accepted (plan § Audit verdicts, A3a-C1..C4). The real one: `SessionManager.open` emits a defined profile on a password change with no lock before it, so anything reset only by the lock seal survives into the replacement session.
- The lock seal closes any snack (`scope-epoch.ts`), and `toastAfter` keeps toasts that were closed: a test of a result shown across a lock reads the snack on screen (`shownToast`), not the toast log.
- Opus 5.5 review beside round 1: conditional approve; its three Low findings are Codex's A3a-C1..C3, found independently; its nits applied.
