/**
 * Reads or sends a Resend broadcast. `check <id>` prints the broadcast without its bodies; `send <id>`
 * calls `POST /broadcasts/{id}/send` and prints the broadcast back. A send cannot be recalled, so
 * `send` reads the broadcast first and refuses one whose status is not `draft`, or whose topic is
 * set to anything but the launch topic: a stale id or a test copy can never go to the list.
 *
 * A keyed run (`infra/subscribe/ops.env.example`): `RESEND_API_KEY` and `RESEND_TOPIC_ID` come from
 * the environment; the command and the broadcast id from the arguments.
 */

const API = "https://api.resend.com"

type Fetch = (input: string, init: RequestInit) => Promise<Response>

export interface SendEnv {
	RESEND_API_KEY?: string
	RESEND_TOPIC_ID?: string
}

const BROADCAST_ID = /^[0-9a-f-]{36}$/

function headersFor(env: SendEnv): Record<string, string> {
	const key = env.RESEND_API_KEY
	if (!key) throw new Error("RESEND_API_KEY must be set")
	return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }
}

function checkId(id: string): void {
	if (!BROADCAST_ID.test(id)) throw new Error("the argument is a broadcast id (uuid)")
}

/** The broadcast as Resend returns it, without the bodies; what a reader needs before and after a send. */
export async function readBroadcast(fetchImpl: Fetch, env: SendEnv, id: string): Promise<Record<string, unknown>> {
	checkId(id)
	const res = await fetchImpl(`${API}/broadcasts/${id}`, { method: "GET", headers: headersFor(env), signal: AbortSignal.timeout(15_000) })
	if (!res.ok) throw new Error(`GET answered ${res.status}: ${await res.text()}`)
	const { html: _html, text: _text, ...rest } = (await res.json()) as Record<string, unknown>
	return rest
}

/** Sends a draft broadcast scoped to the launch topic, and returns it as Resend holds it afterwards. */
export async function sendBroadcast(fetchImpl: Fetch, env: SendEnv, id: string): Promise<Record<string, unknown>> {
	const topic = env.RESEND_TOPIC_ID
	if (!topic) throw new Error("RESEND_TOPIC_ID must be set")
	const before = await readBroadcast(fetchImpl, env, id)
	if (before.status !== "draft") throw new Error(`refused: the broadcast's status is ${String(before.status)}, not draft`)
	if (before.topic_id !== undefined && before.topic_id !== topic)
		throw new Error("refused: the broadcast's topic is not the launch topic")
	const res = await fetchImpl(`${API}/broadcasts/${id}/send`, {
		method: "POST",
		headers: headersFor(env),
		body: "{}",
		signal: AbortSignal.timeout(15_000),
	})
	if (!res.ok) throw new Error(`POST send answered ${res.status}: ${await res.text()}`)
	return readBroadcast(fetchImpl, env, id)
}

if (import.meta.main) {
	const [command = "", id = ""] = process.argv.slice(2)
	const run = command === "check" ? readBroadcast : command === "send" ? sendBroadcast : undefined
	if (!run) {
		console.error("usage: broadcast-send.ts check|send <broadcast id>")
		process.exit(2)
	}
	run((input, init) => fetch(input, init), process.env, id).then(
		(broadcast) => console.log(JSON.stringify(broadcast, null, 2)),
		(error: unknown) => {
			console.error(error instanceof Error ? error.message : String(error))
			process.exit(1)
		},
	)
}
