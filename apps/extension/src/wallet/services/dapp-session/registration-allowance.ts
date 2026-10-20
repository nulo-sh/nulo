import { ScopeViolationError } from "@nulo/extension-messaging/errors"
import type { MinimalStorageArea } from "@nulo/wallet-core/storage"
import { z } from "zod"
import { valueStorage } from "@/wallet/storage/stores"
import { Lock } from "@/wallet/utils"

/** The most registrations one app may make on a profile's chain. */
export const APP_REGISTRATIONS_PER_CHAIN = 32

/**
 * The most registrations all apps together may make on a profile's chain: each may add a tagging
 * secret the chain's PXE derives on every sync. A policy figure, twice the senders a backup carries
 * per network, not a measured threshold.
 */
export const DAPP_REGISTRATIONS_PER_CHAIN = 128

export const REGISTRATIONS_USED_UP = "Scope violation: no registrations left for this app on this network"

/** Chain id → the registrations all apps made on it, and each app's, keyed by origin. */
export type RegistrationCounts = Record<string, { total: number; apps: Record<string, number> }>

const count = z.number().int().nonnegative()
const ChainCountsSchema = z.object({ total: count, apps: z.record(z.string(), count) })
export const RegistrationCountsSchema = z.record(z.string(), ChainCountsSchema)

/** The stored counts; a chain's entry that does not parse reads as none. */
export function decodeRegistrationCounts(stored: unknown): RegistrationCounts {
	if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {}
	return Object.fromEntries(
		Object.entries(stored).flatMap(([chainId, raw]) => {
			const parsed = ChainCountsSchema.safeParse(raw)
			return parsed.success ? [[chainId, parsed.data]] : []
		}),
	)
}

/**
 * The registrations dApps have made on each of a profile's chains. Every admitted call spends one,
 * a repeat included, so whether a call is admitted depends only on these counts, never on what the
 * chain's PXE holds.
 */
export class RegistrationAllowance {
	private readonly lock = new Lock()

	public constructor(private readonly area: MinimalStorageArea) {}

	/** Spends one of `origin`'s registrations on the chain, or refuses, writing nothing, once the app's
	 *  share or the chain's total is used up. */
	public admit(profileId: string, chainId: number, origin: string): Promise<void> {
		return this.lock.withLock(async () => {
			const counts = await this.read(profileId)
			const chain = counts[String(chainId)] ?? { total: 0, apps: {} }
			const used = Object.hasOwn(chain.apps, origin) ? chain.apps[origin] : 0
			if (used >= APP_REGISTRATIONS_PER_CHAIN || chain.total >= DAPP_REGISTRATIONS_PER_CHAIN) {
				throw new ScopeViolationError(REGISTRATIONS_USED_UP)
			}
			await this.store(profileId).set({
				...counts,
				[String(chainId)]: { total: chain.total + 1, apps: { ...chain.apps, [origin]: used + 1 } },
			})
		})
	}

	public clearChain(profileId: string, chainId: number): Promise<void> {
		return this.lock.withLock(async () => {
			const counts = await this.read(profileId)
			if (!Object.hasOwn(counts, String(chainId))) return
			const { [String(chainId)]: _cleared, ...rest } = counts
			await (Object.keys(rest).length ? this.store(profileId).set(rest) : this.store(profileId).delete())
		})
	}

	public purgeProfile(profileId: string): Promise<void> {
		return this.lock.withLock(() => this.store(profileId).delete())
	}

	private async read(profileId: string): Promise<RegistrationCounts> {
		try {
			return decodeRegistrationCounts(await this.store(profileId).get())
		} catch {
			return {}
		}
	}

	private store(profileId: string) {
		return valueStorage<RegistrationCounts>("dappRegistrations", this.area, profileId)
	}
}
