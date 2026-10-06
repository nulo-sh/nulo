/**
 * A switch to another profile while a popup Send is still proving cancels that send, and the other
 * profile never inherits it.
 *
 * Profile B is created, and profile A unlocked again, before the send starts: creating a profile
 * takes longer than the proof gate can hold. With A's transfer parked at `proving`, the user locks
 * through the dialog, picks B on the lock screen and unlocks it; only then is the gate released.
 * Back on A, the record is `cancelled` and the feed holds no transaction, and B has no send at all.
 *
 * A deliberate departure from `account-switch-live-session`, where the send finishes: an account
 * switch keeps the session that approved the send, and a profile switch ends it.
 *
 * @requires-proverless — the proof gate exists only in a proverless build; the agent runner refuses
 * this file without `NULO_E2E_PROVERLESS=1`. Run it with `NULO_E2E_RETRY=0`: it spends on-chain and
 * PXE state that a retry would find half-consumed.
 */
import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import type { AztecTestConfig } from "../fixtures/aztec"
import { TEST_PASSWORD } from "../fixtures/constants"
import { openPopup, test, waitForHash } from "../fixtures/extension"
import {
	createAndActivateProfile,
	lockThroughConfirmDialog,
	lockWallet,
	readSessionRow,
	refreshBalances,
	sendTransfer,
	unlockProfile,
} from "../fixtures/helpers"
import { type SendRecordView, readSendRecords, waitForSendRecord } from "../fixtures/journal"
import { PROOF_GATE_HOLD_MS, holdProofGate, releaseProofGate } from "../fixtures/proof-gate"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

const PROFILE_B_PASSWORD = "SecondProfilePw123!"

/** The send records, for a timeout raised while the picker refuses a switch. */
const sends = (page: Page) => async () => `sends: ${JSON.stringify(await readSendRecords(page).catch(() => []))}`

test.skipIf(!hasConfig)(
	"profile-switch-sweeps-transfer — locking and unlocking another profile cancels a proving transfer",
	{ timeout: 360_000, retry: 0 },
	async ({ tokenReadyExtension }) => {
		const config = aztecConfig as AztecTestConfig
		const page = await openPopup(tokenReadyExtension)
		await waitForHash(page, "#/popup/general", 15_000)
		const profileA = (await readSessionRow(page))?.profile ?? ""
		expect(profileA).not.toBe("")

		const profileB = await createAndActivateProfile(page, "Profile B", PROFILE_B_PASSWORD)
		await lockWallet(page)
		await unlockProfile(page, profileA, TEST_PASSWORD, sends(page))
		await refreshBalances(page)

		await holdProofGate(page)
		// Settles true only on the "submitted" toast, which needs a broadcast.
		const submitted = sendTransfer(page, {
			fromType: "public",
			toType: "public",
			amount: "1",
			destination: config.minterAddress,
			expect: "send",
		}).then(
			() => true,
			() => false,
		)
		let send: SendRecordView
		try {
			send = await waitForSendRecord(page, (r) => r.kind === "transfer" && r.stage === "proving", 180_000)
			expect(send.profileId).toBe(profileA)
			expect(await lockThroughConfirmDialog(page)).toMatchObject({
				description: "1 transaction is still running. Locking cancels it.",
			})
			await waitForSendRecord(page, (r) => r.id === send.id && r.stage === "cancelled", 30_000)
			// The same popup, on purpose: the lock's cancel never reaches a locked popup, so a picker
			// that still trusted the rows cached before the lock would refuse this pick.
			await unlockProfile(page, profileB, PROFILE_B_PASSWORD, sends(page))
			const gateHoldsUntil = (send.enteredProveAt ?? Number.NaN) + PROOF_GATE_HOLD_MS
			expect(Date.now(), "B must be unlocked while the proof gate still holds A's send").toBeLessThan(gateHoldsUntil)
		} finally {
			await releaseProofGate(page)
		}

		// Switching back takes far longer than a released proverless proof needs to reach the network.
		await lockWallet(page)
		await unlockProfile(page, profileA, TEST_PASSWORD, sends(page))
		const records = await readSendRecords(page)
		expect(records.find((r) => r.id === send.id)?.stage).toBe("cancelled")
		expect(records.filter((r) => r.profileId === profileB)).toEqual([])
		await page.waitForSelector('[data-testid="tx-terminal-card"]', { visible: true, timeout: 30_000 })
		expect(await page.evaluate(() => document.querySelectorAll('[data-testid="tx-card"]').length)).toBe(0)
		expect(await submitted, "the Send flow must never report the transfer as submitted").toBe(false)
	},
)
