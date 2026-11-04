import { unreadRows as storedRowProblems } from "@/wallet/storage/stored-shapes/reads"

export { shapeOfKey } from "@/wallet/storage/stored-shapes/reads"

/** What a launch's fixtures write for an armed build; no shipped code reads them. */
export const FIXTURE_PREFIX = "nulo:e2e:"

/** {@link storedRowProblems} over a whole `chrome.storage.local`, the launch's fixture keys aside. */
export const unreadRows = (entries: Record<string, unknown>, now = Date.now()): Promise<string[]> =>
	storedRowProblems(Object.fromEntries(Object.entries(entries).filter(([key]) => !key.startsWith(FIXTURE_PREFIX))), now)

/** Each row of `root` that `entries` stores as a string, parsed: a plaintext release's rows as written. */
export const storedRows = (entries: Record<string, unknown>, root: string): Record<string, unknown>[] =>
	Object.entries(entries)
		.filter(([key, raw]) => key.startsWith(`${root}@`) && typeof raw === "string")
		.map(([, raw]) => JSON.parse(raw as string) as Record<string, unknown>)
