/**
 * Whether the popup shows the stale-network takeover, and which of its screens. Pure over a
 * snapshot of the shell's state, so every route and state is testable without mounting the shell.
 */
import { neverOpened, runsUnattended } from "@/composables/useStaleNetwork"
import type { StaleNetworkView } from "@/wallet/services/network-reset/client"

/** The way out of a reset (Networks), every export, and the legal pages: an idle takeover yields. */
const YIELDING = [/^\/popup\/settings\/networks(\/|$)/, /^\/popup\/settings\/security\/export(\/|$)/, /^\/popup\/legal(\/|$)/]
const PRE_SESSION: ReadonlySet<string> = new Set(["popup-auth", "popup-register"])

export interface TakeoverRoute {
	name: string | undefined
	path: string
}

export interface TakeoverInput {
	logined: boolean
	route: TakeoverRoute
	/** The active network's id. */
	networkId: string | undefined
	/** The active network's stale view. */
	stale: StaleNetworkView | null
	/** The view of the network whose reset runs, whatever network is active. */
	running: StaleNetworkView | null
}

/** A dApp window keeps its own flow: the takeover never covers it and a reset never routes it. */
export const isDappWindow = (routeName: string | undefined): boolean => routeName?.startsWith("windows-") ?? false

/** The view the takeover renders, or null when the route shows. A run covers every route but the
 *  pre-session ones and the dApp windows; an idle stale network yields to {@link YIELDING}, and one
 *  that resets by itself shows nothing. */
export function takeoverView(input: TakeoverInput): StaleNetworkView | null {
	const { route } = input
	if (!input.logined || isDappWindow(route.name) || PRE_SESSION.has(route.name ?? "")) return null
	if (input.running) return input.running
	const { stale } = input
	if (!stale || stale.networkId !== input.networkId || runsUnattended(stale)) return null
	if (YIELDING.some((r) => r.test(route.path))) return null
	return stale
}

export type TakeoverScreen =
	| "loading"
	| "progress"
	| "blocked"
	| "paused"
	| "one-at-a-time"
	| "already-added"
	| "node-down"
	| "network-reset"
	| "new-addresses"

/** The screen for a view, in precedence order: a run in flight (A4c on a network never opened),
 *  Mainnet, a paused journal, another network's journal, a held target chain, an
 *  unreachable custom node, then the cause. */
export function takeoverScreen(view: StaleNetworkView, running: boolean, nodeDown: boolean): TakeoverScreen {
	if (running || view.reset?.running) return neverOpened(view) ? "loading" : "progress"
	if (view.blocked) return "blocked"
	if (view.reset) return "paused"
	if (view.otherPending) return "one-at-a-time"
	if (view.heldBy) return "already-added"
	if (nodeDown) return "node-down"
	return view.cause.networkReset ? "network-reset" : "new-addresses"
}
