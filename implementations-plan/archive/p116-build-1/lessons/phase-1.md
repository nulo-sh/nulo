# Phase 1: Receive

- Base times (armed builds at 002b76fc7, retry 0): Chrome snackbar 46.7 s, Firefox 51.7 s.
- First head run: the still-pointer success test (`snackbar.test.ts`) failed its own precondition (`under.covered` false). At 240 px the sheet no longer scrolls, so the snack, 12 px above Close, covers the network line and no longer the address's last line. Fix: aim at the network line's centre; the `covered` assertion stays. Second run 9/9.
