/**
 * The live half of a profile chaos run: what the symbols of the plan are bound to in this browser,
 * the pages the run holds, and the secrets it generated. Shared by the drivers and the runner.
 */
import { randomBytes } from "node:crypto"
import type { Page } from "puppeteer"
import type { ExtensionContext } from "../../fixtures/extension"
import type { PasskeyAuthSetup } from "../../fixtures/passkey"
import { type Bindings, emptyBindings, type VerifyReading } from "./checkers"
import type { DrainedLog, ErrorCollector, RunPage } from "./collect"
import type { ActionName, Caps, CredentialRef, FileRef, Outcome, PhraseRef, PlannedStep, ProfileRef, SecretRef, World } from "./model"

export interface ScannedFile {
	text: string
	/** The body its own password opened, when it has one. */
	body?: string
	/** The needle names the body carries by design. */
	carried: (name: string) => boolean
}

/** A file the run holds on disk: an exported backup or account file, and what opens it. */
export interface HeldFile {
	path: string
	kind: "backup" | "account"
	/** An account file's signing key and address, as its export decrypted them. */
	signingKey?: string
	address?: string
}

export interface RunState {
	ctx: ExtensionContext
	caps: Caps
	/** The page the run drives; on a browser that scopes a passkey to its page, it holds them all. */
	anchor: Page
	/** Extra pages a driver holds open across its own action only. */
	extras: RunPage[]
	auth?: PasskeyAuthSetup
	errors: ErrorCollector
	bindings: Bindings
	secrets: Map<SecretRef, string>
	phrases: Map<PhraseRef, string[]>
	files: Map<FileRef, HeldFile>
	/** The run's own directory: downloads and corrupted copies land here. */
	dir: string
	/** Where the run's log drain stands, inside the current background's life, and the lines
	 *  logged before the first step, which that step's error check reads with its own. */
	logs: {
		lastId: number
		carried: DrainedLog[]
		/** Every line drained so far, searched again for each needle the run learns later. */
		seen: { id: number; text: string }[]
		/** The needles `seen` was already searched for. */
		searched: Set<string>
		/** Evidence a driver could not read inside its step, reported as that step's gaps. */
		gaps: string[]
	}
	/** The background serving the run when the last step's checks ended. */
	origin?: number
	/** How many collected page errors earlier steps have read. */
	errorMark: number
	/** Warn lines per source over the run, for the coverage line. */
	warns: Record<string, number>
	/** Accepted errors per allowlist source over the run, for the coverage line. */
	allowed: Record<string, number>
	/** Each held file's text and opened body, read once and searched again at every step, since a
	 *  secret the run learns later may already sit in a file it holds. */
	scanned: Map<FileRef, ScannedFile>
	/** What the last `verifyAll` read, for O6. */
	verified: VerifyReading[]
	/** Every PRF output a page of the run received, base64, as O7 needles. */
	prf: Set<string>
	/** Every `prfSalt` value the run has seen or forged, by needle name, with the one row it may sit in. */
	salts: Map<string, { value: string; home?: string }>
	/** The rows a release wrote plain in roots sealed since, by key: they stay plain until their
	 *  profile next opens, and only these bytes are exempt. */
	legacyPlain: Record<string, string>
	/** What an update leaves for the first open of each release profile, answered between steps
	 *  once a step ends with that profile open, then dropped. */
	afterUpdate: Map<ProfileRef, FirstOpen>
	/** Present on a run with a node. */
	network?: NetworkRun
}

export type Drive = (s: RunState, params: unknown, step: PlannedStep, before: World) => Promise<Driven>

/** Answers what an update left for one profile's first open, on the anchor. */
export type FirstOpen = (s: RunState) => Promise<void>

/** What a run with a node adds: the network file's own drivers, and the move that puts a profile a
 *  step opened for the first time on the node's network, before the step's checks read it. */
export interface NetworkRun {
	drivers: Partial<Record<ActionName, Drive>>
	placeOpened(s: RunState): Promise<void>
}

/** What a driver saw: the outcome, and how its settle went. */
export interface Driven {
	outcome: Outcome
	/** The title the refusal showed, read where the model names one. */
	shows?: string
	settle: { reached: boolean; elapsedMs: number; boundMs: number; loading?: string[]; route?: string; visible?: string[] }
}

type Derived =
	| "bindings"
	| "secrets"
	| "phrases"
	| "files"
	| "extras"
	| "logs"
	| "errorMark"
	| "warns"
	| "allowed"
	| "scanned"
	| "verified"
	| "prf"
	| "salts"
	| "legacyPlain"
	| "afterUpdate"

export function newRunState(init: Omit<RunState, Derived>): RunState {
	return {
		...init,
		extras: [],
		bindings: emptyBindings(),
		secrets: new Map(),
		phrases: new Map(),
		files: new Map(),
		logs: { lastId: 0, carried: [], seen: [], searched: new Set(), gaps: [] },
		errorMark: 0,
		warns: {},
		allowed: {},
		scanned: new Map(),
		verified: [],
		prf: new Set(),
		salts: new Map(),
		legacyPlain: {},
		afterUpdate: new Map(),
	}
}

/** A fresh password for `ref`: long, unique to the run, so a leak scan never matches by chance. */
export function secretFor(s: RunState, ref: SecretRef): string {
	const known = s.secrets.get(ref)
	if (known) return known
	const value = `Chaos-${ref}-${randomBytes(9).toString("base64url")}`
	s.secrets.set(ref, value)
	return value
}

/** A password the run never set, for the wrong-password variants. */
export const wrongSecret = (): string => `Wrong-${randomBytes(9).toString("base64url")}`

export function profileId(s: RunState, ref: ProfileRef): string {
	const id = s.bindings.profiles.get(ref)
	if (!id) throw new Error(`${ref} is not bound to a profile yet`)
	return id
}

/** The id the wallet stores for `ref`, bound from the answer that minted it. */
export function credentialId(s: RunState, ref: CredentialRef | undefined): string {
	const id = ref && s.bindings.credentials.get(ref)
	if (!id) throw new Error(`${ref ?? "no credential"} is not bound to a credential yet`)
	return id
}
