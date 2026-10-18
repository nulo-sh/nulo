# Phase 2: the done page

- Gate: green on the first run (STATUS.md, 15:40Z).
- `done.vue` used `useAppStore` through the auto-import only, which vitest does not apply; it now imports it explicitly, as `import.vue` does, so the page can be mounted in a unit test.
