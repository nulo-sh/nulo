# Phase 3: #765, the compact title on a return

- 2026-10-18: both observers (`settings/index.vue`, `activity.vue`) carry `heroSettled` and a `page_title_bar_instant` class (new in `tab-hero.module.css`) until the first report is drawn: `nextTick`, a `barRef` guard, one computed-opacity read, then the class goes.
- Component tests (one per page): the read sees the bar with `visible` and `instant`, `instant` then goes, and later reports run without it and read nothing more. Red on the base pages (2 failed), green with the change.
- E2E (`navigation.test.ts`, inside the existing return case): a capturing `transitionrun` counter on the bar. Red check on Chrome with the base pages built in: `expected 1 to be +0` (the fade the owner saw). With the fix: 0 on the return, 1 on a scroll to the top (the control). Chrome 8/8 (29 s), Firefox 8/8 (66 s), retry 0. The return case took 1.5 s on Chrome (was not measured alone before; the plan's estimate was +1 s).
- One e2e run started at load 185, above the brief's 150 line (it passed); every later run waits for load < 150 first.
- Gate F: lint 0, typecheck:all 0, test 0 (847 files passed).
