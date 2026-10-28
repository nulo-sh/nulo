/**
 * The Firefox revision the e2e suite installs and launches, pinned apart from Puppeteer's own.
 * Firefox 157 and later refuse, on an extension page, every BiDi command that does not opt in to
 * privileged scope. The driver's `bringToFront` and `setViewport` avoid two of them, but a file pick
 * and a page's request interception still meet others (`tests/e2e/FIREFOX.md`).
 */
export const E2E_FIREFOX_REVISION = "stable_153.0.4"
