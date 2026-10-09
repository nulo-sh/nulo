/**
 * The moved Settings URLs against the route tree the build generates: each old path is claimed by its
 * redirect record alone, lands on a generated page, and passes the real popup guard as that page.
 */
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { PageContext } from "vite-plugin-pages"
import { beforeAll, describe, expect, test } from "vitest"
import { createMemoryHistory, createRouter, type RouteRecordRaw } from "vue-router"
import { LEGACY_SETTINGS_REDIRECTS } from "@/popup/legacy-routes"
import { createPopupGuard } from "@/popup/route-guard"
import { PAGES_OPTIONS } from "../../scripts/pages-options"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")

interface GeneratedRoute {
	path: string
	name?: string
	meta?: Record<string, unknown>
	children?: GeneratedRoute[]
}

let generated: GeneratedRoute[] = []
let byPath = new Map<string, GeneratedRoute>()

/** Child paths are relative to their parent; an empty one is the parent's own path. */
function flatten(routes: GeneratedRoute[], parent = ""): GeneratedRoute[] {
	return routes.flatMap((route) => {
		const path = route.path.startsWith("/") ? route.path : route.path ? `${parent}/${route.path}` : parent
		return [{ ...route, path }, ...flatten(route.children ?? [], path)]
	})
}

const PageStub = { render: () => null }
const toRecord = ({ path, name, meta, children }: GeneratedRoute): RouteRecordRaw =>
	({ path, name, meta, component: PageStub, children: children?.map(toRecord) }) as RouteRecordRaw

const PROFILE = { id: "p1", name: "Primary", type: "password" }

function routerFor(store: { isLogined: boolean; profile: { id: string; name: string; type: string } }) {
	const router = createRouter({ history: createMemoryHistory(), routes: [...generated.map(toRecord), ...LEGACY_SETTINGS_REDIRECTS] })
	const appStore = { isRegistered: true, isSessionChecked: true, ...store }
	const profileApi = {
		getActiveProfile: async () => (store.isLogined ? store.profile : undefined),
		getProfiles: async () => [store.profile],
	}
	router.beforeEach(
		createPopupGuard(
			() => appStore as never,
			() => profileApi as never,
		),
	)
	return router
}

async function landing(path: string, store: Parameters<typeof routerFor>[0]) {
	const router = routerFor(store)
	await router.push(path)
	return router.currentRoute.value
}

const unlocked = { isLogined: true, profile: PROFILE }
const locked = { isLogined: false, profile: PROFILE }

beforeAll(async () => {
	const context = new PageContext(PAGES_OPTIONS, root)
	await context.searchGlob()
	generated = (await context.options.resolver.getComputedRoutes(context)) as GeneratedRoute[]
	byPath = new Map(flatten(generated).map((route) => [route.path, route]))
})

describe("the legacy Settings redirects", () => {
	test("move security, appearance and advanced to lock, display and developer", () => {
		expect(LEGACY_SETTINGS_REDIRECTS.map(({ path, redirect }) => [path, redirect])).toEqual([
			["/popup/settings/security", "/popup/settings/lock"],
			["/popup/settings/appearance", "/popup/settings/display"],
			["/popup/settings/advanced", "/popup/settings/developer"],
		])
	})

	test("each old path is no page of its own, and each target is a generated page", () => {
		for (const { path, redirect } of LEGACY_SETTINGS_REDIRECTS) {
			expect(byPath.has(path), path).toBe(false)
			expect(byPath.has(String(redirect)), String(redirect)).toBe(true)
		}
	})

	test.each(["lock", "privacy", "display", "developer", "profile"])("/popup/settings/%s requires auth", (page) => {
		expect(byPath.get(`/popup/settings/${page}`)?.meta?.isAuthRequired).toBe(true)
	})

	test.each(LEGACY_SETTINGS_REDIRECTS.map(({ path, redirect }) => [path, String(redirect)]))(
		"%s lands on %s when unlocked, and on the lock screen when locked",
		async (path, target) => {
			expect((await landing(path, unlocked)).path).toBe(target)
			expect((await landing(path, locked)).name).toBe("popup-auth")
		},
	)

	test("a forwarded query rides along but never moves the target", async () => {
		const route = await landing("/popup/settings/security?redirect=https://example.org", unlocked)
		expect(route.path).toBe("/popup/settings/lock")
		expect(route.query).toEqual({ redirect: "https://example.org" })
	})

	test.each([
		"/popup/settings/security/export",
		"/popup/settings/advanced/account-state",
		"/popup/settings/advanced/account-state/notes",
		"/popup/settings/advanced/account-state/authwits",
		"/popup/settings/advanced/account-state/contracts",
		"/popup/settings/advanced/account-state/senders",
	])("%s under an old prefix keeps its own page", async (path) => {
		expect((await landing(path, unlocked)).path).toBe(path)
	})

	test("a passkey profile's deep link to change-password ends on its profile page", async () => {
		const route = await landing("/popup/settings/security/change-password", {
			isLogined: true,
			profile: { ...PROFILE, type: "passkey" },
		})
		expect(route.path).toBe("/popup/settings/profile")
	})
})
