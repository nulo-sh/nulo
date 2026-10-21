import { readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, test } from "vitest"
import { REPO_ROOT, sourceFiles } from "../../scripts/type-roles/source-scan"

/**
 * Static ban: Privacy Policy § 5.2 keeps transaction execution from triggering a price fetch, and
 * `usePrices` holds that line by asking for `refreshIfStale` only outside a window document. So no
 * other UI code may name `refreshIfStale`, and the window document is captured once, at boot, before
 * the router can move the first route. This test fails the unit gate listing every offending line.
 */

const SRC_ROOT = "apps/extension/src"

/** The composable that decides, and the price service's own definition of the call. */
const REFRESH_ALLOWED = new Set([
	"composables/usePrices.ts",
	"wallet/services/price/client.ts",
	"wallet/services/price/service.ts",
	"wallet/services/price/spec.ts",
])
const CAPTURE_DECLARED = "utils/window-document.ts"
const BOOT = "popup/index.ts"
const BOOT_CAPTURE = "captureWindowDocument(window.location.hash)"

type Source = { path: string; content: string }

const scanned = (path: string) => !/\.test\.(ts|js)$/.test(path) && !path.startsWith("types/")

/** Code lines naming `name`, as `file:line → text`; comment lines may mention it. */
function linesNaming(files: Source[], name: string, skip: (path: string) => boolean): string[] {
	const word = new RegExp(`\\b${name}\\b`)
	const hits: string[] = []
	for (const { path, content } of files) {
		if (!scanned(path) || skip(path)) continue
		content.split("\n").forEach((line, i) => {
			const trimmed = line.trim()
			if (/^(\/\/|\/?\*|<!--)/.test(trimmed)) return
			if (word.test(trimmed)) hits.push(`${path}:${i + 1} → ${trimmed}`)
		})
	}
	return hits
}

const refreshOffenders = (files: Source[]) => linesNaming(files, "refreshIfStale", (path) => REFRESH_ALLOWED.has(path))

/** Every way the capture is wired wrong: a caller besides the boot module, or a boot module that
 *  does not capture the first URL before it creates the router. */
function captureOffenders(files: Source[]): string[] {
	const offenders = linesNaming(files, "captureWindowDocument", (path) => path === CAPTURE_DECLARED || path === BOOT)
	const boot = files.find((file) => file.path === BOOT)?.content ?? ""
	const capture = boot.indexOf(BOOT_CAPTURE)
	if (capture < 0 || capture !== boot.lastIndexOf(BOOT_CAPTURE) || capture > boot.indexOf("createRouter(")) {
		offenders.push(`${BOOT} → must call ${BOOT_CAPTURE} once, before createRouter(`)
	}
	return offenders
}

const BOOT_OK = `${BOOT_CAPTURE}\nconst router = createRouter({})`

describe("price refresh ban (static)", () => {
	const files = sourceFiles({ roots: [SRC_ROOT], exts: ["ts", "js", "vue"] }).map((file) => ({
		path: relative(SRC_ROOT, file),
		content: readFileSync(join(REPO_ROOT, file), "utf8"),
	}))

	test("no UI code but usePrices asks for a refresh", () => {
		const offenders = refreshOffenders(files)
		expect(offenders, `refreshIfStale outside usePrices:\n${offenders.join("\n")}`).toEqual([])
	})

	test("the boot module alone captures the window document, before the router exists", () => {
		const offenders = captureOffenders(files)
		expect(offenders, `window document capture wired wrong:\n${offenders.join("\n")}`).toEqual([])
	})

	test("the refresh scan catches a direct call, an optional call and an extracted method, not a comment", () => {
		const inWindow = (content: string) => [{ path: "popup/windows/example/index.vue", content }]
		expect(refreshOffenders(inWindow("void priceService.refreshIfStale()"))).toHaveLength(1)
		expect(refreshOffenders(inWindow("priceService.refreshIfStale?.()"))).toHaveLength(1)
		expect(refreshOffenders(inWindow("priceService.refreshIfStale.call(priceService)"))).toHaveLength(1)
		expect(refreshOffenders(inWindow("// usePrices owns refreshIfStale"))).toEqual([])
		expect(refreshOffenders([{ path: "composables/usePrices.ts", content: "priceService.refreshIfStale()" }])).toEqual([])
	})

	test("the capture scan admits the declaration and the boot call, and catches a second caller or a late one", () => {
		const declaration = { path: CAPTURE_DECLARED, content: "export function captureWindowDocument(hash: string): void {" }
		expect(captureOffenders([declaration, { path: BOOT, content: BOOT_OK }])).toEqual([])
		const second = { path: "popup/pages/auth.vue", content: "captureWindowDocument(location.hash)" }
		expect(captureOffenders([declaration, { path: BOOT, content: BOOT_OK }, second])).toHaveLength(1)
		const late = `const router = createRouter({})\n${BOOT_CAPTURE}`
		expect(captureOffenders([declaration, { path: BOOT, content: late }])).toHaveLength(1)
		expect(captureOffenders([declaration, { path: BOOT, content: "const router = createRouter({})" }])).toHaveLength(1)
	})
})
