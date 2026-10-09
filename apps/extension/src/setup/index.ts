// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import "@/utils/zod-jitless"
import { recordCspViolationsInPage } from "@/e2e/csp-report"
import { createApp } from "vue"
import { createRouter, createWebHashHistory } from "vue-router"
import App from "./app.vue"
import routes from "~pages"
// import "@/assets/styles/base.scss"
import "./index.scss"

if (import.meta.env.VITE_NULO_E2E_CSP_REPORT === "1") recordCspViolationsInPage()

const router = createRouter({
	history: createWebHashHistory(import.meta.env.BASE_URL),
	routes,
})

const app = createApp(App)

app.use(router).mount("#app")
