export type TransferSide = "private" | "public"

/** `exposed` = public against a private origin; `unknown` = the wallet cannot vouch for the answer. */
export type Visibility = "hidden" | "public" | "exposed" | "unknown"
export type SideVisibility = "hidden" | "public"

/** Who pays, as far as the wallet can say. `unvouched` = a fee contract it cannot speak for. */
export type PayerKind = "account" | "contract" | "unvouched" | null

/** The fee card's reading of the method in effect. It can only ever withhold `contract`. */
export interface PayerDescriptor {
	type: "fj" | "private_fpc" | "fpc"
	fpcId?: string
	isProtocol: boolean
}

export type NoticeShape = "private-private" | "private-public"

export interface PublishFacts {
	you: Visibility
	recipient: SideVisibility
	amount: SideVisibility
	/** True exactly when `you === "exposed"`. */
	requiresReview: boolean
	noticeShape: NoticeShape | null
}

export type FactCell = "you" | "recipient" | "amount"

/** Nothing can be sent, so nothing is published: no publish line, no tag, no warning. */
export const NO_FACTS: Readonly<PublishFacts> = Object.freeze({
	you: "unknown",
	recipient: "hidden",
	amount: "hidden",
	requiresReview: false,
	noticeShape: null,
})

export const FACT_WORDS = {
	you: { hidden: "HIDDEN", public: "SENDER", exposed: "FEE PAYER", unknown: "—" },
	recipient: { hidden: "HIDDEN", public: "PUBLIC" },
	amount: { hidden: "HIDDEN", public: "PUBLIC" },
} as const satisfies {
	you: Record<Visibility, string>
	recipient: Record<SideVisibility, string>
	amount: Record<SideVisibility, string>
}

export const PAID_BY = {
	account: "paid by your address",
	contract: "paid from your private Fee Juice",
	sponsor: "paid by the sponsor",
} as const

/** Spoken in place of a hand-added contract's fee, which is drawn as "—". */
export const UNVOUCHED_FEE_SENTENCE = "Nulo can't tell what this FPC charges you."

/** Under the token for one whose class Nulo has not validated: what a send publishes assumes its code. */
export const TOKEN_CAVEAT = "Nulo can't check this token's contract. What a send publishes depends on its code."

/** The fee row while an earlier send holds the transfer's chain state. */
export const QUEUED_FEE_COPY = "Queued behind your previous send"

/** The fee row and the review's fee line for a queued send Nulo's sponsor pays: there is no cap to name. */
export const QUEUED_SPONSORED_COPY = "Goes out after your earlier send."

type SubmittedFee = { paymentMethod?: { kind?: string; fpcId?: string } } | undefined

/**
 * Reads the payer off the settings that will actually be submitted. `account` needs nothing else;
 * `contract` — the only reading that lets the UI say HIDDEN — also needs the card's descriptor to
 * name the same contract and mark it protocol-derived.
 */
export function payerKindOf(settings: SubmittedFee, payer: PayerDescriptor | null): PayerKind {
	const method = settings?.paymentMethod
	if (method?.kind === "fj") return "account"
	if (method?.kind !== "fpc" || !method.fpcId || payer?.fpcId !== method.fpcId) return null
	return payer.isProtocol === true ? "contract" : "unvouched"
}

function youFor(origin: TransferSide, payer: PayerKind): Visibility {
	if (origin === "public") return "public"
	if (payer === "account") return "exposed"
	return payer === "contract" ? "hidden" : "unknown"
}

export function publishFacts(origin: TransferSide, destination: TransferSide, payer: PayerKind): PublishFacts {
	const you = youFor(origin, payer)
	const requiresReview = you === "exposed"
	const shape: NoticeShape = destination === "public" ? "private-public" : "private-private"
	return {
		you,
		recipient: destination === "public" ? "public" : "hidden",
		amount: origin === "public" || destination === "public" ? "public" : "hidden",
		requiresReview,
		noticeShape: requiresReview ? shape : null,
	}
}

export function factWord(cell: FactCell, facts: PublishFacts): string {
	if (cell === "you") return FACT_WORDS.you[facts.you]
	return FACT_WORDS[cell][facts[cell]]
}

/** Each side's balance mark: a mark never claims more privacy than the send has. */
export function publishGlyph(visibility: Visibility): "private" | "public" | null {
	switch (visibility) {
		case "hidden":
			return "private"
		case "public":
		case "exposed":
			return "public"
		default:
			return null
	}
}

/**
 * Null while no payer is resolved, and for a hand-added contract, whose charge Nulo cannot vouch
 * for. `account` comes from the submitted settings, never from the row's type.
 */
export function paidBy(payer: PayerKind, type: PayerDescriptor["type"] | undefined): string | null {
	if (payer === "account") return PAID_BY.account
	if (payer === null || payer === "unvouched") return null
	return type === "private_fpc" ? PAID_BY.contract : PAID_BY.sponsor
}

const joinList = (items: string[]): string =>
	items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`

/** Said once on Send for a hand-added sponsor, which may publish anything about the sender. */
export const UNVOUCHED_PUBLISH_SENTENCE = "Nulo can't tell what this FPC publishes about you."

/**
 * What anyone watching the chain can see, as one sentence in Send's form. `name` is the recipient's
 * name, already made safe for a sentence, or null. Null while the payer is unresolved, and for a send
 * whose fee names the account: that one reads `feeWarning` instead.
 */
export function publishSentence(facts: PublishFacts, name: string | null, payer: PayerKind): string | null {
	if (facts.you === "exposed") return null
	const theirs = name ? `${name}'s address` : "their address"
	if (facts.you === "unknown") {
		if (payer !== "unvouched") return null
		return facts.recipient === "public"
			? `${UNVOUCHED_PUBLISH_SENTENCE} Anyone can see ${theirs} and the amount.`
			: UNVOUCHED_PUBLISH_SENTENCE
	}
	const shown = shownParts(facts, theirs)
	if (shown.length === 0) return `N${NOBODY_SEES.slice(1)}`
	return `Anyone can see ${joinList(shown)}.`
}

const NOBODY_SEES = "nobody watching the chain can see who sent it, who got it or how much."

function shownParts(facts: PublishFacts, theirs: string): string[] {
	const shown: string[] = []
	if (facts.you === "public") shown.push("your address as the sender")
	if (facts.you === "exposed") shown.push("your address as the fee payer")
	if (facts.recipient === "public") shown.push(theirs)
	if (facts.amount === "public") shown.push("the amount")
	return shown
}

/**
 * The review's strip heard as one sentence, since its cells are drawn only: the route the cells
 * imply, then what anyone watching the chain can see, in the publish line's words. A payer Nulo has
 * not resolved is never read as hiding the sender.
 */
export function stripSentence(facts: PublishFacts, name: string | null, payer: PayerKind): string {
	const route = `From your ${facts.you === "public" ? "public" : "private"} balance, received ${facts.recipient === "public" ? "publicly" : "privately"}`
	const theirs = name ? `${name}'s address` : "their address"
	if (facts.you === "unknown") {
		const rest = facts.recipient === "public" ? ` Anyone can see ${theirs} and the amount.` : ""
		return payer === "unvouched" ? `${route}: ${UNVOUCHED_PUBLISH_SENTENCE}${rest}` : `${route}.${rest} Your address: not known yet.`
	}
	const shown = shownParts(facts, theirs)
	return shown.length === 0 ? `${route}: ${NOBODY_SEES}` : `${route}: anyone can see ${joinList(shown)}.`
}

/** The one warning Send gives: a private origin whose fee, paid from public Fee Juice, names the account. */
export function feeWarning(facts: PublishFacts, name: string | null): string | null {
	if (facts.you !== "exposed") return null
	if (facts.recipient === "hidden") {
		return "Paying the fee from your public Fee Juice shows your address: anyone can see this account sent something, and when."
	}
	const theirs = name ? `${name}'s` : "their"
	return `Paying the fee from your public Fee Juice adds your address to ${theirs} address and the amount, so anyone can read the whole payment as yours.`
}
