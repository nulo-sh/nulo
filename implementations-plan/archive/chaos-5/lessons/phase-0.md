# chaos-5 phase 0: recon, plan and the panel

## Recon

Three read-only explorers (Sonnet) and the planner read `origin/dev` at `a4da1f36f`; their findings are [recon.md](../recon.md). Two claims of #1157's second comment did not hold as written:

- "Each needs an extension window, a file pick or the network, so none runs in process": for S3 and S4 only the answer's source is the window's. After the answer, PATH B runs PATH A's body (`apps/extension/src/wallet/services/profile/service.ts:879-897`, `:946-1013`), and `PS/service.integration.test.ts` already drives the branch over a `FakePasskeyService` (`:137-194`, `:780`, `:1177`).
- S6's network half: no window for the race exists, since the active network crosses no window (`apps/extension/src/utils/guarded-network-activation.ts:11-17`).

Recon missed that file's PATH B tests: the search was for the window's method names in the chaos files and `passkey/`, not for a fake of the passkey service. Searching for a class that extends the service it stubs (`rg "extends Service" -g '*.test.ts'`) would have found it; the Opus leg did.

S10 traced to `implementations-plan/archive/passkey-unlock-1/lessons/phase-A2.md:119-120`: host load delaying headless Firefox's own chooser cancel, owned by #1222.

## Consults

### Codex, round 1 (gpt-6.1-sol, high, read-only)

Verdict: reject. Seven findings, each checked against the tree; all accepted.

1. Dispositions do not discharge the brief's browser forms (`CLAUDE.md` § E2E budget justifies an added scenario; it does not waive a requested one). Accepted: every browser form a browser drives honestly lands (D1); S6b, which no window can drive, is a closed known limit (D11).
2. A stub answering PATH B skips `PasskeyService`'s request identity, input check and hand-over (`apps/extension/src/wallet/services/passkey/service.ts:106-139`). Accepted: the real service over a real `WindowManager` on the fake windows (D6), as `passkey/service.test.ts:92` builds it; S3 is a legitimate reuse that binds the answer.
3. S5's cited tests hold a ceremony that never answers; a close after the hand-over lets the step finish (`service.ts:121-139`). Accepted: S5 drives each ordering and pins the continuation.
4. Running B's driver under the race's step skips B's binding, since `checkAnswers` checks only an allowed outcome (`apps/extension/tests/e2e/helpers/profile-chaos/prf-capture.ts:115-123`); an abort alone does not prove no toast. Accepted (D4): B under a derived step; A judged on its own, with a control before B and a recorded scratch break. Codex confirmed the schedule is sound on Chrome and that updates fan out (`packages/extension-messaging/src/background/service.ts` `sendEvent`, `profile/service.ts:1513`, `popup/app.vue:350`).
5. S6: the export page keeps another window's network; the watcher comment at `export/account.vue:177` misleads; a same-type passkey change is untested. Accepted: S6a driven on Firefox, S6b a closed known limit with the comment named in its body (D11).
6. Spying the duplicate check away proves the predicate, not the lock. Accepted (D7): the first commit held inside the lock until the second waits on it; the break bypasses serialization with the check real. I3 is filed by consequence, deduped by consequence (D10).
7. Runtime accounting incomplete; three full unit runs plus `test:all` redundant. Accepted: an estimate per added scenario, measured times and suite times in the PR bodies; three focused composition runs.

Looks fine per Codex: S8 (`useFullBackupImport.test.ts:2270,2290`, `useRestoreAgain.test.ts:312`), S9, S10, D2, D3, D12.

### Opus Plan leg (claude-opus-5-5, Plan agent)

Verdict: conditional approve. Nine findings, each checked against the tree; eight accepted, one narrowed.

1. PATH B's service branch is already driven: `PS/service.integration.test.ts`'s `FakePasskeyService` (`:137-194`) answers a discovery of another profile's credential (`:780-797`), an answer at another input (`:1141`, `:1192`) and a row whose input changed while asked (`:1177`). Accepted: the in-process harness (draft 2's D6) is dropped; `:1177` gains the window's `failed` outcome; the browser form stays as one Firefox panel test (D6).
2. B under the race's step skips its binding (as Codex 4). Accepted (D4).
3. `mintsAt` and `newVariant` in the model test switch on action names (`apps/extension/scripts/e2e/profile-chaos-model.test.ts:135-171`); a race whose B mints must be taught to them, and each variant to the reachability test. Accepted (1.1).
4. S7: the password seal's PBKDF2 can order two restores by itself, so a green without a forced overlap proves nothing about the lock. Accepted (D7): a one-shot hold inside the first commit until the second has called `runExclusive`; break, `runExclusive` made a pass-through.
5. Estimates per browser per variant. Accepted (1.1, 1.2).
6. Releasing A's held `get` on a Chrome second page waits out WebAuthn's timeout (no authenticator there). Accepted (D4): A closes held, as `abandonCeremony` does.
7. `invalid` must reuse `ACTIONS.changeUnlockMethod.invalid`, or Chrome's three credential slots overflow. Accepted (1.1).
8. The comment at `export/account.vue:177` is open work and cannot sit inside a closed known limit. Accepted (D11): its own open issue.
9. The departure from the brief's landing list needs an Ask for the orchestrator. Accepted (Asks).

Narrowed: Opus proposed S5's orderings in process. The window hides Cancel while it finishes (`apps/extension/src/popup/windows/passkey/index.vue:150-152`), so after the authenticator answers only a close can race the hand-over, by timing, and each ordering is already pinned (`passkey/service.test.ts:98,187,200`, `window-manager/window-manager.test.ts:382`). S5 is a closed known limit (D9).

### Codex, final fresh pass (gpt-6.1-sol, high, read-only, new session)

Verdict: conditional approve (with conditions: replace arc 1's ineffective break fixture and make S7's broken-lock overlap deterministic). Four findings, each checked against the tree; all accepted.

1. The abort-ignoring break does not break the observed invariant: `watchPromptAbort` records the request signal's abort event (`apps/extension/tests/e2e/helpers/profile-chaos/ui.ts:375-385`), which the dialog fires when it unmounts on the page's reset, whatever the held promise does. Accepted (1.1): the scratch break stops the signal from aborting.
2. With `runExclusive` a pass-through, the second restore still hashes its fingerprint before it reads rows (`apps/extension/src/wallet/services/profile/service.ts:2333-2335`), so a hold released when it calls `runExclusive` can let the first's row write win and the break pass by timing. Accepted (D7, 2.2): the break opens the hold after the second's real duplicate check; distinct salts and ids.
3. `stepFromDyingPanel` waits for a session (`apps/extension/tests/e2e/toolbar-panel.test.ts:189-192`), so S4's refusal would time out in it. Accepted (2.1): `withDyingPanel` directly, `step-failed` asserted.
4. Arc 2's `Closes #1157` could close the issue before the close-out files its limits and comment. Accepted (D13).

Then the same session was resumed to verify the four conditions against the revised plan. Verdict: approve; all four met, no new contradiction.
