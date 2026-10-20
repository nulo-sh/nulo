# Phase 4: the full backup's done state

## I1: Chrome's surfaces under `getViews({ type: "popup" })`

Checked once in the e2e driver's Chrome (the armed build, a scratch spec never committed): the tab
page answers `false`; the real action popup, opened with `chrome.action.openPopup({ windowId })`
from that tab, answers `true`; the side panel, opened with `chrome.sidePanel.open({ windowId })`
from a trusted click, answers `false`. So Close calls `window.close()` only in the action popup, and
the side panel and a tab take `goBack`.

Deviation: the plan named the chrome-extension-debug skill (DevTools MCP); this session had no
DevTools MCP, so the check ran through the driver's CDP session against the same Chrome build.

## Known limit 2: "ask where to save" in the side panel

Not attemptable on this host: headless Chrome shows no Save As dialog, and Xvfb here has no input
tool (no xdotool) to cancel one in a headful Chrome. The mechanism the limit states is the one in
`downloadFile`: `chrome.downloads.download` answers once Chrome creates the download, and the file
chooser comes after it, so a cancelled chooser in a surface that stays open would read saved
(moderate confidence, unverified). Left to the owner's Mac check with OA-4; nothing was reproduced,
so no plan change.

## Attempts

- The Chrome gate's first run failed 2 of 7 with `Connection closed` / `frame got detached`: the I1
  scratch spec ran at the same time on the same `dist/chrome`, and the smoke global setup's
  `killChromesLoading(dist)` reaped the gate's browsers. Self-inflicted; the rerun alone passed 7/7.
  Two smoke runs of one browser never share a dist.
