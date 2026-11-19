import { capitalize, stringCompare } from "@/utils/string"
import { sanitizeWireString } from "@/wallet/services/dapp-session/capability-meta"

export interface AuthwitContent {
	kind: "call" | "encoded_call" | "intent" | "message_hash"
	caller?: string
	contract?: string
	method?: string
	to?: string
	selector?: string
	consumer?: string
	intent?: string[]
	messageHash?: string
}

export interface RawAuthwit {
	id: string
	content: AuthwitContent
	pending?: boolean
}

export interface DecoratedAuthwit extends RawAuthwit {
	kindName: string
}

/**
 * Pretty-print an authwit kind for display, e.g. `encoded_call` →
 * `Encoded Call`. Falls back to the raw kind for unknown shapes.
 */
export function decorateAuthwit(aw: RawAuthwit): DecoratedAuthwit {
	const kindName = aw.content.kind
		.split("_")
		.map((k) => capitalize(k))
		.join(" ")
	return { ...aw, kindName }
}

/**
 * What a `call` row allows, named by its function's first word (`transfer_in_public` → `Transfer`),
 * which its hash binds; null for every other kind.
 */
export function authwitAction(content: AuthwitContent): string | null {
	if (content.kind !== "call" || typeof content.method !== "string") return null
	const word = sanitizeWireString(content.method, 64)
		.split("_")
		.find((part) => part.trim())
	return word ? capitalize(word.trim()) : null
}

/**
 * Sort by kind, then by the most user-meaningful field for that kind
 * (caller for call/encoded_call, consumer for intent, last for hash).
 * Stable string-compare is used throughout.
 */
export function sortAuthwits(list: DecoratedAuthwit[]): DecoratedAuthwit[] {
	return [...list].sort((a, b) => {
		const kindPos = stringCompare(a.content.kind, b.content.kind)
		if (kindPos) return kindPos
		switch (a.content.kind) {
			case "call":
			case "encoded_call":
				return stringCompare(a.content.caller ?? "", b.content.caller ?? "")
			case "intent":
				return stringCompare(a.content.consumer ?? "", b.content.consumer ?? "")
			default:
				return 1
		}
	})
}

export function authwitMatchesSearch(aw: DecoratedAuthwit, term: string): boolean {
	if (!term) return true
	const lowTerm = term.toLowerCase()
	const c = aw.content
	return (
		c.kind.toLowerCase().includes(lowTerm) ||
		aw.kindName.toLowerCase().includes(lowTerm) ||
		(c.caller ?? c.consumer ?? "").toLowerCase().includes(lowTerm) ||
		(c.contract ?? c.to ?? "").toLowerCase().includes(lowTerm) ||
		(c.method ?? c.selector ?? "").toLowerCase().includes(lowTerm)
	)
}
