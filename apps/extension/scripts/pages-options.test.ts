import { EventEmitter } from "node:events"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test, vi } from "vitest"
import { PageContext } from "vite-plugin-pages"
import { PAGES_OPTIONS } from "./pages-options"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const TEST_MODULE = /\.(test|spec)\.[^./]+$/

function filesUnder(dir: string): string[] {
	if (!existsSync(join(root, dir))) return []
	return readdirSync(join(root, dir), { recursive: true, encoding: "utf8" }).map((file) => join(dir, file))
}

async function routedFiles(options: typeof PAGES_OPTIONS | Pick<typeof PAGES_OPTIONS, "dirs">): Promise<string[]> {
	const context = new PageContext(options, root)
	await context.searchGlob()
	return [...context.pageRouteMap.keys()]
}

describe("the Pages route scan", () => {
	const colocatedTests = PAGES_OPTIONS.dirs.flatMap(({ dir }) => filesUnder(dir)).filter((file) => TEST_MODULE.test(file))

	test("test modules do sit inside the scanned directories", () => {
		expect(colocatedTests.length).toBeGreaterThan(0)
	})

	test("the configured scan drops exactly the test modules the defaults would route", async () => {
		const byDefault = await routedFiles({ dirs: PAGES_OPTIONS.dirs })
		const configured = await routedFiles(PAGES_OPTIONS)
		expect(byDefault.filter((file) => TEST_MODULE.test(file)).length).toBeGreaterThan(0)
		expect(configured.toSorted()).toEqual(byDefault.filter((file) => !TEST_MODULE.test(file)).toSorted())
	})
})

describe("the Pages dev watcher", () => {
	test("under a dot-directory, an added test module never becomes a route and an added page does", async () => {
		const base = mkdtempSync(join(tmpdir(), "pages-watch-"))
		try {
			const worktree = join(base, ".worktrees", "ext")
			for (const { dir } of PAGES_OPTIONS.dirs) mkdirSync(join(worktree, dir), { recursive: true })
			const context = new PageContext(PAGES_OPTIONS, worktree)
			const watcher = new EventEmitter()
			context.setupWatcher(watcher as unknown as Parameters<PageContext["setupWatcher"]>[0])

			const testModule = join(worktree, "src/popup/pages/new-page.test.ts")
			const page = join(worktree, "src/popup/pages/new-page.vue")
			watcher.emit("add", testModule)
			watcher.emit("add", page)
			await vi.waitFor(() => expect(context.pageRouteMap.has(page)).toBe(true))
			expect(context.pageRouteMap.has(testModule)).toBe(false)
		} finally {
			rmSync(base, { recursive: true, force: true })
		}
	})
})
