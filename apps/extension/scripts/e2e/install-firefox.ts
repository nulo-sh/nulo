/** Installs the e2e suite's pinned Firefox into Puppeteer's cache through the installed launcher, so it never fetches one. */
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { E2E_FIREFOX_REVISION } from "../../tests/e2e/fixtures/browser/firefox-revision"

const PUPPETEER = join(dirname(fileURLToPath(import.meta.url)), "../../node_modules/.bin/puppeteer")

const res = spawnSync(process.execPath, ["--no-install", PUPPETEER, "browsers", "install", `firefox@${E2E_FIREFOX_REVISION}`], {
	stdio: "inherit",
})
process.exit(res.status ?? 1)
