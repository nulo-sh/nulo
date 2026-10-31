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
import type { ReleaseTraits } from "../../fixtures/update/release"
import { cite } from "./citations"

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
	/** Passkey credentials the run's authenticator can hold: every one a mint made counts, a deleted
	 *  profile's, a declined import's and a replaced one's included, since nothing removes them. */
	credentialSlots: number
	/** The actions the run's driver implements, every one when absent: the planner draws from the
	 *  catalog in its own order, so a run without it draws exactly as before. */
	actions?: readonly ActionName[]
}

/** The caps as a record holds them, and back: JSON has no `Infinity`, which an unlimited
 *  authenticator's slot count is. */
export type RecordedCaps = Omit<Caps, "credentialSlots"> & { credentialSlots: number | "unlimited" }

export function recordCaps(caps: Caps): RecordedCaps {
	return { ...caps, credentialSlots: Number.isFinite(caps.credentialSlots) ? caps.credentialSlots : "unlimited" }
}

export function capsOfRecord(caps: RecordedCaps): Caps {
	return { ...caps, credentialSlots: caps.credentialSlots === "unlimited" ? Number.POSITIVE_INFINITY : caps.credentialSlots }
}

export interface ModelProfile {
	ref: ProfileRef
	method: Method
	/** Undefined until the wallet shows the name a restore gave the profile. */
	name?: string
	password?: SecretRef
	credential?: CredentialRef
	/** The phrase behind the profile's master, whichever unlock it has; profiles sharing one derive
	 *  the same accounts. A retired profile has none. */
	phrase?: PhraseRef
	/** Derived accounts on the active network. */
	derived: number
	/** Account files imported into this profile and not since lost. */
	imported: FileRef[]
	deleted: boolean
	/** A passkey profile an earlier build made: listed, never opened, deletable. */
	retired?: true
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
	/** The password that opens the file: a password profile's at export, or the file password a
	 *  passkey profile's export asked for. */
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

/** `pre-update-<passkey>` names the release's passkey trait, so a record says which world it began in. */
export type StartState = "empty" | `pre-update-${ReleaseTraits["passkey"]}`

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
	/** The title a refusal must show, where the clause names which refusal it is. */
	shows?: string
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
	| "method"
	| "delete"
	| "strict"
	| "restart"
	| "window"
	| "ceremony"
	| "race"
	| "dapp"
	| "restore-held"
	| "tamper"
	| "verify"

export interface ParamsMap {
	createPassword: { ref: ProfileRef; name: string; password: SecretRef; double: boolean }
	createPasskey: { ref: ProfileRef; name: string; credential: CredentialRef; double: boolean }
	lock: Record<string, never>
	unlockPassword: { target: ProfileRef; variant: "right" | "wrong" }
	unlockPasskey: { target: ProfileRef; variant: PasskeyVariant; other?: CredentialRef }
	switchProfile: { to: ProfileRef }
	/** `right` and `wrong` reveal a password profile's phrase; the others a passkey profile's. */
	revealPhrase: { variant: "right" | "wrong" | PasskeyVariant; other?: CredentialRef }
	importPhrase: {
		ref: ProfileRef
		phrase: PhraseRef
		name: string
		/** Absent is `password`, so a list recorded before the passkey choice keeps its meaning. */
		method?: Method
		password?: SecretRef
		/** A minted credential is "I already have one"; the next one is minted by the import's card. */
		credential?: CredentialRef
		/** Given exactly when a live profile holds the phrase, which makes the wallet warn first. */
		duplicate?: "confirm" | "decline"
	}
	addAccount: Record<string, never>
	/** A passkey profile's export takes a file password, `short` one under the wallet's rule. */
	exportBackup: { file: FileRef; password?: SecretRef; variant?: "short" }
	importBackup: {
		file: FileRef
		/** `earlier-shape`: a passkey profile's file opened, its recovery phrase field made no string,
		 *  and sealed again under its own password. */
		variant: "right" | "wrong-password" | "truncated" | "flipped" | "earlier-shape"
		ref: ProfileRef
		/** The restored profile's unlock, as `importPhrase` takes it. */
		method?: Method
		password?: SecretRef
		credential?: CredentialRef
		duplicate?: "confirm" | "decline"
	}
	/** A passkey profile's file asks its passkey, then a file password (`password`); `short` is one
	 *  under the wallet's rule, `refuse` and `other` answer the passkey's prompt. */
	exportAccountFile: {
		file: FileRef
		which: AccountChoice
		password?: SecretRef
		variant?: "short" | "refuse" | "other"
		other?: CredentialRef
	}
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
	/** The first profile, made in the onboarding tab, which shows the phrase stage. */
	onboardingCreate: {
		ref: ProfileRef
		method: Method
		password?: SecretRef
		credential?: CredentialRef
		answer: "saved" | "later"
	}
	/** The backup a passkey profile made before 1.1, picked on the import page. */
	importEarlierBackup: Record<string, never>
	/** A passkey unlock held at its prompt while the profile's stored row changes; restored after. */
	editRowDuringUnlock: { field: "prfSalt" | "credentialId" | "secret" | "type" }
	/** One byte of a stored slot flipped, then an unlock with the profile's own secret; restored after. */
	tamperedUnlock: { target: ProfileRef; slot: "guard" | "secret" | "entropy" }
	/** A passkey reveal held at its prompt while another window locks. */
	raceLockDuringReveal: Record<string, never>
	/**
	 * Settings → Unlock method. A change to `passkey` (from a password, `current` right or wrong) or to
	 * a `new-passkey` (from a passkey, `current` approve or refuse) mints `credential`; one to `password`
	 * (from a passkey, `current` approve, refuse or `other`) sets `password`. Every new passkey's prompt
	 * approves. Not `to`, which the agent session reads as a profile.
	 */
	changeUnlockMethod: {
		change: "passkey" | "new-passkey" | "password"
		current: "right" | "wrong" | "approve" | "refuse" | "other"
		credential?: CredentialRef
		password?: SecretRef
		other?: CredentialRef
	}
	/** Unlock method's current-passkey prompt held while another window locks. */
	raceLockDuringMethodChange: Record<string, never>
	/** Unlock method's current-passkey prompt held on a second page while the anchor deletes the
	 *  profile or makes an approved change. */
	raceMethodChangeElsewhere: Competitor
	/** The account file page approved by the passkey, its file `password` typed, on a second page
	 *  while the anchor makes an approved change; then Save, if the page still offers it. */
	raceMethodChangeDuringExport: { password: SecretRef; change: ParamsMap["changeUnlockMethod"] }
	verifyAll: Record<string, never>
}

export type PasskeyVariant = "approve" | "refuse" | "no-prf" | "other"

/** What another page's step meets, each the anchor's own action: a delete from Settings, or a
 *  change its current passkey approves. */
export type Competitor = { competing: "delete" } | { competing: "change"; change: ParamsMap["changeUnlockMethod"] }

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

const SERVICE = "src/wallet/services/profile/service.ts"
const SESSIONS = "src/wallet/services/profile/session-manager.ts"
const IMPORT = "src/composables/useFullBackupImport.ts"
const CREATE_OPENS = cite(SERVICE, 768, "public async createProfile(")
const PASSKEY_CREATE_OPENS = cite(SERVICE, 880, "public async createPasskeyProfile(")
const PASSKEY_CREATE_PHRASE = cite(SERVICE, 910, "deriveMasterFromMnemonic(await getMnemonic(entropy))")
const UNLOCK_REFUSES = cite(SERVICE, 831, "throw new InvalidPasswordError()")
const PASSKEY_UNLOCK_BINDS = cite(SERVICE, 965, "answer.credential.id !== snapshot.credentialId")
const LOCK_CLOSES = cite(SERVICE, 1028, "public async lockActiveProfile(")
const RENAME = cite(SERVICE, 1148, "public async changeProfileName(")
const PASSWORD_CHANGE = cite(SERVICE, 1300, 'throw new Error("Invalid profile old password")')
const PASSWORD_CHANGE_REOPENS = cite(SERVICE, 1333, "this.reopenAfterPasswordChangeHoldingLock(")
const DELETE = cite(SERVICE, 1807, "public async deleteProfile(")
const PHRASE_IMPORT = cite(SERVICE, 2011, "public async importMnemonic(")
const PHRASE_EXPORT = cite(SERVICE, 2237, 'new Error("Invalid profile old password")')
const DUPLICATE_WARNS = cite(SERVICE, 2341, "throw new DuplicateWalletError(")
const RESTORE_CLONE = cite(SERVICE, 2484, "CLONE DIVERGENCE")
const RESTORE_TAKES_PASSWORD = cite(SERVICE, 2427, "if (!credentialData && !password) {")
const OPEN_BEARER = cite(SESSIONS, 299, "const bearer = !this.strictSecurityMode && dek")
const SESSION_RESTORE = cite(SESSIONS, 611, "session.passhash || (this.strictSecurityMode && session.bearer) || !session.bearer")
const LOCK_DELETES_ROW = cite(SESSIONS, 428, "this.deletePersistedSession()")
const STRICT_TOGGLE = cite(SESSIONS, 769, 'prop.key === "strictSecurityMode"')
const STRICT_DEFAULT = cite("src/wallet/config/config.ts", 31, "strictSecurityMode: z.boolean().default(true)")
const STRICT_ROW = cite("src/popup/pages/settings/lock.vue", 222, ':title="strictRow.title"')
const PICKER_PERSISTS = cite("src/popup/components/popups/SelectProfilePopup.vue", 67, "setLastActiveProfileId(profile.id)")
const RESET_ROUTES = cite("src/popup/pages/settings/security/reset.vue", 248, "if (!appStore.profiles.length) {")
const RESET_WHILE_LOCKED = cite("src/popup/pages/settings/security/reset.vue", 5, '"isAuthRequired": false')
const PRF_REQUIRED = cite("src/wallet/utils/passkey-ceremony.ts", 122, "if (!ext.prf) throw new PasskeyPrfError(")
const PROMPT_DISMISSED = cite("src/utils/passkey-copy.ts", 85, 'inner.name === "NotAllowedError") return "not-confirmed"')
const ADD_ACCOUNT = cite("src/wallet/services/account/service.ts", 299, "public async createAccount(")
const EXPORT = "src/composables/useFullBackupExport.ts"
const FULL_EXPORT = cite(EXPORT, 393, "sealFullBackupText(plaintext as string, state.password.value as string)")
const FILE_PASSWORD_RULE = cite(EXPORT, 560, "!isPasskeyProfile.value || isNewPasswordValid(")
const FILE_PASSWORD_BLOCKED = cite(EXPORT, 383, "if (filePasswordBlocked(ctx)) return")
const ACCOUNT_EXPORT = cite("src/wallet/services/account/service.ts", 677, "public async exportAccount(")
const ACCOUNT_IMPORT = cite("src/wallet/services/account/service.ts", 761, "public async importAccount(")
const ACCOUNT_DUPLICATE = cite("src/wallet/services/account/service.ts", 832, "This account is already in your wallet")
const ACCOUNT_HELD = cite("src/popup/pages/settings/accounts/import.vue", 309, 'data-testid="import-account-held"')
const BACKUP_UNREADABLE = cite(IMPORT, 656, "DECRYPTION_FAILED.title")
const BACKUP_INTEGRITY = cite(IMPORT, 173, "if (checksum !== comparisonChecksum) return INTEGRITY_REFUSAL")
const BACKUP_UNPARSED = cite(IMPORT, 601, "parseError.title, parseError.tooltip")
const RESTORE_ASKS_PASSWORD = cite(
	"src/components/composite/import/ImportFullBackupForm.vue",
	140,
	"askNewPassword && selectedBackup?.profileType",
)
const RESTORE_ROLLS_BACK = cite(
	"src/composables/full-backup-restore.ts",
	967,
	"scratch.createdProfileId !== undefined && !scratch.finalizeStarted",
)
const RESTORE_FINALIZES = cite(IMPORT, 508, "restoreRun = await finalizeWithReminder(")
const RESTORE_GATE = cite("src/e2e/chrome-storage-restore-gate.ts", 45, "held: true")
const DAPP_QUEUE = cite("src/wallet/services/wallet-sdk/background.ts", 766, "discoveryQueue.drain(")
const SEED_PAGE = "src/popup/pages/settings/security/export/seed.vue"
const REVEAL_PASSKEY = cite(SEED_PAGE, 124, 'runCeremony({ mode: "get", credentialId, prfSalt, step: "reveal"')
const REVEAL_CANCEL = cite(SEED_PAGE, 129, "handleCancelOrUnconfirmed(error, openToast)")
const CEREMONY_ENDS_WITH_PAGE = cite("src/components/passkey/PasskeyCeremonyDialog.vue", 85, 'cancel("dialog dismounted")')
const SLOTS_BIND_PASSKEY = cite(SERVICE, 469, "credential.id === row.credentialId ? credential.unlockKeyFor(row.prfSalt) : null")
const PASSKEY_SLOTS_REFUSE = cite(SERVICE, 969, "if (!opened) throw new PasskeyNotOpenedError()")
const PASSKEY_KIND_GATE = cite(SERVICE, 158, 'if (row.type === "password") throw new Error("Profile requires password")')
const RETIRED_UNLOCK = cite(SERVICE, 153, 'if (kind === "retired") throw new RetiredProfileError()')
const RETIRED_SLOTS = cite(SERVICE, 414, 'if (classified.kind === "retired") throw new RetiredProfileError()')
const RETIRED_EXPORTS = cite(SERVICE, 527, 'if (classifyProfileRow(profile).kind === "retired") throw new RetiredProfileError()')
const RETIRED_LISTED = cite(SERVICE, 2406, 'classifyProfileRow(profile).kind === "retired")')
const RETIRED_RESEAL = cite(SERVICE, 1293, 'if (classifyProfileRow(profile).kind === "retired") throw new RetiredProfileError()')
const RETIRED_FINALIZE = cite(SERVICE, 2588, 'if (classifyProfileRow(profile).kind === "retired") throw new RetiredProfileError()')
const RETIRED_DELETE = cite("src/popup/pages/auth.vue", 387, 'data-testid="auth-delete-retired"')
const ONBOARDING = "src/onboarding/pages/create.vue"
const ONBOARDING_PHRASE = cite(ONBOARDING, 146, 'stage.value = "phrase"')
const ONBOARDING_SAVED = cite(ONBOARDING, 159, "if (isMounted()) leavePhrase()")
const ONBOARDING_LATER = cite(ONBOARDING, 178, '@later="leavePhrase"')
const EARLIER_AT_PICK = cite(IMPORT, 596, "EARLIER_PASSKEY_BACKUP.title, EARLIER_PASSKEY_BACKUP.message")
const EARLIER_AT_DECRYPT = cite(IMPORT, 641, "EARLIER_PASSKEY_BACKUP.title, EARLIER_PASSKEY_BACKUP.message")
const EARLIER_SHAPE = cite(IMPORT, 134, 'typeof (fullBackup as Record<string, unknown>).entropy !== "string"')
const IMPORT_FLOW = "src/composables/useProfileImportFlow.ts"
const PHRASE_IMPORT_CARD = cite(IMPORT_FLOW, 195, 'await deps.unlockFor(admitted, { step: "import", profileName: name }, existing)')
const RESTORE_CARD = cite(IMPORT, 445, 'await opts.chooseUnlock({ step: "restore", profileName: name }, deps.existing)')
const PASSKEY_IMPORT_SEALS = cite(SERVICE, 2030, "seal = await this.newRowSeal(password, credentialData)")
const RESTORE_SEALS = cite(SERVICE, 2460, "seal = await this.newRowSeal(password, credentialData)")
const DISCOVERS = cite("src/wallet/utils/passkey-ceremony.ts", 117, "credentialId === undefined ? buildDiscoverOptions(prfSalt)")
const UNLOCK_METHOD = "src/popup/pages/settings/security/unlock-method.vue"
const METHOD_CHANGE = cite(SERVICE, 1388, "public async changeUnlockMethod(")
const METHOD_CHANGE_WRITES = cite(SERVICE, 1500, "await this.repo.set(original.id, replacement)")
const METHOD_CHANGE_REOPENS = cite(SERVICE, 1518, "await this.openSessionVerified(replacement, secret, dek)")
const METHOD_VERIFY_REFUSES = cite(SERVICE, 1351, "if (!opened) throw this.notOpened(key, () => new InvalidPasswordError())")
const METHOD_WRONG_PASSWORD = cite(UNLOCK_METHOD, 192, "if (isCurrent()) isWrongPassword.value = true")
/** A password profile's change checks the password before it makes a passkey, so a wrong one mints none. */
const METHOD_PASSWORD_FIRST = cite(UNLOCK_METHOD, 189, "await managers.profile.verifyUnlockCredential(id, { password: typed })")
const METHOD_THEN_MINTS = cite(UNLOCK_METHOD, 196, "const next = await nextPasskey()")
const METHOD_NEW_PASSKEY = cite(UNLOCK_METHOD, 145, "const nextPasskey = () => newPasskey.ask(")
const METHOD_CHECKS_PASSKEY = cite(UNLOCK_METHOD, 208, "await managers.profile.verifyUnlockCredential(id, { passkey: current })")
const METHOD_CHECKS_HELD = cite(UNLOCK_METHOD, 220, "verifyUnlockCredential(appStore.profile.id, { passkey: answer })")
const METHOD_CANCEL = cite(UNLOCK_METHOD, 173, "if (handleCancelOrUnconfirmed(error, openToast)) return")
const METHOD_LEAVES = cite(UNLOCK_METHOD, 159, 'leaveFor(router, "/popup/settings")')
const METHOD_ENDS_WITH_SESSION = cite(UNLOCK_METHOD, 250, "if (!logged) onSessionEnded()")
const METHOD_DROPS_PROMPT = cite(UNLOCK_METHOD, 106, 'onCeremonyReject(new Error("The unlock method page started over"))')
const METHOD_CHANGED_ELSEWHERE = cite(UNLOCK_METHOD, 89, "if (!renamed) onChangedElsewhere()")
const ACCOUNT_PAGE = "src/popup/pages/settings/security/export/account.vue"
const ACCOUNT_FILE_PASSKEY = cite(ACCOUNT_PAGE, 221, 'runCeremony({ mode: "get", credentialId, prfSalt, step: "accountFile"')
const ACCOUNT_FILE_CHECKS = cite(ACCOUNT_PAGE, 224, "await managers.profile.verifyExportCredential(profileId, { passkey: answer })")
const ACCOUNT_FILE_CANCEL = cite(ACCOUNT_PAGE, 228, "handleCancelOrUnconfirmed(error, openToast)) return")
const ACCOUNT_FILE_RULE = cite(ACCOUNT_PAGE, 92, "const canSaveFile = computed(() => isNewPasswordValid(")
const ACCOUNT_FILE_PASSWORD = cite("src/wallet/services/account/service.ts", 110, "The file password needs at least 8 characters")
const ACCOUNT_FILE_TYPE_RESETS = cite(ACCOUNT_PAGE, 162, "() => appStore.profile?.type,")
const ACCOUNT_FILE_NETWORK_RESETS = cite(ACCOUNT_PAGE, 181, "() => appStore.network?.chainId,")
/** A session opened in place re-runs the window's bootstrap, which clears the network first. */
const BOOTSTRAP_CLEARS_NETWORK = cite("src/composables/useProfileBootstrap.ts", 153, "appStore.network = undefined")
const EXPORT_CHECK_REFUSES = cite(SERVICE, 1368, "if (!opened) throw this.notOpened(key, () => new InvalidPasswordError())")
/** The import page's title for an earlier passkey body, cited so a copy change fails the citation. */
export const EARLIER_TITLE = "Backup from an earlier version"
const EARLIER_TITLE_SOURCE = cite(IMPORT, 122, `title: "${EARLIER_TITLE}"`)

/** The names a release gives the two profiles a `pre-update` start makes on it. */
export const PRE_UPDATE_NAMES = { password: "Main", passkey: "Chaos 1" } as const

/**
 * `empty`: a fresh install. `pre-update-*`: the release build made a password profile, then a
 * passkey profile, and locked; the wallet then updated in place, and the password profile carries
 * over. On `pre-update-retired` the passkey profile is retired, and its credential counts toward no
 * slot: a retired profile never asks it. On `pre-update-unlocks` it keeps `K1`, which the release's
 * own page minted and the run keeps alive, so `K1` takes a slot.
 */
export function startWorld(start: StartState): World {
	const empty: World = {
		device: { strict: true },
		profiles: [],
		session: { kind: "locked" },
		files: [],
		knownPhrases: [],
		next: { profile: 1, credential: 1, file: 1, secret: 1, phrase: 1, name: 1 },
	}
	if (start === "empty") return empty
	// A fresh `imported` per profile: a clone keeps a shared array shared.
	const base = () => ({ derived: 1, imported: [], deleted: false })
	const password: ModelProfile = {
		ref: "P1",
		method: "password",
		name: PRE_UPDATE_NAMES.password,
		password: "S1",
		phrase: "W1",
		...base(),
	}
	const passkey: ModelProfile = { ref: "P2", method: "passkey", name: PRE_UPDATE_NAMES.passkey, ...base() }
	if (start === "pre-update-retired")
		return {
			...empty,
			profiles: [password, { ...passkey, retired: true }],
			selected: "P2",
			next: { profile: 3, credential: 1, file: 1, secret: 2, phrase: 2, name: 2 },
		}
	if (start === "pre-update-unlocks")
		return {
			...empty,
			profiles: [password, { ...passkey, credential: "K1", phrase: "W2" }],
			selected: "P2",
			next: { profile: 3, credential: 2, file: 1, secret: 2, phrase: 3, name: 2 },
		}
	throw new Error(`unknown start state ${start}`)
}

export const live = (w: World): ModelProfile[] => w.profiles.filter((p) => !p.deleted)
/** Live profiles an unlock may open: every one but a retired one. */
export const openable = (w: World): ModelProfile[] => live(w).filter((p) => !p.retired)
export const profileOf = (w: World, ref: ProfileRef): ModelProfile | undefined => w.profiles.find((p) => p.ref === ref)
const liveOf = (w: World, ref: ProfileRef | undefined): ModelProfile | undefined =>
	ref === undefined ? undefined : live(w).find((p) => p.ref === ref)
const openableOf = (w: World, ref: ProfileRef | undefined): ModelProfile | undefined => {
	const p = liveOf(w, ref)
	return p?.retired ? undefined : p
}
export const openProfile = (w: World): ModelProfile | undefined => (w.session.kind === "open" ? liveOf(w, w.session.ref) : undefined)
export const selectedProfile = (w: World): ModelProfile | undefined => liveOf(w, w.selected)
const selectedOpenable = (w: World): ModelProfile | undefined => openableOf(w, w.selected)
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
function freshRefs(w: World, refs: { profile?: ProfileRef; file?: FileRef; secret?: SecretRef }): string | undefined {
	if (refs.profile && profileOf(w, refs.profile)) return `${refs.profile} already exists`
	if (refs.file && w.files.some((f) => f.ref === refs.file)) return `${refs.file} already exists`
	if (refs.secret && usedSecrets(w).includes(refs.secret)) return `${refs.secret} is already a password`
	return undefined
}

/** The name a new profile gets: a first profile shows no name field and is called "Main". */
const nameFor = (w: World, planned: string): string => (live(w).length === 0 ? "Main" : planned)

const sessionFor = (w: World, ref: ProfileRef): Session => ({
	kind: "open",
	ref,
	bearer: !w.device.strict,
})

const result = (next: World, outcomes: Outcome[], writes: WriteScope[], settle: Settle, sources: string[]): Expectation => ({
	outcomes,
	next,
	writes,
	settle,
	sources,
})

const unchanged = (w: World, outcome: Outcome, sources: string[]): Expectation => result(clone(w), [outcome], [], "unchanged", sources)

const PICKER_IMPORT = cite("src/popup/components/popups/SelectProfilePopup.vue", 163, "handleImportProfile")

/** An import that does not commit: a later profile is imported from the lock screen only, so the
 *  open session, if any, was locked on the way in. */
const importNotCommitted = (w: World, outcome: Outcome, sources: string[]): Expectation =>
	w.session.kind === "open"
		? result(lockedWorld(w), [outcome], [], "unchanged", [...sources, PICKER_IMPORT, LOCK_CLOSES])
		: unchanged(w, outcome, sources)

const canAddProfile = (w: World): boolean => live(w).length < MAX_PROFILES

/** Credentials the authenticator holds, each numbered by its mint: a reuse mints none. */
export const mintedCredentials = (w: World): number => w.next.credential - 1
const mintedRefs = (w: World): CredentialRef[] => Array.from({ length: mintedCredentials(w) }, (_, i) => `K${i + 1}` as CredentialRef)
/** Whether the authenticator held `k` in `w`: a passkey naming it is "I already have one". */
export const isMinted = (w: World, k: CredentialRef | undefined): boolean => k !== undefined && mintedRefs(w).includes(k)
const canMint = (w: World, caps: Caps): boolean => mintedCredentials(w) < caps.credentialSlots

/** Why a new profile cannot take `credential`: a reuse names a minted one, a mint the next one
 *  while a slot is free. */
function credentialInvalid(w: World, credential: CredentialRef | undefined, caps: Caps): string | undefined {
	if (!credential) return "a passkey profile takes a credential"
	if (isMinted(w, credential)) return undefined
	if (credential !== reserve(w).credential()) return `${credential} is neither minted nor the next credential`
	return canMint(w, caps) ? undefined : "the authenticator holds no more credentials"
}

/** A new passkey profile's credential: one the authenticator holds, as "I already have one" picks
 *  it, or the next mint while a slot is free. */
function drawCredential(rng: Rng, w: World, caps: Caps): CredentialRef | undefined {
	const reused = pick(rng, mintedRefs(w))
	const fresh = canMint(w, caps) ? reserve(w).credential() : undefined
	return reused && (!fresh || chance(rng, 0.35)) ? reused : fresh
}

/** A passkey choice's step on the counter: a mint takes the next number, a reuse none. */
const minting = (w: World, credential: CredentialRef | undefined): { credential: number } => ({
	credential: credential !== undefined && !isMinted(w, credential) ? 1 : 0,
})
const reuseSources = (w: World, credential: CredentialRef | undefined): string[] => (isMinted(w, credential) ? [DISCOVERS] : [])

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
	next.session = sessionFor(next, profile.ref)
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

/** `credential` minted already is "Use a passkey I already have": the browser's pick among every
 *  passkey it holds answers at a fresh input, and the new row names the picked credential. */
const createPasskey: ActionSpec<"createPasskey"> = {
	name: "createPasskey",
	family: "create",
	weight: 3,
	invalid: (w, p, caps) => newProfileInvalid(w, { profile: p.ref }) ?? credentialInvalid(w, p.credential, caps),
	params: (rng, w, caps) => {
		const credential = canAddProfile(w) ? drawCredential(rng, w, caps) : undefined
		if (!credential) return undefined
		const r = reserve(w)
		return { ref: r.profile(), name: r.name(), credential, double: !isMinted(w, credential) && chance(rng, 0.25) }
	},
	expect: (w, p) => {
		const profile = {
			ref: p.ref,
			method: "passkey" as const,
			name: nameFor(w, p.name),
			credential: p.credential,
			phrase: `W${w.next.phrase}` as PhraseRef,
			derived: 1,
			imported: [],
		}
		const next = addProfile(w, profile)
		bump(next, { profile: 1, phrase: 1, name: 1, ...minting(w, p.credential) })
		return result(next, ["committed"], created(p.ref), "home", [
			PASSKEY_CREATE_OPENS,
			PASSKEY_CREATE_PHRASE,
			...reuseSources(w, p.credential),
			OPEN_BEARER,
		])
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
	next.session = sessionFor(next, target.ref)
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

/** Credentials the authenticator holds that are not `target`'s own: a replaced or a declined one
 *  included, and never one `target` shares with another profile. */
export const otherCredentials = (w: World, target: ProfileRef): CredentialRef[] => {
	const own = profileOf(w, target)?.credential
	return mintedRefs(w).filter((k) => k !== own)
}

function passkeyVariant(rng: Rng, w: World, target: ProfileRef): { variant: PasskeyVariant; other?: CredentialRef } {
	const other = pick(rng, otherCredentials(w, target))
	const variants = ["approve", "approve", "refuse", "no-prf", ...(other ? (["other"] as const) : [])] as const
	const variant = pick(rng, variants) as PasskeyVariant
	return variant === "other" ? { variant, other } : { variant }
}

/** Why a passkey variant cannot name `other` against `target`, or undefined when it can. */
function otherInvalid(w: World, target: ProfileRef, variant: PasskeyVariant, other: CredentialRef | undefined): string | undefined {
	if (variant === "other" && !(other && otherCredentials(w, target).includes(other))) return "no other minted credential"
	return variant !== "other" && other ? "only the other-credential variant names one" : undefined
}

const unlockPasskey: ActionSpec<"unlockPasskey"> = {
	name: "unlockPasskey",
	family: "unlock",
	weight: 5,
	invalid: (w, p) => {
		if (!locked(w)) return "not locked"
		if (openableOf(w, p.target)?.method !== "passkey") return `${p.target} is no openable passkey profile`
		return otherInvalid(w, p.target, p.variant, p.other)
	},
	params: (rng, w) => {
		if (!locked(w)) return undefined
		const target = pick(
			rng,
			openable(w).filter((x) => x.method === "passkey"),
		)
		return target ? { target: target.ref, ...passkeyVariant(rng, w, target.ref) } : undefined
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

const PASSWORD_REVEALS = new Set<ParamsMap["revealPhrase"]["variant"]>(["right", "wrong"])

/** A passkey profile reveals its phrase with its passkey in the password's place. */
const revealPhrase: ActionSpec<"revealPhrase"> = {
	name: "revealPhrase",
	family: "phrase",
	weight: 2,
	invalid: (w, p) => {
		const open = openProfile(w)
		if (!open) return "no open session"
		if ((open.method === "password") !== PASSWORD_REVEALS.has(p.variant))
			return `${p.variant} reveals no ${open.method} profile's phrase`
		return open.method === "passkey"
			? otherInvalid(w, open.ref, p.variant as PasskeyVariant, p.other)
			: p.other && "a password reveal names no credential"
	},
	params: (rng, w) => {
		const open = openProfile(w)
		if (!open) return undefined
		if (open.method === "password") return { variant: chance(rng, 0.25) ? "wrong" : "right" }
		return passkeyVariant(rng, w, open.ref)
	},
	expect: (w, p) => {
		if (p.variant === "wrong") return unchanged(w, "refused", [PHRASE_EXPORT])
		if (p.variant === "refuse") return unchanged(w, "cancelled", [REVEAL_PASSKEY, REVEAL_CANCEL, PROMPT_DISMISSED])
		if (p.variant === "no-prf") return unchanged(w, "refused", [REVEAL_PASSKEY, PRF_REQUIRED])
		if (p.variant === "other") return unchanged(w, "refused", [REVEAL_PASSKEY, SLOTS_BIND_PASSKEY])
		const next = clone(w)
		const open = openProfile(w) as ModelProfile
		if (open.phrase && !next.knownPhrases.includes(open.phrase)) next.knownPhrases.push(open.phrase)
		const sources = open.method === "password" ? [PHRASE_EXPORT] : [REVEAL_PASSKEY, "decision:P86-04"]
		return result(next, ["committed"], [{ kind: "profile", ref: open.ref }], "unchanged", sources)
	},
}

/** The unlock a new profile from an import takes: a password, or a passkey minted or reused. */
type NewUnlock = { method: "password"; password: SecretRef } | { method: "passkey"; credential: CredentialRef }

const unlockOf = (p: { method?: Method; password?: SecretRef; credential?: CredentialRef }): NewUnlock =>
	p.method === "passkey"
		? { method: "passkey", credential: p.credential as CredentialRef }
		: { method: "password", password: p.password as SecretRef }

/** Why an import's unlock cannot run: exactly the field its method takes, each fresh or minted. */
function unlockInvalid(w: World, p: { method?: Method; password?: SecretRef; credential?: CredentialRef }, caps: Caps): string | undefined {
	if (p.method === "passkey") return p.password ? "a passkey unlock takes no password" : credentialInvalid(w, p.credential, caps)
	if (p.credential) return "a password unlock takes no credential"
	return p.password ? freshRefs(w, { secret: p.password }) : "a password unlock takes a password"
}

/** A phrase import or a restore offers both unlocks, a passkey one minted or reused. */
function drawUnlock(rng: Rng, w: World, caps: Caps): NewUnlock {
	const credential = chance(rng, 0.5) ? drawCredential(rng, w, caps) : undefined
	return credential ? { method: "passkey", credential } : { method: "password", password: reserve(w).secret() }
}

/** The counters a committed import's unlock moves. */
const unlockBump = (w: World, unlock: NewUnlock): Partial<Record<keyof World["next"], number>> =>
	unlock.method === "password" ? { secret: 1 } : minting(w, unlock.credential)

/** The card answers before the duplicate check, so a declined warning keeps a minted credential. */
function declined(w: World, unlock: NewUnlock, sources: string[]): Expectation {
	const e = importNotCommitted(w, "cancelled", sources)
	if (unlock.method === "passkey") bump(e.next, minting(w, unlock.credential))
	return e
}

const importPhrase: ActionSpec<"importPhrase"> = {
	name: "importPhrase",
	family: "phrase",
	weight: 2,
	invalid: (w, p, caps) => {
		if (!w.knownPhrases.includes(p.phrase)) return `${p.phrase} was never read`
		return (
			newProfileInvalid(w, { profile: p.ref }) ??
			unlockInvalid(w, p, caps) ??
			duplicateInvalid(!!phraseHolder(w, p.phrase), p.duplicate)
		)
	},
	params: (rng, w, caps) => {
		const phrase = canAddProfile(w) ? pick(rng, w.knownPhrases) : undefined
		if (!phrase) return undefined
		const r = reserve(w)
		const base = { ref: r.profile(), phrase, name: r.name(), ...drawUnlock(rng, w, caps) }
		return phraseHolder(w, phrase) ? { ...base, duplicate: chance(rng, 0.75) ? "confirm" : "decline" } : base
	},
	expect: (w, p) => {
		const unlock = unlockOf(p)
		const passkey = unlock.method === "passkey" ? [PHRASE_IMPORT_CARD, PASSKEY_IMPORT_SEALS, ...reuseSources(w, p.credential)] : []
		if (p.duplicate === "decline") return declined(w, unlock, [DUPLICATE_WARNS, ...passkey])
		const next = addProfile(w, { ref: p.ref, name: nameFor(w, p.name), ...unlock, phrase: p.phrase, derived: 1, imported: [] })
		bump(next, { profile: 1, name: 1, ...unlockBump(w, unlock) })
		const sources = [PHRASE_IMPORT, ...passkey, ...(p.duplicate ? [DUPLICATE_WARNS] : []), OPEN_BEARER]
		return result(next, ["committed"], created(p.ref), "home", sources)
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

/** A password profile's file opens with its password; a passkey profile's with a file password of
 *  its own, which the page asks under the wallet's rule before it encrypts anything. */
const exportBackup: ActionSpec<"exportBackup"> = {
	name: "exportBackup",
	family: "backup",
	weight: 3,
	invalid: (w, p) => {
		const open = openProfile(w)
		if (!open) return "no open session"
		if (open.method === "password")
			return p.password || p.variant ? "a password profile's file takes no file password" : freshRefs(w, { file: p.file })
		if (!p.password) return "a passkey profile's file takes a file password"
		return freshRefs(w, { file: p.file, secret: p.password })
	},
	params: (rng, w) => {
		const open = openProfile(w)
		if (!open) return undefined
		const r = reserve(w)
		if (open.method === "password") return { file: r.file() }
		return chance(rng, 0.2) ? { file: r.file(), password: r.secret(), variant: "short" } : { file: r.file(), password: r.secret() }
	},
	expect: (w, p) => {
		const from = openProfile(w) as ModelProfile
		const writes: WriteScope[] = [{ kind: "profile", ref: from.ref }]
		if (p.variant === "short") {
			const next = clone(w)
			bump(next, { secret: 1 })
			return result(next, ["refused"], writes, "unchanged", [FILE_PASSWORD_RULE, FILE_PASSWORD_BLOCKED, "decision:P86-06"])
		}
		const next = clone(w)
		next.files.push({
			ref: p.file,
			kind: "backup",
			from: from.ref,
			method: from.method,
			password: from.method === "password" ? from.password : p.password,
			phrase: from.phrase,
			credential: from.credential,
			imported: [...from.imported],
			derived: from.derived,
		})
		bump(next, from.method === "password" ? { file: 1 } : { file: 1, secret: 1 })
		return result(
			next,
			["committed"],
			writes,
			"unchanged",
			from.method === "password" ? [FULL_EXPORT] : [FULL_EXPORT, FILE_PASSWORD_RULE, "decision:P86-06"],
		)
	},
}

const backupOf = (w: World, ref: FileRef): ModelFile | undefined => w.files.find((f) => f.ref === ref && f.kind === "backup")

const restoreWarns = (w: World, f: ModelFile, variant: ParamsMap["importBackup"]["variant"]): boolean =>
	variant === "right" && phraseHolder(w, f.phrase) !== undefined

const BACKUP_REFUSALS: Record<Exclude<ParamsMap["importBackup"]["variant"], "right">, string[]> = {
	"wrong-password": [BACKUP_UNREADABLE],
	truncated: [BACKUP_UNPARSED, BACKUP_INTEGRITY, BACKUP_UNREADABLE],
	flipped: [BACKUP_UNPARSED, BACKUP_INTEGRITY, BACKUP_UNREADABLE],
	"earlier-shape": [EARLIER_SHAPE, EARLIER_AT_DECRYPT, EARLIER_TITLE_SOURCE, "decision:P86-13"],
}

function importBackupParams(rng: Rng, w: World, caps: Caps): ParamsMap["importBackup"] | undefined {
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
			: (["right", "right", "wrong-password", "earlier-shape", ...corruptions] as const)
	const variant = pick(rng, variants) as ParamsMap["importBackup"]["variant"]
	// The unlock choice shows once the file opens, so only a restore that opens it may pick a passkey.
	const unlock = variant === "right" ? drawUnlock(rng, w, caps) : { method: "password" as const, password: r.secret() }
	const base = { file: file.ref, variant, ref: r.profile(), ...unlock }
	return restoreWarns(w, file, variant) ? { ...base, duplicate: chance(rng, 0.75) ? "confirm" : "decline" } : base
}

/** A backup restores under the unlock the form chose, whatever the method it was made with. */
function restoredWorld(w: World, file: ModelFile, ref: ProfileRef, unlock: NewUnlock): World {
	const next = addProfile(w, { ref, ...unlock, phrase: file.phrase, derived: file.derived, imported: [...file.imported] })
	bump(next, { profile: 1, ...unlockBump(w, unlock) })
	return next
}

const importBackup: ActionSpec<"importBackup"> = {
	name: "importBackup",
	family: "backup",
	weight: 3,
	invalid: (w, p, caps) => {
		const file = backupOf(w, p.file)
		if (!file) return `${p.file} is no backup`
		if (p.variant === "earlier-shape" && file.method !== "passkey") return "only a passkey profile's file is typed passkey"
		if (p.variant !== "right" && p.method === "passkey") return "the unlock choice shows only once the file opens"
		return (
			newProfileInvalid(w, { profile: p.ref }) ??
			unlockInvalid(w, p, caps) ??
			duplicateInvalid(restoreWarns(w, file, p.variant), p.duplicate)
		)
	},
	params: importBackupParams,
	expect: (w, p) => {
		const file = backupOf(w, p.file) as ModelFile
		if (p.variant === "earlier-shape") return { ...importNotCommitted(w, "refused", BACKUP_REFUSALS[p.variant]), shows: EARLIER_TITLE }
		if (p.variant !== "right") return importNotCommitted(w, "refused", BACKUP_REFUSALS[p.variant])
		const unlock = unlockOf(p)
		const passkey = unlock.method === "passkey" ? [RESTORE_CARD, RESTORE_SEALS, ...reuseSources(w, p.credential)] : []
		if (p.duplicate === "decline") return declined(w, unlock, [DUPLICATE_WARNS, ...passkey])
		const sources = [RESTORE_CLONE, RESTORE_FINALIZES, RESTORE_ASKS_PASSWORD, ...passkey, RESTORE_TAKES_PASSWORD, OPEN_BEARER]
		if (p.duplicate) sources.push(DUPLICATE_WARNS)
		return result(restoredWorld(w, file, p.ref, unlock), ["committed"], created(p.ref), "home", sources)
	},
}

// ── account files ───────────────────────────────────────────────────────

function accountChoiceInvalid(open: ModelProfile, which: AccountChoice): string | undefined {
	if ("sentinel" in which) return open.imported.includes(which.sentinel) ? undefined : `${which.sentinel} is not in ${open.ref}`
	const i = which.derivedIndex
	return Number.isInteger(i) && i >= 0 && i < open.derived ? undefined : `no derived account ${i}`
}

/** A password profile's file opens with its password. A passkey profile's asks its passkey, then a
 *  file password under the wallet's rule, and the file opens with that file password alone. */
const exportAccountFile: ActionSpec<"exportAccountFile"> = {
	name: "exportAccountFile",
	family: "account-file",
	weight: 2,
	invalid: (w, p) => {
		const open = openProfile(w)
		if (!open) return "no open session"
		const fresh = freshRefs(w, { file: p.file }) ?? accountChoiceInvalid(open, p.which)
		if (open.method === "password")
			return p.password || p.variant || p.other ? "a password profile's file takes no file password or prompt" : fresh
		if (!p.password) return "a passkey profile's file takes a file password"
		const other = p.variant === "other" ? otherInvalid(w, open.ref, "other", p.other) : p.other && "only `other` names a credential"
		return fresh ?? freshRefs(w, { secret: p.password }) ?? (other || undefined)
	},
	params: (rng, w) => {
		const open = openProfile(w)
		if (!open) return undefined
		const sentinel = pick(rng, open.imported)
		const which = sentinel && chance(rng, 0.5) ? { sentinel } : { derivedIndex: Math.floor(rng() * open.derived) }
		const r = reserve(w)
		if (open.method === "password") return { file: r.file(), which }
		const other = pick(rng, otherCredentials(w, open.ref))
		const variants = ["approve", "approve", "short", "refuse", ...(other ? (["other"] as const) : [])] as const
		const variant = pick(rng, variants) as "approve" | "short" | "refuse" | "other"
		const base = { file: r.file(), which, password: r.secret() }
		if (variant === "approve") return base
		return variant === "other" ? { ...base, variant, other } : { ...base, variant }
	},
	expect: (w, p) => {
		const from = openProfile(w) as ModelProfile
		if (p.variant === "refuse") return unchanged(w, "cancelled", [ACCOUNT_FILE_PASSKEY, ACCOUNT_FILE_CANCEL, PROMPT_DISMISSED])
		if (p.variant === "other") return unchanged(w, "refused", [ACCOUNT_FILE_PASSKEY, ACCOUNT_FILE_CHECKS, EXPORT_CHECK_REFUSES])
		const next = clone(w)
		if (p.variant === "short") {
			bump(next, { secret: 1 })
			return result(next, ["refused"], [], "unchanged", [ACCOUNT_FILE_PASSKEY, ACCOUNT_FILE_RULE])
		}
		const passkey = from.method === "passkey"
		next.files.push({
			ref: p.file,
			kind: "account",
			from: from.ref,
			method: from.method,
			password: passkey ? p.password : from.password,
			phrase: from.phrase,
			imported: [],
			derived: 0,
			account: p.which,
		})
		bump(next, passkey ? { file: 1, secret: 1 } : { file: 1 })
		const sources = passkey ? [ACCOUNT_FILE_PASSKEY, ACCOUNT_FILE_CHECKS, ACCOUNT_FILE_PASSWORD, ACCOUNT_EXPORT] : [ACCOUNT_EXPORT]
		return result(next, ["committed"], [], "unchanged", sources)
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
		if (holdsAccount(w, target, file)) return unchanged(w, "refused", [ACCOUNT_HELD, ACCOUNT_DUPLICATE])
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
		if (target.retired) sources.push(RETIRED_DELETE, "decision:P86-11")
		return result(next, ["committed"], [{ kind: "delete", ref: target.ref }, { kind: "device" }], settle, sources)
	},
}

// ── device, background, windows ─────────────────────────────────────────

const toggleStrict: ActionSpec<"toggleStrict"> = {
	name: "toggleStrict",
	family: "strict",
	weight: 2,
	invalid: (w) => (openProfile(w) ? undefined : "the strict row shows only to an open profile"),
	params: (_rng, w) => (openProfile(w) ? {} : undefined),
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
		const target = selectedOpenable(w)
		if (!locked(w) || !target) return "needs a locked wallet with an openable lock-screen profile"
		return target.method === "passkey" && !caps.ceremonyOffAnchor ? "a passkey ceremony runs only on the anchor page here" : undefined
	},
	params: (_rng, w, caps) => {
		if (openProfile(w)) return { op: "lock" }
		return secondWindow.invalid(w, { op: "unlock" }, caps) ? undefined : { op: "unlock" }
	},
	expect: (w, p) => {
		if (p.op === "lock") return result(lockedWorld(w), ["committed"], [], "lock", [LOCK_CLOSES])
		return unlockedOn(w, selectedOpenable(w) as ModelProfile, "unchanged", [OPEN_BEARER])
	},
}

const lockedOnPasskey = (w: World): boolean => locked(w) && selectedOpenable(w)?.method === "passkey"
const lockedOnPassword = (w: World): boolean => locked(w) && selectedOpenable(w)?.method === "password"

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
		const restored = restoredWorld(w, file, p.ref, { method: "password", password: p.password })
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

// ── the first profile in the onboarding tab ─────────────────────────────

/** Onboarding makes the first profile and shows its phrase for either unlock. It runs in
 *  the anchor's own tab, as a wallet with no profile runs it again, so its passkey outlives it. */
const onboardingCreate: ActionSpec<"onboardingCreate"> = {
	name: "onboardingCreate",
	family: "create",
	weight: 3,
	invalid: (w, p, caps) => {
		if (live(w).length) return "onboarding makes the first profile only"
		if (p.method === "password")
			return p.credential ? "a password profile has no credential" : freshRefs(w, { profile: p.ref, secret: p.password })
		if (p.password) return "a passkey profile has no password"
		return freshRefs(w, { profile: p.ref }) ?? credentialInvalid(w, p.credential, caps)
	},
	params: (rng, w, caps) => {
		if (live(w).length) return undefined
		const r = reserve(w)
		const answer = chance(rng, 0.7) ? "saved" : "later"
		const credential = chance(rng, 0.5) ? drawCredential(rng, w, caps) : undefined
		return credential
			? { ref: r.profile(), method: "passkey", credential, answer }
			: { ref: r.profile(), method: "password", password: r.secret(), answer }
	},
	expect: (w, p) => {
		const phrase: PhraseRef = `W${w.next.phrase}`
		const next = addProfile(w, {
			ref: p.ref,
			method: p.method,
			name: nameFor(w, ""),
			...(p.method === "password" ? { password: p.password } : { credential: p.credential }),
			phrase,
			derived: 1,
			imported: [],
		})
		next.knownPhrases.push(phrase)
		bump(next, p.method === "password" ? { profile: 1, secret: 1, phrase: 1 } : { profile: 1, phrase: 1, ...minting(w, p.credential) })
		const opens = p.method === "password" ? [CREATE_OPENS] : [PASSKEY_CREATE_OPENS, ...reuseSources(w, p.credential)]
		const answered = p.answer === "saved" ? ONBOARDING_SAVED : ONBOARDING_LATER
		return result(next, ["committed"], created(p.ref), "home", [...opens, ONBOARDING_PHRASE, answered, OPEN_BEARER, "decision:P86-01"])
	},
}

// ── backups an earlier version made ─────────────────────────────────────

/** Refused by its shape as soon as it is picked, before any other control or prompt. */
const importEarlierBackup: ActionSpec<"importEarlierBackup"> = {
	name: "importEarlierBackup",
	family: "backup",
	weight: 1,
	invalid: () => undefined,
	params: () => ({}),
	expect: (w) => ({
		...importNotCommitted(w, "refused", [EARLIER_SHAPE, EARLIER_AT_PICK, EARLIER_TITLE_SOURCE, "decision:P86-13"]),
		shows: EARLIER_TITLE,
	}),
}

// ── stored rows changed under the wallet ────────────────────────────────

/** What refuses each field's change once the prompt answered: the unlock reads the row after the
 *  prompt and opens it only under the credential and input the passkey answered for. */
const EDIT_REFUSES: Record<ParamsMap["editRowDuringUnlock"]["field"], string> = {
	prfSalt: SLOTS_BIND_PASSKEY,
	credentialId: PASSKEY_UNLOCK_BINDS,
	secret: PASSKEY_SLOTS_REFUSE,
	type: PASSKEY_KIND_GATE,
}

const editRowDuringUnlock: ActionSpec<"editRowDuringUnlock"> = {
	name: "editRowDuringUnlock",
	family: "tamper",
	weight: 1,
	invalid: (w) => (lockedOnPasskey(w) ? undefined : "needs a lock screen on an openable passkey profile"),
	params: (rng, w) => {
		if (!lockedOnPasskey(w)) return undefined
		return { field: pick(rng, ["prfSalt", "credentialId", "secret", "type"] as const) as ParamsMap["editRowDuringUnlock"]["field"] }
	},
	expect: (w, p) => unchanged(w, "refused", [EDIT_REFUSES[p.field], "decision:D17"]),
}

/** A slot whose last byte changed never opens under the profile's own secret: its frame's tag fails. */
const tamperedUnlock: ActionSpec<"tamperedUnlock"> = {
	name: "tamperedUnlock",
	family: "tamper",
	weight: 1,
	invalid: (w, p) => (locked(w) && openableOf(w, p.target) ? undefined : `needs a locked wallet and ${p.target} openable`),
	params: (rng, w) => {
		const target = locked(w) ? pick(rng, openable(w)) : undefined
		if (!target) return undefined
		return { target: target.ref, slot: pick(rng, ["guard", "secret", "entropy"] as const) as ParamsMap["tamperedUnlock"]["slot"] }
	},
	expect: (w, p) => {
		const target = openableOf(w, p.target) as ModelProfile
		return refusedOn(w, p.target, "refused", [target.method === "password" ? UNLOCK_REFUSES : PASSKEY_SLOTS_REFUSE])
	},
}

/** A lock while the reveal waits at its prompt takes the page, and the prompt with it: no words show. */
const raceLockDuringReveal: ActionSpec<"raceLockDuringReveal"> = {
	name: "raceLockDuringReveal",
	family: "race",
	weight: 1,
	invalid: (w) => (openProfile(w)?.method === "passkey" ? undefined : "needs an open passkey profile"),
	params: (_rng, w) => (openProfile(w)?.method === "passkey" ? {} : undefined),
	expect: (w) => result(lockedWorld(w), ["cancelled"], [], "lock", [CEREMONY_ENDS_WITH_PAGE, LOCK_CLOSES, "decision:D17"]),
}

// ── the unlock method ───────────────────────────────────────────────────

type MethodChange = ParamsMap["changeUnlockMethod"]

const CHANGES_FROM: Record<MethodChange["change"], Method> = { passkey: "password", "new-passkey": "passkey", password: "passkey" }
const CURRENT_ANSWERS: Record<MethodChange["change"], readonly MethodChange["current"][]> = {
	passkey: ["right", "wrong"],
	"new-passkey": ["approve", "refuse"],
	password: ["approve", "refuse", "other"],
}

/** The page checks the current unlock before it asks anything new, so only a change whose current
 *  unlock opens the profile reaches the new passkey's prompt. */
const changeMints = (p: MethodChange): boolean => p.change !== "password" && (p.current === "right" || p.current === "approve")

/** The fields a change names beside its current answer: the next credential for a passkey, a fresh
 *  password for a password, another minted credential for `other`. */
function changeFieldsInvalid(w: World, open: ModelProfile, p: MethodChange, caps: Caps): string | undefined {
	if (p.current === "other") {
		const why = otherInvalid(w, open.ref, "other", p.other)
		if (why) return why
	} else if (p.other) return "only `other` names a credential"
	if (p.change === "password") {
		if (p.credential) return "a change to a password takes no credential"
		return p.password ? freshRefs(w, { secret: p.password }) : "a change to a password takes one"
	}
	if (p.password) return "a change to a passkey takes no password"
	if (p.credential !== reserve(w).credential()) return "a change to a passkey names the next credential"
	return changeMints(p) && !canMint(w, caps) ? "the authenticator holds no more credentials" : undefined
}

/** A committed change replaces the unlock in the one row write, keeps the phrase and every account,
 *  and reopens the session in place, under the bearer rule a fresh open follows. */
const changeUnlockMethod: ActionSpec<"changeUnlockMethod"> = {
	name: "changeUnlockMethod",
	family: "method",
	weight: 3,
	invalid: (w, p, caps) => {
		const open = openProfile(w)
		if (open?.method !== CHANGES_FROM[p.change]) return `${p.change} changes no open ${CHANGES_FROM[p.change]} profile`
		if (!CURRENT_ANSWERS[p.change].includes(p.current)) return `${p.current} answers no change to ${p.change}`
		return changeFieldsInvalid(w, open, p, caps)
	},
	params: (rng, w, caps) => {
		const open = openProfile(w)
		if (!open) return undefined
		const r = reserve(w)
		if (open.method === "password")
			return canMint(w, caps)
				? { change: "passkey", current: chance(rng, 0.25) ? "wrong" : "right", credential: r.credential() }
				: undefined
		if (canMint(w, caps) && chance(rng, 0.4))
			return { change: "new-passkey", current: chance(rng, 0.25) ? "refuse" : "approve", credential: r.credential() }
		const other = pick(rng, otherCredentials(w, open.ref))
		const current = pick(rng, [
			"approve",
			"approve",
			"refuse",
			...(other ? (["other"] as const) : []),
		] as const) as MethodChange["current"]
		return current === "other"
			? { change: "password", current, password: r.secret(), other }
			: { change: "password", current, password: r.secret() }
	},
	expect: (w, p) => {
		if (p.current === "wrong")
			return unchanged(w, "refused", [METHOD_PASSWORD_FIRST, METHOD_VERIFY_REFUSES, METHOD_WRONG_PASSWORD, METHOD_THEN_MINTS])
		const checks = p.change === "new-passkey" ? METHOD_CHECKS_PASSKEY : METHOD_CHECKS_HELD
		if (p.current === "refuse") return unchanged(w, "cancelled", [checks, METHOD_CANCEL, PROMPT_DISMISSED])
		if (p.current === "other") return unchanged(w, "refused", [checks, SLOTS_BIND_PASSKEY, METHOD_VERIFY_REFUSES])
		const next = clone(w)
		const { password: _password, credential: _credential, ...kept } = openProfile(w) as ModelProfile
		const changed: ModelProfile =
			p.change === "password"
				? { ...kept, method: "password", password: p.password }
				: { ...kept, method: "passkey", credential: p.credential }
		next.profiles = next.profiles.map((x) => (x.ref === changed.ref ? changed : x))
		bump(next, p.change === "password" ? { secret: 1 } : { credential: 1 })
		next.session = sessionFor(next, changed.ref)
		const sources = [
			...(p.change === "passkey" ? [METHOD_PASSWORD_FIRST, METHOD_THEN_MINTS] : [checks]),
			...(p.change === "password" ? [] : [METHOD_NEW_PASSKEY]),
			METHOD_CHANGE,
			METHOD_CHANGE_WRITES,
			METHOD_CHANGE_REOPENS,
			OPEN_BEARER,
			METHOD_LEAVES,
		]
		return result(next, ["committed"], [{ kind: "profile", ref: changed.ref }], "unchanged", sources)
	},
}

/** A lock while the current passkey's prompt waits ends the page's run and the prompt with it. */
const raceLockDuringMethodChange: ActionSpec<"raceLockDuringMethodChange"> = {
	name: "raceLockDuringMethodChange",
	family: "race",
	weight: 1,
	invalid: (w) => (openProfile(w)?.method === "passkey" ? undefined : "needs an open passkey profile"),
	params: (_rng, w) => (openProfile(w)?.method === "passkey" ? {} : undefined),
	expect: (w) => result(lockedWorld(w), ["cancelled"], [], "lock", [METHOD_ENDS_WITH_SESSION, METHOD_DROPS_PROMPT, LOCK_CLOSES]),
}

/** A change the current passkey approves: a new passkey while a slot is free, else `password`. */
function approvedChange(rng: Rng, w: World, caps: Caps, password: SecretRef): MethodChange {
	return canMint(w, caps) && chance(rng, 0.5)
		? { change: "new-passkey", current: "approve", credential: reserve(w).credential() }
		: { change: "password", current: "approve", password }
}

function competitorInvalid(w: World, c: Competitor, caps: Caps): string | undefined {
	if (c.competing === "delete") return deleteProfile.invalid(w, { via: "settings" }, caps)
	return c.change.current === "approve" ? changeUnlockMethod.invalid(w, c.change, caps) : "the competing change must be approved"
}

/** The competitor as its own step on the race's world: the driver runs it under this step, so its
 *  outcome and its ceremonies are judged as that action's, whatever the race's own outcome. */
export function competitorStep(index: number, w: World, c: Competitor, caps: Caps): PlannedStep {
	return c.competing === "delete"
		? stepOf(index, deleteProfile, { via: "settings" }, w, caps)
		: stepOf(index, changeUnlockMethod, c.change, w, caps)
}

/** Another page's update or the session's end resets the page with its prompt open: the prompt ends
 *  with no toast, and the world is the competitor's. */
const raceMethodChangeElsewhere: ActionSpec<"raceMethodChangeElsewhere"> = {
	name: "raceMethodChangeElsewhere",
	family: "race",
	weight: 1,
	invalid: (w, p, caps) => (openProfile(w)?.method === "passkey" ? competitorInvalid(w, p, caps) : "needs an open passkey profile"),
	params: (rng, w, caps) => {
		if (openProfile(w)?.method !== "passkey") return undefined
		return chance(rng, 1 / 3)
			? { competing: "delete" }
			: { competing: "change", change: approvedChange(rng, w, caps, reserve(w).secret()) }
	},
	expect: (w, p, caps) => {
		const competitor = competitorStep(0, w, p, caps).expect
		const reset = p.competing === "delete" ? METHOD_ENDS_WITH_SESSION : METHOD_CHANGED_ELSEWHERE
		return result(competitor.next, ["cancelled"], competitor.writes, competitor.settle, [
			...competitor.sources,
			METHOD_DROPS_PROMPT,
			reset,
		])
	},
}

/** The account file page holds an approval for the unlock the anchor replaces, and starts over
 *  before Save: on a change to a password by its type, on a new passkey by its network, which the
 *  window's bootstrap after the in-place reopen clears. The typed file password's secret is spent. */
const raceMethodChangeDuringExport: ActionSpec<"raceMethodChangeDuringExport"> = {
	name: "raceMethodChangeDuringExport",
	family: "race",
	weight: 1,
	invalid: (w, p, caps) => {
		if (!caps.ceremonyOffAnchor) return "the export's passkey runs on a second page"
		const open = openProfile(w)
		if (open?.method !== "passkey" || !open.derived) return "needs an open passkey profile with a derived account"
		if (p.password === p.change.password) return "the file password and the new password are one secret"
		return freshRefs(w, { secret: p.password }) ?? competitorInvalid(w, { competing: "change", change: p.change }, caps)
	},
	params: (rng, w, caps) => {
		const open = openProfile(w)
		if (!caps.ceremonyOffAnchor || open?.method !== "passkey" || !open.derived) return undefined
		const password = reserve(w).secret()
		return { password, change: approvedChange(rng, w, caps, `S${w.next.secret + 1}`) }
	},
	expect: (w, p, caps) => {
		const competitor = changeUnlockMethod.expect(w, p.change, caps)
		const next = clone(competitor.next)
		bump(next, { secret: 1 })
		const reset = p.change.change === "password" ? [ACCOUNT_FILE_TYPE_RESETS] : [BOOTSTRAP_CLEARS_NETWORK, ACCOUNT_FILE_NETWORK_RESETS]
		return result(next, ["cancelled"], competitor.writes, competitor.settle, [...competitor.sources, ACCOUNT_FILE_PASSKEY, ...reset])
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
		const writes: WriteScope[] = [{ kind: "device" }, ...openable(w).map((x) => ({ kind: "profile" as const, ref: x.ref }))]
		const next = clone(w)
		next.session = { kind: "locked" }
		next.selected = w.selected ?? (live(w).at(-1) as ModelProfile).ref
		const retired = live(w).some((x) => x.retired)
			? [RETIRED_LISTED, RETIRED_UNLOCK, RETIRED_SLOTS, RETIRED_EXPORTS, RETIRED_RESEAL, RETIRED_FINALIZE, "decision:P86-11"]
			: []
		return result(next, ["committed"], writes, "lock", [UNLOCK_REFUSES, PASSKEY_UNLOCK_BINDS, OPEN_BEARER, ...retired])
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
	onboardingCreate,
	importEarlierBackup,
	editRowDuringUnlock,
	tamperedUnlock,
	raceLockDuringReveal,
	changeUnlockMethod,
	raceLockDuringMethodChange,
	raceMethodChangeElsewhere,
	raceMethodChangeDuringExport,
	verifyAll,
] as const

type Catalog = { [N in ActionName]: ActionSpec<N> }
export const ACTIONS: Catalog = Object.fromEntries(CATALOG.map((spec) => [spec.name, spec])) as unknown as Catalog

function stepOf<N extends ActionName>(index: number, spec: ActionSpec<N>, params: unknown, w: World, caps: Caps): PlannedStep {
	const p = params as ParamsMap[N]
	return { index, action: spec.name, params: p, expect: spec.expect(w, p, caps) } as PlannedStep
}

const drives = (caps: Caps, action: ActionName): boolean => caps.actions === undefined || caps.actions.includes(action)

/** `verifyAll` is drawn like any action and also closes every run its driver can verify. */
function drawStep(rng: Rng, w: World, caps: Caps, index: number): PlannedStep | undefined {
	const candidates = CATALOG.filter((spec) => drives(caps, spec.name))
		.map((spec) => ({ spec, params: spec.params(rng, w, caps) }))
		.filter((c) => c.params !== undefined)
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
	if (drives(caps, "verifyAll") && !ACTIONS.verifyAll.invalid(w, {}, caps)) steps.push(stepOf(length, ACTIONS.verifyAll, {}, w, caps))
	return { seed, start, caps, steps }
}

/**
 * A hand-trimmed action list as a plan: each step is checked against the world the steps before it
 * leave, and the first one that cannot run there is refused by name.
 */
export function planFromList(list: readonly ListedStep[], start: StartState, caps: Caps, seed = Number.NaN): Plan {
	return { seed, start, caps, steps: planFrom(startWorld(start), list, caps) }
}

/** `list` planned from the world `from`, its steps numbered from `first`. */
export function planFrom(from: World, list: readonly ListedStep[], caps: Caps, first = 0): PlannedStep[] {
	let w = from
	return list.map((listed, at) => {
		const index = first + at
		const spec = ACTIONS[listed.action] as ActionSpec<ActionName> | undefined
		if (!spec) throw new Error(`step ${index}: unknown action ${String(listed.action)}`)
		if (!drives(caps, listed.action)) throw new Error(`step ${index} (${listed.action}) is outside the run's actions`)
		const why = spec.invalid(w, listed.params as never, caps)
		if (why) throw new Error(`step ${index} (${listed.action}) cannot run here: ${why}`)
		const step = stepOf(index, spec, listed.params, w, caps)
		w = step.expect.next
		return step
	})
}

export const familyOf = (action: ActionName): Family => ACTIONS[action].family

/** What a step ends on purpose, which scopes the error allowlist: a run's cleanup lock after a
 *  race or a held restore counts as the step's own, and so does the lock a profile create or import
 *  begins with while a session is open, the lock screen being its only entry once profiles exist. */
export type StepEnd = "session" | "background"

const ENTERS_FROM_LOCK_SCREEN: ReadonlySet<ActionName> = new Set([
	"createPassword",
	"createPasskey",
	"importPhrase",
	"importBackup",
	"importEarlierBackup",
])

export function endsOf(step: ListedStep, before: World): StepEnd[] {
	if (ENTERS_FROM_LOCK_SCREEN.has(step.action)) return before.session.kind === "open" ? ["session"] : []
	switch (step.action) {
		case "lock":
		case "deleteProfile":
		case "raceLockDuringUnlock":
		case "raceLockDuringReveal":
		case "raceLockDuringMethodChange":
		case "verifyAll":
			return ["session"]
		case "raceMethodChangeElsewhere":
			return step.params.competing === "delete" ? ["session"] : []
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
		if (family === "race" || family === "restore-held" || family === "tamper") out.schedules[action] = (out.schedules[action] ?? 0) + 1
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
