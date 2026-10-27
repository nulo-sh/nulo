/**
 * Scopes a Resend broadcast to a topic: `PATCH /broadcasts/{id}` with `topic_id`, then reads the
 * broadcast back. The dashboard offers no other way to set it from this side, and an update from any
 * API client can clear it, so this runs last, after every edit of the draft and before the send.
 *
 * A keyed run (`infra/subscribe/ops.env.example`): `RESEND_API_KEY` and `RESEND_TOPIC_ID` come from
 * the environment, the broadcast id from the one argument.
 */

const API = "https://api.resend.com"

type Fetch = (input: string, init: RequestInit) => Promise<Response>

export interface TopicEnv {
	RESEND_API_KEY?: string
	RESEND_TOPIC_ID?: string
}

/** The broadcast as Resend returns it, without the bodies; what a reader needs to check the result. */
export async function setBroadcastTopic(fetchImpl: Fetch, env: TopicEnv, broadcastId: string): Promise<Record<string, unknown>> {
	const key = env.RESEND_API_KEY
	const topic = env.RESEND_TOPIC_ID
	if (!key || !topic) throw new Error("RESEND_API_KEY and RESEND_TOPIC_ID must be set")
	if (!/^[0-9a-f-]{36}$/.test(broadcastId)) throw new Error("the argument is a broadcast id (uuid)")
	const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }
	const patch = await fetchImpl(`${API}/broadcasts/${broadcastId}`, {
		method: "PATCH",
		headers,
		body: JSON.stringify({ topic_id: topic }),
		signal: AbortSignal.timeout(15_000),
	})
	if (!patch.ok) throw new Error(`PATCH answered ${patch.status}: ${await patch.text()}`)
	const get = await fetchImpl(`${API}/broadcasts/${broadcastId}`, { method: "GET", headers, signal: AbortSignal.timeout(15_000) })
	if (!get.ok) throw new Error(`GET answered ${get.status}: ${await get.text()}`)
	const { html: _html, text: _text, ...rest } = (await get.json()) as Record<string, unknown>
	return rest
}

if (import.meta.main) {
	const id = process.argv[2] ?? ""
	setBroadcastTopic((input, init) => fetch(input, init), process.env, id).then(
		(broadcast) => console.log(JSON.stringify(broadcast, null, 2)),
		(error: unknown) => {
			console.error(error instanceof Error ? error.message : String(error))
			process.exit(1)
		},
	)
}
