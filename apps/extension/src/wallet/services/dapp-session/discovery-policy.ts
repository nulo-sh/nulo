import { z } from "zod"
import type { SealedEntityStorage } from "@/wallet/storage/sealed-entity-storage"
import { Lock } from "@/wallet/utils"

/** The most sites the emoji check refused that a profile's policy keeps; an older one is forgotten
 *  and skips the connect window again, never the emoji check. */
export const CHECK_REFUSALS_KEPT = 32

export const DiscoveryPolicySchema = z
	.object({ everySite: z.literal(true), checkRefused: z.array(z.string()).max(CHECK_REFUSALS_KEPT) })
	.strict()

/** A profile's policy while the switch is on; off stores no row. */
export type StoredDiscoveryPolicy = { everySite: true; checkRefused: string[] }

/** The stored policy, or `undefined` for anything that does not parse: off. */
export function decodeDiscoveryPolicy(stored: unknown): StoredDiscoveryPolicy | undefined {
	const parsed = DiscoveryPolicySchema.safeParse(stored)
	return parsed.success ? parsed.data : undefined
}

/**
 * A profile's "every site may see Nulo" switch, and the sites the emoji check refused while it was
 * on, which get the connect window again. No row is off. Only a row sealed under the profile's keys
 * counts: the root never held plaintext rows, so one found there was put by a storage writer, and
 * nothing here seals it.
 */
export class DiscoveryPolicy {
	private readonly lock = new Lock()

	/** `rows` is the sealed policy root, one row per profile at the profile's id. */
	public constructor(private readonly rows: SealedEntityStorage<unknown>) {}

	/** Whether a new connection from `origin` may skip the connect window. Read under the lock every
	 *  writer holds, so a refusal recorded before this call is seen by it. */
	public allows(profileId: string, origin: string): Promise<boolean> {
		return this.lock.withLock(async () => {
			const policy = await this.read(profileId)
			return policy !== undefined && !policy.checkRefused.includes(origin)
		})
	}

	public isOn(profileId: string): Promise<boolean> {
		return this.lock.withLock(async () => (await this.read(profileId)) !== undefined)
	}

	/** On keeps the refusals already recorded; off deletes the row, refusals included. `assertLive`
	 *  runs under the lock `purgeProfile` takes, so a call it refuses cannot write after the purge. */
	public set(profileId: string, on: boolean, assertLive: () => void): Promise<void> {
		return this.lock.withLock(async () => {
			assertLive()
			if (!on) return this.rows.delete(profileId)
			if (await this.read(profileId)) return
			await this.rows.set(profileId, { everySite: true, checkRefused: [] } satisfies StoredDiscoveryPolicy)
		})
	}

	/** Records that the emoji check refused `origin`, newest last, only while the switch is on. */
	public recordCheckRefusal(profileId: string, origin: string, assertLive: () => void): Promise<void> {
		return this.lock.withLock(async () => {
			assertLive()
			const policy = await this.read(profileId)
			if (!policy) return
			const checkRefused = [...policy.checkRefused.filter((refused) => refused !== origin), origin].slice(-CHECK_REFUSALS_KEPT)
			await this.rows.set(profileId, { everySite: true, checkRefused } satisfies StoredDiscoveryPolicy)
		})
	}

	public purgeProfile(profileId: string): Promise<void> {
		return this.lock.withLock(() => this.rows.delete(profileId))
	}

	/** A plaintext row, a row that does not open or parse, and a read with no row keys are off; a
	 *  failed storage read propagates. */
	private async read(profileId: string): Promise<StoredDiscoveryPolicy | undefined> {
		const stored = await this.rows.readStorageId(profileId)
		return stored?.located.sealed ? decodeDiscoveryPolicy(stored.row) : undefined
	}
}
