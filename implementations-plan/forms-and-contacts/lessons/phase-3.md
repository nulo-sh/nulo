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
- Codex round 2: one Medium (A3a-C5). A Vue `<Transition>` keeps a closed card in the DOM through its leave, so "on screen" means settled: no `/leave/` class, opacity 1, `getAnimations()` empty. Opacity and animations alone miss the leave's first frame, before `leave_to` applies.
- CodeQL's ReDoS query reads test files too, and its high alert fails the PR's CodeQL check. A repeated group whose inner class can also match the group's own prefix (`(?:<scope> [^,{}]+,?\s*)+`) backtracks exponentially. Split rules with `([^{}]+)\{([^{}]*)\}` and test each selector in plain code instead. Lint and the local gates do not catch it.

# Phase 3: arc 3b

Base `21d806e3` (`origin/dev`; arcs 1, 2 and 3a merged as #255, #282 and #435; `incoming-transfers` arc 3a as #426).

## Re-check of § Arc 3b against the tree

The tree wins; each disagreement is also in `plan.md` (§ Assumptions, "Arc 3b re-check", F31-F36).

- #211: the tx page's grey link override is gone; #426 moved it into `TxHashRow.vue`, shared with the journal, whose To link copies it under page 4's OA-6 A. 3.6 edits `TxHashRow` and the To link, not `tx/[id].vue`.
- #216: the plan's option-A mechanics alone (the slot's fallback) would never show the note, since every call site wraps its message in a Transition; eight call sites change, not ten (the endpoint labels have no message).
- #428 holds; and the lock seal clears the guard while a released run can still reach its `finally`, so the disabled item alone leaves the silent loss reachable across a lock.
- The toast API has no update; its region clears hover and focus on every toast change.
- 2026-10-14: 3b revision review, Codex gpt-6.1-sol high, session `01a13c9d`: conditional approve, R3b-C1..C3 accepted (plan § Audit verdicts).

## 3.10-3.11 the snack and the refusal

- A Pinia store hands back a reactive proxy of an object it holds, so `store.slot === mine` is never true for the object a run stored; compare with `toRaw`. The unit tests' plain-object store hid it; the composition test's reactive store caught it, and the unit store is now reactive too.
- A per-row re-opened snack never settles (its 150 ms entrance outlasts a 46 ms row), so the e2e read of a relabelled card fails on it by timeout.

## 3.6 the detail pages

- Chrome probe (armed build, one seeded record per page, both themes; the scroller squeezed to 200 px so every page scrolls). Parent `7b4c3b17`: the Tx hash link grey on tx and journal (light `rgba(0,0,0,0.6)`, dark `rgb(153,145,135)`), primary on received (`rgba(0,0,0,0.88)`, `rgb(245,240,230)`); the journal's To link grey; received's from-text primary; the space under the last box at the scroll end 24 px on tx and received, 48 px on the journal (its `.wrapper`'s 24 px over the shared `.content`'s). F36 holds after the font remake. New build: all four links primary in both themes, 24 px on all three, received unchanged.
- Hover turns every Details link the accent, `rgb(168,72,12)` light and `rgb(248,241,231)` dark. The dark accent is within 1% of the dark primary text, so a primary link shows no hover colour in the dark theme (FA-14).
- The popup's scroller is a fixed 536 px tall, so a viewport change does not make a short page scroll; squeeze the scroller itself to measure the space at the scroll end.

## Arc 3b review loop

- Codex round 1 (gpt-6.1-sol, high, read-only, session `01a13cd8`): approve, three Low findings, all accepted (plan § Audit verdicts, A3b-C1..C3).
- Opus 5.5 review beside round 1: approve; A3b-O1..O3 accepted, A3b-O4 filed as #447 (`known-limit`, closed). The snack region reset focus on every change of card, so a replaced snack dropped keyboard focus to the body; restoring it where `show()` changes the card covers ×, a replacement and a timeout alike.
- The before-suite ran this arc's test files against the base build, so the hold scenario, whose progress assertions need this arc's code, fails there by design (30 s wait); every other file passed.
- Codex round 2 (resumed): approve, no new findings. Final cross-arc pass (fresh session `01a13ceb`): approve, two stale comments from earlier arcs fixed (plan § Audit verdicts, X-1, X-2).

