/**
 * The popup router's global guard, as a factory so its decision logic is testable without mounting
 * the app (`popup/index.ts` mounts on import). Two halves with different timing contracts:
 *
 *  - `earlyDecision` is SYNCHRONOUS and decides — and the guard calls `next` — BEFORE any suspension.
 *    `isLogined=true` exists only AFTER the activation bootstrap has completed, so the auth check never
 *    needs the authoritative session read. An async lookup here would fire during cold boot and its
 *    degrade would redirect to `from` before loadProfile has chosen a destination, stranding the
 *    boot at the bare index route.
 *  - `lateDecision` holds the awaited checks, each under the guard it always had, and the page-load
 *    grace (`start-grace.ts`).
 */
import type { NavigationGuardNext, RouteLocationNormalized, RouteLocationRaw } from "vue-router"
import type { useAppStore } from "@/stores/app.store"
import type { ProfileInfo } from "@/wallet/services/profile/client"
import { getLastActiveProfileId } from "@/utils/lastActiveProfile"
import { postAuthRoute } from "@/utils/own-window"
import { authRequiredGate } from "./auth-guard"
import { lockScreenProfile } from "./lock-screen-profile"
import type { StartGrace } from "./start-grace"

type AppStore = ReturnType<typeof useAppStore>
export interface GuardProfileApi {
	getActiveProfile: () => Promise<ProfileInfo | undefined>
	getProfiles: () => Promise<ProfileInfo[]>
}

export type EarlyDecision = { kind: "proceed" } | { kind: "redirect"; to: RouteLocationRaw }

export function earlyDecision(to: RouteLocationNormalized, from: RouteLocationNormalized, appStore: AppStore): EarlyDecision | undefined {
	if (to.meta.isPasskeyInteraction) return { kind: "proceed" }
	// Never back to the route itself, where a forced replay of it would redirect forever; it goes
	// where an unlock would, so a replay that cancels the shell's push keeps an own window's route.
	const back = from.name && from.name !== to.name ? { name: from.name } : postAuthRoute(appStore.pageAwaitingAuth)
	if (to.name === "popup-register" && appStore.isRegistered) return { kind: "redirect", to: back }
	// A page the lock screen leads to (Delete profile, a new profile, an import) has it behind: held
	// there, Back from it in an unlocked window would land on the page again, so it goes where an
	// unlock would.
	if (to.name === "popup-auth" && appStore.isLogined)
		return { kind: "redirect", to: from.meta.isAuthRequired === false ? postAuthRoute(appStore.pageAwaitingAuth) : back }
	return undefined
}

export async function lateDecision(
	to: RouteLocationNormalized,
	appStore: AppStore,
	profileApi: GuardProfileApi,
	grace: StartGrace,
): Promise<RouteLocationRaw | undefined> {
	if (!appStore.isSessionChecked && !(await grace.ready())) return provisionalDecision(to, appStore, grace)
	try {
		const decision = await decideWithReads(to, appStore, profileApi)
		grace.settle()
		return decision
	} catch {
		return provisionalDecision(to, appStore, grace)
	}
}

/** The auth gate's answer without the service's reads; `start-grace.ts` replays it. */
function provisionalDecision(to: RouteLocationNormalized, appStore: AppStore, grace: StartGrace): RouteLocationRaw | undefined {
	grace.markProvisional(to)
	return to.meta.isAuthRequired && !appStore.isLogined ? { name: "popup-auth" } : undefined
}

async function decideWithReads(
	to: RouteLocationNormalized,
	appStore: AppStore,
	profileApi: GuardProfileApi,
): Promise<RouteLocationRaw | undefined> {
	// The auth-required gate delegates to authRequiredGate: isLogined lags an accepted unlock
	// until the activation bootstrap finishes, and a blind bounce here ejects a genuinely
	// unlocked user mid-navigation (the guard consults the service's active session instead).
	if (to.meta.isAuthRequired && !appStore.isLogined) {
		const gate = await authRequiredGate(appStore.isLogined, appStore.isSessionChecked, () => profileApi.getActiveProfile())
		if (gate === "auth") return { name: "popup-auth" }
	}

	if (!appStore.profile && to.name !== "popup-register" && to.name !== "popup-import" && to.name !== "popup-profile-new") {
		const profiles = await profileApi.getProfiles()
		if (!profiles.length) return { name: "popup-register" }
		const onLockScreen = lockScreenProfile(profiles, await getLastActiveProfileId())
		// A boot run can select a profile while these reads are in flight; its choice stands.
		if (!appStore.profile) appStore.profile = onLockScreen
	}

	if (to.meta.requirePasswordProfile && appStore.profile?.type === "passkey") return { path: "/popup/settings/profile" }
	return undefined
}

/** The `beforeEach` callback. Terminal early decisions call `next` synchronously, before the
 *  first `await`; everything else resolves through `lateDecision` and calls `next` once. */
export function createPopupGuard(getAppStore: () => AppStore, getProfileApi: () => GuardProfileApi, grace: StartGrace) {
	// Only the latest navigation's guard marks or settles the grace: a superseded guard whose read
	// fails late would mark a route the user has left, and the next replay would take them back.
	let latest = 0
	return async (to: RouteLocationNormalized, from: RouteLocationNormalized, next: NavigationGuardNext): Promise<void> => {
		const run = ++latest
		const appStore = getAppStore()
		const early = earlyDecision(to, from, appStore)
		if (early) {
			if (early.kind === "proceed") next()
			else next(early.to)
			return
		}
		const current = () => run === latest
		const fenced: StartGrace = {
			...grace,
			markProvisional(route) {
				if (current()) grace.markProvisional(route)
			},
			settle() {
				if (current()) grace.settle()
			},
		}
		const late = await lateDecision(to, appStore, getProfileApi(), fenced)
		if (late) next(late)
		else next()
	}
}
