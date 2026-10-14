// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import "@/utils/zod-jitless"
import { recordCspViolationsInPage } from "@/e2e/csp-report"
import { installConsoleForwarding } from "@/wallet/logger/console-forwarding"

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
import { captureOwnWindow, followOwnRoute } from "@/utils/own-window"
import { LEGACY_SETTINGS_REDIRECTS } from "./legacy-routes"
import { createPopupGuard } from "./route-guard"
import { createStartGrace, START_GRACE_KEY, START_GRACE_MS } from "./start-grace"

// Eagerly open profile + contact service-worker ports at boot. Matches the
// timing of the previous module-eval init in core.js so no consumer sees a
// "ports not ready" race. Under the new shape, importers that never call
// this (tests, tooling) get silent ports — they connect only on first
// `managers.*` access, if at all.
initAppServiceContext()

/** Store */
import { useAppStore } from "@/stores/app.store"

routes.push({
	path: "/",
	redirect: "/popup",
})
routes.push(...LEGACY_SETTINGS_REDIRECTS)

// Read before the router rewrites the URL: the guard may redirect the first route.
captureOwnWindow(window.location.hash)

const router = createRouter({
	history: createWebHashHistory(import.meta.env.BASE_URL),
	routes,
})

// One grace per opening, counted from the page's navigation start (`performance.now()`'s origin).
const startGrace = createStartGrace({
	deadline: START_GRACE_MS,
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

createApp(App).provide(START_GRACE_KEY, startGrace).use(router).use(createPinia()).mount("#app")
