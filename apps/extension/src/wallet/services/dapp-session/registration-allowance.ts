import { ScopeViolationError } from "@nulo/extension-messaging/errors"
import { z } from "zod"
import type { SealedEntityStorage } from "@/wallet/storage/sealed-entity-storage"
import { Lock } from "@/wallet/utils"

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

	/** `rows` is the sealed counts root, one row per profile at the profile's id. */
	public constructor(private readonly rows: SealedEntityStorage<unknown>) {}

	/** Seals the profile's plaintext counts under the lock every writer holds. */
	public sealLegacy(profileId: string): Promise<number> {
		return this.rows.sealLegacy(profileId, (fn) => this.lock.withLock(fn))
	}

	/** Spends one of `origin`'s registrations on the chain, or refuses, writing nothing, once the app's
	 *  share or the chain's total is used up. `assertLive` runs under the lock `purgeProfile` takes, so
	 *  a call it refuses cannot write after the purge. */
	public admit(profileId: string, chainId: number, origin: string, assertLive: () => void = () => {}): Promise<void> {
		return this.lock.withLock(async () => {
			assertLive()
			const counts = await this.read(profileId)
			const chain = counts[String(chainId)] ?? { total: 0, apps: {} }
			const used = Object.hasOwn(chain.apps, origin) ? chain.apps[origin] : 0
			if (used >= APP_REGISTRATIONS_PER_CHAIN || chain.total >= DAPP_REGISTRATIONS_PER_CHAIN) {
				throw new ScopeViolationError(REGISTRATIONS_USED_UP)
			}
			await this.rows.set(profileId, {
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
			await (Object.keys(rest).length ? this.rows.set(profileId, rest) : this.rows.delete(profileId))
		})
	}

	public purgeProfile(profileId: string): Promise<void> {
		return this.lock.withLock(() => this.rows.delete(profileId))
	}

	/** A row that does not parse or open reads as none; a failed storage read propagates, so it never
	 *  resets the counts. With no row keys every write refuses, so no reset follows a keyless read. */
	private async read(profileId: string): Promise<RegistrationCounts> {
		return decodeRegistrationCounts(await this.rows.get(profileId))
	}
}
