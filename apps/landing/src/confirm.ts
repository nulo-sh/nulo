/**
 * The `/confirm` page: the link in the confirmation email carries its token in the fragment, which
 * the browser keeps out of every request, and the address joins the list only when the visitor
 * presses Confirm. Nothing is posted on load, so a mail scanner that opens the link adds no one.
 */

export type ConfirmState = "ready" | "confirmed" | "invalid"
export type ConfirmOutcome = "confirmed" | "invalid" | "retry"

export const CONFIRM_COPY: Record<ConfirmState, { heading: string; lead: string }> = {
	ready: {
		heading: "Confirm your email.",
		lead: "Press Confirm to join the Nulo mailing list. You'll get occasional updates and can leave in one click.",
	},
	confirmed: { heading: "You're on the list.", lead: "We'll send occasional updates." },
	invalid: { heading: "This link doesn't work.", lead: "It may have expired. Links work for 24 hours. Sign up again on nulo.sh." },
}

export const RETRY_MESSAGE = "That didn't go through. Try again in a minute."

/** The subscribe Worker refuses a longer token unread; this page does not even send one. */
const MAX_TOKEN_LENGTH = 1024
const TOKEN_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

// A stalled connection would otherwise hold the button disabled with nothing said.
const TIMEOUT_MS = 20_000

type Fetch = (input: string, init: RequestInit) => Promise<Response>

/** The token in a location hash, or `null` when there is none of the right shape. */
export function tokenFrom(hash: string): string | null {
	const token = hash.startsWith("#") ? hash.slice(1) : hash
	return token.length <= MAX_TOKEN_LENGTH && TOKEN_SHAPE.test(token) ? token : null
}

/** Only `200 { "ok": true }` confirms, so a page served in the Worker's place never reads as success. */
export async function postConfirm(token: string, fetchImpl: Fetch): Promise<ConfirmOutcome> {
	let response: Response
	try {
		response = await fetchImpl("/api/confirm", {
			method: "POST",
			headers: { Accept: "application/json", "Content-Type": "application/json" },
			body: JSON.stringify({ token }),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		})
	} catch {
		return "retry"
	}
	if (response.status === 400) return "invalid"
	if (response.status !== 200) return "retry"
	const reply: unknown = await response.json().catch(() => null)
	return typeof reply === "object" && reply !== null && (reply as { ok?: unknown }).ok === true ? "confirmed" : "retry"
}

type Attributes = Pick<Element, "getAttribute" | "setAttribute" | "removeAttribute">
type Hideable = Pick<HTMLElement, "hidden">

export interface ConfirmView {
	readonly heading: { textContent: string | null; focus(): void }
	readonly lead: Hideable & { textContent: string | null }
	readonly button: Attributes & Hideable
	readonly back: Hideable
	readonly status: { textContent: string | null; dataset: DOMStringMap }
}

function show(view: ConfirmView, state: ConfirmState): void {
	view.heading.textContent = CONFIRM_COPY[state].heading
	view.lead.textContent = CONFIRM_COPY[state].lead
	view.lead.hidden = false
	view.button.hidden = state !== "ready"
	view.back.hidden = state === "ready"
}

/**
 * One request at a time: `aria-disabled` on the button is the lock, as on the signup form, released
 * only on a retry. A final answer hides the button, so focus moves to the heading rather than
 * staying on a control that is gone.
 */
export async function submitConfirm(view: ConfirmView, token: string, fetchImpl: Fetch): Promise<void> {
	if (view.button.getAttribute("aria-disabled") === "true") return
	view.button.setAttribute("aria-disabled", "true")
	// Emptied first, so a repeated message is a change the live region announces again.
	view.status.textContent = ""
	delete view.status.dataset.state
	const outcome = await postConfirm(token, fetchImpl)
	if (outcome === "retry") {
		view.status.dataset.state = "error"
		view.status.textContent = RETRY_MESSAGE
		view.button.removeAttribute("aria-disabled")
		return
	}
	show(view, outcome)
	view.heading.focus()
}

/** Shows the state the hash allows and returns the press handler, or `null` when there is nothing to confirm. */
export function startConfirm(view: ConfirmView, hash: string, fetchImpl: Fetch): (() => Promise<void>) | null {
	const token = tokenFrom(hash)
	show(view, token ? "ready" : "invalid")
	return token ? () => submitConfirm(view, token, fetchImpl) : null
}

export function mountConfirm(fetchImpl: Fetch = (input, init) => fetch(input, init)): void {
	const root = document.querySelector<HTMLElement>("[data-confirm]")
	if (!root) return
	const heading = root.querySelector<HTMLElement>("[data-confirm-heading]")
	const lead = root.querySelector<HTMLElement>("[data-confirm-lead]")
	const button = root.querySelector<HTMLButtonElement>("[data-confirm-button]")
	const back = root.querySelector<HTMLElement>("[data-confirm-back]")
	const status = root.querySelector<HTMLElement>("[data-confirm-status]")
	if (!heading || !lead || !button || !back || !status) return
	const press = startConfirm({ heading, lead, button, back, status }, location.hash, fetchImpl)
	if (press) button.addEventListener("click", () => void press())
}
