import { z } from "zod"
import type { StorageArea } from "@nulo/wallet-core/ports"
import { decodeRow, type RawRowState } from "@/wallet/utils/raw-row"
import type { DefaultSeed } from "./seeds"
import { type ChainKind, ChainKindSchema } from "./spec"

/** Per-profile raw `storage.local` root (`<root>@<profileId>`): the default seeds a profile has been
 *  offered, by kind, and the ones added to it after it had networks whose arrival the person has not
 *  answered yet. Never in a backup slice: a restored profile is seeded afresh. */
export const SEED_OFFERS_ROOT = "nulo:core:network-seeded"

export const seedOffersKey = (profileId: string) => `${SEED_OFFERS_ROOT}@${profileId}`

export const SeedOffersSchema = z.object({ offered: z.array(ChainKindSchema), announce: z.array(ChainKindSchema).optional() })
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

/** Sorted and deduplicated, with no `announce` key while it names nothing. */
export function normalizeSeedOffers({ offered, announce }: SeedOffers): SeedOffers {
	const sorted = (list: readonly ChainKind[]) => [...new Set(list)].sort()
	return announce?.length ? { offered: sorted(offered), announce: sorted(announce) } : { offered: sorted(offered) }
}

export function sameSeedOffers(a: SeedOffers, b: SeedOffers): boolean {
	return JSON.stringify(normalizeSeedOffers(a)) === JSON.stringify(normalizeSeedOffers(b))
}

export async function writeSeedOffers(storage: StorageArea, profileId: string, record: SeedOffers): Promise<void> {
	await storage.set({ [seedOffersKey(profileId)]: JSON.stringify(normalizeSeedOffers(record)) })
}

/**
 * The seeds to add to a profile and the kinds to record as offered, or `null` while its record is
 * corrupt: guessing would re-add a network the person deleted. A seed is held, so recorded and not
 * added, by a row of its kind (a reset moves a seeded row's chain, never its kind) or by any row on
 * its chain (one row per chain keeps a moved chain classifiable). An empty profile is offered every
 * seed whatever its record says: the wallet needs a network.
 *
 * `announce`, on a profile that had networks, keeps the record's and adds every seed in `add` (the
 * caller keeps only those it wrote) and every one a row of its kind holds: only a seeding pass
 * writes a seeded kind, so that row is an interrupted pass's. A custom row on the chain is the
 * person's own network and announces nothing.
 */
export function seedsToOffer(
	seeds: readonly DefaultSeed[],
	record: RawRowState<SeedOffers>,
	rows: readonly { kind?: ChainKind; chainId: number }[],
): { add: DefaultSeed[]; offered: ChainKind[]; announce: ChainKind[] } | null {
	if (rows.length === 0) return { add: [...seeds], offered: [], announce: [] }
	if (record.kind === "corrupt") return null
	const offered = new Set(record.kind === "valid" ? record.value.offered : KINDS_SEEDED_BEFORE_RECORD)
	const announce = new Set(record.kind === "valid" ? (record.value.announce ?? []) : [])
	const add: DefaultSeed[] = []
	for (const seed of seeds) {
		if (offered.has(seed.kind)) continue
		if (rows.some((row) => row.kind === seed.kind)) {
			offered.add(seed.kind)
			announce.add(seed.kind)
		} else if (rows.some((row) => row.chainId === seed.chainId)) offered.add(seed.kind)
		else {
			add.push(seed)
			announce.add(seed.kind)
		}
	}
	return { add, offered: [...offered].sort(), announce: [...announce].sort() }
}
