# Phase 8: pictures

From a build of the branch, light and dark, every popup route of a seeded wallet (39) and every window state the network sweep reaches:
- Chrome's popup page at 360 and at 240 (a2's own armed build);
- Firefox's sidebar at 240, 340 and 360, the whole window drawn with `drawSnapshot`, headful under Xvfb (a1 and a2 together, since the sidebar needs #889's wiring);
- the dApp windows at 360 and at 240, from the network lane on both browsers.

A page that scrolls also has a `--full` picture, its viewport grown to the page's length, so what sits below the fold is shown too.

Copies: `~/.cache/nulo-backlog/firefox-sidebar-1/shots/w240/`, with `index.txt`. 824 pictures: Chrome's popup 214, Firefox's sidebar 234, the windows 188 on each browser.

## What the pictures found that no check read

The first set, read by eye, showed three defects the gate cannot see, since no text is cut:
- Get started's "How Aztec works" broke inside its words ("Azte/c", "work/s"): the row's 72 px minimum sat on its left group, icon included, so beside "1 min" the text kept about 34 px. The minimum moved to the text column.
- A send record's "Started" and "Ended" touched their wrapped values: those rows have no gap. Below 359 px a detail row keeps 16 px between key and value.
- A transaction's App value broke inside "rather": its `break-all` exists for one unbreakable name. Below 359 px it breaks between words, inside one only when a word is wider than the line.

The window set showed one more: at 240 the execute window's details broke a name inside its word ("AMOU / NT:", "Donat / e") and split shortened addresses ("0x283d9c..24 / 3d"). Its rows let both name and value break anywhere, so each squeezed the other. Below 359 px a value goes under its name, at the right, when the two do not fit. The gate now reads a split identifier as a text fate, proved on a planted page: the layout and cut checks pass a word broken anywhere, since nothing overflows.

The sidebar pictures first drew the browser window, whose snapshot drops the sidebar's translucent layers: the network page's active row (at half opacity) came out blank in the sidebar and whole in a tab of the same build. A snapshot of the sidebar's own document draws it, so each picture now paints that over the window. On Firefox, Contracts, Notes and Senders show "Something went wrong" with no node to read, as `dev`'s build does in the same run.

With the split check reading lines by their tops, the full smoke run found one more: the account switcher's shortened address split at 240, since a settings row lets its text shrink to 72 px beside its controls. A `meta` description now keeps a 14-character line (a shortened address is 13), and the row's controls go under its text when that does not fit. `nowrap` was tried first and failed: Manage accounts shows a complete address in that role, which must keep wrapping.

Left as they are, for the owner: placeholders cut in narrow one-line fields, with an ellipsis or, in a focused field on Chrome, mid-letter (OA-6), a dApp chip's 96 px cap (as at 360).
