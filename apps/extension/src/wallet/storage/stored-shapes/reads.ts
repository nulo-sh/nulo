import { MemoryStorageArea } from "@nulo/wallet-core/storage"
import { STORED_SHAPES, type StoredShapeName } from "../stored-shapes"
import { entityStorage } from "../stores"
import { readStored } from "./baseline"

export function shapeOfKey(key: string): StoredShapeName | undefined {
	for (const [name, { ref }] of Object.entries(STORED_SHAPES)) {
		if (ref.kind === "value" ? key === ref.key : key.startsWith(`${ref.root}@`)) return name as StoredShapeName
	}
	return undefined
}

const idOf = (key: string): string => key.slice(key.indexOf("@") + 1)

/**
 * The value the wallet reads from `key`. A dApp session's MAC key is derived from the unlocked
 * profile, so its row is read through the codec alone; a caller proves the MAC another way.
 */
async function readRow(name: StoredShapeName, entries: Record<string, unknown>, key: string, now: number): Promise<unknown> {
	const shape = STORED_SHAPES[name]
	if ("engine" in shape) {
		const parsed = shape.schema.safeParse(entries[key])
		return parsed.success ? parsed.data : undefined
	}
	// A read may delete what it refuses, so each one gets its own copy of the area.
	const area = new MemoryStorageArea().seed(structuredClone(entries))
	if ("authenticated" in shape) return entityStorage("dappSessions", area).get(idOf(key))
	return readStored(name, area, key, now)
}

/**
 * Why `entries`, keys and values as `chrome.storage.local` holds them, do not read under this
 * build's registry: a key no registered shape claims, or a row its shape's read code returns
 * nothing for. Empty when every row reads.
 */
export async function unreadRows(entries: Record<string, unknown>, now = Date.now()): Promise<string[]> {
	const problems: string[] = []
	for (const key of Object.keys(entries).sort()) {
		const name = shapeOfKey(key)
		if (!name) problems.push(`${key}: no registered shape claims it`)
		else if ((await readRow(name, entries, key, now)) === undefined) problems.push(`${key}: the ${name} read returns nothing`)
	}
	return problems
}
