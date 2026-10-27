/**
 * Writes a Resend broadcast draft whole: `PATCH /broadcasts/{id}` with its name, HTML, text and
 * `topic_id` in one request, then reads it back. A partial update resets the fields it leaves out
 * (the name goes back to Untitled, the text is regenerated from the HTML, the topic is dropped), so
 * every write carries every field, and this is the one writer; a client without the topic field
 * must not update the draft at all.
 *
 * A keyed run (`infra/subscribe/ops.env.example`): `RESEND_API_KEY` and `RESEND_TOPIC_ID` come from
 * the environment; the broadcast id, the name and the two body files from the arguments.
 */

const API = "https://api.resend.com"

type Fetch = (input: string, init: RequestInit) => Promise<Response>

export interface TopicEnv {
	RESEND_API_KEY?: string
	RESEND_TOPIC_ID?: string
}

export interface DraftBodies {
	name: string
	html: string
	text: string
}

/** The broadcast as Resend returns it, without the bodies; what a reader needs to check the result. */
export async function writeBroadcast(
	fetchImpl: Fetch,
	env: TopicEnv,
	broadcastId: string,
	draft: DraftBodies,
): Promise<Record<string, unknown>> {
	const key = env.RESEND_API_KEY
	const topic = env.RESEND_TOPIC_ID
	if (!key || !topic) throw new Error("RESEND_API_KEY and RESEND_TOPIC_ID must be set")
	if (!/^[0-9a-f-]{36}$/.test(broadcastId)) throw new Error("the first argument is a broadcast id (uuid)")
	if (!draft.name || !draft.html || !draft.text) throw new Error("a name, an HTML body and a text body are all required")
	const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }
	const patch = await fetchImpl(`${API}/broadcasts/${broadcastId}`, {
		method: "PATCH",
		headers,
		body: JSON.stringify({ name: draft.name, html: draft.html, text: draft.text, topic_id: topic }),
		signal: AbortSignal.timeout(15_000),
	})
	if (!patch.ok) throw new Error(`PATCH answered ${patch.status}: ${await patch.text()}`)
	const get = await fetchImpl(`${API}/broadcasts/${broadcastId}`, { method: "GET", headers, signal: AbortSignal.timeout(15_000) })
	if (!get.ok) throw new Error(`GET answered ${get.status}: ${await get.text()}`)
	const { html, text, ...rest } = (await get.json()) as Record<string, unknown>
	return { ...rest, html_matches: html === draft.html, text_matches: text === draft.text }
}

if (import.meta.main) {
	const [id = "", name = "", htmlPath = "", textPath = ""] = process.argv.slice(2)
	Promise.all([Bun.file(htmlPath).text(), Bun.file(textPath).text()])
		.then(([html, text]) => writeBroadcast((input, init) => fetch(input, init), process.env, id, { name, html, text }))
		.then(
			(broadcast) => console.log(JSON.stringify(broadcast, null, 2)),
			(error: unknown) => {
				console.error(error instanceof Error ? error.message : String(error))
				process.exit(1)
			},
		)
}
