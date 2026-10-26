/**
 * The checks an agent session runs after every command, which need no model of the wallet (D8): how
 * the session row, the service and the pages relate (O1), how listed profiles and stored rows agree
 * (O2), which fields take a secret the leak scan looks for (D18), and how a replay's end compares
 * with the session it replays. Pure: no browser, no Vitest.
 */
import {
	ADVANCES_ON_OPEN,
	PROFILE_ROW_FIELDS,
	type ProfileReading,
	type RowFields,
	type SessionReading,
	shownWhileLocked,
	type Violation,
} from "../profile-chaos/checkers"

const violation = (oracle: Violation["oracle"], message: string): Violation => ({ oracle, message })

function checkOpen(r: SessionReading, p: ProfileReading, active: string, strict: boolean): Violation[] {
	const out: Violation[] = []
	const listed = p.listed.find((x) => x.id === active)
	if (!listed) out.push(violation("O1", `the active profile ${active} is not listed`))
	if (r.row?.profile !== active)
		out.push(violation("O1", `the session row names ${r.row?.profile ?? "nothing"}, not the active profile ${active}`))
	if (r.row?.hasPasshash) out.push(violation("O1", "the session row holds a legacy passhash"))
	// A passkey session never persists a bearer, and strict mode drops one at once
	// (`code:apps/extension/src/wallet/services/profile/session-manager.ts:493`).
	if (r.row?.hasBearer && listed?.type === "passkey") out.push(violation("O1", "a passkey profile's session row holds a bearer"))
	if (r.row?.hasBearer && strict) out.push(violation("O1", "the session row holds a bearer with strict mode on"))
	for (const page of r.pages)
		if (page.anchor && (ADVANCES_ON_OPEN as readonly string[]).includes(page.route))
			out.push(violation("O1", `open, but ${page.label} shows ${page.route}`))
	return out
}

function checkLocked(r: SessionReading, p: ProfileReading): Violation[] {
	const out: Violation[] = []
	for (const page of r.pages)
		if (!shownWhileLocked(page.route)) out.push(violation("O1", `locked, but ${page.label} shows ${page.route}`))
	if (r.protectedCallRefused === undefined) out.push(violation("O1", "locked, but no call that needs an open session was tried"))
	if (r.protectedCallRefused === false) out.push(violation("O1", "locked, but a call that needs an open session was served"))
	if (r.row) {
		// A passkey profile's row outlives a background restart with no session behind it, and never
		// holds a bearer (`code:apps/extension/src/wallet/services/profile/session-manager.ts:584`).
		const passkey = p.listed.some((x) => x.id === r.row?.profile && x.type === "passkey")
		if (!passkey || r.row.hasBearer || r.row.hasPasshash)
			out.push(violation("O1", `locked, but a session row for ${r.row.profile} remains${r.row.hasBearer ? " with a bearer" : ""}`))
	}
	return out
}

/** O1 without a model: with an active profile, it is listed, the row names it, holds a bearer only
 *  for a password profile with strict mode off, and the anchor has left the lock and register
 *  pages; with none, every page shows a locked route, a protected call is refused, and only a
 *  passkey profile's bare row may remain. */
export function checkSessionRelation(r: SessionReading, profiles: ProfileReading, strict: boolean): Violation[] {
	return r.active === undefined ? checkLocked(r, profiles) : checkOpen(r, profiles, r.active, strict)
}

/** O2 without a model: every listed profile has its stored row and every row is listed, under the
 *  same id, name and method, and each row holds exactly its method's fields. */
export function checkRowsAgree(r: ProfileReading, fields: RowFields = PROFILE_ROW_FIELDS): Violation[] {
	const out: Violation[] = []
	for (const row of r.rows) {
		const listed = r.listed.find((x) => x.id === row.keyId)
		if (!listed) out.push(violation("O2", `a profile row for ${row.keyId} is stored but not listed`))
		else if (listed.name !== row.name || listed.type !== row.type)
			out.push(violation("O2", `${row.keyId} is listed as a ${listed.type} profile under another name than its row's`))
		if (row.id !== row.keyId) out.push(violation("O2", `the row under ${row.keyId} names id ${row.id}`))
		const want = (fields as Record<string, readonly string[] | undefined>)[row.type]
		if (!want) {
			out.push(violation("O2", `${row.keyId}'s row has the unknown method ${row.type}`))
			continue
		}
		const got = [...row.fields].sort().join(",")
		if (got !== [...want].sort().join(","))
			out.push(violation("O2", `${row.keyId}'s row holds the fields [${got}], not [${[...want].sort().join(",")}]`))
	}
	for (const x of r.listed)
		if (!r.rows.some((row) => row.keyId === x.id)) out.push(violation("O2", `${x.id} is listed but has no stored row`))
	return out
}

const PASSWORD_FIELD = /(?:^|-)password(?:-confirm)?-input$/
const PHRASE_FIELD = /(?:^|-)(?:seed|phrase|mnemonic)-input$/

/** What a filled field holds, by its testid, or by its type for a password field the list does not
 *  name: a value typed there is a needle of the leak scan. A shown password field stays one. */
export function secretFieldKind(testid: string, type?: string): "password" | "phrase" | undefined {
	if (PHRASE_FIELD.test(testid)) return "phrase"
	if (PASSWORD_FIELD.test(testid) || type === "password") return "password"
	return undefined
}

/** A phrase as the wallet reads one: lower-case words, one space apart. */
export const phraseWords = (value: string): string[] => value.trim().toLowerCase().split(/\s+/).filter(Boolean)

// ── replay ──────────────────────────────────────────────────────────────

/** A snapshot's items, as the agent read them. */
export interface Shown {
	n: number
	page: string
	items: { testid: string; nth: number; text?: string }[]
}

/** Where a filled value came from: the texts of one testid in an earlier snapshot, in order. A
 *  replay fills the texts its own snapshot shows there, since the wallet makes a new phrase. */
export interface Binding {
	snapshot: number
	page: string
	testid: string
	nths: number[]
}

/** The binding of `value`, when it is the text of one item, or the run of one testid's items whose
 *  texts are its words, in the latest snapshot that shows it. */
export function bindingOf(value: string, shown: readonly Shown[]): Binding | undefined {
	const words = value.trim().split(/\s+/).filter(Boolean)
	if (!words.length) return undefined
	for (const snap of [...shown].reverse()) {
		const byTestid = new Map<string, { nth: number; text?: string }[]>()
		for (const item of snap.items) byTestid.set(item.testid, [...(byTestid.get(item.testid) ?? []), item])
		for (const [testid, items] of byTestid) {
			const at = runAt(items, words)
			if (at !== undefined)
				return { snapshot: snap.n, page: snap.page, testid, nths: items.slice(at, at + words.length).map((i) => i.nth) }
		}
		const whole = snap.items.find((i) => i.text === value.trim())
		if (whole) return { snapshot: snap.n, page: snap.page, testid: whole.testid, nths: [whole.nth] }
	}
	return undefined
}

/** Where `words` run through consecutive `items`' texts. */
function runAt(items: readonly { text?: string }[], words: readonly string[]): number | undefined {
	for (let at = 0; at + words.length <= items.length; at++) if (words.every((w, k) => items[at + k].text === w)) return at
	return undefined
}

/** The value `b` names in `snap`, joined as the original was, or undefined when it shows no such
 *  items. */
export function boundValue(b: Binding, snap: Shown): string | undefined {
	const texts = b.nths.map((nth) => snap.items.find((i) => i.testid === b.testid && i.nth === nth)?.text)
	return texts.every((t): t is string => t !== undefined) ? texts.join(" ") : undefined
}

/** What a session ends on: each page's route and stable testids, the listed profiles, the session,
 *  its findings not yet filed and its incomplete checks, each by what it says with ids masked. Filed
 *  findings are kept apart, since they recur by chance. */
export interface EndState {
	pages: { id: string; route: string; testids: string[] }[]
	profiles: { name: string; type: string }[]
	session: { open: false } | { open: true; profile: string }
	unfiled: string[]
	incomplete: string[]
	filed: number[]
}

/** Testids that come and go on their own: notices and loading marks. */
const TRANSIENT = /^(?:snackbar|toast)-|pending|loading|spinner|progress/

export const stableTestids = (ids: readonly string[]): string[] => [...new Set(ids.filter((id) => !TRANSIENT.test(id)))].sort()

/** A finding as two runs can compare it: ids, addresses and numbers masked. */
export const findingKey = (oracle: string, message: string): string =>
	`${oracle} ${message
		.replace(/0x[0-9a-f]+/gi, "<hex>")
		.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<id>")
		.replace(/\d+/g, "<n>")}`

/** One served command as the actions log records it. */
export interface ActionRecord {
	n: number
	command: Record<string, unknown>
	status: string
	/** A fill whose value came from an earlier snapshot. */
	bound?: Binding
	/** A snapshot's route and stable testids. */
	seen?: { route: string; testids: string[] }
}

/** The command as it was sent; a bound fill's value is the replay's own, so only its binding counts. */
const sent = (a: ActionRecord): string => JSON.stringify(a.bound ? { ...a.command, value: undefined, bound: a.bound } : a.command)

function compareCommand(a: ActionRecord, b: ActionRecord): string | undefined {
	if (sent(a) !== sent(b)) return `command ${a.n} was sent as ${sent(b)}, not ${sent(a)}`
	if (a.status !== b.status) return `command ${a.n} (${String(a.command.verb)}) ended ${b.status}, not ${a.status}`
	if (JSON.stringify(a.seen) !== JSON.stringify(b.seen))
		return `command ${a.n}'s snapshot saw ${JSON.stringify(b.seen)}, not ${JSON.stringify(a.seen)}`
	return undefined
}

function comparePages(o: EndState, r: EndState): string[] {
	const out: string[] = []
	for (const page of o.pages) {
		const other = r.pages.find((p) => p.id === page.id)
		if (!other) {
			out.push(`page ${page.id} is gone at the replay's end`)
			continue
		}
		if (other.route !== page.route) out.push(`page ${page.id} ends on ${other.route}, not ${page.route}`)
		const missing = page.testids.filter((id) => !other.testids.includes(id))
		const added = other.testids.filter((id) => !page.testids.includes(id))
		if (missing.length || added.length) out.push(`page ${page.id} shows [${added.join(",")}] more and [${missing.join(",")}] fewer`)
	}
	for (const page of r.pages) if (!o.pages.some((p) => p.id === page.id)) out.push(`page ${page.id} is open only at the replay's end`)
	return out
}

const sortedJson = (v: readonly unknown[]): string => JSON.stringify([...v].map((x) => JSON.stringify(x)).sort())

/** Every way a replay differs from what it replays: a command sent otherwise, a status, a snapshot,
 *  the end, the findings. */
export function compareReplay(
	original: { actions: readonly ActionRecord[]; end: EndState },
	replay: { actions: readonly ActionRecord[]; end: EndState },
): string[] {
	const out: string[] = []
	if (original.actions.length !== replay.actions.length)
		out.push(`the replay served ${replay.actions.length} commands, the original ${original.actions.length}`)
	original.actions.forEach((a, i) => {
		const diff = replay.actions[i] && compareCommand(a, replay.actions[i])
		if (diff) out.push(diff)
	})
	const o = original.end
	const r = replay.end
	out.push(...comparePages(o, r))
	if (sortedJson(o.profiles) !== sortedJson(r.profiles))
		out.push(`the profiles end as ${sortedJson(r.profiles)}, not ${sortedJson(o.profiles)}`)
	if (JSON.stringify(o.session) !== JSON.stringify(r.session))
		out.push(`the session ends ${JSON.stringify(r.session)}, not ${JSON.stringify(o.session)}`)
	if (sortedJson(o.unfiled) !== sortedJson(r.unfiled)) out.push(`unfiled findings ${sortedJson(r.unfiled)}, not ${sortedJson(o.unfiled)}`)
	if (sortedJson(o.incomplete) !== sortedJson(r.incomplete))
		out.push(`incomplete checks ${sortedJson(r.incomplete)}, not ${sortedJson(o.incomplete)}`)
	return out
}
