/**
 * What the wallet should hold after each profile action, computed from a seed alone before any
 * browser starts: a seed names a whole run, and a run replays from it on the same commit.
 *
 * Every name is symbolic (`P1` a profile, `K1` a credential, `F1` a file, `S1` a password, `W1` a
 * recovery phrase); the runner binds each to what the wallet shows at its first sighting and checks
 * every later one against that binding. Each expectation lists the code branch or decision that
 * makes it true.
 *
 * Imports nothing from Puppeteer or Vitest, so an in-process driver can run the same catalog.
 */
import { prng } from "../../fixtures/chaos-seed"

export type Method = "password" | "passkey"
export type ProfileRef = `P${number}`
export type CredentialRef = `K${number}`
export type FileRef = `F${number}`
export type SecretRef = `S${number}`
export type PhraseRef = `W${number}`

/** What the run's browser and build can do, read from the driver's facts by the spec. */
export interface Caps {
	/** A passkey ceremony may run on a page other than the anchor, which may also close. */
	ceremonyOffAnchor: boolean
	/** The background stops while an extension page stays open. */
	restartUnderOpenPage: boolean
	/** The run has the sandbox and the playground: the dApp family runs. */
	network: boolean
	/** The build holds the restore gate (proverless network builds only). */
	restoreGate: boolean
	/** Passkey credentials the run's authenticator can hold: every one a create minted counts,
	 *  a deleted profile's included, since deleting a profile leaves its credential there. */
	credentialSlots: number
}

export interface ModelProfile {
	ref: ProfileRef
	method: Method
	/** Undefined until the wallet shows the name a restore gave the profile. */
	name?: string
	password?: SecretRef
	credential?: CredentialRef
	/** The phrase behind a password profile's master; profiles sharing one derive the same accounts. */
	phrase?: PhraseRef
	/** Derived accounts on the active network. */
	derived: number
	/** Account files imported into this profile and not since lost. */
	imported: FileRef[]
	deleted: boolean
}

export type Session =
	| {
			kind: "locked"
			/** A passkey profile whose session row may outlive its session after a background restart. */
			staleRow?: ProfileRef
	  }
	| { kind: "open"; ref: ProfileRef; bearer: boolean }

export interface ModelFile {
	ref: FileRef
	kind: "backup" | "account"
	from: ProfileRef
	method: Method
	/** The password that opens the file: the profile's at export. */
	password?: SecretRef
	phrase?: PhraseRef
	credential?: CredentialRef
	/** Backup: the imported account files the profile held at export. */
	imported: FileRef[]
	/** Backup: derived accounts at export. */
	derived: number
	/** Account file: the account it carries. */
	account?: AccountChoice
}

export type AccountChoice = { derivedIndex: number } | { sentinel: FileRef }

export interface World {
	device: { strict: boolean }
	profiles: ModelProfile[]
	/** The profile the lock screen opens; undefined while unknown, as after a delete. */
	selected?: ProfileRef
	session: Session
	files: ModelFile[]
	/** Phrases the run has read from the wallet. */
	knownPhrases: PhraseRef[]
	next: { profile: number; credential: number; file: number; secret: number; phrase: number; name: number }
}

export type StartState = "empty"

export type Outcome = "committed" | "refused" | "cancelled" | "committed-then-locked"

/** Which stored families an action may write: `create` and `delete` are checked as such after the
 *  action, `profile` allows writes to that profile's rows, `device` to device-wide families. */
export type WriteScope = { kind: "device" } | { kind: "profile" | "create" | "delete"; ref: ProfileRef }

/** Where a driver's step ends: the screen it waits for, within its bound. */
export type Settle = "home" | "lock" | "register" | "unchanged"

export interface Expectation {
	/** Every allowed outcome; a race's members share `next`. */
	outcomes: Outcome[]
	next: World
	writes: WriteScope[]
	settle: Settle
	/** `code:<file>:<line>` or `decision:<id>`, one per clause the expectation rests on. */
	sources: string[]
}

export type Family =
	| "create"
	| "lock"
	| "unlock"
	| "switch"
	| "phrase"
	| "account"
	| "backup"
	| "account-file"
	| "edit"
	| "delete"
	| "strict"
	| "restart"
	| "window"
	| "ceremony"
	| "race"
	| "dapp"
	| "restore-held"
	| "verify"

export interface ParamsMap {
	createPassword: { ref: ProfileRef; name: string; password: SecretRef; double: boolean }
	createPasskey: { ref: ProfileRef; name: string; credential: CredentialRef; double: boolean }
	lock: Record<string, never>
	unlockPassword: { target: ProfileRef; variant: "right" | "wrong" }
	unlockPasskey: { target: ProfileRef; variant: "approve" | "refuse" | "no-prf" | "other"; other?: CredentialRef }
	switchProfile: { to: ProfileRef }
	revealPhrase: { variant: "right" | "wrong" }
	importPhrase: {
		ref: ProfileRef
		phrase: PhraseRef
		name: string
		password: SecretRef
		/** Given exactly when a live profile holds the phrase, which makes the wallet warn first. */
		duplicate?: "confirm" | "decline"
	}
	addAccount: Record<string, never>
	exportBackup: { file: FileRef }
	importBackup: {
		file: FileRef
		variant: "right" | "wrong-password" | "truncated" | "flipped"
		ref: ProfileRef
		password: SecretRef
		duplicate?: "confirm" | "decline"
	}
	exportAccountFile: { file: FileRef; which: AccountChoice }
	importAccountFile: { file: FileRef }
	changePassword: { variant: "right" | "wrong"; password: SecretRef }
	rename: { name: string }
	/** `settings` deletes the open profile; `forgot` the lock screen's, through Forgot password. */
	deleteProfile: { via: "settings" | "forgot" }
	toggleStrict: Record<string, never>
	backgroundRestart: Record<string, never>
	secondWindow: { op: "lock" | "unlock" }
	abandonCeremony: Record<string, never>
	raceLockDuringUnlock: Record<string, never>
	raceDoubleUnlock: Record<string, never>
	raceRestartDuringUnlock: Record<string, never>
	dappWhileLocked: Record<string, never>
	dappDuringHeldUnlock: Record<string, never>
	restoreHeld: {
		file: FileRef
		stage: "service-restore" | "account-state"
		/** `delete` deletes the restored profile from a second window: only its session is open. */
		competing: "lock" | "restart" | "delete"
		ref: ProfileRef
		password: SecretRef
	}
	verifyAll: Record<string, never>
}

export type ActionName = keyof ParamsMap

export type PlannedStep = { [N in ActionName]: { index: number; action: N; params: ParamsMap[N]; expect: Expectation } }[ActionName]

/** An action as a replay list names it: no expectation, which the model recomputes. */
export type ListedStep = { [N in ActionName]: { action: N; params: ParamsMap[N] } }[ActionName]

export interface Plan {
	seed: number
	start: StartState
	caps: Caps
	steps: PlannedStep[]
}

export type Rng = () => number

export interface ActionSpec<N extends ActionName> {
	name: N
	family: Family
	weight: number
	/** Why `params` cannot run in `w`, or undefined when they can: a replay list is refused on it. */
	invalid(w: World, p: ParamsMap[N], caps: Caps): string | undefined
	/** Valid params for `w`, or undefined when the action cannot run there. */
	params(rng: Rng, w: World, caps: Caps): ParamsMap[N] | undefined
	expect(w: World, p: ParamsMap[N], caps: Caps): Expectation
}

/** Live profiles, so a run stays inside what the lock screen lists without scrolling. */
export const MAX_PROFILES = 4
export const ACTIONS_PER_RUN = 24

const SERVICE = "code:src/wallet/services/profile/service.ts"
const CREATE_OPENS = `${SERVICE}:734`
const PASSKEY_CREATE_OPENS = `${SERVICE}:854`
const UNLOCK_REFUSES = `${SERVICE}:796`
const PASSKEY_UNLOCK_BINDS = `${SERVICE}:959`
const LOCK_CLOSES = `${SERVICE}:1058`
const RENAME = `${SERVICE}:1178`
const PASSWORD_CHANGE = `${SERVICE}:1313`
const PASSWORD_CHANGE_REOPENS = `${SERVICE}:1346`
const DELETE = `${SERVICE}:1634`
const PHRASE_IMPORT = `${SERVICE}:1840`
const PHRASE_EXPORT = `${SERVICE}:2100`
const DUPLICATE_WARNS = `${SERVICE}:2204`
const RESTORE_CLONE = `${SERVICE}:2432`
const PASSKEY_RESTORE_UNIQUE = `${SERVICE}:2594`
const OPEN_BEARER = "code:src/wallet/services/profile/session-manager.ts:298"
const SESSION_RESTORE = "code:src/wallet/services/profile/session-manager.ts:584"
const LOCK_DELETES_ROW = "code:src/wallet/services/profile/session-manager.ts:427"
const STRICT_TOGGLE = "code:src/wallet/services/profile/session-manager.ts:757"
const STRICT_DEFAULT = "code:src/wallet/config/config.ts:31"
const STRICT_ROW = "code:src/popup/pages/settings/lock.vue:195"
const PICKER_PERSISTS = "code:src/popup/components/popups/SelectProfilePopup.vue:59"
const RESET_ROUTES = "code:src/popup/pages/settings/security/reset.vue:177"
const RESET_WHILE_LOCKED = "code:src/popup/pages/settings/security/reset.vue:5"
const PRF_REQUIRED = "code:src/wallet/utils/passkey-ceremony.ts:139"
const PROMPT_DISMISSED = "code:src/utils/passkey-copy.ts:86"
const ADD_ACCOUNT = "code:src/wallet/services/account/service.ts:277"
const FULL_EXPORT = "code:src/popup/pages/settings/security/export/full.vue"
const ACCOUNT_EXPORT = "code:src/popup/pages/settings/security/export/account.vue"
const ACCOUNT_IMPORT = "code:src/popup/pages/settings/accounts/import.vue"
const ACCOUNT_DUPLICATE = "code:src/wallet/services/account/service.ts:792"
const BACKUP_UNREADABLE = "code:src/composables/useFullBackupImport.ts:603"
const BACKUP_INTEGRITY = "code:src/composables/useFullBackupImport.ts:157"
const BACKUP_UNPARSED = "code:src/composables/useFullBackupImport.ts:560"
const RESTORE_ROLLS_BACK = "code:src/composables/full-backup-restore.ts:1037"
const RESTORE_FINALIZES = "code:src/composables/useFullBackupImport.ts:483"
const RESTORE_GATE = "code:src/e2e/chrome-storage-restore-gate.ts:45"
const DAPP_QUEUE = "code:src/wallet/services/wallet-sdk/background.ts:759"

export function startWorld(start: StartState): World {
	if (start !== "empty") throw new Error(`unknown start state ${start}`)
	return {
		device: { strict: true },
		profiles: [],
		session: { kind: "locked" },
		files: [],
		knownPhrases: [],
		next: { profile: 1, credential: 1, file: 1, secret: 1, phrase: 1, name: 1 },
	}
}

export const live = (w: World): ModelProfile[] => w.profiles.filter((p) => !p.deleted)
export const profileOf = (w: World, ref: ProfileRef): ModelProfile | undefined => w.profiles.find((p) => p.ref === ref)
const liveOf = (w: World, ref: ProfileRef | undefined): ModelProfile | undefined =>
	ref === undefined ? undefined : live(w).find((p) => p.ref === ref)
export const openProfile = (w: World): ModelProfile | undefined => (w.session.kind === "open" ? liveOf(w, w.session.ref) : undefined)
export const selectedProfile = (w: World): ModelProfile | undefined => liveOf(w, w.selected)
const locked = (w: World): boolean => w.session.kind === "locked"

const clone = (w: World): World => structuredClone(w)

const pick = <T>(rng: Rng, xs: readonly T[]): T | undefined => (xs.length ? xs[Math.floor(rng() * xs.length)] : undefined)
const chance = (rng: Rng, p: number): boolean => rng() < p

/** The next symbolic ids `w` would hand out. */
function reserve(w: World) {
	return {
		profile: (): ProfileRef => `P${w.next.profile}`,
		credential: (): CredentialRef => `K${w.next.credential}`,
		file: (): FileRef => `F${w.next.file}`,
		secret: (): SecretRef => `S${w.next.secret}`,
		name: (): string => `Chaos ${w.next.name}`,
	}
}

function bump(w: World, keys: Partial<Record<keyof World["next"], number>>): void {
	for (const [key, by] of Object.entries(keys) as [keyof World["next"], number][]) w.next[key] += by
}

const usedSecrets = (w: World): SecretRef[] => [
	...w.profiles.flatMap((p) => (p.password ? [p.password] : [])),
	...w.files.flatMap((f) => (f.password ? [f.password] : [])),
]

/** A ref an action introduces must be new to the run, so a replay list cannot alias two profiles. */
function freshRefs(
	w: World,
	refs: { profile?: ProfileRef; file?: FileRef; secret?: SecretRef; credential?: CredentialRef },
): string | undefined {
	if (refs.profile && profileOf(w, refs.profile)) return `${refs.profile} already exists`
	if (refs.file && w.files.some((f) => f.ref === refs.file)) return `${refs.file} already exists`
	if (refs.secret && usedSecrets(w).includes(refs.secret)) return `${refs.secret} is already a password`
	if (refs.credential && w.profiles.some((p) => p.credential === refs.credential)) return `${refs.credential} already exists`
	return undefined
}

/** The name a new profile gets: a first profile shows no name field and is called "Main". */
const nameFor = (w: World, planned: string): string => (live(w).length === 0 ? "Main" : planned)

const sessionFor = (w: World, ref: ProfileRef, method: Method): Session => ({
	kind: "open",
	ref,
	bearer: method === "password" && !w.device.strict,
})

const result = (next: World, outcomes: Outcome[], writes: WriteScope[], settle: Settle, sources: string[]): Expectation => ({
	outcomes,
	next,
	writes,
	settle,
	sources,
})

const unchanged = (w: World, outcome: Outcome, sources: string[]): Expectation => result(clone(w), [outcome], [], "unchanged", sources)

const PICKER_IMPORT = "code:src/popup/components/popups/SelectProfilePopup.vue:147"

/** An import that does not commit: a later profile is imported from the lock screen only, so the
 *  open session, if any, was locked on the way in. */
const importNotCommitted = (w: World, outcome: Outcome, sources: string[]): Expectation =>
	w.session.kind === "open"
		? result(lockedWorld(w), [outcome], [], "unchanged", [...sources, PICKER_IMPORT, LOCK_CLOSES])
		: unchanged(w, outcome, sources)

const canAddProfile = (w: World): boolean => live(w).length < MAX_PROFILES

const mintedCredentials = (w: World): number => new Set(w.profiles.flatMap((p) => (p.credential ? [p.credential] : []))).size

const newProfileInvalid = (w: World, refs: Parameters<typeof freshRefs>[1]): string | undefined =>
	canAddProfile(w) ? freshRefs(w, refs) : "the run's profile cap"

const phraseHolder = (w: World, phrase: PhraseRef | undefined): ModelProfile | undefined =>
	phrase === undefined ? undefined : live(w).find((x) => x.phrase === phrase)

/** The duplicate answer is given exactly when the wallet asks for one. */
function duplicateInvalid(warns: boolean, duplicate: "confirm" | "decline" | undefined): string | undefined {
	if (warns && !duplicate) return "a live profile holds the phrase: the warning needs an answer"
	if (!warns && duplicate) return "no live profile holds the phrase: nothing warns"
	return undefined
}

// ── create ──────────────────────────────────────────────────────────────

function addProfile(w: World, profile: Omit<ModelProfile, "deleted">): World {
	const next = clone(w)
	next.profiles.push({ ...profile, deleted: false })
	next.selected = profile.ref
	next.session = sessionFor(next, profile.ref, profile.method)
	return next
}

const created = (ref: ProfileRef): WriteScope[] => [{ kind: "create", ref }, { kind: "device" }]

const createPassword: ActionSpec<"createPassword"> = {
	name: "createPassword",
	family: "create",
	weight: 3,
	invalid: (w, p) => newProfileInvalid(w, { profile: p.ref, secret: p.password }),
	params: (rng, w) => {
		if (!canAddProfile(w)) return undefined
		const r = reserve(w)
		return { ref: r.profile(), name: r.name(), password: r.secret(), double: chance(rng, 0.25) }
	},
	expect: (w, p) => {
		const phrase: PhraseRef = `W${w.next.phrase}`
		const profile = {
			ref: p.ref,
			method: "password" as const,
			name: nameFor(w, p.name),
			password: p.password,
			phrase,
			derived: 1,
			imported: [],
		}
		const next = addProfile(w, profile)
		bump(next, { profile: 1, secret: 1, phrase: 1, name: 1 })
		return result(next, ["committed"], created(p.ref), "home", [CREATE_OPENS, OPEN_BEARER])
	},
}

const createPasskey: ActionSpec<"createPasskey"> = {
	name: "createPasskey",
	family: "create",
	weight: 3,
	invalid: (w, p, caps) =>
		mintedCredentials(w) < caps.credentialSlots
			? newProfileInvalid(w, { profile: p.ref, credential: p.credential })
			: "the authenticator holds no more credentials",
	params: (rng, w, caps) => {
		if (!canAddProfile(w) || mintedCredentials(w) >= caps.credentialSlots) return undefined
		const r = reserve(w)
		return { ref: r.profile(), name: r.name(), credential: r.credential(), double: chance(rng, 0.25) }
	},
	expect: (w, p) => {
		const profile = {
			ref: p.ref,
			method: "passkey" as const,
			name: nameFor(w, p.name),
			credential: p.credential,
			derived: 1,
			imported: [],
		}
		const next = addProfile(w, profile)
		bump(next, { profile: 1, credential: 1, name: 1 })
		return result(next, ["committed"], created(p.ref), "home", [PASSKEY_CREATE_OPENS, OPEN_BEARER])
	},
}

// ── lock, unlock, switch ────────────────────────────────────────────────

/** An explicit lock deletes whatever row the store holds, a passkey row a restart left included. */
function lockedWorld(w: World): World {
	const next = clone(w)
	next.session = { kind: "locked" }
	return next
}

const lock: ActionSpec<"lock"> = {
	name: "lock",
	family: "lock",
	weight: 4,
	invalid: (w) => (openProfile(w) ? undefined : "no open session"),
	params: (_rng, w) => (openProfile(w) ? {} : undefined),
	expect: (w) => result(lockedWorld(w), ["committed"], [], "lock", [LOCK_CLOSES]),
}

function opened(w: World, target: ModelProfile): World {
	const next = clone(w)
	next.selected = target.ref
	next.session = sessionFor(next, target.ref, target.method)
	return next
}

const unlockedOn = (w: World, target: ModelProfile, settle: Settle, sources: string[]): Expectation =>
	result(opened(w, target), ["committed"], [{ kind: "profile", ref: target.ref }, { kind: "device" }], settle, sources)

/** A refused unlock still moves the lock screen to its target: the picker persisted it. */
function refusedOn(w: World, target: ProfileRef, outcome: Outcome, sources: string[]): Expectation {
	const next = clone(w)
	const moved = next.selected !== target
	next.selected = target
	return result(next, [outcome], moved ? [{ kind: "device" }] : [], "lock", moved ? [...sources, PICKER_PERSISTS] : sources)
}

const unlockPassword: ActionSpec<"unlockPassword"> = {
	name: "unlockPassword",
	family: "unlock",
	weight: 5,
	invalid: (w, p) => {
		if (!locked(w)) return "not locked"
		return liveOf(w, p.target)?.method === "password" ? undefined : `${p.target} is no live password profile`
	},
	params: (rng, w) => {
		if (!locked(w)) return undefined
		const target = pick(
			rng,
			live(w).filter((x) => x.method === "password"),
		)
		return target ? { target: target.ref, variant: chance(rng, 0.3) ? "wrong" : "right" } : undefined
	},
	expect: (w, p) => {
		if (p.variant === "wrong") return refusedOn(w, p.target, "refused", [UNLOCK_REFUSES])
		return unlockedOn(w, liveOf(w, p.target) as ModelProfile, "home", [OPEN_BEARER])
	},
}

const otherCredentials = (w: World, target: ProfileRef): CredentialRef[] =>
	live(w)
		.filter((x) => x.ref !== target && x.credential !== undefined)
		.map((x) => x.credential as CredentialRef)

function passkeyVariant(rng: Rng, w: World, target: ProfileRef): ParamsMap["unlockPasskey"] {
	const other = pick(rng, otherCredentials(w, target))
	const variants = ["approve", "approve", "refuse", "no-prf", ...(other ? (["other"] as const) : [])] as const
	const variant = pick(rng, variants) as ParamsMap["unlockPasskey"]["variant"]
	return variant === "other" ? { target, variant, other } : { target, variant }
}

const unlockPasskey: ActionSpec<"unlockPasskey"> = {
	name: "unlockPasskey",
	family: "unlock",
	weight: 5,
	invalid: (w, p) => {
		if (!locked(w)) return "not locked"
		if (liveOf(w, p.target)?.method !== "passkey") return `${p.target} is no live passkey profile`
		if (p.variant === "other" && !(p.other && otherCredentials(w, p.target).includes(p.other))) return "no other live credential"
		return p.variant !== "other" && p.other ? "only the other-credential variant names one" : undefined
	},
	params: (rng, w) => {
		if (!locked(w)) return undefined
		const target = pick(
			rng,
			live(w).filter((x) => x.method === "passkey"),
		)
		return target ? passkeyVariant(rng, w, target.ref) : undefined
	},
	expect: (w, p) => {
		if (p.variant === "refuse") return refusedOn(w, p.target, "cancelled", [PROMPT_DISMISSED])
		if (p.variant === "no-prf") return refusedOn(w, p.target, "refused", [PRF_REQUIRED])
		if (p.variant === "other") return refusedOn(w, p.target, "refused", [PASSKEY_UNLOCK_BINDS])
		return unlockedOn(w, liveOf(w, p.target) as ModelProfile, "home", [OPEN_BEARER])
	},
}

const switchProfile: ActionSpec<"switchProfile"> = {
	name: "switchProfile",
	family: "switch",
	weight: 2,
	invalid: (w, p) => (locked(w) && liveOf(w, p.to) && p.to !== w.selected ? undefined : "needs a locked wallet and another live profile"),
	params: (rng, w) => {
		const to = locked(w)
			? pick(
					rng,
					live(w).filter((x) => x.ref !== w.selected),
				)
			: undefined
		return to ? { to: to.ref } : undefined
	},
	expect: (w, p) => {
		const next = clone(w)
		next.selected = p.to
		return result(next, ["committed"], [{ kind: "device" }], "lock", [PICKER_PERSISTS])
	},
}

// ── recovery phrase ─────────────────────────────────────────────────────

const revealPhrase: ActionSpec<"revealPhrase"> = {
	name: "revealPhrase",
	family: "phrase",
	weight: 2,
	invalid: (w) => (openProfile(w)?.method === "password" ? undefined : "needs an open password profile"),
	params: (rng, w) => (openProfile(w)?.method === "password" ? { variant: chance(rng, 0.25) ? "wrong" : "right" } : undefined),
	expect: (w, p) => {
		if (p.variant === "wrong") return unchanged(w, "refused", [PHRASE_EXPORT])
		const next = clone(w)
		const open = openProfile(w) as ModelProfile
		if (open.phrase && !next.knownPhrases.includes(open.phrase)) next.knownPhrases.push(open.phrase)
		return result(next, ["committed"], [{ kind: "profile", ref: open.ref }], "unchanged", [PHRASE_EXPORT])
	},
}

const importPhrase: ActionSpec<"importPhrase"> = {
	name: "importPhrase",
	family: "phrase",
	weight: 2,
	invalid: (w, p) => {
		if (!w.knownPhrases.includes(p.phrase)) return `${p.phrase} was never read`
		return newProfileInvalid(w, { profile: p.ref, secret: p.password }) ?? duplicateInvalid(!!phraseHolder(w, p.phrase), p.duplicate)
	},
	params: (rng, w) => {
		const phrase = canAddProfile(w) ? pick(rng, w.knownPhrases) : undefined
		if (!phrase) return undefined
		const r = reserve(w)
		const base = { ref: r.profile(), phrase, name: r.name(), password: r.secret() }
		return phraseHolder(w, phrase) ? { ...base, duplicate: chance(rng, 0.75) ? "confirm" : "decline" } : base
	},
	expect: (w, p) => {
		if (p.duplicate === "decline") return importNotCommitted(w, "cancelled", [DUPLICATE_WARNS])
		const profile = {
			ref: p.ref,
			method: "password" as const,
			name: nameFor(w, p.name),
			password: p.password,
			phrase: p.phrase,
			derived: 1,
			imported: [],
		}
		const next = addProfile(w, profile)
		bump(next, { profile: 1, secret: 1, name: 1 })
		return result(next, ["committed"], created(p.ref), "home", [PHRASE_IMPORT, ...(p.duplicate ? [DUPLICATE_WARNS] : []), OPEN_BEARER])
	},
}

// ── accounts ────────────────────────────────────────────────────────────

/** Three derived accounts keep every one on the export picker's first screen. */
function createsAccount(w: World): boolean {
	const open = openProfile(w)
	return open !== undefined && open.derived < 3
}

const addAccount: ActionSpec<"addAccount"> = {
	name: "addAccount",
	family: "account",
	weight: 2,
	invalid: (w) => (createsAccount(w) ? undefined : "needs an open profile under three accounts"),
	params: (_rng, w) => (createsAccount(w) ? {} : undefined),
	expect: (w) => {
		const next = clone(w)
		const target = openProfile(next) as ModelProfile
		target.derived += 1
		return result(next, ["committed"], [{ kind: "profile", ref: target.ref }], "unchanged", [ADD_ACCOUNT])
	},
}

// ── full backups ────────────────────────────────────────────────────────

const exportBackup: ActionSpec<"exportBackup"> = {
	name: "exportBackup",
	family: "backup",
	weight: 3,
	invalid: (w, p) => (openProfile(w) ? freshRefs(w, { file: p.file }) : "no open session"),
	params: (_rng, w) => (openProfile(w) ? { file: reserve(w).file() } : undefined),
	expect: (w, p) => {
		const next = clone(w)
		const from = openProfile(w) as ModelProfile
		next.files.push({
			ref: p.file,
			kind: "backup",
			from: from.ref,
			method: from.method,
			password: from.password,
			phrase: from.phrase,
			credential: from.credential,
			imported: [...from.imported],
			derived: from.derived,
		})
		bump(next, { file: 1 })
		return result(next, ["committed"], [{ kind: "profile", ref: from.ref }], "unchanged", [FULL_EXPORT])
	},
}

const backupOf = (w: World, ref: FileRef): ModelFile | undefined => w.files.find((f) => f.ref === ref && f.kind === "backup")

/** A passkey restore is refused while a live profile holds its credential. */
const credentialLive = (w: World, f: ModelFile): boolean => f.credential !== undefined && live(w).some((x) => x.credential === f.credential)

const restoreWarns = (w: World, f: ModelFile, variant: ParamsMap["importBackup"]["variant"]): boolean =>
	variant === "right" && !credentialLive(w, f) && phraseHolder(w, f.phrase) !== undefined

function importBackupParams(rng: Rng, w: World): ParamsMap["importBackup"] | undefined {
	const file = canAddProfile(w)
		? pick(
				rng,
				w.files.filter((f) => f.kind === "backup"),
			)
		: undefined
	if (!file) return undefined
	const r = reserve(w)
	const corruptions = ["truncated", "flipped"] as const
	const variants =
		file.method === "password"
			? (["right", "right", "wrong-password", ...corruptions] as const)
			: (["right", "right", ...corruptions] as const)
	const variant = pick(rng, variants) as ParamsMap["importBackup"]["variant"]
	const base = { file: file.ref, variant, ref: r.profile(), password: r.secret() }
	return restoreWarns(w, file, variant) ? { ...base, duplicate: chance(rng, 0.75) ? "confirm" : "decline" } : base
}

function restoredWorld(w: World, file: ModelFile, ref: ProfileRef, password: SecretRef): World {
	const next = addProfile(w, {
		ref,
		method: file.method,
		password: file.method === "password" ? password : undefined,
		phrase: file.phrase,
		credential: file.credential,
		derived: file.derived,
		imported: [...file.imported],
	})
	bump(next, { profile: 1, secret: 1 })
	return next
}

const importBackup: ActionSpec<"importBackup"> = {
	name: "importBackup",
	family: "backup",
	weight: 3,
	invalid: (w, p) => {
		const file = backupOf(w, p.file)
		if (!file) return `${p.file} is no backup`
		if (p.variant === "wrong-password" && file.method !== "password") return "a passkey backup has no file password"
		return (
			newProfileInvalid(w, { profile: p.ref, secret: p.password }) ?? duplicateInvalid(restoreWarns(w, file, p.variant), p.duplicate)
		)
	},
	params: importBackupParams,
	expect: (w, p) => {
		const file = backupOf(w, p.file) as ModelFile
		if (p.variant !== "right")
			return importNotCommitted(
				w,
				"refused",
				p.variant === "wrong-password" ? [BACKUP_UNREADABLE] : [BACKUP_UNPARSED, BACKUP_INTEGRITY, BACKUP_UNREADABLE],
			)
		if (credentialLive(w, file)) return importNotCommitted(w, "refused", [PASSKEY_RESTORE_UNIQUE])
		if (p.duplicate === "decline") return importNotCommitted(w, "cancelled", [DUPLICATE_WARNS])
		const sources = [RESTORE_CLONE, RESTORE_FINALIZES, OPEN_BEARER, ...(p.duplicate ? [DUPLICATE_WARNS] : [])]
		return result(restoredWorld(w, file, p.ref, p.password), ["committed"], created(p.ref), "home", sources)
	},
}

// ── account files ───────────────────────────────────────────────────────

function accountChoiceInvalid(open: ModelProfile, which: AccountChoice): string | undefined {
	if ("sentinel" in which) return open.imported.includes(which.sentinel) ? undefined : `${which.sentinel} is not in ${open.ref}`
	const i = which.derivedIndex
	return Number.isInteger(i) && i >= 0 && i < open.derived ? undefined : `no derived account ${i}`
}

const exportAccountFile: ActionSpec<"exportAccountFile"> = {
	name: "exportAccountFile",
	family: "account-file",
	weight: 2,
	invalid: (w, p) => {
		const open = openProfile(w)
		if (open?.method !== "password") return "needs an open password profile"
		return freshRefs(w, { file: p.file }) ?? accountChoiceInvalid(open, p.which)
	},
	params: (rng, w) => {
		const open = openProfile(w)
		if (open?.method !== "password") return undefined
		const sentinel = pick(rng, open.imported)
		const which = sentinel && chance(rng, 0.5) ? { sentinel } : { derivedIndex: Math.floor(rng() * open.derived) }
		return { file: reserve(w).file(), which }
	},
	expect: (w, p) => {
		const next = clone(w)
		const from = openProfile(w) as ModelProfile
		next.files.push({
			ref: p.file,
			kind: "account",
			from: from.ref,
			method: "password",
			password: from.password,
			phrase: from.phrase,
			imported: [],
			derived: 0,
			account: p.which,
		})
		bump(next, { file: 1 })
		return result(next, ["committed"], [], "unchanged", [ACCOUNT_EXPORT])
	},
}

/** The phrase and index, or the original file, behind the account a file carries. */
function accountIdentity(w: World, f: ModelFile): string {
	const account = f.account as AccountChoice
	if ("sentinel" in account) return accountIdentity(w, w.files.find((x) => x.ref === account.sentinel) as ModelFile)
	return `${f.phrase}#${account.derivedIndex}`
}

/** Whether `target` already holds the account `f` carries, derived or imported. */
function holdsAccount(w: World, target: ModelProfile, f: ModelFile): boolean {
	const id = accountIdentity(w, f)
	const [phrase, index] = id.split("#")
	if (target.phrase === phrase && Number(index) < target.derived) return true
	return target.imported.some((s) => accountIdentity(w, w.files.find((x) => x.ref === s) as ModelFile) === id)
}

const importAccountFile: ActionSpec<"importAccountFile"> = {
	name: "importAccountFile",
	family: "account-file",
	weight: 2,
	invalid: (w, p) => {
		if (!openProfile(w)) return "no open session"
		return w.files.some((f) => f.ref === p.file && f.kind === "account") ? undefined : `${p.file} is no account file`
	},
	params: (rng, w) => {
		const file = openProfile(w)
			? pick(
					rng,
					w.files.filter((f) => f.kind === "account"),
				)
			: undefined
		return file ? { file: file.ref } : undefined
	},
	expect: (w, p) => {
		const file = w.files.find((f) => f.ref === p.file) as ModelFile
		const target = openProfile(w) as ModelProfile
		if (holdsAccount(w, target, file)) return unchanged(w, "refused", [ACCOUNT_DUPLICATE])
		const next = clone(w)
		;(openProfile(next) as ModelProfile).imported.push(file.ref)
		return result(next, ["committed"], [{ kind: "profile", ref: target.ref }], "unchanged", [ACCOUNT_IMPORT])
	},
}

// ── profile edits and deletion ──────────────────────────────────────────

const changePassword: ActionSpec<"changePassword"> = {
	name: "changePassword",
	family: "edit",
	weight: 2,
	invalid: (w, p) => (openProfile(w)?.method === "password" ? freshRefs(w, { secret: p.password }) : "needs an open password profile"),
	params: (rng, w) =>
		openProfile(w)?.method === "password"
			? { variant: chance(rng, 0.25) ? "wrong" : "right", password: reserve(w).secret() }
			: undefined,
	expect: (w, p) => {
		if (p.variant === "wrong") return unchanged(w, "refused", [PASSWORD_CHANGE])
		const next = clone(w)
		const target = openProfile(next) as ModelProfile
		target.password = p.password
		bump(next, { secret: 1 })
		// The change reopens the open session under the new password, so the row takes the bearer a
		// fresh open would under the device's strict mode.
		next.session = { kind: "open", ref: target.ref, bearer: !w.device.strict }
		return result(next, ["committed"], [{ kind: "profile", ref: target.ref }], "unchanged", [
			PASSWORD_CHANGE,
			PASSWORD_CHANGE_REOPENS,
			OPEN_BEARER,
		])
	},
}

const rename: ActionSpec<"rename"> = {
	name: "rename",
	family: "edit",
	weight: 1,
	invalid: (w) => (openProfile(w) ? undefined : "no open session"),
	params: (_rng, w) => (openProfile(w) ? { name: reserve(w).name() } : undefined),
	expect: (w, p) => {
		const next = clone(w)
		const target = openProfile(next) as ModelProfile
		target.name = p.name
		bump(next, { name: 1 })
		return result(next, ["committed"], [{ kind: "profile", ref: target.ref }], "unchanged", [RENAME])
	},
}

/** The profile a delete removes: the open one from Settings, the lock screen's from Forgot password. */
export const deleteTarget = (w: World, via: ParamsMap["deleteProfile"]["via"]): ModelProfile | undefined =>
	via === "settings" ? openProfile(w) : locked(w) ? selectedProfile(w) : undefined

function deletedWorld(w: World, target: ProfileRef): World {
	const next = clone(w)
	;(profileOf(next, target) as ModelProfile).deleted = true
	next.session =
		next.session.kind === "locked" && next.session.staleRow !== target && next.session.staleRow ? next.session : { kind: "locked" }
	next.selected = undefined
	return next
}

const deleteProfile: ActionSpec<"deleteProfile"> = {
	name: "deleteProfile",
	family: "delete",
	weight: 2,
	invalid: (w, p) => (deleteTarget(w, p.via) ? undefined : `nothing for ${p.via} to delete`),
	params: (rng, w) => {
		const vias = (["settings", "forgot"] as const).filter((via) => deleteTarget(w, via))
		const via = pick(rng, vias)
		return via ? { via } : undefined
	},
	expect: (w, p) => {
		const target = deleteTarget(w, p.via) as ModelProfile
		const next = deletedWorld(w, target.ref)
		const settle: Settle = live(next).length ? "lock" : "register"
		const sources = p.via === "forgot" ? [DELETE, RESET_WHILE_LOCKED, RESET_ROUTES] : [DELETE, RESET_ROUTES]
		return result(next, ["committed"], [{ kind: "delete", ref: target.ref }, { kind: "device" }], settle, sources)
	},
}

// ── device, background, windows ─────────────────────────────────────────

const toggleStrict: ActionSpec<"toggleStrict"> = {
	name: "toggleStrict",
	family: "strict",
	weight: 2,
	invalid: (w) => (openProfile(w)?.method === "password" ? undefined : "the strict row shows only to an open password profile"),
	params: (_rng, w) => (openProfile(w)?.method === "password" ? {} : undefined),
	expect: (w) => {
		const next = clone(w)
		next.device.strict = !w.device.strict
		if (next.device.strict && next.session.kind === "open") next.session.bearer = false
		return result(next, ["committed"], [{ kind: "device" }], "unchanged", [STRICT_TOGGLE, STRICT_DEFAULT, STRICT_ROW])
	},
}

function restartedWorld(w: World): World {
	const next = clone(w)
	const open = openProfile(w)
	if (w.session.kind === "open" && w.session.bearer) return next
	if (open?.method === "passkey") next.session = { kind: "locked", staleRow: open.ref }
	else if (open) next.session = { kind: "locked" }
	return next
}

const backgroundRestart: ActionSpec<"backgroundRestart"> = {
	name: "backgroundRestart",
	family: "restart",
	weight: 2,
	invalid: () => undefined,
	params: () => ({}),
	expect: (w) => result(restartedWorld(w), ["committed"], [], "unchanged", [SESSION_RESTORE]),
}

const secondWindow: ActionSpec<"secondWindow"> = {
	name: "secondWindow",
	family: "window",
	weight: 2,
	invalid: (w, p, caps) => {
		if (p.op === "lock") return openProfile(w) ? undefined : "no open session"
		const target = selectedProfile(w)
		if (!locked(w) || !target) return "needs a locked wallet with a known lock-screen profile"
		return target.method === "passkey" && !caps.ceremonyOffAnchor ? "a passkey ceremony runs only on the anchor page here" : undefined
	},
	params: (_rng, w, caps) => {
		if (openProfile(w)) return { op: "lock" }
		return secondWindow.invalid(w, { op: "unlock" }, caps) ? undefined : { op: "unlock" }
	},
	expect: (w, p) => {
		if (p.op === "lock") return result(lockedWorld(w), ["committed"], [], "lock", [LOCK_CLOSES])
		return unlockedOn(w, selectedProfile(w) as ModelProfile, "unchanged", [OPEN_BEARER])
	},
}

const lockedOnPasskey = (w: World): boolean => locked(w) && selectedProfile(w)?.method === "passkey"
const lockedOnPassword = (w: World): boolean => locked(w) && selectedProfile(w)?.method === "password"

const abandonCeremony: ActionSpec<"abandonCeremony"> = {
	name: "abandonCeremony",
	family: "ceremony",
	weight: 2,
	invalid: (w) => (lockedOnPasskey(w) ? undefined : "needs a lock screen on a passkey profile"),
	params: (_rng, w) => (lockedOnPasskey(w) ? {} : undefined),
	expect: (w) => unchanged(w, "cancelled", ["decision:D11"]),
}

// ── races: each competing step waits for the hold's acknowledgement ─────

/** The run locks again once the race settles, so every outcome ends on one locked state. */
const raceLockDuringUnlock: ActionSpec<"raceLockDuringUnlock"> = {
	name: "raceLockDuringUnlock",
	family: "race",
	weight: 1,
	invalid: (w) => (lockedOnPasskey(w) ? undefined : "needs a lock screen on a passkey profile"),
	params: (_rng, w) => (lockedOnPasskey(w) ? {} : undefined),
	expect: (w) => {
		const writes: WriteScope[] = [{ kind: "profile", ref: w.selected as ProfileRef }, { kind: "device" }]
		return result(lockedWorld(w), ["committed-then-locked", "cancelled", "refused"], writes, "lock", [
			LOCK_CLOSES,
			LOCK_DELETES_ROW,
			"decision:D17",
		])
	},
}

const raceDoubleUnlock: ActionSpec<"raceDoubleUnlock"> = {
	name: "raceDoubleUnlock",
	family: "race",
	weight: 1,
	invalid: (w) => (lockedOnPassword(w) ? undefined : "needs a lock screen on a password profile"),
	params: (_rng, w) => (lockedOnPassword(w) ? {} : undefined),
	expect: (w) => unlockedOn(w, selectedProfile(w) as ModelProfile, "home", [OPEN_BEARER]),
}

/** A passkey unlock that committed in the stopped background leaves its row, and the next
 *  background keeps it for the lock screen; the lock after the release deletes it. */
const raceRestartDuringUnlock: ActionSpec<"raceRestartDuringUnlock"> = {
	name: "raceRestartDuringUnlock",
	family: "race",
	weight: 1,
	invalid: (w, _p, caps) =>
		caps.restartUnderOpenPage ? abandonCeremony.invalid(w, {}, caps) : "the background will not stop under the held page",
	params: (_rng, w, caps) => (raceRestartDuringUnlock.invalid(w, {}, caps) ? undefined : {}),
	expect: (w) => {
		const writes: WriteScope[] = [{ kind: "profile", ref: w.selected as ProfileRef }, { kind: "device" }]
		return result(lockedWorld(w), ["committed-then-locked", "cancelled", "refused"], writes, "lock", [
			SESSION_RESTORE,
			LOCK_DELETES_ROW,
			"decision:D17",
		])
	},
}

// ── the dApp family and held restores (network file) ────────────────────

const dappWhileLocked: ActionSpec<"dappWhileLocked"> = {
	name: "dappWhileLocked",
	family: "dapp",
	weight: 4,
	invalid: (w, _p, caps) =>
		caps.network && lockedOnPassword(w) ? undefined : "needs the playground and a lock screen on a password profile",
	params: (_rng, w, caps) => (dappWhileLocked.invalid(w, {}, caps) ? undefined : {}),
	expect: (w) => unlockedOn(w, selectedProfile(w) as ModelProfile, "unchanged", [DAPP_QUEUE, OPEN_BEARER]),
}

const dappDuringHeldUnlock: ActionSpec<"dappDuringHeldUnlock"> = {
	name: "dappDuringHeldUnlock",
	family: "dapp",
	weight: 3,
	invalid: (w, _p, caps) =>
		caps.network && lockedOnPasskey(w) ? undefined : "needs the playground and a lock screen on a passkey profile",
	params: (_rng, w, caps) => (dappDuringHeldUnlock.invalid(w, {}, caps) ? undefined : {}),
	expect: (w) => unlockedOn(w, selectedProfile(w) as ModelProfile, "unchanged", [DAPP_QUEUE, OPEN_BEARER]),
}

const restoreCompetitors = (stage: ParamsMap["restoreHeld"]["stage"], caps: Caps): ParamsMap["restoreHeld"]["competing"][] => [
	"lock",
	...(caps.restartUnderOpenPage ? (["restart"] as const) : []),
	...(stage === "account-state" ? (["delete"] as const) : []),
]

const heldRestoreFile = (w: World, f: ModelFile): boolean => f.kind === "backup" && f.method === "password" && !phraseHolder(w, f.phrase)

const restoreHeld: ActionSpec<"restoreHeld"> = {
	name: "restoreHeld",
	family: "restore-held",
	weight: 4,
	invalid: (w, p, caps) => {
		if (!caps.restoreGate) return "the build holds no restore gate"
		const file = backupOf(w, p.file)
		if (!locked(w) || !file || !heldRestoreFile(w, file)) return "needs a lock screen and a password backup no live profile holds"
		if (!restoreCompetitors(p.stage, caps).includes(p.competing)) return `${p.competing} cannot meet a restore held at ${p.stage} here`
		return newProfileInvalid(w, { profile: p.ref, secret: p.password })
	},
	params: (rng, w, caps) => {
		const file = pick(
			rng,
			w.files.filter((f) => heldRestoreFile(w, f)),
		)
		if (!caps.restoreGate || !locked(w) || !file || !canAddProfile(w)) return undefined
		const stage = pick(rng, ["service-restore", "account-state"] as const) as ParamsMap["restoreHeld"]["stage"]
		const competing = pick(rng, restoreCompetitors(stage, caps)) as ParamsMap["restoreHeld"]["competing"]
		const r = reserve(w)
		return { file: file.ref, stage, competing, ref: r.profile(), password: r.secret() }
	},
	// A restart before finalize rolls the profile back; any interruption after it keeps the profile,
	// and a delete removes it. The run locks once the restore settles, so each pair ends locked.
	expect: (w, p) => {
		const file = backupOf(w, p.file) as ModelFile
		const restored = restoredWorld(w, file, p.ref, p.password)
		const rolledBack = p.stage === "service-restore" && p.competing === "restart"
		const next = rolledBack ? clone(w) : p.competing === "delete" ? deletedWorld(restored, p.ref) : lockedWorld(restored)
		if (rolledBack) bump(next, { profile: 1, secret: 1 })
		next.session = { kind: "locked" }
		next.selected = rolledBack || p.competing === "delete" ? undefined : p.ref
		const writes: WriteScope[] = [
			{ kind: rolledBack || p.competing === "delete" ? "delete" : "create", ref: p.ref },
			{ kind: "device" },
		]
		const outcome: Outcome = rolledBack || p.competing === "delete" ? "cancelled" : "committed-then-locked"
		return result(next, [outcome], writes, "lock", [RESTORE_GATE, rolledBack ? RESTORE_ROLLS_BACK : RESTORE_FINALIZES])
	},
}

/** Every live profile in model order: a wrong secret refused with no write, its own secret opens it,
 *  its accounts read as recorded; then the lock screen goes back to the selection, if one is known. */
const verifyAll: ActionSpec<"verifyAll"> = {
	name: "verifyAll",
	family: "verify",
	weight: 1,
	invalid: (w) => (live(w).length ? undefined : "no live profile"),
	params: (_rng, w) => (live(w).length ? {} : undefined),
	expect: (w) => {
		const writes: WriteScope[] = [{ kind: "device" }, ...live(w).map((x) => ({ kind: "profile" as const, ref: x.ref }))]
		const next = clone(w)
		next.session = { kind: "locked" }
		next.selected = w.selected ?? (live(w).at(-1) as ModelProfile).ref
		return result(next, ["committed"], writes, "lock", [UNLOCK_REFUSES, PASSKEY_UNLOCK_BINDS, OPEN_BEARER])
	},
}

export const CATALOG = [
	createPassword,
	createPasskey,
	lock,
	unlockPassword,
	unlockPasskey,
	switchProfile,
	revealPhrase,
	importPhrase,
	addAccount,
	exportBackup,
	importBackup,
	exportAccountFile,
	importAccountFile,
	changePassword,
	rename,
	deleteProfile,
	toggleStrict,
	backgroundRestart,
	secondWindow,
	abandonCeremony,
	raceLockDuringUnlock,
	raceDoubleUnlock,
	raceRestartDuringUnlock,
	dappWhileLocked,
	dappDuringHeldUnlock,
	restoreHeld,
	verifyAll,
] as const

type Catalog = { [N in ActionName]: ActionSpec<N> }
export const ACTIONS: Catalog = Object.fromEntries(CATALOG.map((spec) => [spec.name, spec])) as unknown as Catalog

function stepOf<N extends ActionName>(index: number, spec: ActionSpec<N>, params: unknown, w: World, caps: Caps): PlannedStep {
	const p = params as ParamsMap[N]
	return { index, action: spec.name, params: p, expect: spec.expect(w, p, caps) } as PlannedStep
}

/** `verifyAll` is drawn like any action and also closes every run. */
function drawStep(rng: Rng, w: World, caps: Caps, index: number): PlannedStep | undefined {
	const candidates = CATALOG.map((spec) => ({ spec, params: spec.params(rng, w, caps) })).filter((c) => c.params !== undefined)
	const total = candidates.reduce((sum, c) => sum + c.spec.weight, 0)
	let roll = rng() * total
	for (const c of candidates) {
		roll -= c.spec.weight
		if (roll < 0) return stepOf(index, c.spec as ActionSpec<ActionName>, c.params, w, caps)
	}
	return undefined
}

/** A run of `length` drawn actions, then `verifyAll` whenever a profile is left to verify. */
export function plan(seed: number, start: StartState, caps: Caps, length = ACTIONS_PER_RUN): Plan {
	const rng = prng(seed)
	let w = startWorld(start)
	const steps: PlannedStep[] = []
	for (let i = 0; i < length; i++) {
		const step = drawStep(rng, w, caps, i)
		if (!step) throw new Error(`seed ${seed}: no action can run at step ${i}`)
		steps.push(step)
		w = step.expect.next
	}
	if (!ACTIONS.verifyAll.invalid(w, {}, caps)) steps.push(stepOf(length, ACTIONS.verifyAll, {}, w, caps))
	return { seed, start, caps, steps }
}

/**
 * A hand-trimmed action list as a plan: each step is checked against the world the steps before it
 * leave, and the first one that cannot run there is refused by name.
 */
export function planFromList(list: readonly ListedStep[], start: StartState, caps: Caps, seed = Number.NaN): Plan {
	let w = startWorld(start)
	const steps: PlannedStep[] = list.map((listed, index) => {
		const spec = ACTIONS[listed.action] as ActionSpec<ActionName> | undefined
		if (!spec) throw new Error(`step ${index}: unknown action ${String(listed.action)}`)
		const why = spec.invalid(w, listed.params as never, caps)
		if (why) throw new Error(`step ${index} (${listed.action}) cannot run here: ${why}`)
		const step = stepOf(index, spec, listed.params, w, caps)
		w = step.expect.next
		return step
	})
	return { seed, start, caps, steps }
}

export const familyOf = (action: ActionName): Family => ACTIONS[action].family

/** What a step ends on purpose, which scopes the error allowlist: a run's cleanup lock after a
 *  race or a held restore counts as the step's own, and so does the lock a profile create or import
 *  begins with while a session is open, the lock screen being its only entry once profiles exist. */
export type StepEnd = "session" | "background"

const ENTERS_FROM_LOCK_SCREEN: ReadonlySet<ActionName> = new Set(["createPassword", "createPasskey", "importPhrase", "importBackup"])

export function endsOf(step: ListedStep, before: World): StepEnd[] {
	if (ENTERS_FROM_LOCK_SCREEN.has(step.action)) return before.session.kind === "open" ? ["session"] : []
	switch (step.action) {
		case "lock":
		case "deleteProfile":
		case "raceLockDuringUnlock":
		case "verifyAll":
			return ["session"]
		case "secondWindow":
			return step.params.op === "lock" ? ["session"] : []
		case "backgroundRestart":
			return ["background"]
		case "raceRestartDuringUnlock":
			return ["session", "background"]
		case "restoreHeld":
			return step.params.competing === "restart" ? ["session", "background"] : ["session"]
		default:
			return []
	}
}

/** What a run completed: per family, per transition (two completed actions in a row) and per race. */
export interface Coverage {
	families: Partial<Record<Family, number>>
	transitions: Record<string, number>
	schedules: Record<string, number>
}

export function coverage(completed: readonly ActionName[]): Coverage {
	const out: Coverage = { families: {}, transitions: {}, schedules: {} }
	completed.forEach((action, i) => {
		const family = familyOf(action)
		out.families[family] = (out.families[family] ?? 0) + 1
		if (family === "race" || family === "restore-held") out.schedules[action] = (out.schedules[action] ?? 0) + 1
		if (i > 0) {
			const pair = `${completed[i - 1]}>${action}`
			out.transitions[pair] = (out.transitions[pair] ?? 0) + 1
		}
	})
	return out
}

const counts = (r: Readonly<Record<string, number>>): string =>
	Object.entries(r)
		.map(([k, n]) => `${k}=${n}`)
		.join(" ")

/** One line a seed's log and the baseline table carry. */
export function coverageLine(
	c: Coverage,
	warns: Readonly<Record<string, number>>,
	incomplete: Readonly<Record<string, number>> = {},
	allowed: Readonly<Record<string, number>> = {},
	known: Readonly<Record<string, number>> = {},
): string {
	const gaps = Object.keys(incomplete).length ? ` incomplete[${counts(incomplete)}]` : ""
	const accepted = Object.keys(allowed).length ? ` allowed[${counts(allowed)}]` : ""
	const filed = Object.keys(known).length ? ` known[${counts(known)}]` : ""
	return `families[${counts(c.families)}] transitions=${Object.keys(c.transitions).length} schedules[${counts(c.schedules)}] warns[${counts(warns)}]${gaps}${accepted}${filed}`
}

/** A plan's steps as a printable list: symbols only, never a bound value. */
export function describePlan(p: Plan): string[] {
	return p.steps.map(
		(s) => `${s.index} ${s.action} ${JSON.stringify(s.params)} → ${s.expect.outcomes.join("|")} ${summarize(s.expect.next)}`,
	)
}

export function summarize(w: World): string {
	const session = w.session.kind === "open" ? `open(${w.session.ref}${w.session.bearer ? ",bearer" : ""})` : "locked"
	const profiles = live(w)
		.map((x) => `${x.ref}:${x.method === "password" ? "pw" : "pk"}`)
		.join(",")
	return `${session} sel=${w.selected ?? "?"} strict=${w.device.strict} [${profiles}]`
}
