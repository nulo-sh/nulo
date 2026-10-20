# exists-notice-1, phase 0: recon, pictures, consults

## Recon and pictures

- Two sonnet explorers: flows (F1-F4, with "restore again" and create ruled out) and the typed-error idiom with the capture method. Findings in [recon.md](../recon.md).
- Today's pictures came from an ad-hoc capture file kept outside the repo, run over `vitest.e2e.config.ts` against the armed base build: Chrome popup (virtual authenticator, profile renamed "Daily", lock, Import from the lock screen, Passkey) and Firefox's passkey window (the dying-panel import of `tests/e2e/passkey-toolbar-panel.test.ts`, reused verbatim). A hash with a query never satisfies `waitForHash("#/popup/import")`: wait for `import-page` instead.

## Consults

- **Codex audit, round 1** (gpt-6.1-sol, high, read-only; session `01a1570e-49b9-7e92-8532-5047d9c9f73f`): `conditional approve`. Findings: an unreadable row would get a notice pointing at a profile the list never shows (demonstrated by trace); the page test as first written never resolves the in-page ceremony; pin reserved precedence, a same-message plain control and `"exists"` with no popup return; the security text overclaimed a fresh ceremony (sender authentication is the guard); citation drift. All accepted except a credential check on the id branch, made moot by moving the credential check first.
- **Opus Plan leg, round 1**: `conditional approve`. Same unreadable-row finding; page test needs a real Pinia, the teleported notice and the dialog's `resolve`; OA-1 misdescribed the window (no Firefox note in the failed tone); three code docs go stale; a required notice parameter and a guarded name. All accepted. Raised that onboarding has no lock screen: moved into OA-1's options.
- **Decision from both rounds (EN-D2):** type only S1's credential match on a live, readable row, by moving S1 above the id check; every other occupancy keeps today's plain refusal. No new helper.
- **Final fresh Codex pass** (session `01a1571c-8f91-7e42-a970-4335067ad8fa`): `conditional approve`. The red/green gate could not fail on the never-happens rows; id-clash wording needed "when no credential match exists"; onboarding's profile may be locked; add a readable row holding another credential. All four folded. Resumed: `approve`.
- **Fix loop round 1** (Codex `01a15736-35e9-74b2-9f11-5caae22d0dab`): 0 material, two narration comments removed. **Opus diff review**: clean; test (a) now holds a second profile.
- The integration fake derives one master for every credential, so a second passkey import in one service meets the warned same-wallet duplicate: a success control passes `allowDuplicate`, and a second profile in a test is a password one.
