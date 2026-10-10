// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import { ValueStorage } from "@/wallet/storage"
import { Lock } from "@/wallet/utils"
import { EventHandler } from "@nulo/wallet-core/utils"
import { type Config, type ConfigKey, type ConfigProp, ConfigSchema, defaultConfig } from "./config"
import type { IConfigStore } from "."

/** ValueStorage key holding the whole serialized `Config` object. Frozen:
 *  renaming detaches every install's settings; the backup-migration registry
 *  pins it. */
export const CONFIG_STORAGE_KEY = "nulo:config"

export class ConfigStore implements IConfigStore {
	public readonly onUpdate = new EventHandler<ConfigProp>()

	private readonly lock = new Lock()
	private readonly storage = new ValueStorage<Config>(CONFIG_STORAGE_KEY, chrome.storage.local)
	private config = defaultConfig()

	public get props(): ConfigProp[] {
		return Object.entries(this.config).map(([key, value]) => ({ key, value }) as ConfigProp)
	}

	public async load() {
		let storedConfig: Config | undefined
		try {
			storedConfig = await this.storage.get()
		} catch (err) {
			// `ValueStorage.get()` is fail-closed (throws on a malformed /
			// undecodable value and PRESERVES it for a repair path). A corrupt
			// `nulo:config` must NOT poison startup — this `load()` runs inside the
			// runtime's `Promise.all`, so a propagating throw aborts the whole boot.
			// Swallow it and continue on defaults; the bad value stays in storage
			// for diagnosis / a future migration.
			console.error("ConfigStore.load: undecodable config, booting on defaults", err)
			return
		}
		if (storedConfig && typeof storedConfig === "object") {
			// Assign before the write-back: these values came from storage, and a failed write-back
			// must not leave memory (and log retention, which reads `developerMode`) on the defaults.
			await this.apply(storedConfig, "after-assign")
		}
	}

	public get<TKey extends ConfigKey>(key: TKey): Config[TKey] {
		return this.config[key]
	}

	public async set<TKey extends ConfigKey>(key: TKey, value: Config[TKey]) {
		// Fail fast on an out-of-domain value BEFORE mutating memory/storage —
		// the RPC config spec is type-only, so a runtime caller could pass one.
		// `undefined` is never valid: the per-key schema has a `.default()`, so
		// `safeParse(undefined)` would SUCCEED with the default rather than fail —
		// reject it explicitly.
		if (value === undefined) {
			throw new Error(`Invalid config value for "${String(key)}": value is required`)
		}
		const parsed = ConfigSchema.shape[key].safeParse(value)
		if (!parsed.success) {
			throw new Error(`Invalid config value for "${String(key)}": ${parsed.error.message}`)
		}
		const validated = parsed.data as Config[TKey]
		await this.lock.withLock(async () => {
			if (this.config[key] === validated) {
				return
			}
			// Persist first: a failed write leaves memory and every listener on the stored value,
			// so the caller sees the error and a retry of the same value writes again.
			await this.storage.set({ ...this.config, [key]: validated })
			this.config[key] = validated
			this.onUpdate.invoke({ key, value: validated } as ConfigProp)
		})
	}

	public async reset() {
		await this.apply(defaultConfig(), "before-assign")
	}

	/** Merge an incoming or stored config: a prop that is missing or fails its schema keeps its
	 *  current value, and `onUpdate` fires only for props that validate and change. */
	private async apply(incoming: unknown, persist: "before-assign" | "after-assign") {
		const src = (incoming ?? {}) as Record<string, unknown>
		// Same lock as `set()`: an unlocked apply (reset/load) interleaving a
		// concurrent set() during its persist await would clobber the fresher
		// value in storage while memory kept it — a silent lost update.
		await this.lock.withLock(async () => {
			const changes = this.changesFrom(src)
			if (persist === "before-assign") {
				await this.storage.set({ ...this.config, ...Object.fromEntries(changes.map((c) => [c.key, c.value])) })
			}
			for (const change of changes) {
				;(this.config as Record<string, unknown>)[change.key] = change.value
				this.onUpdate.invoke(change)
			}
			if (persist === "after-assign") await this.storage.set(this.config)
		})
	}

	private changesFrom(src: Record<string, unknown>): ConfigProp[] {
		const changes: ConfigProp[] = []
		for (const key of Object.keys(this.config) as ConfigKey[]) {
			// Skip missing AND explicit-undefined props: the per-key schema has a
			// `.default()`, so `safeParse(undefined)` would reset to default rather
			// than keep the current value (the prior typeof check skipped these).
			if (!(key in src) || src[key] === undefined) continue
			const parsed = ConfigSchema.shape[key].safeParse(src[key])
			if (parsed.success && this.config[key] !== parsed.data) {
				changes.push({ key, value: parsed.data } as ConfigProp)
			}
		}
		return changes
	}
}
