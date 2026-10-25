/**
 * The profile chaos oracles as pure checkers over what a collector read. Each takes the model's
 * world, the run's bindings from symbols to what the wallet showed, and a reading; each returns
 * the properties the reading breaks. A message names keys, ids, symbols, profile names and needle
 * names only, never a secret or another stored value, so a red run's console output is safe to
 * share; an error's own text rides in `detail`, which only the local replay record keeps.
 *
 * Imports nothing from Puppeteer or Vitest.
 */
import type { StoredShapeName } from "@/wallet/storage/stored-shapes"
import { type Method, type ModelProfile, type ProfileRef, type StepEnd, type World, type WriteScope, live } from "./model"

export type OracleId = "O1" | "O2" | "O3" | "O4" | "O5" | "O6" | "O7"

export interface Violation {
	oracle: OracleId
	message: string
	/** Text the wallet produced; the runner masks every needle in it before recording it. */
	detail?: string
}

const violation = (oracle: OracleId, message: string, detail?: string): Violation =>
	detail === undefined ? { oracle, message } : { oracle, message, detail }

/** What the run has learnt from the wallet so far, symbol by symbol. */
export interface Bindings {
	profiles: Map<ProfileRef, string>
	/** Names a restore gave, learnt at their first sighting. */
	names: Map<ProfileRef, string>
	/** Each profile's derived account addresses, by index, as first read. */
	addresses: Map<ProfileRef, string[]>
}

export const emptyBindings = (): Bindings => ({ profiles: new Map(), names: new Map(), addresses: new Map() })

const idOf = (b: Bindings, ref: ProfileRef | undefined): string | undefined => (ref === undefined ? undefined : b.profiles.get(ref))

// ── O1: the session ─────────────────────────────────────────────────────

export interface SessionReading {
	/** The persisted row, projected in the page: never its bearer itself. */
	row?: { profile: string; hasBearer: boolean; hasPasshash: boolean }
	/** `profile.getActiveProfile`'s id. */
	active?: string
	/** Every open extension page's route; the anchor is the page the run drives. */
	pages: { label: string; route: string; anchor: boolean }[]
	/** While locked: whether a call that needs an open session was refused. A locked reading
	 *  without it is a violation, so a collector that skipped the probe cannot pass. */
	protectedCallRefused?: boolean
}

/** Routes a page may show while no session is open. */
const LOCKED_ROUTES = ["/popup/auth", "/popup/register", "/popup/import", "/popup/legal", "/onboarding", "/setup"]
const shownWhileLocked = (route: string): boolean => LOCKED_ROUTES.some((r) => route === r || route.startsWith(`${r}/`))

function checkOpenSession(w: World & { session: { kind: "open" } }, r: SessionReading, b: Bindings): Violation[] {
	const id = idOf(b, w.session.ref)
	const out: Violation[] = []
	if (r.row?.profile !== id)
		out.push(violation("O1", `the session row names ${r.row?.profile ?? "nothing"}, not ${w.session.ref} (${id})`))
	if (r.row && r.row.hasBearer !== w.session.bearer)
		out.push(
			violation(
				"O1",
				`the session row ${r.row.hasBearer ? "holds" : "lacks"} a bearer; the model expects ${w.session.bearer ? "one" : "none"}`,
			),
		)
	if (r.row?.hasPasshash) out.push(violation("O1", "the session row holds a legacy passhash"))
	if (r.active !== id) out.push(violation("O1", `the service's active profile is ${r.active ?? "none"}, not ${w.session.ref}`))
	for (const page of r.pages)
		if (page.anchor && shownWhileLocked(page.route)) out.push(violation("O1", `open, but ${page.label} shows ${page.route}`))
	return out
}

function checkLockedSession(w: World & { session: { kind: "locked" } }, r: SessionReading, b: Bindings): Violation[] {
	const out: Violation[] = []
	if (r.active !== undefined) out.push(violation("O1", `locked, but the service reports ${r.active} active`))
	if (r.row) {
		const stale = idOf(b, w.session.staleRow)
		const allowed = stale !== undefined && r.row.profile === stale && !r.row.hasBearer && !r.row.hasPasshash
		if (!allowed)
			out.push(violation("O1", `locked, but a session row for ${r.row.profile} remains${r.row.hasBearer ? " with a bearer" : ""}`))
	}
	for (const page of r.pages) {
		if (!shownWhileLocked(page.route)) out.push(violation("O1", `locked, but ${page.label} shows ${page.route}`))
	}
	if (r.protectedCallRefused === undefined) out.push(violation("O1", "locked, but no call that needs an open session was tried"))
	if (r.protectedCallRefused === false) out.push(violation("O1", "locked, but a call that needs an open session was served"))
	return out
}

export function checkSession(w: World, r: SessionReading, b: Bindings): Violation[] {
	if (w.session.kind === "open") return checkOpenSession(w as World & { session: { kind: "open" } }, r, b)
	return checkLockedSession(w as World & { session: { kind: "locked" } }, r, b)
}

// ── O2: profile rows ────────────────────────────────────────────────────

export interface ProfileReading {
	/** `profile.getProfiles`. */
	listed: { id: string; name: string; type: string }[]
	/** Every stored profile row: its key's id and the row's id, name, type and field names. */
	rows: { keyId: string; id: string; name: string; type: string; fields: string[] }[]
}

/** The field names each method's stored row holds; a unit test pins this to `ProfileRowSchema`. */
export const PROFILE_ROW_FIELDS: Readonly<Record<Method, readonly string[]>> = {
	password: ["id", "name", "pxeGeneration", "dekSealed", "walletFingerprint", "type", "guard", "secret", "entropy", "envelopeMac"],
	passkey: ["id", "name", "pxeGeneration", "dekSealed", "walletFingerprint", "type", "credentialId"],
}

export type RowFields = Readonly<Record<Method, readonly string[]>>

function checkLiveProfile(p: ModelProfile, r: ProfileReading, b: Bindings, fields: RowFields): Violation[] {
	const id = idOf(b, p.ref)
	const listed = r.listed.find((x) => x.id === id)
	const row = r.rows.find((x) => x.keyId === id)
	if (!listed) return [violation("O2", `${p.ref} (${id}) is not listed`)]
	if (!row) return [violation("O2", `${p.ref} (${id}) has no stored row`)]
	const out: Violation[] = []
	const name = p.name ?? b.names.get(p.ref)
	if (name !== undefined && (listed.name !== name || row.name !== name))
		out.push(violation("O2", `${p.ref} is named "${listed.name}", not "${name}"`))
	if (listed.type !== p.method || row.type !== p.method) out.push(violation("O2", `${p.ref} is a ${row.type} profile, not ${p.method}`))
	if (row.id !== row.keyId) out.push(violation("O2", `${p.ref}'s row names id ${row.id} under key ${row.keyId}`))
	const want = [...fields[p.method]].sort().join(",")
	const got = [...row.fields].sort().join(",")
	if (want !== got) out.push(violation("O2", `${p.ref}'s row holds the fields [${got}], not [${want}]`))
	return out
}

export function checkProfiles(w: World, r: ProfileReading, b: Bindings, fields: RowFields = PROFILE_ROW_FIELDS): Violation[] {
	const out = live(w).flatMap((p) => checkLiveProfile(p, r, b, fields))
	const expected = new Set(live(w).map((p) => idOf(b, p.ref)))
	for (const x of r.listed)
		if (!expected.has(x.id)) out.push(violation("O2", `profile ${x.id} is listed but the model holds no such live profile`))
	for (const x of r.rows)
		if (!expected.has(x.keyId))
			out.push(violation("O2", `a profile row for ${x.keyId} is stored but the model holds no such live profile`))
	return out
}

// ── O3: what each action wrote ──────────────────────────────────────────

/**
 * Who writes a stored family. `action`: only the action under test writes it, so its rows must
 * change exactly as the action's write contract says. `background`: a timer or a boot task writes
 * it as well, so only whose rows change is checked. `device`: device-wide, written by an action
 * whose contract names the device.
 */
export type FamilyGroup = "action" | "background" | "device"

export interface FamilyEntry {
	ref: `root:${string}` | `value:${string}`
	sealed?: true
	group: FamilyGroup
	reason: string
}

const action = (ref: FamilyEntry["ref"], reason: string, sealed?: true): FamilyEntry => ({
	ref,
	group: "action",
	reason,
	...(sealed ? { sealed } : {}),
})
const background = (ref: FamilyEntry["ref"], reason: string, sealed?: true): FamilyEntry => ({
	ref,
	group: "background",
	reason,
	...(sealed ? { sealed } : {}),
})
const device = (ref: FamilyEntry["ref"], reason: string): FamilyEntry => ({ ref, group: "device", reason })
const SEALED = true

const ENGINE = "the migration engine writes it at boot"
const UI_FLAG = "the popup sets it on a person's step on a page of that profile"

/** Every family `STORED_SHAPES` registers; the unit test fails on one missing or one whose ref moved. */
export const FAMILY_GROUPS = {
	accounts: action("root:nulo:core:accounts", "created with a profile and by Add account, restore and import only", SEALED),
	importedAccountKeys: action("root:nulo:core:imported-account-keys", "written by an account file import and a restore only", SEALED),
	authRegistry: action("root:nulo:core:auth-registry", "a dApp's authorization request writes it", SEALED),
	authRegistryEnabled: action("root:nulo:core:auth-registry-enabled", "a person's switch writes it", SEALED),
	contacts: action("root:nulo:core:contacts", "a person's contact edit or a restore writes it", SEALED),
	dappSessions: action("root:nulo:core:dappSessions", "a dApp connect or a person's disconnect writes it", SEALED),
	fpcs: background("root:nulo:core:fpcs", "fee payers are discovered from the node on the background's schedule", SEALED),
	journal: background("root:nulo:journal", "jobs append and settle their records on their own schedule", SEALED),
	networks: background("root:nulo:core:networks", "default networks are seeded at create and on later boots", SEALED),
	tokens: background("root:nulo:core:tokens", "the token seeder adds defaults on its own schedule", SEALED),
	tokenBalances: background("root:nulo:core:token-balances", "balance refreshes run on timers", SEALED),
	txs: background("root:nulo:core:txs", "transaction rows settle on the finality timer", SEALED),
	incomingTransfers: background("root:nulo:core:incoming-transfers", "the incoming scanner runs on its tick", SEALED),
	incomingTrust: background("root:nulo:core:incoming-trust", "the incoming scanner runs on its tick", SEALED),
	incomingPublicCursors: background("root:nulo:core:incoming-public-cursors", "the incoming scanner runs on its tick", SEALED),
	incomingBalanceOutbox: background("root:nulo:core:incoming-balance-outbox", "the incoming scanner runs on its tick", SEALED),
	incomingArrivals: background("root:nulo:core:incoming-arrivals", "the incoming scanner runs on its tick", SEALED),
	profileTombstones: action("root:nulo:core:profile-tombstones", "a delete writes it and its purge clears it"),
	restorePending: action("root:nulo:core:restore-pending", "a restore writes it and its finalize clears it"),
	accountIntegrityBlocked: background(
		"root:nulo:core:account-integrity-blocked",
		"the integrity coordinator classifies at boot and unlock",
	),
	accountIntegrityVerified: background(
		"root:nulo:core:account-integrity-verified",
		"the integrity coordinator stamps at boot and unlock",
	),
	staleNetworks: background("root:nulo:core:stale-networks", "the stale-network classifier runs at boot"),
	networkReset: background("root:nulo:core:network-reset", "a network reset journals its own progress"),
	networkResetDone: background("root:nulo:core:network-reset-done", "a network reset records its notice"),
	networkSeeded: background("root:nulo:core:network-seeded", "network seed offers are recorded at boot and unlock"),
	profiles: action("root:nulo:core:profiles", "only profile actions write a profile row"),
	config: device("value:nulo:config", "a person's settings change writes it"),
	tokenPrices: background("value:nulo:core:token-prices", "the price fetch runs on a timer"),
	tokenList: background("value:nulo:core:token-list", "the token list refresh runs on an alarm"),
	tokenSeeded: background("root:nulo:core:token-seeded", "the token seeder records its markers on its own schedule", SEALED),
	dappRegistrations: action("root:nulo:core:dappRegistrations", "a dApp's registration call writes it", SEALED),
	activeNetwork: action("root:nulo:core:active-network", "created with a profile and moved by a person's network switch"),
	legalAccepted: device("value:nulo:legal:accepted", "written only by accepting the Terms"),
	uiActiveAccount: device("value:nulo:ui:activeAccount", "only earlier builds wrote it"),
	uiLastActiveProfile: device("value:nulo:ui:lastActiveProfile", "the lock screen's profile, moved by create, unlock and the picker"),
	uiLoggerWindowId: device("value:nulo:ui:loggerWindowId", "the log viewer's window"),
	onboardingCompleted: device("value:nulo:onboarding:completed", "onboarding's last step writes it"),
	uiPinnedTokens: action("root:nulo:ui:pinnedTokens", "a person's pin writes it", SEALED),
	uiFeePicks: action("root:nulo:ui:feePaymentMethods", "a person's fee pick writes it", SEALED),
	uiSendFeePicks: action("root:nulo:ui:sendFeePaymentMethods", "a person's fee pick writes it", SEALED),
	uiSelectedAccount: action("root:nulo:ui:selectedAccount", "created with a profile and moved by a person's account pick", SEALED),
	uiRestoreOutcome: action("root:nulo:ui:restoreOutcome", "a restore records the networks it skipped"),
	uiGetStartedPhraseSaved: action("root:nulo:ui:getStartedPhraseSaved", UI_FLAG),
	uiGetStartedBackupSaved: action("root:nulo:ui:getStartedBackupSaved", UI_FLAG),
	uiGetStartedAztecOpened: action("root:nulo:ui:getStartedAztecOpened", UI_FLAG),
	uiGetStartedHidden: action("root:nulo:ui:getStartedHidden", UI_FLAG),
	uiGetStartedFeeJuiceHeld: action("root:nulo:ui:getStartedFeeJuiceHeld", UI_FLAG),
	uiGetStartedPrestoOpened: action("root:nulo:ui:getStartedPrestoOpened", UI_FLAG),
	uiProfileImported: action("root:nulo:ui:profileImported", "an import or a restore marks its profile"),
	uiProfileNotFirst: action("root:nulo:ui:profileNotFirst", "a later profile's create marks it"),
	schemaVersion: background("value:nulo:schema:version", ENGINE),
	schemaRunning: background("value:nulo:schema:running", ENGINE),
	schemaBackup: background("value:nulo:schema:backup", ENGINE),
	schemaAttempts: background("value:nulo:schema:attempts", ENGINE),
	schemaBlocked: background("value:nulo:schema:blocked", ENGINE),
	schemaDegraded: background("value:nulo:schema:degraded", ENGINE),
	schemaRetryRequested: background("value:nulo:schema:retry-requested", ENGINE),
	legacyStorageVersion: background("value:nulo:core:storage-version", ENGINE),
} as const satisfies Record<StoredShapeName, FamilyEntry>

export type FamilyName = keyof typeof FAMILY_GROUPS

const BY_VALUE = new Map<string, FamilyName>()
const BY_ROOT: [string, FamilyName][] = []
for (const [name, entry] of Object.entries(FAMILY_GROUPS) as [FamilyName, FamilyEntry][]) {
	if (entry.ref.startsWith("value:")) BY_VALUE.set(entry.ref.slice("value:".length), name)
	else BY_ROOT.push([`${entry.ref.slice("root:".length)}@`, name])
}

/** The registered family a `chrome.storage.local` key belongs to; undefined for an unregistered one. */
export function familyOfKey(key: string): FamilyName | undefined {
	return BY_VALUE.get(key) ?? BY_ROOT.find(([prefix]) => key.startsWith(prefix))?.[1]
}

/** The harness's own keys, which no wallet code writes. */
const HARNESS_PREFIX = "nulo:e2e:"

/** One `storage.local` entry as the page saw it: a digest of the value, never the value. */
export interface StoredEntry {
	key: string
	digest: string
	/** A sealed row's envelope names its profile in clear. */
	envelopeOwner?: string
	/** Whether the value is a seal envelope. */
	envelope: boolean
}

/** A row's owner: a sealed row's envelope profile; a plain root row's id up to its first
 *  separator, known to the run or not; nobody for a value key or an unregistered one. */
export function ownerOf(entry: StoredEntry): string | undefined {
	const family = familyOfKey(entry.key)
	if (!family) return undefined
	const e = FAMILY_GROUPS[family] as FamilyEntry
	if (e.sealed) return entry.envelopeOwner
	if (e.ref.startsWith("value:")) return undefined
	return /^[^|:@/]+/.exec(entry.key.slice(entry.key.indexOf("@") + 1))?.[0]
}

export interface WriteContext {
	before: readonly StoredEntry[]
	after: readonly StoredEntry[]
	contract: readonly WriteScope[]
	bindings: Bindings
	/** Every profile id the run has seen, live or deleted. */
	knownIds: ReadonlySet<string>
	/** Profiles with an open session at the step's start or end; background writes may also land
	 *  for a profile the contract names, as a restore's network seeding does. */
	openIds: ReadonlySet<string>
	/** Profiles deleted before this step: nothing may write for them again. */
	deletedIds: ReadonlySet<string>
}

function changedEntries(before: readonly StoredEntry[], after: readonly StoredEntry[]): { key: string; entry: StoredEntry }[] {
	const old = new Map(before.map((e) => [e.key, e]))
	const now = new Map(after.map((e) => [e.key, e]))
	const keys = new Set([...old.keys(), ...now.keys()])
	return [...keys]
		.filter((k) => old.get(k)?.digest !== now.get(k)?.digest)
		.map((key) => ({ key, entry: (now.get(key) ?? old.get(key)) as StoredEntry }))
}

function allowedOwner(contract: readonly WriteScope[], b: Bindings, owner: string): boolean {
	return contract.some((s) => s.kind !== "device" && idOf(b, s.ref) === owner)
}

/** Whose row it is, and whether any write to it is already wrong on that alone. */
function ownershipViolation(key: string, family: FamilyName, owner: string | undefined, ctx: WriteContext): Violation | undefined {
	if (owner && ctx.deletedIds.has(owner)) return violation("O3", `${key} (${family}) changed for deleted profile ${owner}`)
	if (owner && !ctx.knownIds.has(owner)) return violation("O3", `${key} (${family}) changed for a profile the run never saw`)
	return undefined
}

function checkChange(key: string, entry: StoredEntry, ctx: WriteContext): Violation | undefined {
	if (!key.startsWith("nulo:") || key.startsWith(HARNESS_PREFIX)) return undefined
	const family = familyOfKey(key)
	if (!family) return violation("O3", `${key} changed under no registered family`)
	const { group, sealed } = FAMILY_GROUPS[family] as FamilyEntry
	if (sealed && !entry.envelope) return violation("O3", `${key} (${family}) is stored outside a seal envelope`)
	const owner = ownerOf(entry)
	const owned = ownershipViolation(key, family, owner, ctx)
	if (owned) return owned
	if (group === "background") {
		if (!owner || ctx.openIds.has(owner) || allowedOwner(ctx.contract, ctx.bindings, owner)) return undefined
		return violation("O3", `${key} (${family}) changed for ${owner}, locked throughout the step`)
	}
	if (group === "device" || !owner) {
		if (ctx.contract.some((s) => s.kind === "device")) return undefined
		return violation("O3", `${key} (${family}) changed; the action writes no device state`)
	}
	if (allowedOwner(ctx.contract, ctx.bindings, owner)) return undefined
	return violation("O3", `${key} (${family}) changed for ${owner}, outside the action's contract`)
}

/** Each create leaves its profile's row; each delete, after its purge, leaves no row its profile owns. */
function checkLifecycle(ctx: WriteContext): Violation[] {
	const out: Violation[] = []
	for (const scope of ctx.contract) {
		if (scope.kind !== "create" && scope.kind !== "delete") continue
		const id = idOf(ctx.bindings, scope.ref)
		if (scope.kind === "create" && !ctx.after.some((e) => e.key === `nulo:core:profiles@${id}`))
			out.push(violation("O3", `${scope.ref} was created but no profile row is stored for ${id}`))
		const left = scope.kind === "delete" && id ? ctx.after.filter((e) => ownerOf(e) === id) : []
		if (left.length)
			out.push(
				violation("O3", `${scope.ref} was deleted but ${left.length} row(s) it owned remain: ${left.map((e) => e.key).join(", ")}`),
			)
	}
	return out
}

export function checkWrites(ctx: WriteContext): Violation[] {
	const changes = changedEntries(ctx.before, ctx.after).flatMap(({ key, entry }) => checkChange(key, entry, ctx) ?? [])
	return [...changes, ...checkLifecycle(ctx)]
}

// ── O4: errors ──────────────────────────────────────────────────────────

export type ErrorEntry =
	| { kind: "page-error"; page: string; text: string }
	| { kind: "console-error"; page: string; text: string }
	| { kind: "log"; level: "warn" | "error"; source: string; context?: string; text: string }

/** An error the run accepts, with where it comes from and why it is not the wallet failing. */
export interface AllowedError {
	pattern: RegExp
	kinds: readonly ErrorEntry["kind"][]
	/** Only during a step that ends one of these on purpose. */
	during: readonly StepEnd[]
	source: string
	reason: string
}

/** The reviewed allowlist. */
export const ALLOWED_ERRORS: readonly AllowedError[] = [
	{
		pattern: /^Client disconnected$/,
		kinds: ["page-error"],
		during: ["session", "background"],
		source: "code:packages/extension-messaging/src/errors.ts:102",
		reason: "ending a session or the background closes the ports in-flight calls ride, and each such call rejects with this text",
	},
]

/** An error's class for a shareable message: its leading `SomethingError`, else `unclassified`. */
const errorClass = (text: string): string => /^[A-Z][A-Za-z]*(Error|Exception)\b/.exec(text)?.[0] ?? "unclassified"

export interface ErrorVerdict {
	violations: Violation[]
	warns: Record<string, number>
}

export function checkErrors(
	entries: readonly ErrorEntry[],
	ends: readonly StepEnd[],
	allowed: readonly AllowedError[] = ALLOWED_ERRORS,
): ErrorVerdict {
	const warns: Record<string, number> = {}
	const violations: Violation[] = []
	for (const e of entries) {
		if (e.kind === "log" && e.level === "warn") {
			warns[e.source] = (warns[e.source] ?? 0) + 1
			continue
		}
		const ok = allowed.some((a) => a.kinds.includes(e.kind) && a.during.some((d) => ends.includes(d)) && a.pattern.test(e.text))
		if (ok) continue
		const where = e.kind === "log" ? `error log from ${e.source}` : `${e.kind} on ${e.page}`
		violations.push(violation("O4", `${where}: ${errorClass(e.text)}`, e.text))
	}
	return { violations, warns }
}

/** Log ids run on without a gap inside one background's life: a missing id is a line the drain lost. */
export function checkLogContinuity(lastSeen: number, ids: readonly number[]): { complete: boolean; reason?: string } {
	let expected = lastSeen + 1
	for (const id of ids) {
		if (id !== expected)
			return { complete: false, reason: `log id ${id} follows ${expected - 1}: the ring overwrote lines before the drain` }
		expected = id + 1
	}
	return { complete: true }
}

// ── O5: the settle bound ────────────────────────────────────────────────

export interface SettleReading {
	reached: boolean
	elapsedMs: number
	boundMs: number
	/** On a miss: the loading testids visible when the bound ran out. */
	loading?: string[]
	route?: string
}

export function checkSettle(name: string, r: SettleReading): Violation[] {
	if (r.reached && r.elapsedMs <= r.boundMs) return []
	if (r.reached) return [violation("O5", `${name} settled after ${r.elapsedMs} ms, past its ${r.boundMs} ms bound`)]
	return [
		violation(
			"O5",
			`${name} did not settle within ${r.boundMs} ms (route ${r.route ?? "?"}, loading: ${(r.loading ?? []).join(", ") || "none"})`,
		),
	]
}

// ── O6: verifyAll ───────────────────────────────────────────────────────

export interface VerifyReading {
	ref: ProfileRef
	wrongRefused: boolean
	wrongWrote: string[]
	opened: boolean
	addresses: string[]
	/** Each imported account's signing key as exported now, beside the one it was imported with.
	 *  A password profile must show exactly the files the model says it imported. */
	sentinels: { file: string; now: string; imported: string }[]
}

/** Profiles that must derive the same accounts: those sharing a phrase or a credential. */
function siblings(w: World, p: ModelProfile): ModelProfile[] {
	return live(w).filter(
		(x) => x.ref !== p.ref && ((p.phrase && x.phrase === p.phrase) || (p.credential && x.credential === p.credential)),
	)
}

function checkSiblings(w: World, p: ModelProfile, r: VerifyReading, b: Bindings): Violation[] {
	const out: Violation[] = []
	for (const s of siblings(w, p)) {
		const theirs = b.addresses.get(s.ref) ?? []
		theirs.forEach((a, i) => {
			if (r.addresses[i] !== undefined && r.addresses[i] !== a)
				out.push(violation("O6", `${r.ref} and ${s.ref} share a secret but derive ${r.addresses[i]} and ${a} at ${i}`))
		})
	}
	return out
}

function checkSentinels(p: ModelProfile, r: VerifyReading): Violation[] {
	const want = (p.method === "password" ? [...p.imported] : []).sort().join(",")
	const got = r.sentinels
		.map((s) => s.file)
		.sort()
		.join(",")
	const out = want === got ? [] : [violation("O6", `${r.ref} shows the imported accounts [${got}], not [${want}]`)]
	for (const s of r.sentinels)
		if (s.now !== s.imported) out.push(violation("O6", `${r.ref}'s imported account ${s.file} exports another signing key`))
	return out
}

function checkVerifyOne(w: World, r: VerifyReading, b: Bindings): Violation[] {
	const p = live(w).find((x) => x.ref === r.ref)
	if (!p) return [violation("O6", `${r.ref} was verified but the model holds no such live profile`)]
	const out: Violation[] = []
	if (!r.wrongRefused) out.push(violation("O6", `${r.ref} opened with a wrong secret`))
	if (r.wrongWrote.length) out.push(violation("O6", `${r.ref}'s refused unlock wrote ${r.wrongWrote.join(", ")}`))
	if (!r.opened) out.push(violation("O6", `${r.ref} did not open with its own secret`))
	if (r.addresses.length !== p.derived)
		out.push(violation("O6", `${r.ref} shows ${r.addresses.length} derived accounts, not ${p.derived}`))
	const recorded = b.addresses.get(p.ref) ?? []
	recorded.forEach((a, i) => {
		if (r.addresses[i] !== undefined && r.addresses[i] !== a)
			out.push(violation("O6", `${r.ref}'s account ${i} moved from ${a} to ${r.addresses[i]}`))
	})
	return [...out, ...checkSiblings(w, p, r, b), ...checkSentinels(p, r)]
}

export function checkVerify(w: World, readings: readonly VerifyReading[], b: Bindings): Violation[] {
	const out = readings.flatMap((r) => checkVerifyOne(w, r, b))
	const seen = new Set(readings.map((r) => r.ref))
	if (seen.size !== readings.length) out.push(violation("O6", "a profile was verified twice"))
	for (const p of live(w)) if (!seen.has(p.ref)) out.push(violation("O6", `${p.ref} was not verified`))
	return out
}

// ── O7: leaks ───────────────────────────────────────────────────────────

/** A secret the run knows, in one encoding; `name` is what a message prints. */
export interface Needle {
	name: string
	value: string
}

/** Where a needle was found: `area:key`, `log:<id>`, `file:<ref>`; never what surrounds it. */
export interface LeakHit {
	where: string
	needle: string
}

export interface StructureReading {
	/** Rows of sealed families whose value is not a seal envelope. */
	unsealedRows: string[]
	/** Password profile slots that are not framed ciphertext: `profileId.field`. */
	unframedSlots: string[]
	/** Where `prfSalt` appears: `area:key`, `log:<id>`, `file:<ref>`. */
	prfSalt: string[]
	/** Each password backup the run holds: whether its file password opens it and another is refused. */
	exports: { file: string; opensWithOwn: boolean; refusesOther: boolean }[]
}

/** `prfSalt` belongs in a passkey profile's row and nowhere else. */
const prfSaltAllowed = (where: string, passkeyIds: ReadonlySet<string>): boolean =>
	[...passkeyIds].some((id) => where === `local:nulo:core:profiles@${id}`)

export function checkLeaks(hits: readonly LeakHit[], s: StructureReading, passkeyIds: ReadonlySet<string>): Violation[] {
	const out = hits.map((h) => violation("O7", `${h.needle} found in ${h.where}`))
	for (const k of s.unsealedRows) out.push(violation("O7", `${k} holds a row of a sealed family outside a seal envelope`))
	for (const k of s.unframedSlots) out.push(violation("O7", `${k} is not framed ciphertext`))
	for (const k of s.prfSalt) if (!prfSaltAllowed(k, passkeyIds)) out.push(violation("O7", `prfSalt appears in ${k}`))
	for (const e of s.exports) {
		if (!e.opensWithOwn) out.push(violation("O7", `${e.file} does not open with its file password`))
		if (!e.refusesOther) out.push(violation("O7", `${e.file} opens with another password`))
	}
	return out
}

/** Every place a needle occurs in `text`, by name. */
export function findNeedles(text: string, needles: readonly Needle[]): string[] {
	return needles.filter((n) => n.value.length >= 8 && text.includes(n.value)).map((n) => n.name)
}
