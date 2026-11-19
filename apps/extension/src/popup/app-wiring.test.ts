import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")
const app = read("./app.vue")

/** The shell has no harness: these pin the wiring its unit-tested pieces rely on. */
describe("the shell's lock and failure wiring", () => {
	test("both lock paths end the Sending toast's scope before any message closes, and supersede the network-switch run", () => {
		expect(app).toMatch(/const endScopeOnLock = \(\) => \{\s*sends\.endScope\(\)\s*onLocked\(\)\s*switchNetwork\.supersede\(\)\s*\}/)
		expect(app).toContain("watchLockStart(() => appStore.isLogined, endScopeOnLock)")
		expect(app).toContain("onLocked: endScopeOnLock,")
	})

	test("every switch run, resume and stale refresh has a handler", () => {
		expect(app.match(/\bswitchNetwork\(\)/g)).toHaveLength(1)
		expect(app).toMatch(/switchRun = switchNetwork\(\)\s*(?:\/\/[^\n]*\s*)?switchRun\.catch\(\(error\) => logCallFailure\(/)
		expect(app.match(/\bstale\.resume\(/g)).toHaveLength(1)
		expect(app).toContain("stale.resume(profileId).catch((error) => logCallFailure(")
		expect(app.match(/\bstale\.refresh\(/g)).toHaveLength(1)
		expect(app).toContain("stale.refresh().catch((error) => logCallFailure(")
	})

	test("the sends in progress are one shell-owned list, read only in a popup document and torn down after its client", () => {
		expect(app).toContain("provide(SENDS_IN_PROGRESS_KEY, sends)")
		expect(app).toMatch(/route\.name &&\s*!isDappWindow\(route\.name\)\s*\?/)
		expect(app).toMatch(/sendsJournal\.disconnect\(\)[\s\S]*sends\.dispose\(\)/)
	})

	test.each(["./index.ts", "../onboarding/index.ts"])("%s installs the Vue error handler", (path) => {
		expect(read(path)).toContain("app.config.errorHandler = forwardVueError")
	})
})
