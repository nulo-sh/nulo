/**
 * Every key family the build stores is sealed at rest or stands on the reviewed plaintext list
 * below, with the reason it may be read without a row key. The registry claims every `nulo:` key
 * the build writes (`stored-shapes.scan.test.ts`), so a root a later change adds fails here until
 * it is sealed or reviewed. A new entry here is a privacy decision: SECURITY.md § Storage privacy
 * names what stays readable.
 */
import { describe, expect, test } from "vitest"
import { STORED_SHAPES, type StoredShapeName } from "./stored-shapes"
import { SEALED_ROOTS } from "./stores"

const KL_12 = "a structured popup preference the stored-shape guard lets no migration move: known limit #1062"
const ENGINE = "the migration engine's own state, read before any unlock"
const UI_FLAG = "a per-profile flag of the popup, no content"

const PLAINTEXT: Partial<Record<StoredShapeName, string>> = {
	profiles: "the row keys' source; the picker and lock screen show the name",
	profileTombstones: "reserves the id and resumes a deletion before unlock; names addresses and token ids only while it runs",
	restorePending: "the torn-restore gate runs before unlock: a profile id, a generation and a time",
	accountIntegrityBlocked: "read before unlock by the integrity barrier; names addresses only while a block stands",
	accountIntegrityVerified: "the account set's digest under the profile's keyed hash: no address",
	staleNetworks: "read before unlock and from change events: network and chain ids, and a keyed digest",
	networkReset: "the reset journal, read from change events: names accounts and a probed endpoint only while a reset runs",
	networkResetDone: "a finished reset's notice: a network id and a flag",
	networkSeeded: "which of the build's default network kinds the profile was offered: build constants",
	config: "device-wide settings the boot reads before any unlock",
	tokenPrices: "device-wide prices of listed tokens: public data",
	tokenList: "the signed public token list",
	activeNetwork: "a random network id, meaningless without its sealed row, read by the pre-unlock gates",
	legalAccepted: "device-wide terms acceptance, read before unlock and never in a backup",
	uiActiveAccount: KL_12,
	uiLastActiveProfile: "the profile id the lock screen opens on",
	uiLoggerWindowId: "the log viewer's window id",
	onboardingCompleted: "a device-wide flag",
	uiPinnedTokens: KL_12,
	uiFeePicks: KL_12,
	uiSendFeePicks: KL_12,
	uiRestoreOutcome: "how a restore ended: a run token, the backup's checksum and network ids",
	uiGetStartedPhraseSaved: UI_FLAG,
	uiGetStartedBackupSaved: UI_FLAG,
	uiGetStartedAztecOpened: UI_FLAG,
	uiGetStartedHidden: UI_FLAG,
	uiGetStartedFeeJuiceHeld: UI_FLAG,
	uiGetStartedPrestoOpened: UI_FLAG,
	uiProfileImported: UI_FLAG,
	uiProfileNotFirst: UI_FLAG,
	schemaVersion: ENGINE,
	schemaRunning: ENGINE,
	schemaBackup: ENGINE,
	schemaAttempts: ENGINE,
	schemaBlocked: ENGINE,
	schemaDegraded: ENGINE,
	schemaRetryRequested: ENGINE,
	legacyStorageVersion: ENGINE,
}

const names = Object.keys(STORED_SHAPES) as StoredShapeName[]
const isSealed = (name: StoredShapeName) => (STORED_SHAPES[name] as { sealed?: true }).sealed === true

describe("the root census", () => {
	test("every registered key family is sealed or on the reviewed plaintext list, never both", () => {
		expect(names.filter((name) => !isSealed(name) && PLAINTEXT[name] === undefined)).toEqual([])
		expect(names.filter((name) => isSealed(name) && PLAINTEXT[name] !== undefined)).toEqual([])
	})

	test("the reviewed list names only registered families, and the sealed roots are the sealed families", () => {
		expect(Object.keys(PLAINTEXT).filter((name) => !(name in STORED_SHAPES))).toEqual([])
		const sealedRoots = names.filter(isSealed).map((name) => {
			const { ref } = STORED_SHAPES[name]
			return ref.kind === "root" ? ref.root : ref.key
		})
		expect([...sealedRoots].sort()).toEqual([...SEALED_ROOTS].sort())
	})
})
