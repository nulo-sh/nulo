/**
 * Default (real) adapter implementations of the ports. The composition root
 * instantiates these once at the extension shell; services receive them as
 * dependencies and never import them directly.
 */

export { SystemClock } from "./system-clock"
export { RealChromeBrowserApi } from "./chrome-browser-api"
export { ClockTickerAdapter } from "./clock-ticker-adapter"
