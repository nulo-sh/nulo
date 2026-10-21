import { readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, test } from "vitest"
import { REPO_ROOT, sourceFiles } from "../../scripts/type-roles/source-scan"

/**
 * Privacy Policy § 5.2: no price fetch from a window document. `usePrices` alone may ask for
 * `refreshIfStale`, and the boot module alone captures the window document, once, before the router
 * can move the first route.
 */

const SRC_ROOT = "apps/extension/src"

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
type Hit = { path: string; line: number; text: string }

const scanned = (path: string) => !/\.test\.(ts|js)$/.test(path) && !path.startsWith("types/")

/** Code lines naming `name`; a comment may mention it. */
function linesNaming(files: Source[], name: string, skip: (path: string) => boolean): Hit[] {
	const word = new RegExp(`\\b${name}\\b`)
	const hits: Hit[] = []
	for (const { path, content } of files) {
		if (!scanned(path) || skip(path)) continue
		content.split("\n").forEach((line, i) => {
			const text = line.trim()
			if (!/^(\/\/|\/?\*|<!--)/.test(text) && word.test(text)) hits.push({ path, line: i + 1, text })
		})
	}
	return hits
}

const show = (hits: Hit[]) => hits.map(({ path, line, text }) => `${path}:${line} → ${text}`)
const code = (hits: Hit[]) => hits.filter(({ text }) => !text.startsWith("import "))

const refreshOffenders = (files: Source[]) => show(linesNaming(files, "refreshIfStale", (path) => REFRESH_ALLOWED.has(path)))

function captureOffenders(files: Source[]): string[] {
	const offenders = show(linesNaming(files, "captureWindowDocument", (path) => path === CAPTURE_DECLARED || path === BOOT))
	const boot = files.filter((file) => file.path === BOOT)
	const [capture, ...more] = code(linesNaming(boot, "captureWindowDocument", () => false))
	const [router] = code(linesNaming(boot, "createRouter", () => false))
	if (capture?.text !== BOOT_CAPTURE || more.length > 0 || !router || capture.line > router.line) {
		offenders.push(`${BOOT} → must call ${BOOT_CAPTURE} once, before createRouter(, and nowhere else`)
	}
	return offenders
}

const IMPORT = 'import { captureWindowDocument } from "@/utils/window-document"'
const BOOT_OK = `${IMPORT}\n${BOOT_CAPTURE}\nconst router = createRouter({})`

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

	test("the capture scan admits the declaration and the boot call, and catches a second caller, a re-capture, a late or a commented-out one", () => {
		const declaration = { path: CAPTURE_DECLARED, content: "export function captureWindowDocument(hash: string): void {" }
		const boot = (content: string) => captureOffenders([declaration, { path: BOOT, content }])
		expect(boot(BOOT_OK)).toEqual([])
		const second = { path: "popup/pages/auth.vue", content: "captureWindowDocument(location.hash)" }
		expect(captureOffenders([declaration, { path: BOOT, content: BOOT_OK }, second])).toHaveLength(1)
		expect(boot(`${BOOT_OK}\nrouter.afterEach((to) => captureWindowDocument(to.fullPath))`)).toHaveLength(1)
		expect(boot(`${IMPORT}\nconst router = createRouter({})\n${BOOT_CAPTURE}`)).toHaveLength(1)
		expect(boot(`${IMPORT}\n// ${BOOT_CAPTURE}\nconst router = createRouter({})`)).toHaveLength(1)
	})
})
