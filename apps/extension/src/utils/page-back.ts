import type { Router } from "vue-router"
import { closeOwnWindow } from "@/utils/own-window"

/**
 * A page's way back. An own window closes, having nothing behind it; else browser history, which a
 * back arrow is expected to follow after navigating forward; else `backTo`, the structural parent
 * for a cold open or a deep link; else Home.
 */
export async function goBack(router: Pick<Router, "back" | "push">, backTo?: string): Promise<void> {
	if (await closeOwnWindow()) return
	if (window.history.length > 1) router.back()
	else void router.push(backTo || "/popup/general")
}

/**
 * Leaves a page for `to` without leaving the page anywhere Back can reach from `to`: back to `to`'s
 * own entry when it is the one behind, else in the page's place.
 */
export function leaveFor(router: Pick<Router, "back" | "replace">, to: string): void {
	if (window.history.state?.back === to) router.back()
	else void router.replace(to)
}
