/**
 * Upgrades each `form[data-signup]` to submit with `fetch` and answer in its live region. Without
 * this module the form still posts, and the subscribe Worker redirects to `/subscribed`.
 */

export type SignupOutcome = "subscribed" | "invalid" | "retry"

export const SIGNUP_MESSAGES: Record<SignupOutcome, string> = {
	subscribed: "You're on the list. We'll write when Nulo is live.",
	invalid: "Enter a valid email address.",
	retry: "That didn't go through. Try again in a minute.",
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>

// A stalled connection would otherwise hold the button disabled with nothing said.
const TIMEOUT_MS = 20_000

/** Only the contract's `200 { "ok": true }` counts as subscribed, so a page served in the Worker's place never reads as success. */
export async function postSignup(action: string, body: URLSearchParams, fetchImpl: Fetch): Promise<SignupOutcome> {
	let response: Response
	try {
		response = await fetchImpl(action, {
			method: "POST",
			headers: { Accept: "application/json" },
			body,
			signal: AbortSignal.timeout(TIMEOUT_MS),
		})
	} catch {
		return "retry"
	}
	if (response.status === 400) return "invalid"
	if (response.status !== 200) return "retry"
	const reply: unknown = await response.json().catch(() => null)
	return typeof reply === "object" && reply !== null && (reply as { ok?: unknown }).ok === true ? "subscribed" : "retry"
}

type Attributes = Pick<Element, "getAttribute" | "setAttribute" | "removeAttribute">

export interface SignupView {
	readonly button: Attributes
	readonly field: Attributes
	readonly status: { textContent: string | null; dataset: DOMStringMap }
	body(): URLSearchParams
}

/**
 * One request per form at a time: `aria-disabled` on the button is the lock, released whatever the
 * answer. Not the `disabled` property, which would drop the focus of a keyboard user who pressed it.
 */
export async function submitSignup(view: SignupView, action: string, fetchImpl: Fetch): Promise<void> {
	if (view.button.getAttribute("aria-disabled") === "true") return
	view.button.setAttribute("aria-disabled", "true")
	// Emptied first, so a repeated message is a change the live region announces again.
	view.status.textContent = ""
	view.field.removeAttribute("aria-invalid")
	try {
		const outcome = await postSignup(action, view.body(), fetchImpl)
		if (outcome === "invalid") view.field.setAttribute("aria-invalid", "true")
		view.status.dataset.state = outcome === "subscribed" ? "ok" : "error"
		view.status.textContent = SIGNUP_MESSAGES[outcome]
	} finally {
		view.button.removeAttribute("aria-disabled")
	}
}

function formBody(form: HTMLFormElement): URLSearchParams {
	const body = new URLSearchParams()
	for (const [name, value] of new FormData(form)) if (typeof value === "string") body.append(name, value)
	return body
}

export function mountSignup(fetchImpl: Fetch = (input, init) => fetch(input, init)): void {
	for (const form of document.querySelectorAll<HTMLFormElement>("form[data-signup]")) {
		const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')
		const field = form.querySelector<HTMLInputElement>('input[name="email"]')
		const status = form.querySelector<HTMLElement>("[data-signup-status]")
		if (!button || !field || !status) continue
		const action = form.getAttribute("action") ?? "/api/subscribe"
		form.addEventListener("submit", (event) => {
			event.preventDefault()
			void submitSignup({ button, field, status, body: () => formBody(form) }, action, fetchImpl)
		})
	}
}
