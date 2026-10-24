/**
 * The Firefox revision the e2e suite installs and launches, pinned apart from Puppeteer's own.
 * Firefox 157 and later class an extension-process page as privileged, and BiDi
 * `browsingContext.activate` and `setViewport` throw there, so `bringToFront` and `setViewport` on a
 * wallet page need a driver seam before this pin moves (`tests/e2e/FIREFOX.md`).
 */
export const E2E_FIREFOX_REVISION = "stable_153.0.4"
