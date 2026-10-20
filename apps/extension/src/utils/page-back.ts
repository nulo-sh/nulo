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
