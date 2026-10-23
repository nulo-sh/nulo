import { type MinimalStorageArea, prefixedEntries } from "@nulo/wallet-core/storage"
import { parseEnvelope } from "./sealed-entity-storage"
import { SEALED_ROOTS } from "./stores"

/** Whether a stored value, an envelope or a plaintext row, names `profileId`; read with no key. */
export function namesProfile(raw: unknown, profileId: string): boolean {
	if (typeof raw !== "string") return false
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		return false
	}
	const owner = parseEnvelope(parsed)?.profileId ?? (parsed as { profileId?: unknown } | null)?.profileId
	return owner === profileId
}

/**
 * The keyless step of a profile deletion: removes every row of every sealed root whose envelope,
 * or whose plaintext row, names `profileId`. It needs no row key, so it also catches what a typed
 * purge could not attribute without opening a row, and runs as is when a resumed deletion has no
 * keys. Each delete re-reads its key and spares a value that changed since the scan. Returns the
 * rows removed.
 */
export async function purgeSealedRowsOf(area: MinimalStorageArea, profileId: string): Promise<number> {
	const all = await area.get()
	let removed = 0
	for (const root of SEALED_ROOTS) {
		for (const [key, , raw] of prefixedEntries(all, `${root}@`)) {
			if (!namesProfile(raw, profileId)) continue
			if ((await area.get(key))[key] !== raw) continue
			await area.remove(key)
			removed++
		}
	}
	return removed
}
