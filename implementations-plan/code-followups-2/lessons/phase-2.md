# Arc 2 (Phases 2.1-2.5): lessons

Base: the plan commit `3b59152` with `origin/dev` `79bbd7b` merged in (#55, #58, #75 landed).
Every new test was run against the base copy of the code it covers and failed there before it
passed here.

## 2.1 Submit latches

- The countdown's own `disposed` guard already keeps a late `start()` from arming a timer, so a
  seed-page test that only counts timers after unmount passes at base: it cannot see the page's
  fence. The unmount case spies on the resolved mnemonic's `join`, which only a page that sets
  the phrase calls.
- Gate: unit cases red at base (3 countdown, 2 seed, 1 change password) and green after; smoke
  `keyboard-guards.test.ts` 2/2 and `security.test.ts` 4/4 on Chrome, retry 0. No `<template>`
  diff in either SFC.

## 2.2 Routes and declarations

- vite-plugin-pages' `pageRouteMap` keys are absolute paths (root-joined), so the exact-set case
  compares against `join(root, file)`.
- With `extensions: ["vue"]`, dropping the dot-directory test glob reds the dev-watcher case,
  which now plants `new-page.test.vue`, so the case still exercises the globs.
- Gate: two `bun run build` runs leave `src/types/` unchanged after the first; the first drops
  exactly `resolveRestoredActiveNetworkId` and `restoreNetworksStage`. `typecheck:all` 0. Smoke
  `navigation.test.ts` 5/5 and `settings-routes.test.ts` 4/4 on Chrome, retry 0.

## 2.3 Process groups and the L1 probe

- The old teardown read `child.exitCode` only; a leader killed by a signal keeps `exitCode` null
  (Node sets `signalCode`), so even a group that obeyed SIGTERM waited the whole grace period and
  was then sent SIGKILL. The base copy fails the cooperative control case for exactly that reason
  (2 s, escalated). The new wait reads both.
- First cut escalated every group that outlived SIGTERM, including one whose leader had exited
  before teardown; the audits showed that group may have emptied and its id been reused, so such a
  group now gets no signal at all (D-arc2-3). The cases, each red at base: a leader that exits
  cleanly on SIGTERM with a member ignoring it is escalated (the base loop stops at the leader's
  exit code); a cooperative group is not (the `exitCode` bug); a group whose leader exited first
  is never signalled, shown by a member that would die on SIGTERM surviving.
- A real-process test must wait until its shells have installed their traps: group existence is
  not readiness. Each case waits for its member's `ready` on stdout, and gates on the pipe's end,
  not the leader's exit, since a leader may exit first (2 of 4 runs red before, 8 of 8 green
  after).
- Gate: `process-group.test.ts` and `anvil-probe.test.ts` red at base (4 of 5), green after.
  Network `incoming-transfers.test.ts` on Chrome 2/2, retry 0; after the run nothing listened as
  `anvil --host 127.0.0.1 --port 16368`.
  Firefox twin 2/2, retry 0; nothing left on its anvil port 22078. Smoke `import-paths.test.ts`
  3/3 on Chrome and 3/3 on Firefox, retry 0.

## 2.4 Development CSP: no change, the HMR socket is not refused

The probe claimed 8088 in the host port registry, ran `bun run dev` in its own process group,
loaded the dev-wired `dist/chrome` into the Puppeteer 25.8 Chrome (152.0.7977.42), opened
`src/popup/index.html` and recorded the page over CDP; afterwards it stopped the group by its id
and released the claim.

- Run 1 saw no WebSocket: the dep optimizer was still bundling, so crxjs's loading page reloaded
  in a loop for the whole 20 s window. Read as "proves nothing", per the plan, and rerun after the
  dev server's log went quiet for 15 s.
- Every later run saw `[vite] connecting...`, `WebSocket ws://localhost:8088/?token=…` created,
  and a `101 Switching Protocols` handshake followed by the `{"type":"connected"}` frame, with no
  CSP refusal of it.
- Why it is not refused: the extension serves only crxjs's loading page itself (with the manifest
  policy as its CSP header); the real popup comes from crxjs's service worker
  (`fromServiceWorker=true`) with no CSP header, and Chrome then applies only its baseline
  extension policy, `script-src 'self' 'wasm-unsafe-eval' 'inline-speculation-rules'
  http://localhost:* http://127.0.0.1:*; object-src 'self'`, which has no `connect-src`. The
  discriminating control: in that page `fetch("data:text/plain,…")` succeeded, and the only
  violation (an inline script) reported that baseline as its `originalPolicy`. Against a
  production build the same control was refused under `connect-src 'self' blob: https: http:`
  with the manifest policy as `originalPolicy`, so the control detects the manifest policy when it
  applies.
- So whether an `http:` source admits `ws:` was not tested (the plan's inference I1 is neither
  proven nor disproven), and a development-only `connect-src` source would change nothing. The
  first reading of runs 2 to 4, "the policy is enforced and admits `ws:`", rested on an
  inline-script control that both policies refuse; both audits caught it.
- Found on the way: on Chrome, `bun run dev` never runs the popup under the manifest's CSP, so a
  CSP regression shows only in production-mode builds (the e2e builds and their CSP recorder).
- An `<img>` control from run 3 is not evidence either way: COEP (`require-corp`) blocked it.
- `dist/chrome` rebuilt with `bun run build:chrome`: its manifest's policy is byte-equal to the
  production string and it carries no development `key`; `manifest.test.ts` 12/12.
- Firefox's `dev:firefox` is a watch build with no HMR socket, so it was not probed.

## 2.5 Two invisible cleanups

- `setTimeout(resolve, ms)` inside `new Promise<undefined>` falls through to the DOM overload (its
  `resolve` takes one argument, so Node's `(...args: TArgs)` overload does not fit) and returns a
  `number`, which `vue-tsc` refuses against `ReturnType<typeof setTimeout>`. The unit tests passed
  and only `typecheck:all` inside `audit:vue` caught it: run the typecheck after every phase, not
  only where the plan names it.
- Gate: the three files pass; the two timer cases and the flipped PopupManager case red at base.
  Smoke `import-paths.test.ts` 3/3 and `onboarding-import.test.ts` 1/1 on Chrome, retry 0.

## Arc gate

`bun run audit:vue` 0 (typecheck:all, 718 files / 10,673 tests with 4 skipped and 7 todo, lint,
build); `bun run test:ci-gating` 413/413.

## Codex loop

Session `gpt-6.1-sol` at high, read-only, over `git diff a78cee1..HEAD`; each round resumed the
same session. Findings and verdicts are in `plan.md` § Audit verdicts.

- Round 1 (with one Opus review): approve with fixes. Accepted: signal ownership (C1/O2), the
  dropped final-wait result (C2), the CSP control that could not tell the policies apart (C3/O1),
  the plain test glob left unguarded (O3), caller-naming comments (O4).
- Round 2: approve with fixes. Accepted: no signal to a group whose leader was reaped before
  teardown, trap-readiness in the real-process cases, the lock comment. Rejected: refusing
  escalation once the leader dies during the grace wait, since that undoes entry 125 (D-arc2-3).
- Round 3: no new material finding; one comment tightened to the accepted residual risk.
- Network `incoming-transfers.test.ts` re-run on the round-2 head: Chrome 2/2, retry 0, nothing
  left on its anvil port.
