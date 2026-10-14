# Phase 1: the fee card's dead path (#406)

- 2026-10-14. Deleted as planned. The two template blocks gated on `showMethodSelector` lost their `<template>` wrapper once the condition was always true; `.card` and `.method_size` stay, used by the locked row.
- The one live-region guard is rewritten on a plain mount: both reads held (the region is there, empty, with its three attributes), then both refused (the same element carries the notice, and the method row is gone).
- Gate: unit 389/389, `bun run test` green, smoke Chrome 103 s and Firefox 112 s for the two files at retry 0.
