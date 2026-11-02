import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { detectInstall, type Install, type NavigatorLike, STORES } from "./install"

const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"
const CHROME = `${WIN} Chrome/129.0.0.0 Safari/537.36`

const cases: [string, NavigatorLike, Install | null][] = [
	["Chrome on Windows", { userAgent: CHROME }, { store: "chrome", browser: "Chrome" }],
	[
		"Chrome on macOS",
		{
			userAgent:
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
		},
		{ store: "chrome", browser: "Chrome" },
	],
	[
		"Chrome on ChromeOS",
		{ userAgent: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36" },
		{ store: "chrome", browser: "Chrome" },
	],
	[
		"Chromium on Linux",
		{ userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chromium/129.0.0.0 Safari/537.36" },
		{ store: "chrome", browser: "Chrome" },
	],
	["Edge", { userAgent: `${CHROME} Edg/129.0.0.0` }, { store: "chrome", browser: "Edge" }],
	["Opera", { userAgent: `${CHROME} OPR/114.0.0.0` }, { store: "chrome", browser: "Opera" }],
	["Opera GX", { userAgent: `${CHROME} OPR/114.0.0.0 (Edition std-2)` }, { store: "chrome", browser: "Opera" }],
	[
		"Yandex reads as Chrome",
		{ userAgent: `${WIN} Chrome/124.0.0.0 YaBrowser/24.4.0.0 Safari/537.36` },
		{ store: "chrome", browser: "Chrome" },
	],
	["Brave", { userAgent: CHROME, brave: {} }, { store: "chrome", browser: "Brave" }],
	[
		"Firefox",
		{ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0" },
		{ store: "firefox", browser: "Firefox" },
	],
	[
		"Firefox ESR on Linux",
		{ userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0" },
		{ store: "firefox", browser: "Firefox" },
	],
	[
		"Tor Browser",
		{ userAgent: "Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0" },
		{ store: "firefox", browser: "Firefox" },
	],
	[
		"LibreWolf",
		{ userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0 LibreWolf/131.0-1" },
		{ store: "firefox", browser: "Firefox" },
	],
	[
		"Safari on macOS",
		{
			userAgent:
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
		},
		null,
	],
	[
		"Safari on iPhone",
		{
			userAgent:
				"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
		},
		null,
	],
	[
		"Firefox on iOS",
		{
			userAgent:
				"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15",
		},
		null,
	],
	[
		"Chrome on Android",
		{ userAgent: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36" },
		null,
	],
	[
		"Edge on Android",
		{
			userAgent:
				"Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 EdgA/129.0.0.0",
		},
		null,
	],
	[
		"Samsung Internet",
		{
			userAgent:
				"Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
		},
		null,
	],
	["Firefox on Android", { userAgent: "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0" }, null],
	["a desktop user agent that reports itself mobile", { userAgent: CHROME, userAgentData: { mobile: true } }, null],
	["an empty user agent", { userAgent: "" }, null],
]

describe("detectInstall", () => {
	it.each(cases)("%s", (_name, nav, expected) => {
		expect(detectInstall(nav)).toEqual(expected)
	})
})

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
const STORE_URLS = [STORES.chrome.url, STORES.firefox.url]
const storeLinks = (html: string) =>
	[...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1] as string).filter((href) => /chromewebstore|mozilla/.test(href))

describe.each(["index.html", "how-aztec-works.html"])("%s", (page) => {
	it("links a store only through a URL the script uses", () => {
		for (const link of storeLinks(source(page))) expect(STORE_URLS).toContain(link)
	})
})

it("index.html serves both stores, for a visitor without JavaScript", () => {
	expect(new Set(storeLinks(source("index.html")))).toEqual(new Set(STORE_URLS))
})

it("names the listings the Terms name in § 1", () => {
	const terms = source("../../legal/terms.md")
	const section = terms.slice(terms.indexOf("\n## 1."), terms.indexOf("\n## 2."))
	const urls = section
		.split(/\s+/)
		.filter((word) => word.startsWith("https://"))
		.map((word) => word.replace(/[.,;]+$/, ""))
	expect(new Set(urls)).toEqual(new Set(STORE_URLS))
})
