/** The store listings, named by item id so a listing rename never breaks a link. `index.html` carries the same URLs for visitors without JavaScript. */
export const STORES = {
	chrome: { url: "https://chromewebstore.google.com/detail/jlmiaokmjoicmclelpiiocdhncddkdmc", name: "Chrome" },
	firefox: { url: "https://addons.mozilla.org/firefox/addon/3077967/", name: "Firefox" },
} as const

export type StoreId = keyof typeof STORES

export type Install = { store: StoreId; browser: "Chrome" | "Edge" | "Brave" | "Opera" | "Firefox" }

/** The navigator fields detection reads. */
export type NavigatorLike = {
	userAgent: string
	brave?: unknown
	userAgentData?: { mobile?: boolean }
}

const HANDHELD = /Android|iPhone|iPad|iPod|Mobile/

/**
 * The store and browser name for a desktop browser that can install Nulo, or `null` when the page
 * should offer both stores. A phone in "desktop site" mode sends a desktop user agent and cannot be
 * told apart; its store page then refuses the install.
 */
export function detectInstall(nav: NavigatorLike): Install | null {
	const ua = nav.userAgent
	if (HANDHELD.test(ua) || nav.userAgentData?.mobile === true) return null
	if (/\bFirefox\//.test(ua)) return { store: "firefox", browser: "Firefox" }
	if (!/\b(?:Chrome|Chromium)\//.test(ua)) return null
	if (/\bEdg\//.test(ua)) return { store: "chrome", browser: "Edge" }
	if (/\bOPR\//.test(ua)) return { store: "chrome", browser: "Opera" }
	// Brave sends Chrome's user agent; this flag is its only tell, and a user can hide it.
	if (nav.brave !== undefined) return { store: "chrome", browser: "Brave" }
	return { store: "chrome", browser: "Chrome" }
}
