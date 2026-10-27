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
import { cite } from "./citations"
import {
	type Expectation,
	type ModelFile,
	type ModelProfile,
	type Outcome,
	type ProfileRef,
	type StepEnd,
	type World,
	type WriteScope,
	live,
} from "./model"

export type OracleId = "O1" | "O2" | "O3" | "O4" | "O5" | "O6" | "O7"

export interface Violation {
	oracle: OracleId
	message: string
	/** Text the wallet produced; the runner masks every needle in it before recording it. */
	detail?: string
	/** The filed issue this violation is an instance of: it keeps the seed red, not the run stopped. */
	known?: number
}

const violation = (oracle: OracleId, message: string, detail?: string): Violation =>
	detail === undefined ? { oracle, message } : { oracle, message, detail }

/** What the run has learnt from the wallet so far, symbol by symbol. */
export interface Bindings {
	profiles: Map<ProfileRef, string>
	/** Names a restore gave, learnt at their first sighting. */
	names: Map<ProfileRef, string>
	/** Each profile's derived account addresses, by index, as first read on the chain it stood on. */
	addresses: Map<ProfileRef, ChainAddresses>
}

/** Derived addresses read on one chain: an address takes its chain's L1 id, so two readings
 *  compare only on one chain. */
export interface ChainAddresses {
	chainId: number
	addresses: string[]
}

export const emptyBindings = (): Bindings => ({ profiles: new Map(), names: new Map(), addresses: new Map() })

/** Binds `ref` to `id`. A full-backup restore keeps the backed-up profile's id, so a deleted
 *  profile's id comes back under the ref that restored it: `deleted` names the refs whose id a new
 *  ref may take over. */
export function bindProfile(b: Bindings, ref: ProfileRef, id: string, deleted: ReadonlySet<ProfileRef> = new Set()): void {
	const bound = b.profiles.get(ref)
	if (bound && bound !== id) throw new Error(`${ref} is bound to ${bound}, now seen as ${id}`)
	for (const [other, otherId] of b.profiles) {
		if (otherId !== id || other === ref) continue
		if (!deleted.has(other)) throw new Error(`${id} is already ${other}`)
		b.profiles.delete(other)
	}
	b.profiles.set(ref, id)
}

const idOf = (b: Bindings, ref: ProfileRef | undefined): string | undefined => (ref === undefined ? undefined : b.profiles.get(ref))

// ── O1: the session ─────────────────────────────────────────────────────

export interface SessionReading {
	/** The persisted row, projected in the page: never its bearer itself. */
	row?: { profile: string; hasBearer: boolean; hasPasshash: boolean }
	/** `profile.getActiveProfile`'s id. */
	active?: string
	/** Every open extension page's route; the anchor is the page the run drives. A page on the lock
	 *  screen also says whether it shows Set up again and whether it offers an unlock. */
	pages: { label: string; route: string; anchor: boolean; lockScreen?: { setupAgain: boolean; unlockOffered: boolean } }[]
	/** While locked: whether a call that needs an open session was refused. A locked reading
	 *  without it is a violation, so a collector that skipped the probe cannot pass. */
	protectedCallRefused?: boolean
}

/** Routes a page may show while no session is open: every popup page whose route meta sets
 *  `isAuthRequired: false`, and the legal, onboarding and setup pages. */
const LOCKED_ROUTES = [
	"/popup/auth",
	"/popup/register",
	"/popup/import",
	"/popup/profile/new",
	"/popup/settings/security/reset",
	"/popup/legal",
	"/onboarding",
	"/setup",
]
export const shownWhileLocked = (route: string): boolean => LOCKED_ROUTES.some((r) => route === r || route.startsWith(`${r}/`))

/** The routes the popup leaves for Home once a profile is active; an import, legal or onboarding
 *  page is left where it stands (`code:apps/extension/src/popup/should-advance-to-general.ts:3`). */
export const ADVANCES_ON_OPEN = ["/popup/auth", "/popup/register"] as const

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
		if (page.anchor && (ADVANCES_ON_OPEN as readonly string[]).includes(page.route))
			out.push(violation("O1", `open, but ${page.label} shows ${page.route}`))
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
	return [...out, ...checkLockScreens(w, r)]
}

/** The lock screen on a retired profile shows Set up again and offers no unlock; on any other, the
 *  reverse. Judged on the anchor only, whose lock screen shows the model's selection. */
function checkLockScreens(w: World, r: SessionReading): Violation[] {
	const selected = live(w).find((p) => p.ref === w.selected)
	const anchor = r.pages.find((p) => p.anchor && p.route === "/popup/auth")
	if (!selected || !anchor?.lockScreen) return []
	const { setupAgain, unlockOffered } = anchor.lockScreen
	if (selected.retired) {
		return [
			...(setupAgain ? [] : [violation("O1", `the lock screen on retired ${selected.ref} does not show Set up again`)]),
			...(unlockOffered ? [violation("O1", `the lock screen offers retired ${selected.ref} an unlock`)] : []),
		]
	}
	return [
		...(setupAgain ? [violation("O1", `the lock screen shows Set up again on ${selected.ref}`)] : []),
		...(unlockOffered ? [] : [violation("O1", `the lock screen offers ${selected.ref} no unlock`)]),
	]
}

export function checkSession(w: World, r: SessionReading, b: Bindings): Violation[] {
	if (w.session.kind === "open") return checkOpenSession(w as World & { session: { kind: "open" } }, r, b)
	return checkLockedSession(w as World & { session: { kind: "locked" } }, r, b)
}

// ── O2: profile rows ────────────────────────────────────────────────────

export interface ProfileReading {
	/** `profile.getProfiles`, with whether each is listed as retired. */
	listed: { id: string; name: string; type: string; retired: boolean }[]
	/** Every stored profile row: its key's id and the row's id, name, type and field names. */
	rows: { keyId: string; id: string; name: string; type: string; fields: string[] }[]
}

export type RowKind = "password" | "passkey" | "retired"

const ROW_BASE = ["id", "name", "pxeGeneration", "dekSealed", "walletFingerprint", "type"] as const
const SEALED_FIELDS = ["guard", "secret", "entropy", "envelopeMac"] as const

/** The field names each kind of stored row holds; a unit test pins this to `ProfileRowSchema`. */
export const PROFILE_ROW_FIELDS: Readonly<Record<RowKind, readonly string[]>> = {
	password: [...ROW_BASE, ...SEALED_FIELDS],
	passkey: [...ROW_BASE, ...SEALED_FIELDS, "credentialId", "prfSalt"],
	retired: [...ROW_BASE, "credentialId"],
}

export type RowFields = Readonly<Record<RowKind, readonly string[]>>

const rowKind = (p: ModelProfile): RowKind => (p.retired ? "retired" : p.method)

function checkLiveProfile(p: ModelProfile, r: ProfileReading, b: Bindings, fields: RowFields): Violation[] {
	const id = idOf(b, p.ref)
	const listed = r.listed.find((x) => x.id === id)
	const row = r.rows.find((x) => x.keyId === id)
	if (!listed) return [violation("O2", `${p.ref} (${id}) is not listed`)]
	if (!row) return [violation("O2", `${p.ref} (${id}) has no stored row`)]
	const out: Violation[] = []
	const name = p.name ?? b.names.get(p.ref)
	if (name !== undefined && (listed.name !== name || row.name !== name))
		out.push(violation("O2", `${p.ref} does not hold the name the model gave it`, `named "${listed.name}", not "${name}"`))
	if (listed.type !== p.method || row.type !== p.method) out.push(violation("O2", `${p.ref} is a ${row.type} profile, not ${p.method}`))
	if (listed.retired !== !!p.retired) out.push(violation("O2", `${p.ref} is listed ${listed.retired ? "" : "not "}as retired`))
	if (row.id !== row.keyId) out.push(violation("O2", `${p.ref}'s row names id ${row.id} under key ${row.keyId}`))
	const want = [...fields[rowKind(p)]].sort().join(",")
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
	uiSelectedAccount: background(
		"root:nulo:ui:selectedAccount",
		"a person's pick moves it, and a create's activation or a window's account setup stamps the open profile's",
		SEALED,
	),
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
	/** The `profileId` a plaintext row names: a release wrote its sealed roots' rows so, and they stay
	 *  so until their profile next opens. */
	plainOwner?: string
	/** Whether the value is a seal envelope. */
	envelope: boolean
}

/** The profile in `ids` a key names as one whole segment of its id: a root whose rows carry no
 *  `profileId`, as an account's or a flag's, names its owner in its key. */
export function keyOwner(key: string, ids: ReadonlySet<string>): string | undefined {
	const segments = key.slice(key.indexOf("@") + 1).split(/[^0-9A-Za-z_-]/)
	return [...ids].find((id) => segments.includes(id))
}

/**
 * The roots where a release row `id` owns left its key with no sealed row of `id`'s taking its
 * place: a keyed root seals each row under a new key, so every row gone needs one envelope of
 * `id`'s that `before` did not hold; an unkeyed root seals in place, keeping the key.
 */
export function lostRelease(keys: readonly string[], before: readonly StoredEntry[], now: readonly StoredEntry[], id: string): string[] {
	const rootOf = (key: string) => key.slice(0, key.indexOf("@") + 1)
	const had = new Set(before.map((e) => e.key))
	const out: string[] = []
	for (const root of new Set(keys.map(rootOf))) {
		const gone = keys.filter((k) => rootOf(k) === root && !now.some((e) => e.key === k)).length
		const added = now.filter((e) => rootOf(e.key) === root && e.envelopeOwner === id && !had.has(e.key)).length
		if (gone > added) out.push(`${root} lost ${gone - added} of ${id}'s release rows on its first open`)
	}
	return out
}

/** Whose plaintext row a release left: the `profileId` it names, else the profile its key names. */
export function releaseRowOwner(key: string, text: string, ids: ReadonlySet<string>): string | undefined {
	const named = (() => {
		try {
			return (JSON.parse(text) as { profileId?: unknown } | null)?.profileId
		} catch {
			return undefined
		}
	})()
	return typeof named === "string" ? named : keyOwner(key, ids)
}

/** A row's owner: a sealed row's envelope profile, or the profile its plaintext or its key names; a
 *  plain root row's id up to its first separator, known to the run or not; nobody for a value key or
 *  an unregistered one. */
export function ownerOf(entry: StoredEntry, ids: ReadonlySet<string> = new Set()): string | undefined {
	const family = familyOfKey(entry.key)
	if (!family) return undefined
	const e = FAMILY_GROUPS[family] as FamilyEntry
	if (e.sealed) return entry.envelopeOwner ?? entry.plainOwner ?? (entry.envelope ? undefined : keyOwner(entry.key, ids))
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

type Change = "added" | "changed" | "removed"

function changedEntries(
	before: readonly StoredEntry[],
	after: readonly StoredEntry[],
): { key: string; entry: StoredEntry; change: Change }[] {
	const old = new Map(before.map((e) => [e.key, e]))
	const now = new Map(after.map((e) => [e.key, e]))
	const keys = new Set([...old.keys(), ...now.keys()])
	return [...keys]
		.filter((k) => old.get(k)?.digest !== now.get(k)?.digest)
		.map((key) => {
			const change: Change = !old.has(key) ? "added" : now.has(key) ? "changed" : "removed"
			return { key, entry: (now.get(key) ?? old.get(key)) as StoredEntry, change }
		})
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

function checkChange(key: string, entry: StoredEntry, change: Change, ctx: WriteContext): Violation | undefined {
	if (!key.startsWith("nulo:") || key.startsWith(HARNESS_PREFIX)) return undefined
	const family = familyOfKey(key)
	if (!family) return violation("O3", `${key} changed under no registered family`)
	const { group, sealed } = FAMILY_GROUPS[family] as FamilyEntry
	// A removed row is judged by what it held: sealing or purging a release's plaintext row writes none.
	if (sealed && !entry.envelope && change !== "removed") return violation("O3", `${key} (${family}) is stored outside a seal envelope`)
	const owner = ownerOf(entry, ctx.knownIds)
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
		const left = scope.kind === "delete" && id ? ctx.after.filter((e) => ownerOf(e, ctx.knownIds) === id) : []
		if (left.length)
			out.push(
				violation("O3", `${scope.ref} was deleted but ${left.length} row(s) it owned remain: ${left.map((e) => e.key).join(", ")}`),
			)
	}
	return out
}

export function checkWrites(ctx: WriteContext): Violation[] {
	const changes = changedEntries(ctx.before, ctx.after).flatMap(({ key, entry, change }) => {
		const v = checkChange(key, entry, change, ctx)
		return v ? [{ ...v, detail: change }] : []
	})
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
	/** Only during a step that ends one of these on purpose, or at any point of the run. */
	during: readonly StepEnd[] | "any step"
	source: string
	reason: string
	/** Every string the entry carries past its description, error class names aside, must match, so
	 *  one that also carries another error, in any shape, still fails. */
	everyMessage?: true
	/** Entries this one never covers, whatever they carry. */
	except?: RegExp
}

/** Every guarded launch, a sandbox run's included, holds a stand-in for each seeded remote node.
 *  The entry needs the stand-in's own refusal text, so an error from anything else still fails. */
export const GUARDED_NODE_REFUSAL: AllowedError = {
	pattern: /no node answers a guarded e2e run/,
	kinds: ["log"],
	during: "any step",
	everyMessage: true,
	// An unhandled rejection is a defect whatever it carries, and a failed restore is the user's.
	except: /^\["(?:unhandled rejection|\[full-backup\] restore failed)/,
	source: cite("apps/extension/tests/e2e/fixtures/node-stub.ts", 12, "const REFUSAL = JSON.stringify("),
	reason: "the stand-in refuses every node call, and the wallet logs each refused node call as an error",
}

/** The reviewed allowlist. */
export const ALLOWED_ERRORS: readonly AllowedError[] = [
	{
		pattern: /^Error: Client disconnected$/,
		kinds: ["page-error"],
		during: "any step",
		source: cite("apps/extension/src/wallet/logger/console-forwarding.ts", 19, "if (disconnect) e.preventDefault()"),
		reason: "the popup prevents every disconnect rejection and logs it at debug, but neither browser's capture sees the prevention; a disconnect the wallet logs at error still fails the run",
	},
	GUARDED_NODE_REFUSAL,
	{
		pattern: /^\["\[full-backup\] restore failed:",\{"error":\{"name":"Error","message":"Client disconnected"\}\}\]$/,
		kinds: ["log"],
		during: ["background"],
		source: cite("apps/extension/src/composables/full-backup-restore.ts", 999, 'console.error("[full-backup] restore failed:"'),
		reason: "a planned restart under a running restore drops the run's client, and the run reports its own failure and rolls the profile back, which the model expects",
	},
]

/** A filed product finding the runs keep meeting. Its error line keeps the seed red, but the run
 *  goes on, so the steps after it are still checked; only an error line qualifies, never a state. */
export interface KnownFinding {
	issue: number
	pattern: RegExp
	kinds: readonly ErrorEntry["kind"][]
	/** A log line's source, when the finding names one. */
	source?: string
	/** A page error counts only when the same step holds the forwarder's line for that very
	 *  rejection, `text(pageError)` from `source`, one line per page error: the page cannot name
	 *  its producer, the forwarder's line can. */
	alongside?: { source: string; text: (pageError: string) => string }
}

const UNHANDLED_LOCKED = /^\["unhandled rejection",\{"error":\{"name":"Error","message":"(?:Wallet|Profile) locked"\}\}\]$/

export const KNOWN_FINDINGS: readonly KnownFinding[] = [
	{ issue: 1132, pattern: /^\[\{"name":"Error","message":"Client disconnected"\}\]$/, kinds: ["log"], source: "ui" },
	{ issue: 1133, pattern: UNHANDLED_LOCKED, kinds: ["log"], source: "ui" },
	{
		issue: 1133,
		pattern: /^Error: (?:Wallet|Profile) locked$/,
		kinds: ["page-error"],
		alongside: {
			source: "ui",
			text: (pageError) => `["unhandled rejection",{"error":{"name":"Error","message":"${pageError.replace(/^Error: /, "")}"}}]`,
		},
	},
	{
		issue: 432,
		// A closed known limit: its entry stays while the issue does.
		pattern:
			/^\[\{"module":"foundation:retry"\},\{\},"Error while retrying JsonRpcClient request to \S+ .* TypeError: Failed to fetch"\]$/,
		kinds: ["log"],
		source: "pxe",
	},
]

/** The filed finding `e` is an instance of; a page error's pairing takes its forwarded line from
 *  `free`, so one line never vouches for two page errors. */
function instanceOf(e: ErrorEntry, known: readonly KnownFinding[], free: ErrorEntry[]): KnownFinding | undefined {
	return known.find((k) => {
		if (!k.kinds.includes(e.kind) || !k.pattern.test(e.text)) return false
		if (k.source !== undefined && !(e.kind === "log" && e.source === k.source)) return false
		if (k.alongside === undefined) return true
		const want = k.alongside
		const i = free.findIndex((o) => o.kind === "log" && o.source === want.source && o.text === want.text(e.text))
		if (i < 0) return false
		free.splice(i, 1)
		return true
	})
}

/** Every string an entry carries past its leading description, error class names aside; undefined
 *  when the entry is no JSON. */
function carriedStrings(text: string): string[] | undefined {
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch {
		return undefined
	}
	const body = Array.isArray(parsed) && typeof parsed[0] === "string" ? parsed.slice(1) : parsed
	return stringsIn(body)
}

/** Every string under `v`, an error class name aside. */
function stringsIn(v: unknown, key?: string): string[] {
	if (typeof v === "string") return key === "name" ? [] : [v]
	if (Array.isArray(v)) return v.flatMap((x) => stringsIn(x))
	if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => stringsIn(x, k))
	return []
}

const UNCAUGHT = /^Uncaught (?:\(in promise\) )?/
const CLASSED = /^\w*(?:Error|Exception): /

/** A page error as one text on both browsers, `<class>: <message>`: Chrome's driver reports the
 *  class as the error's name, or keeps Chrome's `Uncaught (in promise) <class>: ` text when the
 *  event carried no value; Firefox's relay puts the class in the message. */
export function pageErrorText(error: unknown): string {
	if (!(error instanceof Error)) return String(error)
	const message = error.message.replace(UNCAUGHT, "")
	if (error.name !== "Error") return `${error.name}: ${message}`
	return CLASSED.test(message) ? message : `Error: ${message}`
}

/** What an opened file carries by design, which the scan of its body excepts: an account file's own
 *  signing key; a backup's phrase and the signing keys of the account files its profile had
 *  imported. Any other needle in an opened body is a leak. */
export function carriedBy(file: Pick<ModelFile, "ref" | "kind" | "phrase" | "imported">): (needle: string) => boolean {
	const own = file.kind === "account" ? [file.ref] : [...(file.phrase ? [file.phrase] : []), ...file.imported]
	return (needle) => own.some((ref) => needle.startsWith(`${ref}/`))
}

/** An error's class for a shareable message: its leading `Error` or `SomethingError`, else
 *  `unclassified`. */
const errorClass = (text: string): string => /^(?:[A-Z][A-Za-z]*)?(?:Error|Exception)\b/.exec(text)?.[0] ?? "unclassified"

export interface ErrorVerdict {
	violations: Violation[]
	warns: Record<string, number>
	/** Accepted errors per allowlist source, so the coverage line shows what the run let through. */
	allowed: Record<string, number>
}

const allows = (a: AllowedError, e: ErrorEntry, ends: readonly StepEnd[]): boolean =>
	a.kinds.includes(e.kind) &&
	(a.during === "any step" || a.during.some((d) => ends.includes(d))) &&
	!a.except?.test(e.text) &&
	(a.everyMessage ? everyCarried(e.text, a.pattern) : a.pattern.test(e.text))

const everyCarried = (text: string, pattern: RegExp): boolean => {
	const strings = carriedStrings(text)
	return strings !== undefined && strings.length > 0 && strings.every((m) => pattern.test(m))
}

export function checkErrors(
	entries: readonly ErrorEntry[],
	ends: readonly StepEnd[],
	allowed: readonly AllowedError[] = ALLOWED_ERRORS,
	known: readonly KnownFinding[] = KNOWN_FINDINGS,
): ErrorVerdict {
	const warns: Record<string, number> = {}
	const accepted: Record<string, number> = {}
	const violations: Violation[] = []
	const free = [...entries]
	for (const e of entries) {
		if (e.kind === "log" && e.level === "warn") {
			warns[e.source] = (warns[e.source] ?? 0) + 1
			continue
		}
		const entry = allowed.find((a) => allows(a, e, ends))
		if (entry) {
			accepted[entry.source] = (accepted[entry.source] ?? 0) + 1
			continue
		}
		const where = e.kind === "log" ? `error log from ${e.source}` : `${e.kind} on ${e.page}`
		const finding = instanceOf(e, known, free)
		violations.push({ ...violation("O4", `${where}: ${errorClass(e.text)}`, e.text), ...(finding ? { known: finding.issue } : {}) })
	}
	return { violations, warns, allowed: accepted }
}

// ── the run's verdict ───────────────────────────────────────────────────

export interface StepOutcome {
	violations: readonly Violation[]
	incomplete: readonly string[]
	/** A check that threw: the step's evidence is unread. */
	crashed?: string
}

export type RunVerdict = "green" | "incomplete" | "red"

/** Red on any violation, a known one included; green only when every planned step ran with
 *  complete evidence. */
export function runVerdict(steps: readonly StepOutcome[], planned: number): RunVerdict {
	if (steps.some((r) => r.violations.length)) return "red"
	return steps.length === planned && steps.every((r) => !r.incomplete.length && !r.crashed) ? "green" : "incomplete"
}

export const UNPLANNED_RESTART = "the background restarted unplanned: the run stops here"

/** A step after which the run cannot go on: a violation not filed yet, a check that threw, or a
 *  restart the plan did not draw. */
export const stopsRun = (r: StepOutcome): boolean =>
	r.violations.some((v) => v.known === undefined) || r.crashed !== undefined || r.incomplete.includes(UNPLANNED_RESTART)

/** The evidence a planned restart cannot give: the stopped background's last lines are unread. */
export const RESTART_LOG_GAP = "logs: the background restarted inside the step"

/** Why a seed with no violation is still no pass: a planned step it never ran, a check that threw,
 *  or any evidence it could not read but a planned restart's log window. */
export function evidenceGaps(steps: readonly (StepOutcome & { index: number; action: string })[], planned: number): string[] {
	const gaps = steps.flatMap((r) => [
		...(r.crashed === undefined ? [] : [`step ${r.index} ${r.action}: the checks threw`]),
		...r.incomplete.filter((why) => why !== RESTART_LOG_GAP).map((why) => `step ${r.index} ${r.action}: ${why}`),
	])
	return steps.length < planned ? [...gaps, `ran ${steps.length} of ${planned} planned steps`] : gaps
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
	/** On a miss: every testid visible then. */
	visible?: string[]
}

export function checkSettle(name: string, r: SettleReading): Violation[] {
	if (r.reached && r.elapsedMs <= r.boundMs) return []
	if (r.reached) return [violation("O5", `${name} settled after ${r.elapsedMs} ms, past its ${r.boundMs} ms bound`)]
	return [
		violation(
			"O5",
			`${name} did not settle within ${r.boundMs} ms (route ${r.route ?? "?"}, loading: ${(r.loading ?? []).join(", ") || "none"})`,
			r.visible?.length ? `visible ${r.visible.join(",")}` : undefined,
		),
	]
}

/** The outcome the driver saw against the ones the model allows, and the refusal's title where the
 *  model names which refusal it is. */
export function checkOutcome(
	action: string,
	expect: Pick<Expectation, "outcomes" | "shows">,
	seen: { outcome: Outcome; shows?: string },
): Violation[] {
	if (!expect.outcomes.includes(seen.outcome))
		return [violation("O5", `${action} ended ${seen.outcome}; the model allows ${expect.outcomes.join(" or ")}`)]
	if (expect.shows !== undefined && seen.shows !== expect.shows)
		return [
			{ ...violation("O5", `${action} refused under another title than the model names`), detail: `shown: ${seen.shows ?? "none"}` },
		]
	return []
}

// ── O6: verifyAll ───────────────────────────────────────────────────────

export interface VerifyReading {
	ref: ProfileRef
	wrongRefused: boolean
	/** Keys the refused attempt changed; for a retired profile, the probe below. */
	wrongWrote: string[]
	opened: boolean
	/** The opened profile's derived addresses on its active chain. */
	addresses: string[]
	chainId: number
	/** The roots where a release row the profile owns left its key with no sealed row taking its
	 *  place, once the profile opened. */
	lost?: string[]
	/** Each imported account's signing key as exported now, beside the one it was imported with.
	 *  A password profile must show exactly the files the model says it imported. */
	sentinels: { file: string; now: string; imported: string }[]
	/** A retired profile's probe: what its lock screen shows, and how each call that would open or
	 *  export it answered (`retired` for the wallet's retired refusal, else the call's own outcome). */
	retired?: { setupAgain: boolean; unlockOffered: boolean; calls: Record<string, string> }
}

/** The profile service's calls a page can make that open, export or reseal a profile: each refuses
 *  a retired one before it reads a secret, prompts or writes. The service's other refusing calls
 *  are internal to the background, so no page reaches them. */
export const RETIRED_REFUSALS = [
	"getPasskeyUnlockParams",
	"unlockProfile",
	"unlockPasskeyProfile",
	"exportMnemonic",
	"exportPlain",
	"changeProfilePassword",
	"changeUnlockMethod",
	"finalizeRestore",
] as const

function checkRetired(r: VerifyReading): Violation[] {
	const probe = r.retired
	if (!probe) return [violation("O6", `retired ${r.ref} was verified as an openable profile`)]
	const out: Violation[] = []
	if (!probe.setupAgain) out.push(violation("O6", `retired ${r.ref}'s lock screen does not show Set up again`))
	if (probe.unlockOffered) out.push(violation("O6", `retired ${r.ref}'s lock screen offers an unlock`))
	if (r.opened) out.push(violation("O6", `retired ${r.ref} opened`))
	for (const call of RETIRED_REFUSALS)
		if (probe.calls[call] !== "retired")
			out.push({
				...violation("O6", `retired ${r.ref}'s ${call} did not answer the retired refusal`),
				detail: probe.calls[call] ?? "no answer",
			})
	if (r.wrongWrote.length) out.push(violation("O6", `probing retired ${r.ref} wrote ${r.wrongWrote.join(", ")}`))
	return out
}

/** Profiles that must derive the same accounts: those sharing a phrase or a credential. */
/** Profiles that share `p`'s phrase or credential, deleted ones included: a restore must derive the
 *  addresses its source derived before that source was deleted. */
function siblings(w: World, p: ModelProfile): ModelProfile[] {
	return w.profiles.filter(
		(x) => x.ref !== p.ref && ((p.phrase && x.phrase === p.phrase) || (p.credential && x.credential === p.credential)),
	)
}

function checkSiblings(w: World, p: ModelProfile, r: VerifyReading, b: Bindings): Violation[] {
	const out: Violation[] = []
	for (const s of siblings(w, p)) {
		const theirs = b.addresses.get(s.ref)
		if (theirs?.chainId !== r.chainId) continue
		theirs.addresses.forEach((a, i) => {
			if (r.addresses[i] !== undefined && r.addresses[i] !== a)
				out.push(
					violation(
						"O6",
						`${r.ref} and ${s.ref} share a secret but derive ${r.addresses[i]} and ${a} at ${i} on chain ${r.chainId}`,
					),
				)
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
	if (p.retired) return checkRetired(r)
	if (r.retired) return [violation("O6", `${r.ref} was probed as retired, but the model holds it openable`)]
	const out: Violation[] = []
	if (!r.wrongRefused) out.push(violation("O6", `${r.ref} opened with a wrong secret`))
	if (r.wrongWrote.length) out.push(violation("O6", `${r.ref}'s refused unlock wrote ${r.wrongWrote.join(", ")}`))
	if (!r.opened) out.push(violation("O6", `${r.ref} did not open with its own secret`))
	if (r.addresses.length !== p.derived)
		out.push(violation("O6", `${r.ref} shows ${r.addresses.length} derived accounts, not ${p.derived}`))
	const recorded = b.addresses.get(p.ref)
	if (recorded?.chainId === r.chainId)
		recorded.addresses.forEach((a, i) => {
			if (r.addresses[i] !== undefined && r.addresses[i] !== a)
				out.push(violation("O6", `${r.ref}'s account ${i} moved from ${a} to ${r.addresses[i]} on chain ${r.chainId}`))
		})
	for (const m of r.lost ?? []) out.push(violation("O3", m))
	return [...out, ...checkSiblings(w, p, r, b), ...checkSentinels(p, r)]
}

export function checkVerify(w: World, readings: readonly VerifyReading[], b: Bindings): Violation[] {
	const out = readings.flatMap((r) => checkVerifyOne(w, r, b))
	const seen = new Set(readings.map((r) => r.ref))
	if (seen.size !== readings.length) out.push(violation("O6", "a profile was verified twice"))
	for (const p of live(w)) if (!seen.has(p.ref)) out.push(violation("O6", `${p.ref} was not verified`))
	return out
}

// ── the pre-update start ────────────────────────────────────────────────

/** The profile rows the release wrote, read before the update, and the same keys after it. */
export interface StartReading {
	released: Record<string, string>
	updated: Record<string, string | undefined>
	listed: ProfileReading["listed"]
	/** Whether the anchor reached the lock screen after the update. */
	onAuth: boolean
}

const PROFILE_ROOT = "nulo:core:profiles@"

/**
 * After an in-place update from the release: every profile row the release wrote is still stored,
 * byte for byte, and listed, a retired one as retired and no other; the model
 * holds exactly those profiles; the wallet shows its lock screen. Before the first step, so a dropped or rewritten row is never
 * read as the first step's doing.
 */
export function checkPreUpdate(w: World, r: StartReading, b: Bindings): Violation[] {
	const keys = Object.keys(r.released).filter((k) => k.startsWith(PROFILE_ROOT))
	const out =
		keys.length === live(w).length
			? []
			: [violation("O2", `the release wrote ${keys.length} profile row(s); the start holds ${live(w).length}`)]
	for (const key of keys) out.push(...releaseRowKept(key, r))
	if (!r.onAuth) out.push(violation("O1", "the wallet did not reach the lock screen after the update"))
	return [...out, ...startBound(w, r, b, keys)]
}

function releaseRowKept(key: string, r: StartReading): Violation[] {
	const after = r.updated[key]
	if (after === undefined) return [violation("O2", `${key} the release wrote is gone after the update`)]
	return after === r.released[key] ? [] : [violation("O3", `${key} the release wrote was rewritten by the update`)]
}

/** Each model profile is a row the release wrote, listed with its retired mark. */
function startBound(w: World, r: StartReading, b: Bindings, keys: readonly string[]): Violation[] {
	const out: Violation[] = []
	for (const p of live(w)) {
		const id = idOf(b, p.ref)
		if (!id || !keys.includes(`${PROFILE_ROOT}${id}`)) {
			out.push(violation("O2", `${p.ref} (${id ?? "unbound"}) is no row the release wrote`))
			continue
		}
		const listed = r.listed.find((x) => x.id === id)
		if (!listed) out.push(violation("O2", `${p.ref} (${id}) is not listed after the update`))
		else if (listed.retired !== !!p.retired)
			out.push(violation("O2", `${p.ref} is listed ${listed.retired ? "" : "not "}as retired after the update`))
	}
	return out
}

// ── O7: leaks ───────────────────────────────────────────────────────────

/** A secret the run knows, in one encoding; `name` is what a message prints. `home` names the one
 *  place it may sit: a passkey profile's `prfSalt` in that profile's row. */
export interface Needle {
	name: string
	value: string
	home?: string
}

/** Where a needle was found: `area:key`, `log:<id>`, `file:<ref>`; never what surrounds it. */
export interface LeakHit {
	where: string
	needle: string
}

export interface StructureReading {
	/** Rows of sealed families whose value is not a seal envelope. */
	unsealedRows: string[]
	/** Sealed profile-row fields that are not their method's frame: `profileId.field (why)`. */
	unframedSlots: string[]
	/** Where `prfSalt` appears: `area:key`, `log:<id>`, `file:<ref>`. */
	prfSalt: string[]
	/** Each file the run holds that a password protects: whether its own opens it and another is
	 *  refused. A passkey profile's backup is one of them, under its file password. */
	exports: { file: string; opensWithOwn: boolean; refusesOther: boolean }[]
}

/** `prfSalt` belongs in a passkey profile's row and nowhere else. */
const prfSaltAllowed = (where: string, passkeyIds: ReadonlySet<string>): boolean =>
	[...passkeyIds].some((id) => where === `local:nulo:core:profiles@${id}`)

export function checkLeaks(
	hits: readonly LeakHit[],
	s: StructureReading,
	passkeyIds: ReadonlySet<string>,
	homes: ReadonlyMap<string, string> = new Map(),
): Violation[] {
	const out = hits.filter((h) => homes.get(h.needle) !== h.where).map((h) => violation("O7", `${h.needle} found in ${h.where}`))
	for (const k of s.unsealedRows) out.push(violation("O7", `${k} holds a row of a sealed family outside a seal envelope`))
	for (const k of s.unframedSlots) out.push(violation("O7", `${k} is not framed ciphertext`))
	for (const k of s.prfSalt) if (!prfSaltAllowed(k, passkeyIds)) out.push(violation("O7", `prfSalt appears in ${k}`))
	for (const e of s.exports) {
		if (!e.opensWithOwn) out.push(violation("O7", `${e.file} does not open with its file password`))
		if (!e.refusesOther) out.push(violation("O7", `${e.file} opens with another password`))
	}
	return out
}

/** The shortest value searched for: the run's secrets are random, and the shortest, a file password
 *  one short of the wallet's rule, has 7 characters. */
export const MIN_NEEDLE = 7

/** Every place a needle occurs in `text`, by name. */
export function findNeedles(text: string, needles: readonly Needle[]): string[] {
	return needles.filter((n) => n.value.length >= MIN_NEEDLE && text.includes(n.value)).map((n) => n.name)
}
