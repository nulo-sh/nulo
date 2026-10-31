# flake-1 phase 0: planning consults

## Recon and probe

- Firefox 158's Remote Agent source (`omni.ja`, `chrome/remote/content/`) shows the only BiDi picker switch is `unhandledPromptBehavior.file`, session-wide and cancel-only. The pref the issue's first triage used is gone.
- Probe (scratch Bun script, geckodriver, headless 158.0, a web page): a JS `@mozilla.org/filepicker;1` factory from a system-principal sandbox cancels an unasked pick, holds an asked one and answers it with an `nsIFile` (37 ms to `change`). `Cu.evalInSandbox` needs a `chrome://`, `resource://` or `moz-src://` label; the first attempt with the default label failed "unsafe filename", and `getClassObject` is not scriptable on `Components.manager`.

## Round 1 (dual audit)

- Codex (`run-codex.sh`, `high`, `read-only`, `gpt-6.1-sol`): approve with changes, six findings. All accepted; see plan.md § Audit verdicts.
- Opus Plan leg: approve with changes, seven findings plus an optional unit test. Six accepted, one rejected (D7); the unit test adopted with Codex's (D6).
- Final Codex pass (resumed session): approve, no new material defect.
