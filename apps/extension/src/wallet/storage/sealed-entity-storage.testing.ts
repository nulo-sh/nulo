import { EventHandler } from "@nulo/wallet-core/utils"
import type { MinimalStorageArea } from "@nulo/wallet-core/storage"
import { asMasterSecretBytes, deriveRowKeys, openRow, type RowKeys } from "@nulo/wallet-crypto"
import { parseEnvelope, type RowKeysSource } from "./sealed-entity-storage"

/** Row keys for tests, as a worker's keyring holds them: derived from one fixed master per
 *  unlocked profile; a profile never unlocked, or dropped, has none. */
export class TestRowKeys {
	readonly #keys = new Map<string, RowKeys>()

	public readonly source: RowKeysSource = (profileId) => this.#keys.get(profileId)

	public async unlock(...profileIds: string[]): Promise<this> {
		const master = asMasterSecretBytes(new Uint8Array(32).fill(0x2a) as Uint8Array<ArrayBuffer>)
		for (const id of profileIds) this.#keys.set(id, await deriveRowKeys(master, id, "test-generation"))
		return this
	}

	public drop(profileId: string): void {
		this.#keys.delete(profileId)
	}
}

/** The row-key surface of `ProfileService` for a fake that stands one key for every profile, as
 *  these fakes' single MAC key does: every profile is unlocked, and the conversion event is inert
 *  until a test fires it. */
export async function rowKeysForEveryProfile(): Promise<{ rowKeys: RowKeysSource; onRowKeysReady: EventHandler<string> }> {
	const keys = await deriveRowKeys(
		asMasterSecretBytes(new Uint8Array(32).fill(0x2b) as Uint8Array<ArrayBuffer>),
		"any",
		"test-generation",
	)
	return { rowKeys: () => keys, onRowKeysReady: new EventHandler<string>() }
}

/** The row text a stored value carries: a sealed envelope opened with the keys of the profile it
 *  names, a plaintext row as stored; undefined for a value that is neither. */
export async function storedText(storageKey: string, value: unknown, keys: RowKeysSource): Promise<string | undefined> {
	if (typeof value !== "string") return undefined
	let parsed: unknown
	try {
		parsed = JSON.parse(value)
	} catch {
		return undefined
	}
	const envelope = parseEnvelope(parsed)
	if (!envelope) return value
	const profileKeys = keys(envelope.profileId)
	if (!profileKeys) return undefined
	const root = storageKey.slice(0, storageKey.indexOf("@"))
	return await openRow(profileKeys, envelope.sealed, { root, storageKey, profileId: envelope.profileId })
}

/** The row text sealed at a storage key, opened with the keys of the profile its envelope names;
 *  throws on a value that is not an envelope, so a plaintext write cannot pass for a sealed one. */
export async function openStoredText(area: MinimalStorageArea, storageKey: string, keys: RowKeysSource): Promise<string> {
	const raw = (await area.get(storageKey))[storageKey]
	const sealed = typeof raw === "string" && parseEnvelope(JSON.parse(raw)) !== undefined
	const text = sealed ? await storedText(storageKey, raw, keys) : undefined
	if (text === undefined) throw new Error(`${storageKey} holds no envelope these keys open`)
	return text
}

/** Captured at import, before a test can fake it: a real turn drains every queued microtask. */
const realSetImmediate = globalThis.setImmediate

const SUBTLE_METHODS = ["encrypt", "decrypt", "sign", "verify", "digest", "importKey", "deriveBits", "deriveKey"] as const

/** Tracks the WebCrypto calls a sealed store makes. They answer on a later event-loop turn, which
 *  a microtask flush or a fake-timer advance never waits for, so a test that asserts after either
 *  would read a write still in flight. `settled()` returns once a full drain leaves none pending. */
export function trackSubtleCrypto(): { settled(): Promise<void>; restore(): void } {
	const subtle = globalThis.crypto.subtle as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>
	const pending = new Set<Promise<unknown>>()
	const originals = SUBTLE_METHODS.map((name) => [name, subtle[name], Object.getOwnPropertyDescriptor(subtle, name)] as const)
	for (const [name, original] of originals) {
		Object.defineProperty(subtle, name, {
			configurable: true,
			writable: true,
			value: (...args: unknown[]) => {
				const call = original.apply(subtle, args)
				pending.add(call)
				const done = () => pending.delete(call)
				call.then(done, done)
				return call
			},
		})
	}
	return {
		async settled() {
			for (;;) {
				await new Promise<void>((resolve) => realSetImmediate(resolve))
				if (pending.size === 0) return
				await Promise.allSettled([...pending])
			}
		},
		restore() {
			for (const [name, , own] of originals) {
				if (own) Object.defineProperty(subtle, name, own)
				else delete subtle[name]
			}
		},
	}
}
