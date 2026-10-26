import { array_equals, getMnemonic } from "@nulo/wallet-core/utils"
import {
	asImportedKeysDek,
	asMasterSecretBytes,
	deriveMasterFromMnemonic,
	type ImportedKeysDek,
	type MasterSecretBytes,
	zeroize,
} from "@nulo/wallet-crypto"
import { fromBase64Lenient } from "@/wallet/utils"
import type { RestoreSecret } from "./spec"

/** A full backup's secret body once decoded and checked, whatever unlock the restored profile
 *  takes: the master, the entropy behind its recovery phrase, and the transfer key its
 *  imported-key rows are sealed under. The holder owns and zeroes all three. */
export type RestoreMaterial = { master: MasterSecretBytes; entropy: Uint8Array<ArrayBuffer>; transferKey: ImportedKeysDek }

/** Decodes a password backup's body. Throws, wiping what it decoded, on a field that is not 32
 *  bytes or on entropy that does not derive the master: the backup checksum is integrity, not
 *  authenticity, so a doctored body can look self-consistent, and restoring it would mint a profile
 *  whose recovery words derive another wallet than the one in use. */
export async function decodeRestoreMaterial(secret: Extract<RestoreSecret, { type: "password" }>): Promise<RestoreMaterial> {
	const master = fromBase64Lenient(secret.masterKey)
	if (master.byteLength !== 32) {
		zeroize(master)
		throw new Error("Invalid master key length")
	}
	const entropy = fromBase64Lenient(secret.entropy)
	if (entropy.byteLength !== 32) {
		zeroize(master)
		zeroize(entropy)
		throw new Error("Invalid entropy length")
	}
	const rederived = await deriveMasterFromMnemonic(await getMnemonic(entropy))
	const paired = array_equals(rederived, master)
	zeroize(rederived)
	if (!paired) {
		zeroize(master)
		zeroize(entropy)
		throw new Error("Backup entropy does not derive the backup master key")
	}
	const transferKey = fromBase64Lenient(secret.importedKeysDek ?? "")
	if (transferKey.byteLength !== 32) {
		zeroize(master)
		zeroize(entropy)
		zeroize(transferKey)
		throw new Error("Invalid imported-keys dek length")
	}
	return { master: asMasterSecretBytes(master), entropy, transferKey: asImportedKeysDek(transferKey) }
}
