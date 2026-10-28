# lock-window-1: phase 1 (the lock screen and the export pages)

- The first `audit:vue` run was red on `scripts/e2e/profile-chaos-model.test.ts`: the chaos model cites `export/seed.vue` (the passkey reveal and its cancel) and `auth.vue` (the retired profile's delete) by line, and recon had listed only the service files it cites. Fixed by moving the three line numbers (D12). Before editing a popup page, grep `tests/e2e/helpers/profile-chaos/model.ts` for its path.
- A scratch e2e spec outside the repo cannot import `vitest` (no `node_modules` above it); importing only the repo's fixtures by absolute path, with a config that spreads `vitest.e2e.config.ts` and sets `root` and `test.dir`, runs it on the armed build.
- `createAndActivateProfile` presses the header's lock, so it must start from a page that shows the header (Home), not from an export page.
