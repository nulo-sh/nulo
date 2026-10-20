import { z } from "zod"
import type { StorageArea } from "@nulo/wallet-core/ports"
import { decodeRow, type RawRowState } from "@/wallet/utils/raw-row"
import type { DefaultSeed } from "./seeds"
import { type ChainKind, ChainKindSchema } from "./spec"

/** Per-profile raw `storage.local` root (`<root>@<profileId>`): the default seeds a profile has been
 *  offered, by kind. Never in a backup slice: a restored profile is seeded afresh. */
export const SEED_OFFERS_ROOT = "nulo:core:network-seeded"

export const seedOffersKey = (profileId: string) => `${SEED_OFFERS_ROOT}@${profileId}`

export const SeedOffersSchema = z.object({ offered: z.array(ChainKindSchema) })
export type SeedOffers = z.infer<typeof SeedOffersSchema>

/**
 * What every build before this record seeded, so what a profile with rows and no record was
 * offered. Never edited: a kind added here is withheld from every profile made before the record.
 */
export const KINDS_SEEDED_BEFORE_RECORD: readonly ChainKind[] = ["testnet", "local"]

/** The stored record; one that exists and does not decode is `corrupt`, never `absent`. */
export async function readSeedOffers(storage: StorageArea, profileId: string): Promise<RawRowState<SeedOffers>> {
	const key = seedOffersKey(profileId)
	const res = await storage.get(key)
	return decodeRow(SeedOffersSchema, res[key])
}

export async function writeSeedOffers(storage: StorageArea, profileId: string, offered: ChainKind[]): Promise<void> {
	await storage.set({ [seedOffersKey(profileId)]: JSON.stringify({ offered } satisfies SeedOffers) })
}

/**
 * The seeds to add to a profile and the kinds to record as offered, or `null` while its record is
 * corrupt: guessing would re-add a network the person deleted. A seed is held, so recorded and not
 * added, by a row of its kind (a reset moves a seeded row's chain, never its kind) or by any row on
 * its chain (one row per chain keeps a moved chain classifiable). An empty profile is offered every
 * seed whatever its record says: the wallet needs a network.
 */
export function seedsToOffer(
	seeds: readonly DefaultSeed[],
	record: RawRowState<SeedOffers>,
	rows: readonly { kind?: ChainKind; chainId: number }[],
): { add: DefaultSeed[]; offered: ChainKind[] } | null {
	if (rows.length > 0 && record.kind === "corrupt") return null
	const prior = rows.length === 0 ? [] : record.kind === "valid" ? record.value.offered : KINDS_SEEDED_BEFORE_RECORD
	const offered = new Set(prior)
	const add: DefaultSeed[] = []
	for (const seed of seeds) {
		if (offered.has(seed.kind)) continue
		if (rows.some((row) => row.kind === seed.kind || row.chainId === seed.chainId)) offered.add(seed.kind)
		else add.push(seed)
	}
	return { add, offered: [...offered].sort() }
}
