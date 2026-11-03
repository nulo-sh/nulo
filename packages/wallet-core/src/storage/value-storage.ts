// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { MinimalStorageArea } from "./entity_storage"

/** A stored value that was read but does not decode. Its message names only the root; the parse
 *  or codec error, which may quote the stored text, is the `cause`. A rejected read is never one. */
export class ValueDecodeError extends Error {
	public override readonly name = "ValueDecodeError"

	public constructor(root: string, cause: unknown) {
		super(`${root}: stored value does not decode`, { cause })
	}
}

export class ValueStorage<T> {
	private readonly storage: MinimalStorageArea
	private readonly root: string
	private readonly parse?: (raw: unknown) => T

	/**
	 * Callers must pass a concrete `MinimalStorageArea` (e.g.
	 * `browserApi.storage.local`, `chrome.storage.session`, or
	 * `FakeBrowserApi`'s fake) explicitly from the composition root. No
	 * legacy enum form is supported.
	 *
	 * `parse` is an OPTIONAL boundary codec: `(raw: unknown) => T`. When omitted,
	 * `get` keeps the legacy `JSON.parse(...)` behavior (no validation). Unlike
	 * `EntityStorage`, `ValueStorage.get` THROWS on a malformed value and NEVER
	 * deletes — a single-value store has no "drop one bad row of many" option, so
	 * both JSON-syntax failure and codec-validation failure surface to the caller
	 * as a {@link ValueDecodeError} (fail-closed, no silent data loss), while a
	 * rejected storage read surfaces as itself. The schema is injected from the app
	 * layer (wallet-core carries no zod).
	 */
	constructor(root: string, area: MinimalStorageArea, parse?: (raw: unknown) => T) {
		this.root = root
		this.storage = area
		this.parse = parse
	}

	public async get(): Promise<T | undefined> {
		const res = await this.storage.get(this.root)
		if (!(this.root in res)) return undefined
		try {
			const parsed = JSON.parse(res[this.root] as string)
			return this.parse ? this.parse(parsed) : (parsed as T)
		} catch (error) {
			throw new ValueDecodeError(this.root, error)
		}
	}

	public set(value: T): Promise<void> {
		return this.storage.set({ [this.root]: JSON.stringify(value) })
	}

	public delete(): Promise<void> {
		return this.storage.remove(this.root)
	}
}
