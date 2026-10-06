import type { ProjectionGate } from "./projection-gate"
import { waitForStorageRelease } from "./storage-gate"

/**
 * Storage key of the projection gate, imported by the e2e fixture. The `_build-extension.yml`
 * negative grep asserts it is absent from production builds.
 */
export const PROJECTION_GATE_KEY = "nulo:e2e:projection-hold"

/** Outlasts the scan window a test holds through, so only a test that never releases meets it. */
export const PROJECTION_GATE_TIMEOUT_MS = 180_000

type GateRecord = { account?: unknown; held?: boolean }

const matches = (rec: GateRecord | undefined, account: string): boolean =>
	typeof rec?.account === "string" && rec.account.toLowerCase() === account.toLowerCase()

/**
 * Lives in the service worker; constructed only inside the statically-false `if (E2E_PROVERLESS)`
 * branch in `wallet/runtime.ts`, so production builds tree-shake it and its key.
 */
export class ChromeStorageProjectionGate implements ProjectionGate {
	public async waitIfArmed(account: string): Promise<void> {
		const rec = await this.read()
		if (!matches(rec, account)) return
		if (!rec?.held) await chrome.storage.session.set({ [PROJECTION_GATE_KEY]: { account, held: true } })
		let timedOut = false
		await waitForStorageRelease({
			key: PROJECTION_GATE_KEY,
			stillHeld: async () => matches(await this.read(), account),
			timeoutMs: PROJECTION_GATE_TIMEOUT_MS,
			onTimeout: () => {
				timedOut = true
			},
		})
		// Failing the projection, not releasing it: a late registration would let a fix that only
		// refuses pass a test that outlived its hold.
		if (timedOut) throw new Error(`[e2e-projection-gate] hold not released within ${PROJECTION_GATE_TIMEOUT_MS}ms`)
	}

	private async read(): Promise<GateRecord | undefined> {
		const rec = await chrome.storage.session.get(PROJECTION_GATE_KEY)
		return rec[PROJECTION_GATE_KEY] as GateRecord | undefined
	}
}
