/**
 * The Firefox revision the e2e suite installs and launches, pinned apart from Puppeteer's own so a
 * Puppeteer bump never moves the browser alone: a Firefox can refuse what the one before it served,
 * as 157 did on extension pages (`tests/e2e/FIREFOX.md`).
 */
export const E2E_FIREFOX_REVISION = "stable_158.0"
