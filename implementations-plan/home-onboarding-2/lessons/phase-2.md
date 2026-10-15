# Phase 2: the Firefox manifest's optional host permission

- 2026-10-15: `web-ext@10.6.0 lint --self-hosted` on the base Firefox build: 0 errors, 0 notices, 10 warnings (3 `DANGEROUS_EVAL`, 3 `UNSAFE_VAR_ASSIGNMENT`, 4 `UNSUPPORTED_API`). On the head build: the same output, line for line. I2 holds: an origin in both lists draws no new message.
- The built `dist/firefox/manifest.json` carries `optional_host_permissions: ["https://127.0.0.1/*", "http://127.0.0.1/*"]` beside the unchanged `host_permissions`, and no `optional_permissions`: crxjs passes the key through, and `defineManifest`'s type accepts it with no suppression.
- The new Firefox pin in `src/manifest.test.ts` is red on the base config and green on the head.
- The first build regenerated `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json` for the new composable (it lives in `src/composables/`, which the app auto-imports); `components.d.ts` stayed as Phase 1 wrote it by hand.
- Gate: `bun run lint` 0, `bun run test` 0, both builds and both lints as above.
