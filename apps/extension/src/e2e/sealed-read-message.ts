import type { SealedStoreName } from "@/wallet/storage/stores"

/** The message a spec sends the background to read a sealed root (`./sealed-read.ts`); the release
 *  workflow greps release bundles for it. */
export const SEALED_READ_MESSAGE = "nulo:e2e:sealed-read"

export type SealedReadRequest = {
	type: typeof SEALED_READ_MESSAGE
	root: SealedStoreName
	/** Stored values to read instead of the root's rows in storage, keyed as stored: a value a spec
	 *  captured from a change event. */
	stored?: Record<string, unknown>
}

/** One readable row: where it is stored, the id it answers to, whose it is and whether it is sealed. */
export type SealedReadRow<T = unknown> = {
	storageKey: string
	naturalId: string
	profileId: string | undefined
	sealed: boolean
	row: T
}
