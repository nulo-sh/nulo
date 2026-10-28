# Phase 0: planning consults

## Mock pictures

- The throwaway shot spec drove the armed Chrome smoke build with a localStorage switch per issue, so one build served every option. Two harness fixes on the way: a toast's text is upper-cased by CSS, so match `textContent` case-insensitively; the popup import page opens on its option chooser the first time and on the phrase form after, so wait for either.

## Round 1 (plan audit)

- Codex, gpt-6.1-sol at high, read-only: `conditional approve`. D1 to D6 all upheld, with conditions: settle a replaced confirm as false, complete D6's callers and tests, add `audit:vue` and the armed builds to the gates, and disclose two facts to the owner (imported accounts are outside "same accounts and funds"; "saved" means the browser accepted the download). All accepted after checking each against the tree.
- Opus Plan leg: `conditional approve`. Same D1 to D6 picks; eight findings, all accepted: the field can move during the ask because focus stays on the input behind the scrim (demonstrated by reading `Popup.vue`'s `initialFocus` default), a `0` settling after unmount, `stringCompare` over `localeCompare`, D6's full change map, retired profiles under #1228 A, the download boundary and B's `canDownload` trap under #1207, focus after the #1192 link's press, and the gate and test lists.
- Verified before accepting: `stringCompare` (`utils/string.ts:58`) orders the chooser (`SelectProfilePopup.vue:116`); `getProfiles` lists retired profiles (`profile/service.ts:767`); `goBack` closes an own window first (`utils/page-back.ts:10`); `downloadFile` resolves on `chrome.downloads.download`'s callback (`utils/files.ts:70-82`); `PasskeyReuseLink.test.ts` has 10 cases.

## Round 2 (Codex resume, verification)

- `conditional approve`, three conditions, all accepted: `askConfirm` settles false at its scope's disposal; "Do it later" refuses a repeat Enter after the link's press moves focus onto it; OA-5's retired-profile sentence over-promised and now covers the fallback only.

## Round 3 (Codex resume, verification)

- `approve`; no new material finding.
