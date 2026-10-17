/**
 * Home's "Get started" card: which reminders a profile still shows. The flags record what the
 * person did or dismissed, never proof of a backup; they live per profile beside the other UI keys
 * (`profile-ui-keys.ts`), so a deletion or a row commit clears them and no backup carries them.
 */
import { getStartedAztecOpenedKey, getStartedBackupSavedKey, getStartedHiddenKey, getStartedPhraseSavedKey } from "@/utils/profile-ui-keys"
import { storageLocalGet, storageLocalSet } from "@/utils/storage"

/** The slice of a gas balance read the reminders need (`stores/balances.store.ts`' `GasSlice`). */
type GasRead = { display?: { publicFeeJuice: string | null; privateFeeJuice: string | null }; status: string }

export type GetStartedFlag = "phraseSaved" | "backupSaved" | "aztecOpened" | "hidden"

export type GetStartedFlags = Readonly<Record<GetStartedFlag, boolean>>

const KEYS: Readonly<Record<GetStartedFlag, (profileId: string) => string>> = {
	phraseSaved: getStartedPhraseSavedKey,
	backupSaved: getStartedBackupSavedKey,
	aztecOpened: getStartedAztecOpenedKey,
	hidden: getStartedHiddenKey,
}

const FLAGS = Object.keys(KEYS) as GetStartedFlag[]

/** The storage keys of `profileId`'s flags, for a reader that listens for their changes. */
export const getStartedKeys = (profileId: string): string[] => FLAGS.map((flag) => KEYS[flag](profileId))

/** A flag counts only when stored as `true`: anything else in storage reads as not done. */
export async function readGetStarted(profileId: string): Promise<GetStartedFlags> {
	const stored = await storageLocalGet(getStartedKeys(profileId))
	return Object.fromEntries(FLAGS.map((flag) => [flag, stored[KEYS[flag](profileId)] === true])) as Record<GetStartedFlag, boolean>
}

/** Records a flag. Never rejects: a lost write leaves the reminder up, and the action it rides on
 *  (a link, a download, leaving the phrase step) must go ahead. */
export async function markGetStarted(profileId: string, flag: GetStartedFlag): Promise<void> {
	try {
		await storageLocalSet({ [KEYS[flag](profileId)]: true })
	} catch (error) {
		console.debug("get-started flag write failed", { error })
	}
}

/** Opens the landing's "How it works" section until nulo.sh has the page with the clips. */
export const HOW_AZTEC_WORKS_URL = "https://nulo.sh/#see"

/** What a balance read says about holding funds: `unknown` until it settles. */
export type Holdings = "some" | "none" | "unknown"

export type GetStartedItem = "phrase" | "backup" | "aztec" | "feeJuice" | "presto"

export interface GetStartedInput {
	type: "password" | "passkey" | undefined
	/** `undefined` until the active profile's flags are read. */
	flags: GetStartedFlags | undefined
	/** Tokens or Fee Juice on the selected account. */
	funds: Holdings
	feeJuice: Holdings
	/** `undefined` until the config is read. */
	prestoReached: boolean | undefined
}

export interface GetStartedView {
	/** The urgent "Your funds have no backup" banner above the balance. */
	banner: boolean
	/** In the drawn order; empty means no card. */
	items: GetStartedItem[]
	/** Whether the card offers Hide: only items a person may dismiss count. */
	canHide: boolean
}

/** Combines the token and Fee Juice reads: any positive side holds funds. */
export function combineHoldings(a: Holdings, b: Holdings): Holdings {
	if (a === "some" || b === "some") return "some"
	if (a === "unknown" || b === "unknown") return "unknown"
	return "none"
}

/** A password wallet's phrase reminder cannot be hidden; it moves to the banner once funded. */
const phraseShown = (i: Ready) => i.type === "password" && !i.flags.phraseSaved
const backupShown = (i: Ready) => i.type === "passkey" && !i.flags.backupSaved && !i.flags.hidden
const aztecShown = (i: Ready) => !i.flags.aztecOpened && !i.flags.hidden
const feeJuiceShown = (i: Ready) => i.feeJuice === "none" && !i.flags.hidden
const prestoShown = (i: Ready) => !i.prestoReached && !i.flags.hidden

type Ready = GetStartedInput & { type: "password" | "passkey"; flags: GetStartedFlags; prestoReached: boolean }

/**
 * Home's reminders for the active profile, or `null` while anything they depend on is unread:
 * a loading balance never moves the reminder, and an old profile's flags never show for a new one.
 */
export function getStartedView(input: GetStartedInput): GetStartedView | null {
	const { type, flags, prestoReached, funds } = input
	if (type === undefined || flags === undefined || prestoReached === undefined || funds === "unknown") return null
	const ready: Ready = { ...input, type, flags, prestoReached }
	const phrase = phraseShown(ready)
	const banner = phrase && funds === "some"
	const items: GetStartedItem[] = []
	if (phrase && !banner) items.push("phrase")
	if (backupShown(ready)) items.push("backup")
	if (aztecShown(ready)) items.push("aztec")
	if (feeJuiceShown(ready)) items.push("feeJuice")
	if (prestoShown(ready)) items.push("presto")
	return { banner, items, canHide: items.some((item) => item !== "phrase") }
}

/** Fee Juice from the gas slice: a failed first read claims nothing held, so the calm row shows. */
export function gasHoldings(gas: GasRead | undefined): Holdings {
	const display = gas?.display
	if (display === undefined) return gas?.status === "degraded" ? "none" : "unknown"
	return [display.publicFeeJuice, display.privateFeeJuice].some(isPositive) ? "some" : "none"
}

function isPositive(raw: string | null | undefined): boolean {
	if (typeof raw !== "string") return false
	try {
		return BigInt(raw) > 0n
	} catch {
		return false
	}
}
