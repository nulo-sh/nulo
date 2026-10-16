/**
 * Selector contract for tests in this directory.
 *
 *   <area>-<entity>-<verb>      e.g.  setting-nav-profile, new-account-submit
 *
 * For list rows expose two attributes:
 *   data-<entity>-id="<stable id>"     — used to compose selectors
 *   data-<entity>-name="<display>"     — readable in failures / debugging
 *
 * Always select by testid; never by text content. Toast assertions are the
 * one exception (waitForToast) and use textContent scan for ergonomics.
 *
 * For inline validation errors prefer `data-testid="error-text"` plus
 * `role="alert"`. Avoid asserting on copy.
 */

// Every feature helper the specs import, re-exported from the module that owns its concern.
export * from "./accounts"
export * from "./address-book"
export * from "./auth"
export * from "./navigation"
export * from "./networks"
export * from "./profiles"
export * from "./session"
export * from "./settings"
export * from "./tokens"
export * from "./transfers"
export * from "./widgets"
