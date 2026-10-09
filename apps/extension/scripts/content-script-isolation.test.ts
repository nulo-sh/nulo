import { describe, expect, test } from "vitest"
import { contentScriptIsolation, isolatedId, withoutContentScriptResources } from "./content-script-isolation"

type Manifest = Parameters<typeof withoutContentScriptResources>[0]

const ENTRY = "/repo/apps/extension/src/content-script/content.ts"

describe("withoutContentScriptResources", () => {
	// Shaped as crxjs 2.7.1 emits it for an import-free content script.
	test("drops the entry crxjs adds for the injected file, and the key with it", () => {
		const manifest = {
			content_scripts: [{ js: ["assets/content.ts-a1.js"], matches: ["*://*/*"] }],
			web_accessible_resources: [{ matches: ["*://*/*"], resources: ["assets/content.ts-a1.js"], use_dynamic_url: false }],
		} as Manifest
		expect(withoutContentScriptResources(manifest)).toEqual({ content_scripts: manifest.content_scripts })
	})

	test("keeps every resource that is not an injected file", () => {
		const manifest = {
			content_scripts: [{ js: ["assets/content.ts-a1.js"], matches: ["*://*/*"] }],
			web_accessible_resources: [
				{ matches: ["*://*/*"], resources: ["assets/content.ts-a1.js", "assets/chunk-b2.js"] },
				{ matches: ["https://example.com/*"], resources: ["assets/page.html"] },
			],
		} as Manifest
		expect(withoutContentScriptResources(manifest).web_accessible_resources).toEqual([
			{ matches: ["*://*/*"], resources: ["assets/chunk-b2.js"] },
			{ matches: ["https://example.com/*"], resources: ["assets/page.html"] },
		])
	})
})

describe("the isolating resolver", () => {
	const [plugin] = contentScriptIsolation()
	const configResolved = plugin.configResolved as (config: { root: string }) => void
	configResolved({ root: "/repo/apps/extension" })
	type Resolved = { id: string } | null
	const resolveId = plugin.resolveId as (
		this: { resolve: (source: string, importer?: string) => Promise<Resolved> },
		source: string,
		importer: string | undefined,
		options: object,
	) => Promise<Resolved>
	const seen: (string | undefined)[] = []
	const context = {
		resolve: async (source: string, importer?: string) => {
			seen.push(importer)
			return source.startsWith("virtual:") ? { id: `\0${source}` } : { id: `/repo/node_modules/${source}.js` }
		},
	}
	const resolve = (source: string, importer?: string) => resolveId.call(context, source, importer, {})

	test("gives every module the content script reaches an id of its own", async () => {
		expect(await resolve("sdk", ENTRY)).toEqual({ id: "/repo/node_modules/sdk.js?content-script" })
		expect(await resolve("dep", isolatedId("/repo/node_modules/sdk.js"))).toEqual({ id: "/repo/node_modules/dep.js?content-script" })
		expect(seen.at(-1)).toBe("/repo/node_modules/sdk.js")
		expect(isolatedId("/repo/x.js?raw")).toBe("/repo/x.js?raw&content-script")
	})

	test("leaves every other entry's imports and virtual modules alone", async () => {
		expect(await resolve("sdk", "/repo/src/background/index.ts")).toBeNull()
		expect(await resolve("sdk", undefined)).toBeNull()
		expect(await resolve("virtual:x", ENTRY)).toEqual({ id: "\0virtual:x" })
	})
})
