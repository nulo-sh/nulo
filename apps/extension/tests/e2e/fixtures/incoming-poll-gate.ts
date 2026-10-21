import type { Page } from "puppeteer"
import { ensureUnlocked, lockWallet } from "./auth"
import { TEST_PASSWORD } from "./constants"
import { waitForHash } from "./dom"
import { pollUntil } from "./poll"
import { INCOMING_POLL_HOLD_KEY, INCOMING_POLL_STATUS_KEY, type IncomingPollPhase } from "@/e2e/chrome-storage-incoming-poll-gate"

/**
 * Drive the bidirectional incoming-poll gate from an e2e test. Only meaningful
 * against a PROVERLESS build, where the SW `IncomingTransferService` holds a
 * scan mid-flight. Key literals are imported from source so the two halves of
 * the contract can't drift. `chrome.storage` is shared across extension
 * contexts, so a write from any extension page reaches the SW gate.
 */
export type IncomingPollArm = {
	profileId: string
	networkId: string
	accountAddress: string
	contract: string
	txHash: string
}

export type IncomingPollStatus = { phase: IncomingPollPhase; txHash: string }

/** Arm the gate: the next scan of `(profile, network, account, contract)` that
 *  discovers a note carrying `txHash` parks after discovery, before commit. */
export async function holdIncomingPoll(extensionPage: Page, arm: IncomingPollArm): Promise<void> {
	await extensionPage.evaluate((key, value) => chrome.storage.session.set({ [key]: value }), INCOMING_POLL_HOLD_KEY, arm)
}

/** Arms the hold for `deliver`'s tx hash while the wallet is locked, which runs no incoming
 *  scheduler, so no tick can commit the note first; the unlock's own scan is the first that can find
 *  it. Returns once Home shows; a failure leaves the file's shared wallet unlocked with no hold armed. */
export async function deliverWhileLocked(
	page: Page,
	arm: Omit<IncomingPollArm, "txHash">,
	deliver: () => Promise<string>,
	password = TEST_PASSWORD,
): Promise<string> {
	await lockWallet(page)
	let armed = false
	try {
		const txHash = await deliver()
		await holdIncomingPoll(page, { ...arm, txHash })
		armed = true
		await ensureUnlocked(page, password)
		await waitForHash(page, "#/popup/general", 60_000)
		return txHash
	} catch (error) {
		if (armed) await releaseIncomingPoll(page).catch(() => undefined)
		await ensureUnlocked(page, password).catch(() => undefined)
		throw error
	}
}

/** Release a parked scan; the SW proceeds into the locked commit. */
export async function releaseIncomingPoll(extensionPage: Page): Promise<void> {
	await extensionPage.evaluate((key) => chrome.storage.session.remove(key), INCOMING_POLL_HOLD_KEY)
}

/** Read the SW-published gate status (or null before the first transition). */
export async function readIncomingPollStatus(extensionPage: Page): Promise<IncomingPollStatus | null> {
	return extensionPage.evaluate(async (key) => {
		const rec = await chrome.storage.session.get(key)
		return (rec[key] as IncomingPollStatus | undefined) ?? null
	}, INCOMING_POLL_STATUS_KEY)
}

/** Poll until the gate reports `phase` for `txHash`, or throw on timeout. */
export async function waitForIncomingPollPhase(
	extensionPage: Page,
	phase: IncomingPollPhase,
	txHash: string,
	timeoutMs = 20_000,
): Promise<void> {
	await pollUntil(
		() => readIncomingPollStatus(extensionPage),
		(status) => status?.phase === phase && status.txHash === txHash,
		{ label: `incoming-poll gate at "${phase}" for ${txHash}`, timeoutMs, intervalMs: 150 },
	)
}
