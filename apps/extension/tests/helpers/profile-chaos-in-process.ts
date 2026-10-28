/**
 * The profile chaos catalog (`tests/e2e/helpers/profile-chaos/model.ts`) driven in process: the real
 * `ProfileService`, `ContactService` and `ConfigStore` over one `FakeBrowserApi` per worker, each
 * action through the service calls its page makes, in the page's order, judged after every step by
 * the oracles the e2e runner uses. See `apps/extension/tests/COMPOSITION-TESTS.md`.
 *
 * Every storage write a worker makes is logged with its area and its value before and after, so a
 * write the step reverted is judged too; the harness's own fault writes go around the log. Messages
 * name symbols, keys and ids only, and a needle the wallet leaked is masked in every detail.
 */
import { createHash, randomBytes } from "node:crypto"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { DuplicateWalletError, InvalidPasswordError, PasskeyNotOpenedError } from "@nulo/extension-messaging/errors"
import { consoleMethods, type Log } from "@nulo/wallet-core/logger"
import type { BrowserApi, StorageArea, StorageEntries } from "@nulo/wallet-core/ports"
import { FakeBrowserApi } from "@nulo/wallet-core/testing"
import { getEntropy } from "@nulo/wallet-core/utils"
import { PasskeyCredential, type PasskeyCredentialData } from "@nulo/wallet-crypto"
import { fakeBrowser } from "@webext-core/fake-browser"
import { profileUiKeys } from "@/utils/profile-ui-keys"
import { ServiceCollection } from "@/wallet/base"
import { ConfigStore } from "@/wallet/config/store"
import { LoggerStore, LogLevel } from "@/wallet/logger"
import { svc } from "@/wallet/services/composition-harness"
import { ContactService } from "@/wallet/services/contact/service"
import { PASSKEY_SERVICE_NAME } from "@/wallet/services/passkey/spec"
import { ProfileService } from "@/wallet/services/profile/service"
import {
	type Bindings,
	bindProfile,
	checkChanges,
	checkLeaks,
	checkLifecycle,
	checkOutcome,
	checkProfiles,
	checkSession,
	emptyBindings,
	findNeedles,
	type LeakHit,
	MIN_NEEDLE,
	type Needle,
	type ProfileReading,
	SEALED_PREFIXES,
	type SessionReading,
	SLOT_FRAMES,
	type StoredEntry,
	type StructureReading,
	type Violation,
	type WriteContext,
} from "../e2e/helpers/profile-chaos/checkers"
import {
	type ActionName,
	type Caps,
	type CredentialRef,
	deleteTarget,
	describePlan,
	isMinted,
	live,
	type ModelProfile,
	type Outcome,
	openProfile,
	otherCredentials,
	type ParamsMap,
	type PhraseRef,
	type Plan,
	type PlannedStep,
	type ProfileRef,
	profileOf,
	type SecretRef,
	selectedProfile,
	startWorld,
	type World,
} from "../e2e/helpers/profile-chaos/model"
import { fakePasskeyAnswer, freshPrfSalt } from "./fake-passkey"

/** The catalog actions this driver implements. The rest need bb (accounts and account files), the
 *  backup service's file, or only add a parameter read or a lock that `lock` already drives. */
export const IN_PROCESS_ACTIONS = [
	"createPassword",
	"createPasskey",
	"onboardingCreate",
	"lock",
	"unlockPassword",
	"unlockPasskey",
	"switchProfile",
	"secondWindow",
	"revealPhrase",
	"importPhrase",
	"changePassword",
	"rename",
	"deleteProfile",
	"toggleStrict",
	"backgroundRestart",
	"raceLockDuringUnlock",
	"raceDoubleUnlock",
	"raceRestartDuringUnlock",
	"editRowDuringUnlock",
	"tamperedUnlock",
	"changeUnlockMethod",
	"verifyAll",
] as const satisfies readonly ActionName[]

export type InProcessAction = (typeof IN_PROCESS_ACTIONS)[number]

/** Any page may run a ceremony and a worker may stop under it; no sandbox, no restore gate, and the
 *  authenticator holds every credential the run mints. */
export const IN_PROCESS_CAPS: Caps = {
	ceremonyOffAnchor: true,
	restartUnderOpenPage: true,
	network: false,
	restoreGate: false,
	credentialSlots: Number.POSITIVE_INFINITY,
	actions: IN_PROCESS_ACTIONS,
}

const PROFILE_ROW = "nulo:core:profiles@"
const SESSION_ROW = "nulo:core:session"
const CONFIG_KEY = "nulo:config"
const PROBE_ADDRESS = `0x${"0".repeat(64)}`

// ── workers ─────────────────────────────────────────────────────────────

type Area = "local" | "session"

/** One write a worker made; `undefined` is an absent key. */
export interface WriteRecord {
	worker: number
	area: Area
	key: string
	before: unknown
	after: unknown
	/** The device's strict mode as the worker held it when the write was made. */
	strict: boolean
}

export interface Worker {
	n: number
	/** The worker's unlogged view of storage, for the harness's reads and fault writes. */
	raw: FakeBrowserApi
	/** What the services were built over: every write through it is logged. */
	api: BrowserApi
	profiles: ProfileService
	contacts: ContactService
	config: ConfigStore
	logger: LoggerStore
	/** Set at a restart: a dropped worker's write is refused and reported. */
	dropped: boolean
}

/** What a master and a session secret read as at a profile's first sighting. */
export interface FirstSighting {
	masters: Map<ProfileRef, string>
	sessionSecrets: Map<ProfileRef, string>
}

/** What `verifyAll` read of one profile in process. */
export interface MasterReading {
	ref: ProfileRef
	wrongRefused: boolean
	/** `area:key` of every write the refused attempts made. */
	wrongWrote: string[]
	opened: boolean
	/** Base64, as `exportPlain` returns it. */
	master?: string
	/** `Fr` hex, as `getProfileSecret` returns it. */
	sessionSecret?: string
}

type Unlock = { password?: string; data?: PasskeyCredentialData }

/** A test's view of the run between a step's driver and its readings. */
export interface StepHooks {
	/** Runs once the driver returned, before the barrier and the readings; its writes through
	 *  `run.worker.api` are the step's. */
	afterDriver?: (run: InProcessRun, step: PlannedStep) => Promise<void>
	/** Runs on each worker once it has booted. */
	onWorker?: (worker: Worker) => void
}

export class InProcessRun {
	worker!: Worker
	readonly bindings: Bindings = emptyBindings()
	/** Every profile id a step bound, deleted ones included. */
	readonly knownIds = new Set<string>()
	readonly secrets = new Map<SecretRef, string>()
	readonly phrases = new Map<PhraseRef, { words: string[]; entropy: Uint8Array }>()
	readonly seen: FirstSighting = { masters: new Map(), sessionSecrets: new Map() }
	readonly prf = new Set<string>()
	readonly salts = new Map<string, { value: string; home?: string }>()
	writes: WriteRecord[] = []
	/** Writes a worker made while the harness read: a reading writes nothing. */
	readingWrites: WriteRecord[] = []
	/** Writes a dropped worker tried, kept until a step's check reports them. */
	strays: WriteRecord[] = []
	/** Every log line the workers' loggers kept, at any level. */
	logs: { worker: number; log: Log }[] = []
	/** Every wrong secret a driver typed. */
	readonly wrong: string[] = []
	/** Needles each write held at once, with the needles known then. */
	writeHits: LeakHit[] = []
	findings: Violation[] = []
	sightings: { ref: ProfileRef; id: string; unlock: Unlock; phrase?: PhraseRef }[] = []
	verified: MasterReading[] = []
	phase: "step" | "reading" = "step"
	workerCount = 0
	private sink?: LoggerStore
	private readonly pending: [LogLevel, unknown[]][] = []

	constructor(readonly hooks: StepHooks) {}

	get profiles(): ProfileService {
		return this.worker.profiles
	}

	/** The worker's console hook: a line goes to the newest logger, and waits for the first. */
	console(level: LogLevel, args: unknown[]): void {
		if (this.sink) this.sink.log("wallet", level, ...args)
		else this.pending.push([level, args])
	}

	sinkTo(logger: LoggerStore): void {
		this.sink = logger
		for (const [level, args] of this.pending.splice(0)) logger.log("wallet", level, ...args)
	}

	record(r: WriteRecord): void {
		if (sameValue(r.before, r.after)) return
		;(this.phase === "reading" ? this.readingWrites : this.writes).push(r)
		this.writeHits.push(...scanText(`${r.area}:${r.key}`, `${r.key}\n${textOf(r.after)}`, needlesOf(this)))
	}

	beginStep(): void {
		this.writes = []
		this.readingWrites = []
		this.logs = []
		this.writeHits = []
		this.findings = []
		this.sightings = []
		this.phase = "step"
	}
}

const textOf = (value: unknown): string => (typeof value === "string" ? value : (JSON.stringify(value) ?? ""))
const sameValue = (a: unknown, b: unknown): boolean => (a === undefined ? b === undefined : b !== undefined && textOf(a) === textOf(b))

function loggedArea(run: InProcessRun, worker: Worker, area: Area, inner: StorageArea): StorageArea {
	const write = async (keys: string[], after: (key: string) => unknown, apply: () => Promise<void>) => {
		const strict = worker.config?.get("strictSecurityMode") === true
		const before = await inner.get(keys)
		const records = keys.map((key) => ({ worker: worker.n, area, key, before: before[key], after: after(key), strict }))
		// Checked after the read, so a write a worker began before its restart is refused too.
		if (worker.dropped) {
			run.strays.push(...records)
			throw new Error(`worker ${worker.n} wrote after its restart`)
		}
		await apply()
		for (const r of records) run.record(r)
	}
	const listed = (keys: string | string[]) => (typeof keys === "string" ? [keys] : keys)
	return {
		get: (keys) => inner.get(keys),
		onChange: (listener) => inner.onChange(listener),
		set: (entries: StorageEntries) =>
			write(
				Object.keys(entries),
				(key) => entries[key],
				() => inner.set(entries),
			),
		remove: (keys) =>
			write(
				listed(keys),
				() => undefined,
				() => inner.remove(keys),
			),
		clear: async () =>
			write(
				Object.keys(await inner.get(null)),
				() => undefined,
				() => inner.clear(),
			),
	}
}

const ports = (raw: FakeBrowserApi) => ({ runtime: raw.runtime, windows: raw.windows, alarms: raw.alarms })

/** The coordinator's purge, as far as this graph goes: the profile's UI keys. */
const purge = (local: StorageArea) => ({
	snapshot: async () => ({ addresses: [], tokenIds: [], networkIds: [] }),
	runFor: async (id: string) => local.remove(profileUiKeys(id)),
})

/** A worker over the storage the fake holds now. `ConfigStore` binds `chrome.storage.local` when it
 *  is built, so the global points at this worker's logged area first. */
async function boot(run: InProcessRun): Promise<Worker> {
	const raw = new FakeBrowserApi()
	const worker = { n: ++run.workerCount, raw, dropped: false } as Worker
	const local = loggedArea(run, worker, "local", raw.storage.local)
	worker.api = { storage: { local, session: loggedArea(run, worker, "session", raw.storage.session) }, ...ports(raw) }
	;(chrome.storage as { local?: unknown }).local = local
	worker.config = new ConfigStore()
	await worker.config.load()
	worker.logger = new LoggerStore(worker.config)
	worker.logger.onLog.add((log) => {
		run.logs.push({ worker: worker.n, log })
	})
	run.sinkTo(worker.logger)
	const services = new ServiceCollection()
	services.add(
		svc(PASSKEY_SERVICE_NAME, { materializeCredential: async (data: PasskeyCredentialData) => PasskeyCredential.create(data) }),
	)
	worker.profiles = new ProfileService(worker.config, worker.logger, worker.api)
	worker.contacts = new ContactService(worker.logger, worker.api)
	services.add(worker.profiles)
	services.add(worker.contacts)
	await services.start()
	worker.profiles.setDeletionDelegate(purge(local))
	run.hooks.onWorker?.(worker)
	return worker
}

/** A stopped worker and a fresh one over what it left: both storage areas and the alarm list
 *  survive, its listeners do not (`fakeBrowser.reset()` drops every one), and a write it still
 *  tries is refused and reported. */
async function restart(run: InProcessRun): Promise<void> {
	const local = await fakeBrowser.storage.local.get()
	const session = await fakeBrowser.storage.session.get()
	const alarms = await fakeBrowser.alarms.getAll()
	run.worker.dropped = true
	run.worker.raw.reset()
	await fakeBrowser.storage.local.set(local)
	await fakeBrowser.storage.session.set(session)
	for (const a of alarms)
		await fakeBrowser.alarms.create(
			a.name,
			a.periodInMinutes ? { when: a.scheduledTime, periodInMinutes: a.periodInMinutes } : { when: a.scheduledTime },
		)
	run.worker = await boot(run)
}

// ── what the run binds ──────────────────────────────────────────────────

const boundId = (run: InProcessRun, ref: ProfileRef): string => {
	const id = run.bindings.profiles.get(ref)
	if (!id) throw new Error(`${ref} was never bound`)
	return id
}

const secretOf = (run: InProcessRun, ref: SecretRef): string => {
	const known = run.secrets.get(ref)
	if (known) return known
	const value = `Pw-${randomBytes(12).toString("base64url")}`
	run.secrets.set(ref, value)
	return value
}

/** A secret no profile holds, kept as a needle: a typed password leaks like a right one. */
function wrongSecret(run: InProcessRun): string {
	const value = `Wrong-${randomBytes(9).toString("base64url")}`
	run.wrong.push(value)
	return value
}

const credentialOf = (run: InProcessRun, ref: CredentialRef | undefined): string => {
	const id = ref && run.bindings.credentials.get(ref)
	if (!id) throw new Error(`${ref ?? "no credential"} was never minted`)
	return id
}

/** What the page hands the worker once `ref` answered at `prfSalt`. */
async function answer(run: InProcessRun, ref: CredentialRef | undefined, prfSalt: string): Promise<PasskeyCredentialData> {
	const data = await fakePasskeyAnswer(credentialOf(run, ref), prfSalt)
	run.prf.add(data.prf)
	return data
}

/** A new passkey's answer at a fresh input: the authenticator mints `ref`, or picks it when it already
 *  holds it ("Use a passkey I already have"). */
async function newPasskey(run: InProcessRun, before: World, ref: CredentialRef | undefined): Promise<PasskeyCredentialData> {
	if (!ref) throw new Error("a passkey choice names its credential")
	if (!isMinted(before, ref)) {
		if (run.bindings.credentials.has(ref)) throw new Error(`${ref} is minted twice`)
		run.bindings.credentials.set(ref, randomBytes(16).toString("base64"))
	}
	return answer(run, ref, freshPrfSalt())
}

/** The words a phrase was first read as; a later reading must be the same words. */
async function learnWords(run: InProcessRun, ref: PhraseRef | undefined, words: string[]): Promise<void> {
	if (!ref) return
	const known = run.phrases.get(ref)
	if (!known) run.phrases.set(ref, { words, entropy: await getEntropy(words) })
	else if (known.words.join(" ") !== words.join(" "))
		run.findings.push({ oracle: "O6", message: `a reading shows another phrase than ${ref}'s` })
}

const deletedRefs = (w: World): Set<ProfileRef> => new Set(w.profiles.filter((p) => p.deleted).map((p) => p.ref))

/** Binds a profile a step made; its master, session secret and words are read once the step ends. */
function made(run: InProcessRun, step: PlannedStep, before: World, ref: ProfileRef, id: string, unlock: Unlock): void {
	bindProfile(run.bindings, ref, id, deletedRefs(before))
	run.knownIds.add(id)
	run.sightings.push({ ref, id, unlock, phrase: profileOf(step.expect.next, ref)?.phrase })
}

async function readSightings(run: InProcessRun): Promise<void> {
	for (const { ref, id, unlock, phrase } of run.sightings) {
		const master = await run.profiles.exportPlain(id, unlock.password, unlock.data)
		const sessionSecret = (await run.profiles.getProfileSecret(id)).toString()
		run.seen.masters.set(ref, master)
		run.seen.sessionSecrets.set(ref, sessionSecret)
		if (sessionSecret !== fieldOf(master)) run.findings.push({ oracle: "O6", message: `${ref}'s session secret is not its master` })
		if (phrase && !run.phrases.has(phrase))
			await learnWords(run, phrase, await run.profiles.exportMnemonic(id, unlock.password, unlock.data))
	}
}

/** Each bound profile's stored `prfSalt`, kept for the rest of the run with its row as its home. */
async function learnSalts(run: InProcessRun): Promise<void> {
	for (const [ref, id] of run.bindings.profiles) {
		const key = `${PROFILE_ROW}${id}`
		const raw = (await run.worker.raw.storage.local.get(key))[key]
		const salt = typeof raw === "string" ? (JSON.parse(raw) as { prfSalt?: unknown }).prfSalt : undefined
		if (typeof salt === "string" && ![...run.salts.values()].some((s) => s.value === salt))
			run.salts.set(`${ref}/prf-salt-${run.salts.size}`, { value: salt, home: `local:${key}` })
	}
}

// ── drivers: each makes its page's service calls in the page's order ────

/** A rejection the driver lists for its variant; any other fails the step by its class. */
type Refusal = (e: unknown) => boolean
const is =
	(cls: abstract new (...args: never[]) => Error): Refusal =>
	(e) =>
		e instanceof cls
const says =
	(message: string): Refusal =>
	(e) =>
		e instanceof Error && e.message === message

export class UnlistedRejection extends Error {
	constructor(readonly error: unknown) {
		super("a rejection the driver lists for no variant")
	}
}

async function attempt(call: () => Promise<unknown>, refusals: readonly Refusal[] = [], as: Outcome = "refused"): Promise<Outcome> {
	try {
		await call()
		return "committed"
	} catch (e) {
		if (refusals.some((r) => r(e))) return as
		throw new UnlistedRejection(e)
	}
}

type Drive<N extends InProcessAction> = (run: InProcessRun, p: ParamsMap[N], step: PlannedStep, before: World) => Promise<Outcome>
type Drivers = { [N in InProcessAction]: Drive<N> }

const nameOf = (step: PlannedStep, ref: ProfileRef, fallback: string): string => profileOf(step.expect.next, ref)?.name ?? fallback

const mustOpen = (w: World): ModelProfile => {
	const p = openProfile(w)
	if (!p) throw new Error("the step needs an open profile and the model holds none")
	return p
}

const mustSelect = (w: World): ModelProfile => {
	const p = selectedProfile(w)
	if (!p) throw new Error("the step needs a lock-screen profile and the model holds none")
	return p
}

/** A create or an import starts on the lock screen: with a session open, the page locks first. */
async function fromLockScreen(run: InProcessRun, before: World): Promise<void> {
	if (before.session.kind === "open") await run.profiles.lockActiveProfile()
}

/** `auth.vue`: the passkey's parameters, the prompt, then the unlock. */
async function passkeyUnlock(run: InProcessRun, id: string, k: CredentialRef | undefined): Promise<void> {
	const { prfSalt } = await run.profiles.getPasskeyUnlockParams(id)
	await run.profiles.unlockPasskeyProfile(id, await answer(run, k, prfSalt))
}

async function unlockAs(run: InProcessRun, target: ModelProfile): Promise<void> {
	const id = boundId(run, target.ref)
	if (target.method === "password") await run.profiles.unlockProfile(id, secretOf(run, target.password as SecretRef))
	else await passkeyUnlock(run, id, target.credential)
}

async function createWith(run: InProcessRun, step: PlannedStep, before: World, p: { ref: ProfileRef; name?: string }, unlock: Unlock) {
	const name = nameOf(step, p.ref, p.name ?? "Main")
	const info = unlock.data
		? await run.profiles.createPasskeyProfile(name, unlock.data)
		: await run.profiles.createProfile(name, unlock.password as string)
	made(run, step, before, p.ref, info.id, unlock)
	return info
}

const createPassword: Drive<"createPassword"> = async (run, p, step, before) => {
	await fromLockScreen(run, before)
	await createWith(run, step, before, p, { password: secretOf(run, p.password) })
	return "committed"
}

const createPasskey: Drive<"createPasskey"> = async (run, p, step, before) => {
	await fromLockScreen(run, before)
	await createWith(run, step, before, p, { data: await newPasskey(run, before, p.credential) })
	return "committed"
}

/** `onboarding/pages/create.vue`: the create, then the words read with what the create was made from. */
const onboardingCreate: Drive<"onboardingCreate"> = async (run, p, step, before) => {
	const unlock: Unlock =
		p.method === "password"
			? { password: secretOf(run, p.password as SecretRef) }
			: { data: await newPasskey(run, before, p.credential) }
	const info = await createWith(run, step, before, p, unlock)
	const words = await run.profiles.exportMnemonic(info.id, unlock.password, unlock.data)
	await learnWords(run, profileOf(step.expect.next, p.ref)?.phrase, words)
	return "committed"
}

const lock: Drive<"lock"> = async (run) => {
	await run.profiles.lockActiveProfile()
	return "committed"
}

const unlockPassword: Drive<"unlockPassword"> = async (run, p, _step, before) => {
	const target = profileOf(before, p.target) as ModelProfile
	const typed = p.variant === "right" ? secretOf(run, target.password as SecretRef) : wrongSecret(run)
	return attempt(() => run.profiles.unlockProfile(boundId(run, p.target), typed), p.variant === "wrong" ? [is(InvalidPasswordError)] : [])
}

/** A refused prompt and an answer with no PRF output end in the page, after the parameters. */
const unlockPasskey: Drive<"unlockPasskey"> = async (run, p, _step, before) => {
	const id = boundId(run, p.target)
	const { prfSalt } = await run.profiles.getPasskeyUnlockParams(id)
	if (p.variant === "refuse") return "cancelled"
	if (p.variant === "no-prf") return "refused"
	const k = p.variant === "other" ? p.other : profileOf(before, p.target)?.credential
	const data = await answer(run, k, prfSalt)
	return attempt(() => run.profiles.unlockPasskeyProfile(id, data), p.variant === "other" ? [says("Invalid profile id")] : [])
}

/** The picker moves the lock screen's profile in UI storage only; later steps target the model's. */
const switchProfile: Drive<"switchProfile"> = async () => "committed"

const secondWindow: Drive<"secondWindow"> = async (run, p, _step, before) => {
	if (p.op === "lock") await run.profiles.lockActiveProfile()
	else await unlockAs(run, mustSelect(before))
	return "committed"
}

/** `export/seed.vue`: a password, or the passkey's parameters, its prompt and its answer. */
const revealPhrase: Drive<"revealPhrase"> = async (run, p, _step, before) => {
	const open = mustOpen(before)
	const id = boundId(run, open.ref)
	const reveal = async (password?: string, data?: PasskeyCredentialData) =>
		learnWords(run, open.phrase, await run.profiles.exportMnemonic(id, password, data))
	if (open.method === "password") {
		const typed = p.variant === "right" ? secretOf(run, open.password as SecretRef) : wrongSecret(run)
		return attempt(() => reveal(typed), p.variant === "wrong" ? [says("Invalid profile old password")] : [])
	}
	const { prfSalt } = await run.profiles.getPasskeyUnlockParams(id)
	if (p.variant === "refuse") return "cancelled"
	if (p.variant === "no-prf") return "refused"
	const data = await answer(run, p.variant === "other" ? p.other : open.credential, prfSalt)
	return attempt(() => reveal(undefined, data), p.variant === "other" ? [is(PasskeyNotOpenedError)] : [])
}

/** `useProfileImportFlow.ts`: the unlock's card first, then the import; a duplicate warning is
 *  answered, and a confirm imports again allowing it. */
const importPhrase: Drive<"importPhrase"> = async (run, p, step, before) => {
	await fromLockScreen(run, before)
	const words = run.phrases.get(p.phrase)?.words
	if (!words) throw new Error(`${p.phrase} was never read`)
	const unlock: Unlock =
		p.method === "passkey"
			? { data: await newPasskey(run, before, p.credential) }
			: { password: secretOf(run, p.password as SecretRef) }
	const name = nameOf(step, p.ref, p.name)
	const call = (allow: boolean) => run.profiles.importMnemonic(name, words, unlock.password, allow, unlock.data)
	let info: Awaited<ReturnType<typeof call>>
	try {
		info = await call(false)
		if (p.duplicate) run.findings.push({ oracle: "O5", message: `importPhrase imported a phrase a live profile holds with no warning` })
	} catch (e) {
		if (!(e instanceof DuplicateWalletError && p.duplicate)) throw new UnlistedRejection(e)
		if (p.duplicate === "decline") return "cancelled"
		info = await call(true)
	}
	made(run, step, before, p.ref, info.id, unlock)
	return "committed"
}

const changePassword: Drive<"changePassword"> = async (run, p, _step, before) => {
	const open = mustOpen(before)
	const current = p.variant === "right" ? secretOf(run, open.password as SecretRef) : wrongSecret(run)
	return attempt(
		() => run.profiles.changeProfilePassword(boundId(run, open.ref), current, secretOf(run, p.password)),
		p.variant === "wrong" ? [says("Invalid profile old password")] : [],
	)
}

const rename: Drive<"rename"> = async (run, p, _step, before) => {
	await run.profiles.changeProfileName(boundId(run, mustOpen(before).ref), p.name)
	return "committed"
}

const deleteProfile: Drive<"deleteProfile"> = async (run, p, _step, before) => {
	const target = deleteTarget(before, p.via)
	if (!target) throw new Error(`nothing for ${p.via} to delete`)
	await run.profiles.deleteProfile(boundId(run, target.ref))
	return "committed"
}

/** `settings/lock.vue` writes the device's strict mode through the config store. */
const toggleStrict: Drive<"toggleStrict"> = async (run, _p, step) => {
	await run.worker.config.set("strictSecurityMode", step.expect.next.device.strict)
	return "committed"
}

const backgroundRestart: Drive<"backgroundRestart"> = async (run) => {
	await restart(run)
	return "committed"
}

/** The lock screen's passkey prompt held while `compete` runs: the unlock call follows the
 *  prompt, then the run locks, so every schedule ends on one state. */
async function heldUnlock(run: InProcessRun, before: World, compete: () => Promise<void>): Promise<Outcome> {
	const target = mustSelect(before)
	const id = boundId(run, target.ref)
	const { prfSalt } = await run.profiles.getPasskeyUnlockParams(id)
	const data = await answer(run, target.credential, prfSalt)
	await compete()
	const outcome = await attempt(() => run.profiles.unlockPasskeyProfile(id, data))
	await run.profiles.lockActiveProfile()
	return outcome === "committed" ? "committed-then-locked" : outcome
}

const raceLockDuringUnlock: Drive<"raceLockDuringUnlock"> = async (run, _p, _step, before) =>
	heldUnlock(run, before, () => run.profiles.lockActiveProfile())

/** The unlock the page sends after the stop reaches the new worker. */
const raceRestartDuringUnlock: Drive<"raceRestartDuringUnlock"> = async (run, _p, _step, before) =>
	heldUnlock(run, before, () => restart(run))

/** Two windows' unlocks of the lock screen's profile at once. */
const raceDoubleUnlock: Drive<"raceDoubleUnlock"> = async (run, _p, _step, before) => {
	const target = mustSelect(before)
	const id = boundId(run, target.ref)
	const password = secretOf(run, target.password as SecretRef)
	const ends = await Promise.allSettled([run.profiles.unlockProfile(id, password), run.profiles.unlockProfile(id, password)])
	const refused = ends.find((e) => e.status === "rejected")
	if (refused) throw new UnlistedRejection(refused.reason)
	return "committed"
}

/** The base64 value with its last byte, a frame's tag byte, changed. */
function flipLast(b64: string): string {
	const bytes = Buffer.from(b64, "base64")
	if (!bytes.length) throw new Error("an empty slot")
	bytes[bytes.length - 1] ^= 0x01
	return bytes.toString("base64")
}

/** What refuses each field's change once the prompt answered (the model's `EDIT_REFUSES`); a refusal
 *  counts only while no slot of the row opened, since an unlock that opened them read a stale row. */
const EDIT_REFUSALS: Record<ParamsMap["editRowDuringUnlock"]["field"], Refusal> = {
	prfSalt: is(PasskeyNotOpenedError),
	credentialId: says("Invalid profile id"),
	secret: is(PasskeyNotOpenedError),
	type: says("Profile requires password"),
}

function edited(run: InProcessRun, raw: string, field: ParamsMap["editRowDuringUnlock"]["field"]): string {
	const row = JSON.parse(raw) as Record<string, unknown>
	if (field === "type") row.type = "password"
	else if (field === "secret") row.secret = flipLast(row.secret as string)
	else row[field] = randomBytes(field === "prfSalt" ? 32 : 16).toString("base64url")
	if (field === "prfSalt") run.salts.set(`forged/prf-salt-${run.salts.size}`, { value: row.prfSalt as string })
	return JSON.stringify(row)
}

/** Runs `step` with the stored row of `id` changed by `change`, written around the log as anything
 *  else holding the storage could, then puts it back only where it still holds that change. */
async function withRow<T>(id: string, change: (raw: string) => string, step: () => Promise<T>): Promise<T> {
	const key = `${PROFILE_ROW}${id}`
	const original = (await fakeBrowser.storage.local.get(key))[key]
	if (typeof original !== "string") throw new Error(`${key} holds no row`)
	const wrote = change(original)
	await fakeBrowser.storage.local.set({ [key]: wrote })
	try {
		return await step()
	} finally {
		if ((await fakeBrowser.storage.local.get(key))[key] === wrote) await fakeBrowser.storage.local.set({ [key]: original })
	}
}

/** The row changes after the page read its parameters and before the unlock reads it again. */
const editRowDuringUnlock: Drive<"editRowDuringUnlock"> = async (run, p, _step, before) => {
	const target = mustSelect(before)
	const id = boundId(run, target.ref)
	const { prfSalt } = await run.profiles.getPasskeyUnlockParams(id)
	const data = await answer(run, target.credential, prfSalt)
	const opens = countOpens(run.profiles)
	try {
		return await withRow(
			id,
			(raw) => edited(run, raw, p.field),
			() => attempt(() => run.profiles.unlockPasskeyProfile(id, data), [(e) => EDIT_REFUSALS[p.field](e) && opens.count === 0]),
		)
	} finally {
		opens.restore()
	}
}

/** Counts the slot sets `profiles` opens until `restore` runs. */
function countOpens(profiles: ProfileService): { readonly count: number; restore: () => void } {
	type Opener = { openSlots: (...args: unknown[]) => Promise<unknown> }
	const target = profiles as unknown as Opener
	const open = target.openSlots
	let count = 0
	target.openSlots = async function (this: unknown, ...args) {
		const opened = await open.apply(this, args)
		if (opened) count++
		return opened
	}
	return {
		get count() {
			return count
		},
		restore: () => {
			Reflect.deleteProperty(target, "openSlots")
		},
	}
}

const tamperedUnlock: Drive<"tamperedUnlock"> = async (run, p, _step, before) => {
	const target = profileOf(before, p.target) as ModelProfile
	const flip = (raw: string) => {
		const row = JSON.parse(raw) as Record<string, unknown>
		row[p.slot] = flipLast(row[p.slot] as string)
		return JSON.stringify(row)
	}
	const refusal = target.method === "password" ? is(InvalidPasswordError) : is(PasskeyNotOpenedError)
	return withRow(boundId(run, p.target), flip, () => attempt(() => unlockAs(run, target), [refusal]))
}

type Change = ParamsMap["changeUnlockMethod"]

/** What `k` answers at the stored input of `id`, read first as each page reads it. */
async function answerAt(run: InProcessRun, id: string, k: CredentialRef | undefined): Promise<PasskeyCredentialData> {
	const { prfSalt } = await run.profiles.getPasskeyUnlockParams(id)
	return answer(run, k, prfSalt)
}

async function toPasskey(run: InProcessRun, open: ModelProfile, p: Change, before: World): Promise<Outcome> {
	const id = boundId(run, open.ref)
	const typed = p.current === "right" ? secretOf(run, open.password as SecretRef) : wrongSecret(run)
	const checked = await attempt(() => run.profiles.verifyUnlockCredential(id, { password: typed }), [is(InvalidPasswordError)])
	if (checked !== "committed") return checked
	const next = await newPasskey(run, before, p.credential)
	return attempt(() => run.profiles.changeUnlockMethod(id, { password: typed }, { passkey: next }))
}

async function toNewPasskey(run: InProcessRun, open: ModelProfile, p: Change, before: World): Promise<Outcome> {
	const id = boundId(run, open.ref)
	if (p.current === "refuse") {
		await run.profiles.getPasskeyUnlockParams(id)
		return "cancelled"
	}
	const current = await answerAt(run, id, open.credential)
	await run.profiles.verifyUnlockCredential(id, { passkey: current })
	const next = await newPasskey(run, before, p.credential)
	return attempt(() => run.profiles.changeUnlockMethod(id, { passkey: current }, { passkey: next }))
}

async function toPassword(run: InProcessRun, open: ModelProfile, p: Change): Promise<Outcome> {
	const id = boundId(run, open.ref)
	if (p.current === "refuse") {
		await run.profiles.getPasskeyUnlockParams(id)
		return "cancelled"
	}
	const current = await answerAt(run, id, p.current === "other" ? p.other : open.credential)
	const checked = await attempt(
		() => run.profiles.verifyUnlockCredential(id, { passkey: current }),
		p.current === "other" ? [is(PasskeyNotOpenedError)] : [],
	)
	if (checked !== "committed") return checked
	return attempt(() => run.profiles.changeUnlockMethod(id, { passkey: current }, { password: secretOf(run, p.password as SecretRef) }))
}

const changeUnlockMethod: Drive<"changeUnlockMethod"> = async (run, p, _step, before) => {
	const open = mustOpen(before)
	if (p.change === "passkey") return toPasskey(run, open, p, before)
	if (p.change === "new-passkey") return toNewPasskey(run, open, p, before)
	return toPassword(run, open, p)
}

/** Every live profile in model order: wrong secrets refused with no write, its own opens it, and
 *  its master and session secret read while it is open; the run then locks. */
const verifyAll: Drive<"verifyAll"> = async (run, _p, _step, before) => {
	if (before.session.kind === "open") await run.profiles.lockActiveProfile()
	run.verified = []
	for (const p of live(before)) run.verified.push(await verifyOne(run, p, before))
	return "committed"
}

/** A wrong password, or each credential the authenticator holds other than `p`'s own, each a press
 *  that reads the parameters first; with none, a refused prompt, which ends in the page. */
async function wrongAttempts(run: InProcessRun, p: ModelProfile, w: World): Promise<boolean> {
	const id = boundId(run, p.ref)
	if (p.method === "password")
		return (await attempt(() => run.profiles.unlockProfile(id, wrongSecret(run)), [is(InvalidPasswordError)])) === "refused"
	const others = otherCredentials(w, p.ref)
	if (!others.length) await run.profiles.getPasskeyUnlockParams(id)
	for (const k of others) {
		const data = await answerAt(run, id, k)
		if ((await attempt(() => run.profiles.unlockPasskeyProfile(id, data), [says("Invalid profile id")])) !== "refused") return false
	}
	return true
}

async function verifyOne(run: InProcessRun, p: ModelProfile, w: World): Promise<MasterReading> {
	const id = boundId(run, p.ref)
	const mark = run.writes.length
	const wrongRefused = await wrongAttempts(run, p, w)
	const wrongWrote = run.writes.slice(mark).map((r) => `${r.area}:${r.key}`)
	await unlockAs(run, p)
	const opened = (await run.profiles.getActiveProfile())?.id === id
	const reading: MasterReading = { ref: p.ref, wrongRefused, wrongWrote, opened }
	if (opened) {
		const unlock = await unlockOf(run, p, id)
		reading.master = await run.profiles.exportPlain(id, unlock.password, unlock.data)
		reading.sessionSecret = (await run.profiles.getProfileSecret(id)).toString()
	}
	await run.profiles.lockActiveProfile()
	return reading
}

async function unlockOf(run: InProcessRun, p: ModelProfile, id: string): Promise<Unlock> {
	if (p.method === "password") return { password: secretOf(run, p.password as SecretRef) }
	return { data: await answerAt(run, id, p.credential) }
}

export const DRIVERS: Drivers = {
	createPassword,
	createPasskey,
	onboardingCreate,
	lock,
	unlockPassword,
	unlockPasskey,
	switchProfile,
	secondWindow,
	revealPhrase,
	importPhrase,
	changePassword,
	rename,
	deleteProfile,
	toggleStrict,
	backgroundRestart,
	raceLockDuringUnlock,
	raceDoubleUnlock,
	raceRestartDuringUnlock,
	editRowDuringUnlock,
	tamperedUnlock,
	changeUnlockMethod,
	verifyAll,
}

// ── readings ────────────────────────────────────────────────────────────

/** A `storage.local` entry as the page collector reads it: a digest, never the value. */
export function entryOf(key: string, value: unknown): StoredEntry {
	const text = textOf(value)
	const digest = createHash("sha256").update(text).digest("hex").slice(0, 24)
	const row = objectOf(value)
	const named = typeof row?.profileId === "string" ? row.profileId : undefined
	if (
		named !== undefined &&
		Object.keys(row as object)
			.sort()
			.join() === "profileId,sealed"
	)
		return { key, digest, envelope: true, envelopeOwner: named }
	return named === undefined ? { key, digest, envelope: false } : { key, digest, envelope: false, plainOwner: named }
}

function objectOf(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== "string") return undefined
	try {
		const parsed = JSON.parse(value)
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined
	} catch {
		return undefined
	}
}

const census = async (run: InProcessRun): Promise<StoredEntry[]> =>
	Object.entries(await run.worker.raw.storage.local.get(null)).map(([key, value]) => entryOf(key, value))

async function readSession(run: InProcessRun, locked: boolean): Promise<SessionReading> {
	const raw = (await run.worker.raw.storage.session.get(SESSION_ROW))[SESSION_ROW]
	const row = typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : undefined
	const reading: SessionReading = {
		row: row && { profile: String(row.profile), hasBearer: row.bearer != null, hasPasshash: row.passhash != null },
		active: (await run.profiles.getActiveProfile())?.id,
		pages: [],
	}
	if (locked) reading.protectedCallRefused = await protectedCallRefused(run)
	return reading
}

/** Whether a read that needs an open session is refused as locked; any other failure is the probe's,
 *  not an answer. */
async function protectedCallRefused(run: InProcessRun): Promise<boolean> {
	try {
		await run.worker.contacts.getContactByAddress(PROBE_ADDRESS)
		return false
	} catch (err) {
		if (err instanceof Error && err.message.includes("Profile locked")) return true
		throw err
	}
}

async function readProfiles(run: InProcessRun): Promise<ProfileReading> {
	const listed = (await run.profiles.getProfiles()).map(({ id, name, type, retired }) => ({ id, name, type, retired: retired === true }))
	const all = await run.worker.raw.storage.local.get(null)
	const rows = Object.entries(all)
		.filter(([key]) => key.startsWith(PROFILE_ROW))
		.map(([key, value]) => {
			const row = JSON.parse(value as string) as Record<string, unknown>
			return {
				keyId: key.slice(PROFILE_ROW.length),
				id: String(row.id),
				name: String(row.name),
				type: String(row.type),
				fields: Object.keys(row),
				...(typeof row.credentialId === "string" ? { credentialId: row.credentialId } : {}),
			}
		})
	return { listed, rows }
}

/** Every secret the run knows, in each encoding a leak could take. */
export function needlesOf(run: InProcessRun): Needle[] {
	const out: Needle[] = []
	const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64")
	for (const [ref, value] of run.secrets)
		out.push({ name: `${ref}/password`, value }, { name: `${ref}/password-b64`, value: b64(Buffer.from(value)) })
	for (const [ref, { words, entropy }] of run.phrases)
		out.push(
			{ name: `${ref}/words`, value: words.join(" ") },
			{ name: `${ref}/words-json`, value: words.join('","') },
			{ name: `${ref}/entropy-hex`, value: Buffer.from(entropy).toString("hex") },
			{ name: `${ref}/entropy-b64`, value: b64(entropy) },
		)
	for (const [i, value] of run.wrong.entries())
		out.push({ name: `wrong-${i}/password`, value }, { name: `wrong-${i}/password-b64`, value: b64(Buffer.from(value)) })
	for (const [name, salt] of run.salts) out.push({ name, ...salt })
	for (const [i, value] of [...run.prf].entries()) {
		const bytes = Buffer.from(value, "base64")
		out.push(
			{ name: `prf-${i}/b64`, value },
			{ name: `prf-${i}/hex`, value: bytes.toString("hex") },
			{ name: `prf-${i}/b64url`, value: bytes.toString("base64url") },
		)
	}
	for (const [ref, master] of run.seen.masters)
		out.push(
			{ name: `${ref}/master-b64`, value: master },
			{ name: `${ref}/master-hex`, value: Buffer.from(master, "base64").toString("hex") },
		)
	return out
}

const scanText = (where: string, text: string, needles: readonly Needle[]): LeakHit[] =>
	findNeedles(text, needles).map((needle) => ({ where, needle }))

/** A value's text with every needle replaced by its name. */
export function mask(text: string, needles: readonly Needle[]): string {
	return needles.filter((n) => n.value.length >= MIN_NEEDLE).reduce((t, n) => t.split(n.value).join(`<${n.name}>`), text)
}

const ENVELOPE = /^\{"profileId":"[^"]+","sealed":"[^"]+"\}$/
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

/** Why `value` is no frame of `spec`, or undefined when it is one; the reason names no byte. */
function notFrame(value: unknown, spec: { version: number; length: number }): string | undefined {
	if (typeof value !== "string") return typeof value
	if (!BASE64.test(value) || value.length % 4) return "not base64"
	const bytes = Buffer.from(value, "base64")
	return bytes[0] === spec.version && bytes.length === spec.length ? undefined : `version ${bytes[0]}, ${bytes.length} bytes`
}

function unframed(text: string, key: string): string[] {
	const row = JSON.parse(text) as Record<string, unknown>
	const label = String(row.id ?? key)
	const kind = row.type === "passkey" && !("prfSalt" in row) ? "retired" : String(row.type)
	const fields = SLOT_FRAMES[kind]
	if (!fields) return [`${label}.type (${String(row.type)})`]
	return Object.entries(fields).flatMap(([field, spec]) => {
		const why = notFrame(row[field], spec)
		return why ? [`${label}.${field} (${why})`] : []
	})
}

/** The page collector's storage scan, in process: needles in both areas and the step's log lines,
 *  sealed roots outside an envelope, profile slots that are no frame, and every `prfSalt`. */
async function scanStorage(run: InProcessRun, needles: readonly Needle[]) {
	const hits: LeakHit[] = []
	const structure: Omit<StructureReading, "exports"> = { unsealedRows: [], unframedSlots: [], prfSalt: [] }
	const scan = (where: string, text: string) => {
		hits.push(...scanText(where, text, needles))
		if (text.includes("prfSalt")) structure.prfSalt.push(where)
	}
	for (const [key, value] of Object.entries(await run.worker.raw.storage.local.get(null))) {
		const text = textOf(value)
		scan(`local:${key}`, `${key}\n${text}`)
		if (SEALED_PREFIXES.some((p) => key.startsWith(p)) && !ENVELOPE.test(text)) structure.unsealedRows.push(key)
		if (key.startsWith(PROFILE_ROW)) structure.unframedSlots.push(...unframed(text, key))
	}
	for (const [key, value] of Object.entries(await run.worker.raw.storage.session.get(null)))
		scan(`session:${key}`, `${key}\n${textOf(value)}`)
	for (const { worker, log } of run.logs) scan(`log:${worker}.${log.id}`, logText(log))
	for (const r of [...run.writes, ...run.readingWrites])
		hits.push(...scanText(`${r.area}:${r.key}`, `${r.key}\n${textOf(r.after)}`, needles))
	return { hits, structure }
}

const logText = (log: Log): string => JSON.stringify([log.source, ...log.data])

// ── O4: the step's warn and error logs ──────────────────────────────────

/** A warn or error log the in-process run accepts, with where it comes from and why it is not the
 *  wallet failing. */
export interface InProcessAllowed {
	pattern: RegExp
	during: readonly { action: InProcessAction; variant?: string }[]
	source: string
	reason: string
}

export const IN_PROCESS_ALLOWED: readonly InProcessAllowed[] = []

const variantOf = (step: PlannedStep): string | undefined => {
	const params = step.params as { variant?: string; field?: string; slot?: string; change?: string }
	return params.variant ?? params.field ?? params.slot ?? params.change
}

/** Every warn or error log of the step's workers, unless an entry names it for the step; the boot
 *  is no step, so it accepts none. Lower levels are read for leaks only. */
function checkLogs(run: InProcessRun, step: PlannedStep | undefined, allowed: readonly InProcessAllowed[]): Violation[] {
	const variant = step && variantOf(step)
	const names = (a: InProcessAllowed) =>
		step !== undefined && a.during.some((d) => d.action === step.action && (d.variant === undefined || d.variant === variant))
	return run.logs.flatMap(({ log }) => {
		if (log.level < LogLevel.Warn) return []
		const text = logText(log)
		if (allowed.some((a) => names(a) && a.pattern.test(text))) return []
		return [{ oracle: "O4" as const, message: `${LogLevel[log.level]} log from ${log.source}`, detail: text }]
	})
}

// ── O6: masters at verify ───────────────────────────────────────────────

/**
 * Each live profile is refused a wrong secret with no write and opens with its own; its master and
 * session secret read as at its first sighting, the session secret is the master as a field element,
 * and profiles on one phrase share a master while profiles on two never do. A deleted profile counts
 * by what it showed at first sighting.
 */
export function checkMasters(w: World, readings: readonly MasterReading[], seen: FirstSighting): Violation[] {
	const out: Violation[] = []
	const v = (message: string): void => {
		out.push({ oracle: "O6", message })
	}
	for (const p of live(w)) {
		const r = readings.find((x) => x.ref === p.ref)
		if (!r) v(`${p.ref} was not verified`)
		else checkOneMaster(r, seen, v)
	}
	const masterOf = (p: ModelProfile) => readings.find((x) => x.ref === p.ref)?.master ?? seen.masters.get(p.ref)
	const known = w.profiles.filter((p) => p.phrase !== undefined && masterOf(p) !== undefined)
	known.forEach((p, i) => {
		for (const q of known.slice(i + 1)) {
			const same = masterOf(p) === masterOf(q)
			if (p.phrase === q.phrase && !same) v(`${p.ref} and ${q.ref} share ${p.phrase} but hold different masters`)
			if (p.phrase !== q.phrase && same) v(`${p.ref} and ${q.ref} hold different phrases but one master`)
		}
	})
	return out
}

function checkOneMaster(r: MasterReading, seen: FirstSighting, v: (message: string) => void): void {
	if (!r.wrongRefused) v(`${r.ref} opened with a wrong secret`)
	if (r.wrongWrote.length) v(`${r.ref}'s refused unlock wrote ${r.wrongWrote.join(", ")}`)
	if (!r.opened || r.master === undefined || r.sessionSecret === undefined) {
		v(`${r.ref} did not open with its own secret`)
		return
	}
	if (r.master !== seen.masters.get(r.ref)) v(`${r.ref}'s master is not the one it showed at first sighting`)
	if (r.sessionSecret !== seen.sessionSecrets.get(r.ref)) v(`${r.ref}'s session secret is not the one it showed at first sighting`)
	if (r.sessionSecret !== fieldOf(r.master)) v(`${r.ref}'s session secret is not its master`)
}

const fieldOf = (master: string): string => Fr.fromBuffer(Buffer.from(master, "base64")).toString()

/** The open profile's session secret is the one it showed at first sighting, after every step. */
async function checkOpenSecret(run: InProcessRun, w: World): Promise<Violation[]> {
	if (w.session.kind !== "open") return []
	const { ref } = w.session
	const id = run.bindings.profiles.get(ref)
	if (!id || (await run.profiles.getActiveProfile())?.id !== id) return []
	const secret = (await run.profiles.getProfileSecret(id)).toString()
	return secret === run.seen.sessionSecrets.get(ref)
		? []
		: [{ oracle: "O6", message: `${ref}'s session secret is not the one it showed at first sighting` }]
}

// ── the step loop ───────────────────────────────────────────────────────

export interface StepReport {
	index: number
	action: ActionName | "boot"
	outcome?: Outcome
	violations: Violation[]
}

export interface RunReport {
	plan: Plan
	steps: StepReport[]
	/** The step that broke a property; the run stops there. */
	red?: StepReport
}

const idsOf = (run: InProcessRun, refs: Iterable<ProfileRef>): Set<string> =>
	new Set([...refs].flatMap((ref) => (run.bindings.profiles.has(ref) ? [run.bindings.profiles.get(ref) as string] : [])))

const openRefs = (w: World): ProfileRef[] => (w.session.kind === "open" ? [w.session.ref] : [])

/** O3 over every logged `storage.local` transition, reverted ones included, once the step has bound
 *  its new ids; then each create's row and each delete's purge; then writes no step may make, and
 *  O1 over every session row written, whatever came after it. */
function checkWriteLog(
	run: InProcessRun,
	step: PlannedStep | undefined,
	before: World,
	censuses: [StoredEntry[], StoredEntry[]],
): Violation[] {
	const next = step?.expect.next ?? before
	const ctx: Omit<WriteContext, "before" | "after"> = {
		contract: step?.expect.writes ?? [],
		bindings: run.bindings,
		knownIds: run.knownIds,
		openIds: idsOf(run, [...openRefs(before), ...openRefs(next)]),
		deletedIds: idsOf(run, deletedRefs(before)),
	}
	const side = (key: string, value: unknown) => (value === undefined ? [] : [entryOf(key, value)])
	const out = run.writes
		.filter((r) => r.area === "local")
		.flatMap((r) => checkChanges({ ...ctx, before: side(r.key, r.before), after: side(r.key, r.after) }))
	out.push(...checkLifecycle({ ...ctx, before: censuses[0], after: censuses[1] }))
	for (const r of run.readingWrites) out.push({ oracle: "O3", message: `a reading wrote ${r.area}:${r.key}` })
	for (const r of run.strays.splice(0))
		out.push({ oracle: "O3", message: `worker ${r.worker} wrote ${r.area}:${r.key} after its restart` })
	for (const r of [...run.writes, ...run.readingWrites]) out.push(...checkSessionWrite(r))
	return out
}

/** A session row is never written with a legacy passhash, nor with a bearer while strict. */
function checkSessionWrite(r: WriteRecord): Violation[] {
	if (r.area !== "session" || r.key !== SESSION_ROW || typeof r.after !== "string") return []
	const row = JSON.parse(r.after) as { bearer?: unknown; passhash?: unknown }
	const out: Violation[] = []
	if (row.passhash != null) out.push({ oracle: "O1", message: `worker ${r.worker} wrote a session row holding a legacy passhash` })
	if (r.strict && row.bearer != null)
		out.push({ oracle: "O1", message: `worker ${r.worker} wrote a session row holding a bearer under strict mode` })
	return out
}

async function checkStep(run: InProcessRun, step: PlannedStep | undefined, before: World, censuses: [StoredEntry[], StoredEntry[]]) {
	const next = step?.expect.next ?? before
	await learnSalts(run)
	const needles = needlesOf(run)
	const session = await readSession(run, next.session.kind === "locked")
	const profiles = await readProfiles(run)
	const { hits, structure } = await scanStorage(run, needles)
	const passkeyIds = idsOf(
		run,
		live(next)
			.filter((p) => p.method === "passkey")
			.map((p) => p.ref),
	)
	const homes = new Map(needles.flatMap((n) => (n.home ? [[n.name, n.home] as const] : [])))
	const leaks = dedupe([...run.writeHits, ...hits])
	return [
		...checkSession(next, session, run.bindings),
		...checkProfiles(next, profiles, run.bindings),
		...checkWriteLog(run, step, before, censuses),
		...checkLeaks(leaks, { ...structure, exports: [] }, passkeyIds, homes),
		...checkLogs(run, step, IN_PROCESS_ALLOWED),
		...(step?.action === "verifyAll" ? checkMasters(before, run.verified, run.seen) : []),
		...(await checkOpenSecret(run, next)),
	]
}

const dedupe = (hits: readonly LeakHit[]): LeakHit[] => [...new Map(hits.map((h) => [`${h.where}|${h.needle}`, h])).values()]

const wroteConfig = (run: InProcessRun): boolean => run.writes.some((r) => r.area === "local" && r.key === CONFIG_KEY)

function failure(action: string, e: unknown): Violation {
	const error = e instanceof UnlistedRejection ? e.error : e
	const name = error instanceof Error ? error.constructor.name : typeof error
	const message = error instanceof Error ? error.message : String(error)
	const why = e instanceof UnlistedRejection ? "ended on a rejection its driver lists for no variant" : "threw"
	return { oracle: "O5", message: `${action} ${why}: ${name}`, detail: message }
}

async function runStep(run: InProcessRun, step: PlannedStep, before: World): Promise<StepReport> {
	run.beginStep()
	const start = await census(run)
	const violations: Violation[] = []
	let outcome: Outcome | undefined
	try {
		outcome = await (DRIVERS[step.action as InProcessAction] as Drive<InProcessAction>)(run, step.params as never, step, before)
		await run.hooks.afterDriver?.(run, step)
		// A config write's listeners run `void`ed work under the facade lock; one locked read waits for it.
		if (wroteConfig(run)) await run.profiles.getActiveProfile()
	} catch (e) {
		violations.push(failure(step.action, e))
	}
	run.phase = "reading"
	try {
		await readSightings(run)
		if (outcome) violations.push(...checkOutcome(step.action, step.expect, { outcome }))
		violations.push(...run.findings, ...(await checkStep(run, step, before, [start, await census(run)])))
	} catch (e) {
		violations.push(failure(`reading after ${step.action}`, e))
	}
	const needles = needlesOf(run)
	return { index: step.index, action: step.action, outcome, violations: violations.map((v) => maskViolation(v, needles)) }
}

const maskViolation = (v: Violation, needles: readonly Needle[]): Violation => ({
	...v,
	message: mask(v.message, needles),
	...(v.detail === undefined ? {} : { detail: mask(v.detail, needles) }),
})

/** Runs `plan` on a fresh graph, stopping at the first step that breaks a property. */
export async function runPlan(plan: Plan, hooks: StepHooks = {}): Promise<RunReport> {
	for (const action of plan.steps.map((s) => s.action))
		if (!(IN_PROCESS_ACTIONS as readonly string[]).includes(action)) throw new Error(`${action} has no in-process driver`)
	const local = (chrome.storage as { local?: unknown }).local
	const run = new InProcessRun(hooks)
	const consoles = consoleMethods.map(([method, level]) => {
		const name = method as "log"
		const original = console[name]
		console[name] = (...args: unknown[]) => run.console(level, args)
		return () => {
			console[name] = original
		}
	})
	try {
		new FakeBrowserApi().reset()
		run.beginStep()
		run.worker = await boot(run)
		run.phase = "reading"
		const empty = startWorld(plan.start)
		const booted: StepReport = {
			index: -1,
			action: "boot",
			violations: await checkStep(run, undefined, empty, [[], await census(run)]),
		}
		if (booted.violations.length) return { plan, steps: [booted], red: booted }
		return await runSteps(run, plan, empty)
	} finally {
		;(chrome.storage as { local?: unknown }).local = local
		for (const restore of consoles) restore()
	}
}

async function runSteps(run: InProcessRun, plan: Plan, start: World): Promise<RunReport> {
	const steps: StepReport[] = []
	let world = start
	for (const step of plan.steps) {
		const report = await runStep(run, step, world)
		steps.push(report)
		if (report.violations.length) return { plan, steps, red: report }
		world = step.expect.next
	}
	return { plan, steps }
}

/** A red run as the test prints it: the seed, the step, its violations and the plan, symbols only. */
export function describeRed(report: RunReport): string {
	const red = report.red
	if (!red) return `seed ${report.plan.seed}: green`
	const step = report.plan.steps.find((s) => s.index === red.index)
	return [
		`seed ${report.plan.seed}, step ${red.index} ${red.action} ${step ? JSON.stringify(step.params) : ""} ended ${red.outcome ?? "without an outcome"}`,
		...red.violations.map((v) => `  ${v.oracle} ${v.message}${v.detail ? ` [${v.detail}]` : ""}`),
		"plan:",
		...describePlan(report.plan).map((line) => `  ${line}`),
	].join("\n")
}
