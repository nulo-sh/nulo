// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import "@/utils/zod-jitless"
import { recordCspViolationsInPage } from "@/e2e/csp-report"
import { forwardVueError, installConsoleForwarding } from "@/wallet/logger/console-forwarding"

if (import.meta.env.VITE_NULO_E2E_CSP_REPORT === "1") recordCspViolationsInPage()

installConsoleForwarding("popup")

import { createPinia } from "pinia"
import { createApp } from "vue"
import { createRouter, createWebHashHistory } from "vue-router"
import App from "./app.vue"
import routes from "~pages"
import "@nulo/design/base.css"
import "./index.scss"

import { initAppServiceContext, isServiceReady, managers, waitForServiceReady } from "@/utils/core"
import { captureOwnWindow, followOwnRoute, ownWindowSettled } from "@/utils/own-window"
import { readHandback } from "@/utils/panel-handback"
import { showSnack } from "@/utils/snack"
import { captureWindowDocument } from "@/utils/window-document"
import { LEGACY_SETTINGS_REDIRECTS } from "./legacy-routes"
import { createPopupGuard } from "./route-guard"
import { createScrollMemory, pageScroller } from "./scroll-memory"
import { createStartGrace, START_GRACE_KEY, START_GRACE_MS } from "./start-grace"

// Eagerly open profile + contact service-worker ports at boot. Matches the
// timing of the previous module-eval init in core.js so no consumer sees a
// "ports not ready" race. Under the new shape, importers that never call
// this (tests, tooling) get silent ports — they connect only on first
// `managers.*` access, if at all.
initAppServiceContext()

/** Store */
import { useAppStore } from "@/stores/app.store"
import { useToast } from "@/composables/toast"
import { settleLanding } from "@/composables/panelLanding"

routes.push({
	path: "/",
	redirect: "/popup",
})
routes.push(...LEGACY_SETTINGS_REDIRECTS)

// Read before the router rewrites the URL: the guard may redirect the first route.
captureOwnWindow(window.location.hash)
captureWindowDocument(window.location.hash)

// Firefox's toolbar panel opens on the page a hand-off window returned to: the URL is rewritten
// before the router reads it, so Home never shows first. An own window's pages read its window type.
const [landing] = await Promise.all([readHandback(), ownWindowSettled()])
if (landing) window.history.replaceState(window.history.state, "", `#${landing}`)

const scrollMemory = createScrollMemory(() => {
	const position: unknown = window.history.state?.position
	return typeof position === "number" ? position : undefined
})

const router = createRouter({
	history: createWebHashHistory(import.meta.env.BASE_URL),
	routes,
	// Runs once the entering page has rendered; it returns nothing, so the window never moves.
	scrollBehavior: (to, from, saved) => {
		scrollMemory.arrive(pageScroller(to), { restore: saved !== null, reused: to.matched.at(-1) === from.matched.at(-1) })
	},
})

// One grace per opening, counted from here, as the bar's delay counts from its first render: a slow
// bundle evaluation must not spend the grace before the first route.
const startGrace = createStartGrace({
	deadline: performance.now() + START_GRACE_MS,
	now: () => performance.now(),
	isReady: () => isServiceReady.value,
	waitForReady: waitForServiceReady,
	replace: (to) => router.replace(to),
})

// The guard's decision logic (and its synchronous-early-branch contract) lives in `route-guard.ts`,
// where it is unit-tested; this module only mounts.
router.beforeEach(
	createPopupGuard(
		() => useAppStore(),
		() => managers.profile,
		startGrace,
	),
)
router.afterEach(followOwnRoute)
// Runs before the render that unmounts the leaving page, so its box still holds the offset.
router.afterEach((_to, from, failure) => {
	if (!failure) scrollMemory.leave(pageScroller(from))
})

const app = createApp(App)
app.config.errorHandler = forwardVueError
app.provide(START_GRACE_KEY, startGrace).use(router).use(createPinia()).mount("#app")

if (landing) {
	const appStore = useAppStore()
	const { openToast } = useToast()
	settleLanding(
		() => ({ path: router.currentRoute.value.path, loggedIn: appStore.isLogined, profileId: appStore.profile?.id }),
		(snack) => showSnack(openToast, snack),
	)
}
