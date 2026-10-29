import type { Page } from "puppeteer"
import { PROOF_GATE_KEY, SAFETY_TIMEOUT_MS } from "@/e2e/chrome-storage-proof-gate"
import { readSendRecords } from "./journal"
import { pollUntil } from "./poll"

/** How long after a send's `enteredProveAt` its held gate still certainly holds: the gate starts its
 *  own release timer later than that stamp, and the margin covers polling and clock reads. */
export const PROOF_GATE_HOLD_MS = SAFETY_TIMEOUT_MS - 2_000

/**
 * Drive the proverless proof gate from an e2e test.
 *
 * Only meaningful against a PROVERLESS build (`NULO_E2E_PROVERLESS=1`), where
 * the offscreen `ChromeStorageProofGate` watches {@link PROOF_GATE_KEY} in
 * `chrome.storage.session`. The key literal is imported from the source so
 * the two halves of the contract can never drift.
 *
 * The gate holds inside the SW `ExecutionCoordinator.proveTxTask` — after the
 * coordinator has journaled `proving`, immediately before `pxe.proveTx` — so
 * "held" means the transaction is deterministically parked in its proving
 * stage. Use it to snapshot ordering / cancel behaviour, then release.
 *
 * Pass any extension-context page (popup, SW); `chrome.storage` is shared
 * across extension contexts, so a write from the popup is seen by the SW
 * coordinator's gate listener.
 */
export async function holdProofGate(extensionPage: Page): Promise<void> {
	await extensionPage.evaluate((key) => chrome.storage.session.set({ [key]: { held: true } }), PROOF_GATE_KEY)
}

/** Release a held gate; the SW coordinator's gate listener resolves `proveTx`. */
export async function releaseProofGate(extensionPage: Page): Promise<void> {
	await extensionPage.evaluate((key) => chrome.storage.session.remove(key), PROOF_GATE_KEY)
}

/**
 * An execute window opened while a dApp send is held at `proving` cannot be approved: for `windowMs`
 * its Confirm stays off and its fee row reads queued (`feeRow`), while the journal holds the first
 * send at `proving` and the second request at the `queued` it was recorded at on arrival. Every read
 * falls before `PROOF_GATE_HOLD_MS` past the held send's `enteredProveAt`: later, the gate may have
 * released itself, and the reads would prove nothing.
 */
export async function expectWindowHeldBehindProof(wallet: Page, execute: Page, opts: { windowMs: number; feeRow: boolean }): Promise<void> {
	const pair = async () => {
		const sends = (await readSendRecords(wallet)).filter((r) => r.kind === "dapp_execute")
		const held = sends.find((r) => r.stage === "proving")
		const waiting = sends.find((r) => r.stage === "queued")
		return { sends, held: sends.length === 2 && held && waiting ? held : undefined }
	}
	const { held } = await pollUntil(pair, (read) => read.held !== undefined, {
		label: "one dApp send held at proving, the other queued",
		timeoutMs: 60_000,
		intervalMs: 250,
	})
	const gateHoldsUntil = (held?.enteredProveAt ?? Number.NaN) + PROOF_GATE_HOLD_MS
	const readWindow = () =>
		execute.evaluate(() => {
			const confirm = document.querySelector<HTMLButtonElement>('[data-testid="execute-confirm-btn"]')
			return {
				confirmOff: !confirm || confirm.disabled || getComputedStyle(confirm).pointerEvents === "none",
				queued: document.querySelector('[data-testid="fee-estimate-queued"]') !== null,
			}
		})
	if (opts.feeRow) {
		await pollUntil(readWindow, (view) => view.queued, {
			label: "the window's fee row reading queued",
			timeoutMs: 10_000,
			intervalMs: 250,
		})
	}
	const observeUntil = Date.now() + opts.windowMs
	for (;;) {
		const view = await readWindow()
		const read = await pair()
		const readAt = Date.now()
		if (readAt > gateHoldsUntil) throw new Error("a read fell after the held send's gate may have released itself")
		if (!view.confirmOff || (opts.feeRow && !view.queued) || read.held?.id !== held?.id) {
			throw new Error(`the window must wait behind the held send: ${JSON.stringify({ view, sends: read.sends })}`)
		}
		if (readAt >= observeUntil) return
		await new Promise((resolve) => setTimeout(resolve, 250))
	}
}
