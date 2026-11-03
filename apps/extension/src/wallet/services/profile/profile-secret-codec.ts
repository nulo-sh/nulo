// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { array_equals, getMnemonic, toBase64 } from "@nulo/wallet-core/utils"
import { PasskeyNotOpenedError, RetiredProfileError } from "@nulo/extension-messaging/errors"
import {
	asBase64Ciphertext,
	asImportedKeysDek,
	deriveMasterFromMnemonic,
	EncryptionKey,
	type EncryptedProfileSecret,
	IMPORTED_DEK_AAD,
	IMPORTED_KEYS_DEK_LEN,
	type ImportedKeysDek,
	type MasterSecretBytes,
	openPasskeySlots,
	type Passhash,
	type PasskeyCredential,
	type PasswordSecretBox,
	sealDekUnderWrapKey,
	sealPasskeySlots,
	unsealDekUnderWrapKey,
	verifyEnvelopeMacV3,
	zeroize,
} from "@nulo/wallet-crypto"
import { fromBase64Lenient } from "@/wallet/utils"
import { classifyProfileRow, macEnvelopeV3 } from "./profile-row"
import type { Profile } from "./spec"

/** What opens a row's slots: its password, or a passkey answer, which opens a passkey row only for
 *  the row's own credential and `prfSalt`. */
export type SlotKey = { password: string } | { passkey: PasskeyCredential }

/** What a new or resealed row is sealed under: a password's hash, or a passkey answer, whose own
 *  `prfSalt` the row then stores. */
export type RowSeal = { passhash: Passhash } | { credential: PasskeyCredential }

/** A row's slots and DEK slot sealed under a {@link RowSeal}, and the unlock fields the row takes. */
export type SealedUnder = {
	slots: EncryptedProfileSecret
	dekSealed: string
	unlock: { type: "password" } | { type: "passkey"; credentialId: string; prfSalt: string }
}

/** A row's slots opened under its unlock, from {@link ProfileSecretCodec.openSlots}. The caller owns the
 *  buffers and calls `wipe()` on every path. */
export type OpenedSlots = {
	secret: MasterSecretBytes
	entropy: Uint8Array<ArrayBuffer>
	/** Opens a DEK slot under the same key; `null` when it does not open. */
	openDek(dekSealed: string): Promise<ImportedKeysDek | null>
	wipe(): void
}

/** Whether `key` is for the unlock `row` stores: the same kind and, for a passkey, the row's own
 *  credential at its own input. A key that is for it still has to open the slots. */
export function unlocksWith(row: Profile, key: SlotKey): boolean {
	const classified = classifyProfileRow(row)
	if (classified.kind === "password") return "password" in key
	if (classified.kind !== "passkey" || !("passkey" in key)) return false
	return key.passkey.id === classified.credentialId && key.passkey.unlockKeyFor(classified.prfSalt) !== null
}

/** Whether the recovery words `entropy` encodes still derive `master`. Wipes only its own
 *  derivation: the inputs stay the caller's. */
export async function entropyDerivesMaster(master: Uint8Array<ArrayBuffer>, entropy: Uint8Array<ArrayBuffer>): Promise<boolean> {
	const rederived = await deriveMasterFromMnemonic(await getMnemonic(entropy))
	const paired = array_equals(rederived, master)
	zeroize(rederived)
	return paired
}

/**
 * How a profile row's secrets are opened, sealed and checked: the slots and the DEK slot under a
 * password's hash or a passkey's unlock key, the words-to-master pairing and the envelope MAC. It
 * holds no lock, session or deletion state; every buffer it returns is the caller's to wipe.
 */
export class ProfileSecretCodec {
	public constructor(private readonly secretBox: PasswordSecretBox) {}

	/** The only reader of a row's sealed slots: the master and entropy `key` opens, or `null` when
	 *  the row does not classify as the unlock `key` is for, or `key` does not open its slots (wrong,
	 *  or a slot corrupted), which each caller maps to its own refusal. A passkey row opens only
	 *  under its own credential and its own `prfSalt`. Refuses a retired row before anything else.
	 *  The DEK opens through the result, so it opens only after the guard. */
	public async openSlots(row: Profile, key: SlotKey): Promise<OpenedSlots | null> {
		const classified = classifyProfileRow(row)
		if (classified.kind === "retired") throw new RetiredProfileError()
		if (classified.kind === "password" && "password" in key) return this.openPasswordSlots(classified.slots, key.password)
		if (classified.kind === "passkey" && "passkey" in key) return this.openPasskeyRowSlots(classified, key.passkey)
		return null
	}

	/**
	 * Runs `body` over `row`'s slots opened under `key`, and wipes them once `body` settles, a
	 * rejection included; nothing else `body` allocates is wiped here. The slots are lent: `body`
	 * finishes with them before it settles and returns nothing that aliases them. When the slots do
	 * not open, throws the path's refusal ({@link notOpened}) and never runs `body`. Takes no lock:
	 * the caller places it, and runs its fence and checks inside `body` in its own order.
	 */
	public async withOpenedSlots<T>(
		row: Profile,
		key: SlotKey,
		passwordRefusal: () => Error,
		body: (opened: OpenedSlots) => Promise<T>,
	): Promise<T> {
		const opened = await this.openSlots(row, key)
		if (!opened) throw this.notOpened(key, passwordRefusal)
		try {
			return await body(opened)
		} finally {
			opened.wipe()
		}
	}

	/** What a path throws when `key` did not open the row: its own wrong-password refusal, or the
	 *  passkey's, which no screen may read as a wrong password. */
	private notOpened(key: SlotKey, passwordRefusal: () => Error): Error {
		return "passkey" in key ? new PasskeyNotOpenedError() : passwordRefusal()
	}

	private async openPasswordSlots(
		slots: { guard: string; secret: string; entropy: string },
		password: string,
	): Promise<OpenedSlots | null> {
		const passhash = await EncryptionKey.getPasshash(password)
		let opened: OpenedSlots | null = null
		try {
			opened = await this.openUnderPasshash(slots, passhash)
		} finally {
			if (!opened) zeroize(passhash)
		}
		if (!opened) return null
		const { wipe } = opened
		return {
			...opened,
			wipe: () => {
				wipe()
				zeroize(passhash)
			},
		}
	}

	/** {@link openPasswordSlots} under a hash the caller owns, and wipes. */
	public async openUnderPasshash(
		slots: { guard: string; secret: string; entropy: string },
		passhash: Passhash,
	): Promise<OpenedSlots | null> {
		const opened = await this.secretBox.unsealWithPasshash(passhash, {
			guard: asBase64Ciphertext(slots.guard),
			secret: asBase64Ciphertext(slots.secret),
			entropy: asBase64Ciphertext(slots.entropy),
		})
		if (!opened) return null
		const { secret, entropy } = opened
		return {
			secret,
			entropy,
			openDek: (dekSealed) => this.unsealDekWithPasshash(passhash, dekSealed),
			wipe: () => {
				zeroize(secret)
				zeroize(entropy)
			},
		}
	}

	private async openPasskeyRowSlots(
		row: Extract<ReturnType<typeof classifyProfileRow>, { kind: "passkey" }>,
		credential: PasskeyCredential,
	): Promise<OpenedSlots | null> {
		const unlockKey = credential.id === row.credentialId ? credential.unlockKeyFor(row.prfSalt) : null
		if (!unlockKey) return null
		const opened = await openPasskeySlots(unlockKey, {
			guard: asBase64Ciphertext(row.slots.guard),
			secret: asBase64Ciphertext(row.slots.secret),
			entropy: asBase64Ciphertext(row.slots.entropy),
		})
		if (!opened) return null
		const { secret, entropy } = opened
		return {
			secret,
			entropy,
			openDek: (dekSealed) => unsealDekUnderWrapKey(unlockKey, dekSealed).catch(() => null),
			wipe: () => {
				zeroize(secret)
				zeroize(entropy)
			},
		}
	}

	/** Seals master, entropy and `dek` under `seal`. The caller owns every buffer. */
	public async sealUnder(
		seal: RowSeal,
		secret: MasterSecretBytes,
		entropy: Uint8Array<ArrayBuffer>,
		dek: ImportedKeysDek,
	): Promise<SealedUnder> {
		const sealDek = await this.sealSlotsUnder(seal, secret, entropy)
		return sealDek(dek)
	}

	/** {@link sealUnder} in two steps, so a caller can draw the DEK after the slots are sealed. */
	public async sealSlotsUnder(
		seal: RowSeal,
		secret: MasterSecretBytes,
		entropy: Uint8Array<ArrayBuffer>,
	): Promise<(dek: ImportedKeysDek) => Promise<SealedUnder>> {
		if ("passhash" in seal) {
			const { passhash } = seal
			const slots = await this.secretBox.sealWithPasshash(passhash, secret, entropy)
			return async (dek) => ({ slots, dekSealed: await this.sealDekWithPasshash(passhash, dek), unlock: { type: "password" } })
		}
		const { id: credentialId, prfSalt } = seal.credential
		const unlockKey = seal.credential.unlockKeyFor(prfSalt)
		if (!unlockKey) throw new Error("Passkey answered for another request")
		const slots = await sealPasskeySlots(unlockKey, secret, entropy)
		return async (dek) => ({
			slots,
			dekSealed: await sealDekUnderWrapKey(unlockKey, dek),
			unlock: { type: "passkey", credentialId, prfSalt },
		})
	}

	/**
	 * The words↔master pairing check, run at every site that has decrypted BOTH the entropy and
	 * the master: the stored recovery words MUST still derive the stored master. A mismatch means
	 * a tampered or cross-profile-transplanted ciphertext (the backup checksum is integrity-not-
	 * auth; purpose-AAD stops slot-swaps but not same-slot moves between same-password profiles).
	 * Throws before any secret is revealed, persisted, or exported.
	 */
	public async assertEntropyMasterPair(secret: MasterSecretBytes, entropy: Uint8Array<ArrayBuffer>): Promise<void> {
		if (!(await entropyDerivesMaster(secret, entropy))) {
			throw new Error("Profile storage corrupted")
		}
	}

	/**
	 * Does the stored MAC still cover this exact record? EVERY site that is about to trust the DEK
	 * must ask — not just the unlock path. The DEK slot's AAD is a purpose constant, not
	 * profile-bound, so a same-password sibling's `dekSealed` transplants cleanly into another
	 * profile's row and unseals there; the whole-envelope MAC is the only check that catches it.
	 * A site that skips this either blesses the planted slot (laundering the tamper into a
	 * freshly-valid MAC) or exports material sealed to a key the profile does not own.
	 */
	public async envelopeMacValid(
		requestedId: string,
		p: {
			guard: string
			secret: string
			entropy: string
			dekSealed: string
			walletFingerprint: string
			envelopeMac: string
		},
		secret: MasterSecretBytes,
		dek: ImportedKeysDek,
	): Promise<boolean> {
		return verifyEnvelopeMacV3(requestedId, secret, dek, macEnvelopeV3(p, p.dekSealed, p.walletFingerprint), p.envelopeMac)
	}

	/** Seal the imported-keys DEK under the password credential (EncryptionKey — the audited
	 *  PBKDF2 + AES-GCM path — with the shared purpose AAD). */
	public async sealDekWithPasshash(passhash: Passhash, dek: ImportedKeysDek): Promise<string> {
		const key = await EncryptionKey.fromPasshash(passhash)
		return toBase64(await key.encrypt(dek, IMPORTED_DEK_AAD))
	}

	/** Unseal the DEK slot under the password credential. `null` — not a throw — on any
	 *  wrong-key / transplant / corruption / length failure: the caller applies the degradation
	 *  state machine (derived-only session), never a profile block. */
	private async unsealDekWithPasshash(passhash: Passhash, dekSealed: string): Promise<ImportedKeysDek | null> {
		try {
			const key = await EncryptionKey.fromPasshash(passhash)
			const pt = await key.decrypt(fromBase64Lenient(dekSealed), IMPORTED_DEK_AAD)
			if (pt.length !== IMPORTED_KEYS_DEK_LEN) {
				zeroize(pt)
				return null
			}
			return asImportedKeysDek(pt)
		} catch {
			return null
		}
	}
}
