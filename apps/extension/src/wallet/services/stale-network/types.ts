import { z } from "zod"

/** Raw `storage.local` roots, one key per profile (`<root>@<profileId>`). None is in any backup
 *  slice: each describes this device's storage against this build, never a portable fact. */
export const STALE_NETWORKS_ROOT = "nulo:core:stale-networks"
export const NETWORK_RESET_ROOT = "nulo:core:network-reset"
export const NETWORK_RESET_DONE_ROOT = "nulo:core:network-reset-done"

export const StaleEntrySchema = z.object({
	networkId: z.string(),
	chainId: z.number(),
	/** The row's seeded identity is behind the build's seed for its kind. */
	networkReset: z.boolean(),
	/** Every account address on the chain moves under this build. */
	addressesMoved: z.boolean(),
})
export type StaleEntry = z.infer<typeof StaleEntrySchema>

/** The classifier's verdict for one profile. Replaced whole by a full classification, which writes
 *  it only while the account set still has `accountSetDigest`; a runtime verdict merges one entry. */
export const StaleNetworksRecordSchema = z.object({
	profileId: z.string(),
	accountSetDigest: z.string(),
	entries: z.array(StaleEntrySchema),
})
export type StaleNetworksRecord = z.infer<typeof StaleNetworksRecordSchema>

export const ResetCauseSchema = z.object({ networkReset: z.boolean(), addressesMoved: z.boolean() })
export type ResetCause = z.infer<typeof ResetCauseSchema>

export const ProbedEndpointSchema = z.object({ id: z.string(), url: z.string() })
export type ProbedEndpoint = z.infer<typeof ProbedEndpointSchema>

export const JournalAccountSchema = z.object({
	type: z.union([z.literal(0), z.literal(1)]),
	index: z.number().int().nonnegative(),
	name: z.string(),
	visible: z.boolean(),
	oldAddress: z.string(),
	/** Imported accounts only: the address the resealed key derives, and that key sealed under
	 *  `(toChainId, newAddress)`. */
	newAddress: z.string().optional(),
	encryptedSigningKey: z.string().optional(),
	done: z.boolean(),
})
export type JournalAccount = z.infer<typeof JournalAccountSchema>

/**
 * One in-place reset, captured before anything is deleted. After the purge it is the only copy of
 * the account list and the resealed imported keys. Trusted for screens only: the run re-checks
 * every target against the build's seeds and the network row, and every key against the DEK.
 */
export const ResetJournalSchema = z.object({
	profileId: z.string(),
	networkId: z.string(),
	fromChainId: z.number(),
	toChainId: z.number(),
	/** Verified at capture: the seed's L1 for a seeded kind, a live probe for a custom row. */
	l1ChainId: z.number().int().nonnegative().max(0xffffffff),
	cause: ResetCauseSchema,
	purged: z.boolean(),
	switchToSeedNode: z.boolean(),
	probedEndpoint: ProbedEndpointSchema.nullable(),
	accounts: z.array(JournalAccountSchema),
})
export type ResetJournal = z.infer<typeof ResetJournalSchema>

/** A finished reset no popup has announced yet. */
export const ResetNoticeSchema = z.object({ networkId: z.string(), addressesMoved: z.boolean() })
export type ResetNotice = z.infer<typeof ResetNoticeSchema>
