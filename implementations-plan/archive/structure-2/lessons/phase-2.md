# Phase 2: the detail hero line and the explorer name

- 2026-10-18: `src/utils/a11y-css.test.ts` ("every link on the tx, received and journal pages binds a local class composing a ringed one") counts the `<a>` tags each file renders. Moving the hero link into `DetailHeroMeta` moved one anchor out of each page, so the full unit run was red at 1/13,902. The plan's test-identity list did not name this pin. Fix: its table gains the component's row (1 anchor) and each page's count drops by one; the title and the ring check are unchanged. Recorded as D11.
