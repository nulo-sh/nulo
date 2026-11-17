# scroll-cue-build-2: phase 0 (planning)

- **No plan-stage consult.** The lane brief's proportion sets one Codex pass over the plan and the net diff after the build, and no Opus leg; the decisions D1 to D7 go to that pass.
- **Classic-scrollbar probe (D3).** A scratch script (outside the repo) loaded a static page that copies the shell's layout (24 px side padding, a centred 640 px column, a fixed 36 px button at `right: 16px` and at `right: 16px + gutter`) in Puppeteer's Chrome 155 with `--hide-scrollbars` dropped from the default arguments, over a pipe, and in the suite's pinned Firefox 158 with `ui.useOverlayScrollbars: 0` and `widget.gtk.overlay-scrollbars.enabled: false`. Results, `innerWidth / clientWidth / gutter`, then the button's right edge at each offset:
  - Chrome 1280 / 1265 / 15: 1249 at `16px`, 1234 at `16 + gutter`. Firefox 1280 / 1268 / 12: 1252 and 1240.
  - Chrome 791 would be the first window with `clientWidth` 776; at 790 (775) the column ends at 707.5. Firefox's first is 788.
  - So a fixed box's `right` counts from the scrollbar's inner edge, and `16 + gutter` counted the bar twice.
- **The brief's 708 px.** It counts the room on one side of a column that is centred; the same terms give 776 (plan § The threshold).
