# square-corners-1: owner asks

## OA-1: the other rounded corners (#928)

Your note on P71-07: "on Nulo if I'm not wrong there are NO rounded corners." Arc 1 squares the notice card, the one you saw. Eight more things have rounded corners today. Each is a literal in the wallet's own files, except one editor-library default in item 6; `@nulo/design` has no radius token.

- **Surfaces** (pictures: before and after, light and dark, from a real build, in the arc 1 report as `SHOTS_READY oa1`):
  1. **The logs and JSON windows' frame** (`window-shell.module.css`, 8px): the bordered box around the viewer.
  2. **The logs window's toolbar buttons** (`LogsToolbar.vue`, 6px): Source, Level and the Log actions (⋯) button.
  3. **The Source and Level filter panels** (`Popover.vue` in `@nulo/design`, 10px). Only the logs window uses it; the Log actions menu is a different, square one.
  4. **The rows inside those menus** (`LogsToolbar.vue`, 4px): filter rows, Export CSV and Clear logs; the shape shows on hover.
  5. **The JSON viewer's copy icon** (`JsonViewer.vue`, 5px): a faint square behind the icon on hover, visible in the dark theme only. The viewer opens from the import error viewer, revoke authwits, the developer pages and the JSON window. Its full-screen icon carries the same 5px but no screen shows that icon today.
  6. **The search boxes** (Ctrl/Cmd-F): in the JSON viewer the box is 6px and its field and buttons 3px (`creator.js`); in the logs window the buttons are 1px, the editor library's own default. Also **the outline on other matches of a selected word** in the JSON viewer (2px).
  7. **The focus ring on an awaiting transaction's Focus and Cancel buttons** (`TransactionAwaitingCard.vue`, 4px): visible when the button has keyboard focus. The buttons themselves are square.
  8. **The RETRY button** on the "wallet could not start" banner (`popup/app.vue`, 4px): seen only when the wallet fails to start. Its picture is a forced state: the banner as it renders, set from the page, since the capture cannot make the wallet fail.
- **Readings** (computed in Chrome, both themes, from the two builds): before, every value above as listed; after squaring, no element on any pictured screen has a rounded corner. The search box's three checkboxes are the browser's own and keep their look under every answer.
- **Q1, the corners**:
  - **A (recommended)**: square all eight. Same colours, borders, sizes and spacing; only the corners change. This matches your note.
  - **B**: square only the numbers you name; the rest keep their corners.
  - **C**: keep all eight as they are.
- **Q2, a guard** (independent of Q1): a test that fails the build on any new rounded corner in the wallet's own source (`apps/extension/src`, `packages/design/src`, stylesheets and the editor themes in `creator.js`), as the red-text and type-role guards work. Circles are allowed. Each corner kept under B or C is listed in the test with your reason. The arc 1 pin on the notice card folds into it. It cannot see a radius a third-party library draws by default, such as the logs search buttons' 1px. **Yes (recommended)** or **No**.
- **Circles stay under every answer**: the spinner, the status dots (refreshing, failure, active network), the corner badges on transaction and passkey screens, and the logs window's scroll-to-end button. They are round shapes, not rounded corners. Say so if you want them square too.
- **No visible change either way**: radii the wallet declares but never draws follow the item in the same file. The full-screen icon follows 5; the editor's cursor, autocomplete and lint styles and a logs scrollbar rule Chrome ignores (all in `creator.js`) follow 6.
- **What ships now**: arc 1 squares the notice card only. Everything above keeps its shape until you answer. Arc 2 builds your answer, the guard if you take it, and closes #928.
- **Answered** on decision page 72 (2026-10-20): Q1 **A** (P72-01), every surface above square, circles round; Q2 struck (P72-02), no guard. Shipped by arc 2 ([plan.md § Arc 2](plan.md#arc-2-the-rest-after-oa-1)).
