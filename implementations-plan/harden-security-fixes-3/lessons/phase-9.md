# Phase 9: the wallet restarts after a lock it could not save (OA-7 A)

| When (2026-10-19/20) | Step | Outcome |
|---|---|---|
| 22:3x | Probe: `chrome.runtime.reload()` under the harness (`--load-extension`, then CDP `Extensions.loadUnpacked`) | every extension URL failed with `ERR_BLOCKED_BY_CLIENT` after the reload; a minimal MV3 extension failed the same way, so the harness, not the wallet |
| 22:5x | `chrome.developerPrivate.getExtensionsInfo` after the reload | `state: DISABLED`, `unsupportedDeveloperExtension: true`: Chrome checks an unpacked extension again as it reloads and, with developer mode off, leaves it disabled. With developer mode on the reload completes and `storage.session` comes back empty (HS3-D14) |
| 23:0x | Probe on the real build, Chrome headless and headful, then Firefox | `nulo:core:session` present before, gone after; the next popup on `#/popup/auth`; both browsers close the open Nulo tab rather than reloading it (OA-8) |
| 23:1x | Firefox 153 source (`omni.ja`) | `runtime.reload()` re-installs a temporary add-on, or sets an installed one disabled then enabled (`AddonWrapper.reload`); `storage.session` is a map keyed by the Extension instance, so every restart starts it empty |
| 23:2x | First committed spec timed out | after the restart Puppeteer lists the dead worker's target beside the new one, and an attach to the dead one never answers; `evaluateInBackground` takes the first listed. `backgroundOrigin` reads every listed worker on a budget (HS3-D14). Not fixed in `evaluateInBackground`: no spec reads the background after a restart |
| 23:3x | Codex design consult (gpt-6.1-sol high, read-only) | approve: trigger on both deletes refused, not the read-back; the restart in `lockActiveProfile`, not `close()`; immediate, read-back kept. Asked for the 0/1/2 matrix with the read-back failing, and `close()` never restarting (HS3-D13) |
| 23:4x | Restart built; mutation: restart on every lock | the control and the read-back row fail; restored |
| 23:5x | Smoke spec on the wallet's own restart; negative run without the refusal | green on both browsers; without the refusal it fails waiting for the pages to close |
| 00:0x | Network spec: a connected playground after the restart | green on both browsers (proverless) after the app's page loads again; the measured tab and app behaviour went to OA-8 |
