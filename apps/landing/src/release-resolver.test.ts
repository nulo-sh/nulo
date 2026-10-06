import { describe, expect, it } from "vitest"
import { noReleaseInfo, resolveReleaseInfo } from "./release-resolver"

const apiOk = {
	tag_name: "v1.2.3",
	html_url: "https://github.com/nulo-sh/nulo/releases/tag/v1.2.3",
	published_at: "2000-01-01T00:00:00Z",
	assets: [
		{ name: "nulo-chrome-1.2.3.zip", browser_download_url: "https://example.test/nulo-chrome-1.2.3.zip" },
		{ name: "nulo-firefox-1.2.3.zip", browser_download_url: "https://example.test/nulo-firefox-1.2.3.zip" },
		{ name: "SHASUMS256.txt", browser_download_url: "https://example.test/SHASUMS256.txt" },
	],
}

describe("resolveReleaseInfo", () => {
	it("parses a release payload into the landing's release shape", () => {
		expect(resolveReleaseInfo(apiOk)).toEqual({
			status: "ok",
			version: "1.2.3",
			publishedAt: "2000-01-01T00:00:00Z",
			chromeZipUrl: "https://example.test/nulo-chrome-1.2.3.zip",
			releaseUrl: "https://github.com/nulo-sh/nulo/releases/tag/v1.2.3",
			shasumsUrl: "https://example.test/SHASUMS256.txt",
		})
	})

	it("throws when no nulo-chrome-*.zip asset is present (must fail loud, not silently)", () => {
		const without = { ...apiOk, assets: apiOk.assets.filter((a) => !a.name.startsWith("nulo-chrome-")) }
		expect(() => resolveReleaseInfo(without)).toThrow(/no nulo-chrome-.*\.zip asset/)
	})
})

describe("noReleaseInfo", () => {
	it("points at the repo's releases page so first-time deploys don't break the CTA", () => {
		expect(noReleaseInfo("nulo-sh/nulo")).toEqual({
			status: "no-release",
			releaseUrl: "https://github.com/nulo-sh/nulo/releases",
		})
	})
})
