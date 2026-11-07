import type { RouteSnapshot } from "@/wallet/services/network/client"

/** The account engine's route as the endpoint list read it, and when. */
export interface RouteView {
	readonly snapshot: RouteSnapshot | null
	readonly readAt: number
}

export type EndpointState = RouteSnapshot["endpoints"][number]["state"]
export type EndpointTone = "green" | "amber" | "red" | "gray"

export interface EndpointStatus {
	readonly tone: EndpointTone
	/** The edit sheet's word for the state. */
	readonly word: string
	/** The edit sheet's error line; only a down endpoint has one. */
	readonly detail: string | null
}

const WHY: Partial<Record<string, string>> = {
	unreachable: "The connection failed.",
	timeout: "It did not answer in time.",
	server: "It returned a server error.",
	malformed: "Its reply could not be read.",
}

const NOT_ASKED: EndpointStatus = { tone: "gray", word: "Not asked yet", detail: null }

/** "20 s ago", "4 min ago", "2 h ago": whole units, rounded down, never zero. */
export function ago(elapsedMs: number): string {
	const seconds = Math.max(1, Math.floor(elapsedMs / 1_000))
	if (seconds < 60) return `${seconds} s ago`
	const minutes = Math.floor(seconds / 60)
	return minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ago`
}

/** The state decides before the role: a lone endpoint keeps the role while down. */
export function endpointStatus(view: RouteView | null, id: string): EndpointStatus {
	const entry = view?.snapshot?.endpoints.find((e) => e.id === id)
	if (!view || !entry) return NOT_ASKED
	switch (entry.state) {
		case "down": {
			const why = entry.failure ? WHY[entry.failure] : undefined
			const since = `No answer since ${ago(view.readAt - entry.since)}.`
			return { tone: "red", word: "Not answering", detail: why ? `${since} ${why}` : since }
		}
		case "behind":
			return { tone: "amber", word: "Behind", detail: null }
		case "wrong-chain":
			return { tone: "amber", word: "Wrong network", detail: null }
		case "ready":
			return { tone: "green", word: view.snapshot?.activeId === id ? "In use" : "Answering", detail: null }
		default:
			return NOT_ASKED
	}
}

const WAS: Partial<Record<EndpointState, string>> = {
	down: "This endpoint was not answering.",
	behind: "This endpoint was behind.",
	"wrong-chain": "This endpoint answered for another network.",
}

/** The line a row moved first carries when it was not serving at the move; none otherwise. */
export function movedFirstWarning(stateAtMove: EndpointState | undefined): string | null {
	const was = stateAtMove ? WAS[stateAtMove] : undefined
	return was ? `${was} The wallet will try another if needed.` : null
}
