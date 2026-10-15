import path from "node:path"
import type { CrxPlugin } from "@crxjs/vite-plugin"
import type { Plugin } from "vite"

type Manifest = Parameters<NonNullable<CrxPlugin["renderCrxManifest"]>>[0]

const MARK = /[?&]content-script$/

/** A module id of the content script's own, which no other entry's import resolves to. */
export const isolatedId = (id: string): string => `${id}${id.includes("?") ? "&" : "?"}content-script`

/**
 * Removes the content scripts' own files from `web_accessible_resources`, and the key once it is
 * empty. The browser injects a declared content script whether or not its file is web-accessible;
 * crxjs lists it for the loader it uses only when the script imports other chunks.
 */
export function withoutContentScriptResources(manifest: Manifest): Manifest {
	const injected = new Set(manifest.content_scripts?.flatMap(({ js = [] }) => js))
	const kept = (manifest.web_accessible_resources ?? [])
		.map((entry) => ({ ...entry, resources: entry.resources.filter((file) => !injected.has(file)) }))
		.filter(({ resources }) => resources.length > 0)
	const { web_accessible_resources: _, ...rest } = manifest
	return kept.length ? { ...rest, web_accessible_resources: kept } : rest
}

/**
 * Keeps the content script's module graph out of every shared chunk, so crxjs injects it as one
 * import-free file and no page can detect the install by fetching a web-accessible chunk. A build
 * that gives the script an import again gets crxjs's loader back, which the third-party-notices
 * policy refuses as an unclaimed asset.
 */
export function contentScriptIsolation(): Plugin[] {
	let entry = ""
	return [
		{
			name: "content-script-isolation",
			apply: "build",
			enforce: "pre",
			configResolved(config) {
				entry = path.resolve(config.root, "src/content-script/content.ts")
			},
			async resolveId(source, importer, options) {
				if (!importer || (importer !== entry && !MARK.test(importer))) return null
				const resolved = await this.resolve(source, importer.replace(MARK, ""), { ...options, skipSelf: true })
				// A virtual module's own plugin loads it by its exact id, so it keeps that id.
				if (!resolved || resolved.external || resolved.id.startsWith("\0")) return resolved
				return { ...resolved, id: isolatedId(resolved.id) }
			},
		},
		// Post, and registered after `crx()`: crxjs adds the entry in its own post `renderCrxManifest`.
		{
			name: "content-script-resources",
			apply: "build",
			enforce: "post",
			renderCrxManifest: withoutContentScriptResources,
		} as CrxPlugin,
	]
}
