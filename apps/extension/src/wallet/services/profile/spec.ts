// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { Fr } from "@aztec-labs/foundation/curves/bn254"
import { getRandomHex } from "@nulo/wallet-core/utils"
import type { Base64MasterSecret, ImportedKeysDek, PasskeyCredentialData, SessionWrappedSecret } from "@nulo/wallet-crypto"
import type { Restored } from "@/wallet/base"
import type { ExecutionFence } from "./profile-deletion-state"

export const PROFILE_SERVICE_NAME = "profile"

/** Storage root for profile records. Frozen: renaming detaches every
 *  wallet on disk from its profile metadata. */
export const PROFILE_STORAGE_ROOT = "nulo:core:profiles"

export type ProfileType = "password" | "passkey"

/** An {@link ExecutionFence} a popup holds across several RPCs. Serials and deletion epochs restart
 *  with the service worker, so the fence also names the worker that issued it. */
export type RunFence = ExecutionFence & { incarnation: string }

/** A finalized restore: the opened profile, and the fence of the session its finalize opened. */
export type FinalizedRestore = { profile: ProfileInfo; fence: RunFence }

/**
 * The secret body of a full backup, the same for every profile since passkey profiles have a
 * recovery phrase: `restore` verifies `PBKDF2(words(entropy)) == masterKey` before sealing either
 * (the backup checksum is integrity, not authenticity).
 */
export type RestoreSecret = {
	masterKey: Base64MasterSecret
	/** Base64 of the 32-byte BIP-39 entropy behind the recovery phrase. */
	entropy: string
	/** Base64 of the backup's own 32-byte transfer key, which its imported-key rows are sealed
	 *  under. Used ONLY inside the TTL-bound rewrap context: `restore` mints a FRESH destination DEK
	 *  for the new row (a restored clone must never share the source's DEK) and
	 *  `restoreImportedKeys` rewraps the backup's key rows source→destination. */
	importedKeysDek: string
}

/** What a passkey unlock asks the passkey for: the credential, and the PRF input the profile's slots
 *  open under. */
export type PasskeyUnlockParams = { credentialId: string; prfSalt: string }

/** A profile's unlock as a method change takes it: a password, or a passkey's answer. The current one
 *  must open the profile (a passkey answer for its own `prfSalt`); a new one is a password of at
 *  least 8 characters, or a new passkey answer at a fresh `prfSalt`. */
export type UnlockCredential = { password: string } | { passkey: PasskeyCredentialData }

export type ProfileInfo = {
	/** Randomly generated id. */
	id: string
	/** Display name. */
	name: string
	/** Profile type. */
	type: ProfileType
	/** `true` for a passkey profile made before 1.1, whose row holds no recovery phrase: listed and
	 *  deletable, never opened. A projection of the stored row's shape, never persisted. */
	retired?: boolean
	/** `true` while THIS profile's session is open WITHOUT its imported-keys DEK — recovery mode:
	 *  the PXE store key and the dApp-session key take `HKDF(master ‖ dek)` and cannot be derived,
	 *  so chain data and dApp sessions are unavailable until export + restore. A projection of the
	 *  live session: never persisted on the row, never carried by a backup. */
	recoveryMode?: boolean
}

export type Profile = Omit<ProfileInfo, "recoveryMode" | "retired"> & {
	/** 128-bit random incarnation generation (hex), minted fresh at EVERY row
	 *  creation — including a same-id backup re-import. The PXE layer fences
	 *  provisions/ops/clears on it so a deleted incarnation can never be
	 *  resurrected in the offscreen document. Never reused, never
	 *  derived from the id. */
	pxeGeneration: string
	/** The per-profile imported-keys DEK, sealed under the profile's unlock (password: EncryptionKey
	 *  under the passhash; passkey: AES-GCM under the passkey unlock key), AAD
	 *  `nulo:profile-imported-dek:v1`. The DEK — never the master — roots imported signing-key
	 *  rows: a shared recovery phrase means a shared master, so master-rooted keys are readable by
	 *  the sibling profile by construction. */
	dekSealed: string
	/** One-way plaintext duplicate-phrase detector: hex(sha256("nulo:wallet-fingerprint:v1" ||
	 *  master)). Plaintext ON PURPOSE — other profiles' masters are sealed, so import/restore can
	 *  only compare a candidate master against stored fingerprints. Negligible-marginal (not zero)
	 *  same-device linkability, owner-accepted; see `wallet-fingerprint.ts`. */
	walletFingerprint: string
	/** Sealed under the profile's unlock: version-0 PBKDF2 frames under a password, version-1
	 *  AES-GCM frames under a passkey unlock key (`profile-slots.ts`). */
	guard: string
	secret: string
	/** Sealed 32-byte BIP-39 entropy (AAD-bound) — the recovery phrase re-displays from THIS; the
	 *  master derives one-way from the words. */
	entropy: string
	/** HMAC over (this row's OWN storage id, the four sealed slots, the plaintext wallet
	 *  fingerprint), keyed by HKDF(master‖dek) — v3. NOT master-only: the same-phrase attacker HOLDS
	 *  the master, so a master-keyed tag is forgeable by them; forging v3 additionally requires the
	 *  victim's DEK. The id binding kills whole-envelope swaps between profiles that share an unlock;
	 *  the fingerprint binding makes blinding the duplicate guard a detectable tamper. Verified at
	 *  every unlock AND bearer restore; a mismatch opens DERIVED-ONLY (imported accounts quarantine,
	 *  no bearer) — never a profile block (imported material must not block derived funds). */
	envelopeMac: string
} & (
		| { type: "password" }
		| {
				type: "passkey"
				/** The passkey that unlocks this profile. */
				credentialId: string
				/** 32 random bytes (base64), this profile's own: the PRF input its passkey evaluates and the
				 *  HKDF salt of its unlock key. A changed value opens nothing. */
				prfSalt: string
		  }
	)

/** What the profile RPCs return, never the stored row: a row carries sealed key material.
 *  `recoveryMode` is present only when true, so a persisted identity never carries the key. */
export function toProfileInfo(profile: Pick<ProfileInfo, "id" | "name" | "type">, recoveryMode: boolean, retired = false): ProfileInfo {
	const info: ProfileInfo = { id: profile.id, name: profile.name, type: profile.type }
	if (retired) info.retired = true
	if (recoveryMode) info.recoveryMode = true
	return info
}

/** Mint a fresh 128-bit Web-Crypto incarnation generation (32 hex chars). */
export function mintPxeGeneration(): string {
	return getRandomHex(32)
}

export type Session = {
	/** Profile id. */
	profile: string
	/** Random-token wrapped-secret silent-restore bearer (any profile opened
	 *  with its DEK, strict mode off). Replaces `passhash` — see `SessionSecretBox`.
	 *  The token is random, not password-derived, so a session-store leak no
	 *  longer exposes a password-equivalent value. */
	bearer?: SessionWrappedSecret
	/** @deprecated Legacy password-equivalent bearer (unsalted
	 *  `SHA-256(password)`). Written only by code that predates the bearer; the new `restore()`
	 *  NEVER accepts it — such a session is `silentClose`d (one-time re-unlock). */
	passhash?: string
	/** Creation time */
	since: number
	/**
	 * Epoch-ms timestamp at which this session expires. Set when
	 * `sessionTtl > 0`. Optional for backward compatibility — older
	 * sessions written without this field still load; `SessionManager`
	 * derives the same value from `since + sessionTtl` at read time.
	 *
	 * Source of truth for the `chrome.alarms` lock fire — both the
	 * scheduler (`open` / `refresh`) and the alarm listener gate compare
	 * against it (gate:
	 * `alarm.scheduledTime === activeSession.session.lockedAt`).
	 *
	 * Schema version: still v1 (additive optional field). Any future
	 * session migrator MUST accept both `lockedAt`-present and
	 * `lockedAt`-absent records as v1.
	 */
	lockedAt?: number
}

export type ActiveSession = {
	/** Profile object*/
	profile: Profile
	/** Session object */
	session: Session
	/** Master secret */
	secret: Fr
	/** The unsealed imported-keys DEK. `undefined` = a DEGRADED (derived-only) session: the DEK
	 *  slot failed to unseal or the envelope MAC failed at unlock — imported accounts quarantine
	 *  per-account, and NO silent-restore bearer is persisted (the next SW wake forces a password
	 *  unlock, re-surfacing the state). Zeroized on close/replace/expiry. */
	dek?: ImportedKeysDek
	/** Allocated when the session is published by an unlock or a restore; never reused, so it names
	 *  this session and no later one of the same profile. */
	serial: number
	/** The latest deadline expiry deferral may reach for this session, fixed by its first deferral. */
	deferBudgetEnd?: number
	/** The pending decision on this session's expiry, joined by every path that observes it. */
	expiryDecision?: Promise<void>
}

export type Methods = {
	/**
	 * Returns a profile for which an active session exists, or undefined otherwise.
	 */
	getActiveProfile(): ProfileInfo | undefined

	/**
	 * Returns a list of profiles.
	 */
	getProfiles(): ProfileInfo[]

	/**
	 * Creates and returns a new profile.
	 * @param name Display name.
	 * @param password Password for storage encryption.
	 */
	createProfile(name: string, password: string): ProfileInfo

	/**
	 * Creates a passkey profile: a new recovery phrase, sealed under the unlock key the passkey's
	 * answer rebuilds for the profile's own `prfSalt`, then signs in.
	 *
	 * @param name Display name.
	 * @param credentialData PATH A: the page ran the create (`runPasskeyCeremony`), or the
	 *   discovery get of a passkey the person already has, with a `prfSalt` it minted, which the
	 *   answer reports and the row stores. Absent: PATH B, the background mints the input and the
	 *   passkey window runs the step.
	 * @param existing PATH B only: the window asks for a passkey the person already has instead of
	 *   creating one.
	 */
	createPasskeyProfile(name: string, credentialData?: PasskeyCredentialData, existing?: boolean): ProfileInfo

	/**
	 * Unlocks a profile with the specified id.
	 * @param id Profile id.
	 * @param password Profile password.
	 */
	unlockProfile(id: string, password: string): ProfileInfo

	/**
	 * Unlocks a passkey profile with the specified id. Throws `RetiredProfileError` for a passkey
	 * profile made before 1.1.
	 *
	 * @param id Profile id.
	 * @param credentialData PATH A: the page's answer for {@link getPasskeyUnlockParams}. The
	 *   profile opens only under its own credential and its own `prfSalt`. Absent: PATH B.
	 */
	unlockPasskeyProfile(id: string, credentialData?: PasskeyCredentialData): ProfileInfo

	/**
	 * What PATH A asks the passkey for to unlock profile `id`: its credential (an `allowCredentials`
	 * `get`, never a discovery picker) and its PRF input. Throws `RetiredProfileError` for a passkey
	 * profile made before 1.1, and when the profile is not passkey-typed.
	 */
	getPasskeyUnlockParams(id: string): PasskeyUnlockParams

	/**
	 * An opaque name for the open session, or `undefined` while locked.
	 */
	getSessionHandle(): string | undefined

	/**
	 * Captures the fence of the open session, for a popup run that spans several RPCs. Throws
	 * "Wallet locked" while no session is open or its profile is being deleted.
	 */
	captureRunFence(): RunFence

	/**
	 * Throws `SessionEndedError` unless `fence` names the open session of this worker, and
	 * the deletion error once a delete of its profile has begun.
	 */
	assertRunFence(fence: RunFence): void

	/**
	 * Locks active profile, closing active session. Given a `handle`, closes nothing while a
	 * different session is open.
	 */
	lockActiveProfile(handle?: string): void

	/**
	 * Resets expiration of active session.
	 */
	refreshSession(): void

	/**
	 * Changes profile name and returns the updated profile.
	 * @param id Profile id.
	 * @param newName New display name.
	 */
	changeProfileName(id: string, newName: string): ProfileInfo

	/**
	 * Changes profile password and returns the updated profile.
	 * @param id Profile id.
	 * @param oldPassword Old password, to decrypt storage.
	 * @param newPassword New password, to encrypt storage.
	 */
	changeProfilePassword(id: string, oldPassword: string, newPassword: string): ProfileInfo

	/**
	 * Throws unless `credential` opens profile `id` as {@link changeUnlockMethod} needs: its slots,
	 * the recovery phrase's match with the master, and the imported-keys key and its record.
	 * `InvalidPasswordError` for a wrong password, the change's own refusal otherwise. Opens no
	 * session and writes nothing.
	 */
	verifyUnlockCredential(id: string, credential: UnlockCredential): void

	/**
	 * Throws unless `credential` opens profile `id` as an export needs: its slots and the recovery
	 * phrase's match with the master, never the imported-keys key, so a profile in recovery mode
	 * still passes. `InvalidPasswordError` for a wrong password, the passkey's own refusal for
	 * another passkey. Opens no session and writes nothing; the export checks again.
	 */
	verifyExportCredential(id: string, credential: UnlockCredential): void

	/**
	 * Moves profile `id` from the unlock `current` opens it with to `next`, keeping its recovery
	 * phrase, accounts and data. Refuses a profile whose imported-keys key no longer opens or no
	 * longer matches its record, and with `StaleUnlockCredentialError` one that does not store the
	 * unlock `current` is for. Throws `UnlockMethodChangedError` when the change was saved, or may
	 * have been, but the profile could not be reopened: the wallet is then locked. An account
	 * integrity block found on the reopen returns the profile with its session closed, behind the
	 * integrity barrier.
	 */
	changeUnlockMethod(id: string, current: UnlockCredential, next: UnlockCredential): ProfileInfo

	/**
	 * Deletes a profile and returns the deleted profile.
	 * @param id Profile id.
	 */
	deleteProfile(id: string): ProfileInfo

	/**
	 * Imports a profile from its 24-word recovery phrase and signs in. Validates on the
	 * canonical form (NFKD/lowercase/collapse) BEFORE any persistence: exactly 24 words, all
	 * on the wordlist, checksum valid. The master derives via the standard BIP-39 PBKDF2 step
	 * (NULO-ACCOUNT-KDF v2); the entropy is stored sealed so the phrase re-displays.
	 * Throws `DuplicateWalletError` (naming every colliding profile) when another live profile
	 * carries the same wallet fingerprint, unless `allowDuplicate` — the UI confirms and retries
	 * (warn-and-confirm, never a hard block; owner policy).
	 * @param name Display name.
	 * @param mnemonic 24-word recovery phrase.
	 * @param password Password to encrypt the secrets, for a password profile.
	 * @param allowDuplicate Confirmed duplicate override from the warn dialog.
	 * @param credentialData For a passkey profile: the page's answer from a new passkey, or from one
	 *   the person already has, at a fresh `prfSalt` the row then stores.
	 */
	importMnemonic(
		name: string,
		mnemonic: string[],
		password?: string,
		allowDuplicate?: boolean,
		credentialData?: PasskeyCredentialData,
	): ProfileInfo

	/**
	 * Returns the profile's master (base64), after the unlock opens its slots and the words↔master
	 * pairing check passes.
	 *
	 * @param id Profile id.
	 * @param password The password, for a password profile.
	 * @param credentialData The page's passkey answer for {@link getPasskeyUnlockParams}, for a
	 *   passkey profile.
	 */
	exportPlain(id: string, password?: string, credentialData?: PasskeyCredentialData): string

	/**
	 * Returns the 24-word recovery phrase, re-encoded from the profile's stored entropy after
	 * the words↔master pairing check (fails closed on a tampered row).
	 * @param id Profile id.
	 * @param password The password, for a password profile.
	 * @param credentialData A passkey answer for the profile's own `prfSalt`, for a passkey profile:
	 *   the reveal's prompt, or the create's answer handed to the phrase stage.
	 */
	exportMnemonic(id: string, password?: string, credentialData?: PasskeyCredentialData): string[]

	/**
	 * Restores a profile from a full-backup payload as a password or passkey profile. Writes the
	 * profile to storage and emits `onProfileAdded`. Does NOT open a session — that's deferred to
	 * `finalizeRestore` so the caller can finish restoring networks / accounts / etc. before
	 * `onActiveProfileChanged` fires.
	 *
	 * @param profile Source profile descriptor (id, name, type) from the backup; its `type`
	 *   describes the source and selects nothing.
	 * @param secret The backup's secret body.
	 * @param password New password, for a password profile.
	 * @param allowDuplicate Confirmed duplicate override from the warn dialog.
	 * @param credentialData For a passkey profile: the page's answer at a fresh `prfSalt`, as for
	 *   `importMnemonic`; `finalizeRestore` takes the same answer.
	 */
	restore(
		profile: ProfileInfo,
		secret: RestoreSecret,
		password?: string,
		allowDuplicate?: boolean,
		credentialData?: PasskeyCredentialData,
	): Restored<ProfileInfo>

	/**
	 * Opens the session for a profile previously created by `restore()`, with the SAME password
	 * (one PBKDF2) or passkey answer supplied to `restore`.
	 *
	 * Emits `onActiveProfileChanged` once the session is up. Idempotent: if
	 * the session is already active for `id`, returns without re-opening.
	 * The fence is captured under the same lock hold that opened the session, so it can only
	 * name this restore's profile, never a same-id successor.
	 *
	 * @param id Profile id (from the `restore` return value).
	 * @param password The password `restore` sealed under, for a password profile.
	 * @param credentialData The passkey answer `restore` sealed under, for a passkey profile.
	 */
	finalizeRestore(id: string, password?: string, credentialData?: PasskeyCredentialData): FinalizedRestore
}

export type Events = {
	/** Emitted when a new profile is created. */
	onProfileAdded: ProfileInfo
	/** Emitted when an existing profile is updated. */
	onProfileUpdated: ProfileInfo
	/** Emitted when an existing profile is deleted. */
	onProfileDeleted: ProfileInfo
	/** Emitted when an active profile is changed. */
	onActiveProfileChanged: ProfileInfo | undefined
	/** Emitted when an unlock opened a DEGRADED (derived-only) session — the imported-keys DEK
	 *  slot failed to unseal or the envelope MAC failed. The popup surfaces a visible warning
	 *  (never just a log); imported accounts quarantine per-account. */
	onImportedKeysDegraded: ProfileInfo
}
