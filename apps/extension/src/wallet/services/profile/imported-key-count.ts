import { type ImportedKeysDek, unsealDekUnderWrapKey, unsealImportedSigningKeyV2, zeroize } from "@nulo/wallet-crypto"

/** An imported-key row as its storage holds it: the key sealed to its chain and address. */
export type SealedImportedKey = { chainId: number; address: string; encryptedSigningKey: string }

/** How many of `rows` do not open under `dek`. Each key that opens is wiped at once; a row that is
 *  not a stored row's shape throws. */
export async function countUnopenedImportedKeys(dek: ImportedKeysDek, rows: readonly SealedImportedKey[]): Promise<number> {
	let unopened = 0
	for (const row of rows) {
		const { chainId, address, encryptedSigningKey } = row
		let key: Uint8Array | undefined
		try {
			key = await unsealImportedSigningKeyV2(dek, chainId, address, encryptedSigningKey)
		} catch {
			unopened++
		} finally {
			if (key) zeroize(key)
		}
	}
	return unopened
}

/**
 * Whether the sealed DEK opens under `wrapKey` and, given `rows`, how many of them do not open under
 * it. The DEK is wiped before this returns or throws; a count that throws aborts the caller.
 */
export async function probeDekAndCount(
	wrapKey: CryptoKey,
	dekSealed: string,
	rows?: readonly SealedImportedKey[],
): Promise<{ opens: boolean; unopened: number }> {
	let probe: ImportedKeysDek | null = null
	try {
		probe = await unsealDekUnderWrapKey(wrapKey, dekSealed)
	} catch {
		probe = null
	}
	try {
		if (!probe) return { opens: false, unopened: 0 }
		return { opens: true, unopened: rows ? await countUnopenedImportedKeys(probe, rows) : 0 }
	} finally {
		zeroize(probe)
	}
}
