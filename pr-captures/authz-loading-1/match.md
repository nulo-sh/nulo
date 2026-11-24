# authz-loading-1 · frame match

Method: the execute window's capture shell (the prototype's harness, ported without its look switch) around the real `OperationCard`, in the Storybook dev server at the branch head, screenshotted by Puppeteer at 400×800, 1×, light and dark; animations paused at 0.2 / 0.7 / 1.2 s through the Web Animations API; reduced motion emulated. Compared with the decision page's frames by per-pixel RGBA difference and md5.

Result: 24 of 24 compared frames are byte-identical (0 differing pixels, equal md5). Pending frames match `Q1-a-*`; loaded, raw and failed match `Q1-today-*`.

| Frame | Page frame | Differing pixels | Byte-identical |
|---|---|---|---|
| card-failed-dark.png | Q1-today-card-failed-dark.png | 0 of 320000 | yes |
| card-failed-light.png | Q1-today-card-failed-light.png | 0 of 320000 | yes |
| card-loaded-dark.png | Q1-today-card-loaded-dark.png | 0 of 320000 | yes |
| card-loaded-light.png | Q1-today-card-loaded-light.png | 0 of 320000 | yes |
| card-loading-cycle-dark.png | Q1-a-card-loading-cycle-dark.png | 0 of 960000 | yes |
| card-loading-cycle-light.png | Q1-a-card-loading-cycle-light.png | 0 of 960000 | yes |
| card-loading-dark.png | Q1-a-card-loading-dark.png | 0 of 320000 | yes |
| card-loading-light.png | Q1-a-card-loading-light.png | 0 of 320000 | yes |
| card-loading-reduced-motion-dark.png | Q1-a-card-loading-reduced-motion-dark.png | 0 of 320000 | yes |
| card-loading-reduced-motion-light.png | Q1-a-card-loading-reduced-motion-light.png | 0 of 320000 | yes |
| card-raw-dark.png | Q1-today-card-raw-dark.png | 0 of 320000 | yes |
| card-raw-light.png | Q1-today-card-raw-light.png | 0 of 320000 | yes |
| send-failed-dark.png | Q1-today-send-failed-dark.png | 0 of 320000 | yes |
| send-failed-light.png | Q1-today-send-failed-light.png | 0 of 320000 | yes |
| send-loaded-dark.png | Q1-today-send-loaded-dark.png | 0 of 320000 | yes |
| send-loaded-light.png | Q1-today-send-loaded-light.png | 0 of 320000 | yes |
| send-loading-beside-fee-dark.png | Q1-a-send-loading-beside-fee-dark.png | 0 of 320000 | yes |
| send-loading-beside-fee-light.png | Q1-a-send-loading-beside-fee-light.png | 0 of 320000 | yes |
| send-loading-dark.png | Q1-a-send-loading-dark.png | 0 of 320000 | yes |
| send-loading-light.png | Q1-a-send-loading-light.png | 0 of 320000 | yes |
| send-loading-reduced-motion-dark.png | Q1-a-send-loading-reduced-motion-dark.png | 0 of 320000 | yes |
| send-loading-reduced-motion-light.png | Q1-a-send-loading-reduced-motion-light.png | 0 of 320000 | yes |
| send-raw-dark.png | Q1-today-send-raw-dark.png | 0 of 320000 | yes |
| send-raw-light.png | Q1-today-send-raw-light.png | 0 of 320000 | yes |

Not compared (no page frame of their own): the 0.2 s and 1.2 s card stills (the card's cycle strip, which holds them, is byte-identical), the three send stills' 0.2 s and 1.2 s moments, and the send's cycle strip.

Accessibility tree (Chromium, puppeteer snapshot): the card's arguments block is `status[busy]` holding "Reading arguments…" once; a pending authorization's list item holds "Reading arguments…" once (its line), its opened details none; a pending step's item holds it once.
