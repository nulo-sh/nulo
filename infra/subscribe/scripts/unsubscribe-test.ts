/**
 * The unsubscribe path, end to end, on one real contact: `send` copies a draft broadcast's envelope
 * and bodies into a new broadcast scoped to the launch topic and to a one-contact test segment, and
 * sends it; `check` reads that contact's global flag and topic subscriptions after the click;
 * `restore` puts the contact back (subscribed, topic opted in). The contact is never named on the
 * command line: `send` takes the earliest contact of the launch segment and the other modes the one
 * contact of the test segment, and the log shows a masked address.
 *
 * A keyed run (`infra/subscribe/ops.env.example`): `RESEND_API_KEY` and `RESEND_TOPIC_ID` from the
 * environment, the mode and ids from the arguments.
 */

const API = "https://api.resend.com"
const TEST_SEGMENT = "Launch test"

type Fetch = (input: string, init: RequestInit) => Promise<Response>
type Json = Record<string, unknown>

export interface TestEnv {
	RESEND_API_KEY?: string
	RESEND_TOPIC_ID?: string
}

interface Contact {
	id: string
	email: string
	created_at: string
	unsubscribed: boolean
}

function mask(email: string): string {
	const at = email.indexOf("@")
	return at < 1 ? "?" : `${email[0]}***${email.slice(at)}`
}

class Resend {
	constructor(
		private readonly fetchImpl: Fetch,
		private readonly key: string,
	) {}

	async call(method: string, path: string, body?: unknown): Promise<Json> {
		const response = await this.fetchImpl(`${API}${path}`, {
			method,
			headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: AbortSignal.timeout(15_000),
		})
		if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${await response.text()}`)
		return (await response.json()) as Json
	}

	async contactsOf(segmentId: string): Promise<Contact[]> {
		const list = await this.call("GET", `/contacts?segment_id=${segmentId}&limit=100`)
		return (list.data as Contact[]) ?? []
	}

	async topicsOf(contactId: string): Promise<Json[]> {
		return ((await this.call("GET", `/contacts/${contactId}/topics`)).data as Json[]) ?? []
	}
}

function env(e: TestEnv): { key: string; topic: string } {
	if (!e.RESEND_API_KEY || !e.RESEND_TOPIC_ID) throw new Error("RESEND_API_KEY and RESEND_TOPIC_ID must be set")
	return { key: e.RESEND_API_KEY, topic: e.RESEND_TOPIC_ID }
}

function uuid(value: string, what: string): string {
	if (!/^[0-9a-f-]{36}$/.test(value)) throw new Error(`${what} must be an id (uuid)`)
	return value
}

/** The one contact of the test segment, with its state. */
async function testContact(api: Resend, testSegmentId: string): Promise<Contact> {
	const contacts = await api.contactsOf(testSegmentId)
	if (contacts.length !== 1) throw new Error(`the test segment holds ${contacts.length} contacts, expected exactly one`)
	return contacts[0] as Contact
}

function state(contact: Contact, topics: Json[]): Json {
	return {
		contact: mask(contact.email),
		unsubscribed: contact.unsubscribed,
		topics: topics.map((t) => ({ name: t.name, subscription: t.subscription })),
	}
}

export async function sendTest(fetchImpl: Fetch, e: TestEnv, draftId: string, launchSegmentId: string): Promise<Json> {
	const { key, topic } = env(e)
	uuid(draftId, "the draft id")
	uuid(launchSegmentId, "the launch segment id")
	const api = new Resend(fetchImpl, key)
	const contacts = await api.contactsOf(launchSegmentId)
	if (contacts.length === 0) throw new Error("the launch segment holds no contact")
	const [subject] = [...contacts].sort((a, b) => a.created_at.localeCompare(b.created_at)) as [Contact]
	const segments = ((await api.call("GET", "/segments")).data as { id: string; name: string }[]) ?? []
	const test =
		segments.find((s) => s.name === TEST_SEGMENT) ?? ((await api.call("POST", "/segments", { name: TEST_SEGMENT })) as { id: string })
	await api.call("POST", `/contacts/${subject.id}/segments/${test.id}`)
	const draft = await api.call("GET", `/broadcasts/${draftId}`)
	if (!draft.html || !draft.text) throw new Error("the draft has no bodies to copy")
	const created = await api.call("POST", "/broadcasts", {
		name: `Unsubscribe test: ${String(draft.name ?? "")}`,
		segment_id: test.id,
		topic_id: topic,
		from: draft.from,
		subject: draft.subject,
		reply_to: draft.reply_to,
		html: draft.html,
		text: draft.text,
	})
	const readBack = await api.call("GET", `/broadcasts/${created.id}`)
	if (readBack.topic_id !== topic || readBack.segment_id !== test.id) {
		throw new Error(
			`the test broadcast ${created.id} read back with topic ${readBack.topic_id} and segment ${readBack.segment_id}; not sent`,
		)
	}
	const sent = await api.call("POST", `/broadcasts/${created.id}/send`)
	return {
		contact: mask(subject.email),
		created_at: subject.created_at,
		test_segment: test.id,
		broadcast: created.id,
		send: sent,
	}
}

export async function checkTest(fetchImpl: Fetch, e: TestEnv, testSegmentId: string): Promise<Json> {
	const { key } = env(e)
	const api = new Resend(fetchImpl, key)
	const contact = await testContact(api, uuid(testSegmentId, "the test segment id"))
	return state(contact, await api.topicsOf(contact.id))
}

export async function restoreTest(fetchImpl: Fetch, e: TestEnv, testSegmentId: string): Promise<Json> {
	const { key, topic } = env(e)
	const api = new Resend(fetchImpl, key)
	const before = await testContact(api, uuid(testSegmentId, "the test segment id"))
	await api.call("PATCH", `/contacts/${before.id}`, { unsubscribed: false })
	await api.call("PATCH", `/contacts/${before.id}/topics`, [{ id: topic, subscription: "opt_in" }])
	const after = await testContact(api, testSegmentId)
	return state(after, await api.topicsOf(after.id))
}

if (import.meta.main) {
	const [mode = "", a = "", b = ""] = process.argv.slice(2)
	const live: Fetch = (input, init) => fetch(input, init)
	const run =
		mode === "send"
			? sendTest(live, process.env, a, b)
			: mode === "check"
				? checkTest(live, process.env, a)
				: mode === "restore"
					? restoreTest(live, process.env, a)
					: Promise.reject(
							new Error("usage: send <draft id> <launch segment id> | check <test segment id> | restore <test segment id>"),
						)
	run.then(
		(result) => console.log(JSON.stringify(result, null, 2)),
		(error: unknown) => {
			console.error(error instanceof Error ? error.message : String(error))
			process.exit(1)
		},
	)
}
