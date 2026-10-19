# firefox-sidebar-1: owner asks

The draft PR ships without an answer to any of these, and each entry says what ships now. OA-2 and OA-4 gate the PR leaving draft.

## OA-1: how a person opens the sidebar

- **Ships now**: Firefox's own sidebar UI, its sidebar menu or the sidebar launcher, lists "Nulo V6" with its icon. Settings → Display shows no "Open as Side Panel" row on Firefox, and the toolbar button keeps opening the popup.
- **The question**: should Settings → Display offer the row on Firefox, with the toolbar button then opening the sidebar, as it opens Chrome's side panel?
- **Cost if yes**: Firefox has no "open on action click". The row would call `sidebarAction.open()` in its click handler, since it requires user input. The background would also take over the toolbar button (`action.onClicked`, and the popup unset while the setting is on). That adds a background listener and a second Settings behaviour on Firefox, plus a test of each.

## OA-2: the sidebar's width

- **Ships now (in the draft)**: the popup's 360 px layout. Firefox opens the sidebar narrower than that: 240–252 px for its default (old) sidebar, 340 px for the revamped one. In the old sidebar about a third of the page is cut until the person widens the sidebar or scrolls: the network badge and Lock, half of Receive, the end of the balance and the Settings tab (`screenshots/sidebar-home-opening-width.png`). In the revamped one every tab fits and the page scrolls 20 px. Pictures are in the PR.
- **Gates leaving draft**: the answer is either a layout change, which is a new plan change with pictures, or an accepted limit, filed as a closed `known-limit` issue.
- **The question**: should the shell fit a narrower sidebar? The options are a fluid width on the Firefox sidebar only, a fluid width on every surface, or Firefox's own resizing as today.
- **Cost if yes**: a layout change across every popup page, reviewed with pictures.

## OA-3: the sidebar at install and after an update

- **Ships now**: `open_at_install: false`. Installing Nulo opens no sidebar, as Chrome installs no open side panel. A sidebar left open comes back after a plain Firefox restart, but not after a Nulo update or a Firefox update that resets the startup cache (Firefox re-shows an extension's sidebar there only when this key is true).
- **The question**: open the sidebar at install, and keep it across updates, by setting the key to true?
- **Cost if yes**: every new Firefox install opens Nulo in the sidebar beside the onboarding tab.

## OA-4: is Linux proof enough

- **Ships now**: the spike and the e2e spec run on Linux (headless in CI). They prove that a passkey step started in the sidebar runs in place, and that Firefox allows WebAuthn in a focused sidebar.
- **The question**: on a Mac, does the OS passkey prompt leave the sidebar open and the step alive? The toolbar panel's window exists because a Mac closes the panel when that prompt takes focus (Mozilla bug 2026687), and headless Linux never shows that.
- **What would settle it**: one manual unlock with a passkey from the sidebar on a Mac, using the draft PR's build. If the sidebar dies there, the step needs the panel's window and the arc changes.
- **Gates leaving draft**: the answer is either that Mac check, run by the owner, or an accepted limit, filed as a closed `known-limit` issue.
