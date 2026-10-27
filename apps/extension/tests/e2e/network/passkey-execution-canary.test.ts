/**
 * Passkey execution canary — the passkey analog of `frozen-account-canary.test.ts`.
 *
 * The address KAT pins the accounts a recovery phrase derives, which is where a passkey profile's
 * master comes from; it says nothing about executability. This file asserts a passkey-registered
 * wallet operates end-to-end against a live node, EXECUTION-ONLY by design (PRF outputs cannot be
 * read back via CDP, so the test cannot open the sealed master itself):
 *
 *   1. Register a passkey profile via the in-page (path A) ceremony against a virtual
 *      authenticator, create a second account, connect the playground, grant the transaction
 *      bundle to both accounts.
 *   2. A's FIRST tx executes the frozen ctor via the multicall deploy path — simulate, REAL
 *      proof, node acceptance (mined).
 *   3. An authwit-CONSUMING tx as the named caller B (B's first tx — its own ctor) lands.
 *   4. A background restart later, the profile re-unlocks via a FRESH WebAuthn ceremony (passkey
 *      sessions are never silently restored), and the account the passkey opened again still
 *      signs, proves, and lands a tx.
 *
 * Credential scope (load-bearing): the virtual authenticator — and therefore the credential and
 * its PRF seed — is scoped by the browser. On Chrome it belongs to the anchor popup page's
 * FrameTreeNode, so that popup stays OPEN across the restart: closing it garbage-collects the
 * credential and makes the post-restart unlock impossible. On Firefox it belongs to the session
 * and the credential outlives the window that made it — while the background cannot be ended under
 * an open extension page — so there the anchor popup closes before the kill and a fresh popup hosts
 * the ceremony. Which applies is the driver's `credentialOutlivesPage`, never a browser test here.
 * No browser-relaunch leg, ever: credentials die with the browser instance.
 *
 * Every stage asserts an exact outcome — no ok-or-error tolerances. Run prover-ON, on Chrome and
 * on Firefox: `bun run e2e:agent tests/e2e/network/passkey-execution-canary.test.ts`.
 */
import { describe, expect, inject } from "vitest"
import { credentialOutlivesPage, stopBackgroundIfAlive } from "../fixtures/browser"
import { mintPublicTokensForAccount, waitForTxMined, type AztecTestConfig } from "../fixtures/aztec"
import { clickByTestId, connectPlayground, grantCapBundle, openPopup, test, waitForHash } from "../fixtures/extension"
import { createAccount, readLivenessBaseline, switchToLocalNetwork, waitForWorkerLiveness } from "../fixtures/helpers"
import { registerPasskeyProfile, setupPasskeyVirtualAuth } from "../fixtures/passkey"
import { selectPgAccount, setPgInputs, txHashOf } from "../fixtures/playground"
import { reconnectPlayground, runApprovedPgCall, sendDefaultTx } from "../fixtures/send"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

describe("passkey canary — the KDF-change execution gate, on both browsers", () => {
	test("agent-runner contract: a live sandbox must be configured (no false skip)", () => {
		if (process.env.E2E_REQUIRE_SETUP === "1") {
			expect(hasConfig).toBe(true)
		}
	})

	test.skipIf(!hasConfig)(
		"passkey canary — register via PRF ceremony, ctor-deploy with real proof, authwit consume, SW-restart ceremony re-unlock",
		// retry: 0 — this is the KDF-change execution gate; a retry-masked failure defeats it.
		{ timeout: 900_000, retry: 0 },
		async ({ freshExtensionPerTest }) => {
			const ctx = freshExtensionPerTest
			const step = (m: string) => console.log(`[passkey-canary] ${m}`)

			// ── Stage 1: passkey profile + second account + dApp connection ──
			// The anchor popup anchors the virtual authenticator; where the credential is page-scoped
			// it stays open until the end, and the post-restart ceremony runs in it.
			const anchorPopup = await openPopup(ctx)
			const auth = await setupPasskeyVirtualAuth(ctx.browser, anchorPopup)
			let ceremonyPopup = anchorPopup
			try {
				step("registering passkey profile (in-page PRF ceremony)")
				await registerPasskeyProfile(anchorPopup)
				await switchToLocalNetwork(anchorPopup)
				step("creating the second account")
				await createAccount(anchorPopup, "Second")

				step("connecting the playground")
				const page = await connectPlayground(ctx)
				const accountAddresses = await grantCapBundle(ctx, page, "transaction", async (accountIds) => {
					const granted = accountIds.slice(0, 2).filter((a): a is string => !!a)
					if (granted.length < 2) {
						throw new Error(`capabilities popup exposed ${granted.length} account(s); passkey canary needs 2`)
					}
					return granted
				})
				const [ownerA, callerB] = accountAddresses as [string, string]
				step(`granted A=${ownerA.slice(0, 12)}… B=${callerB.slice(0, 12)}…`)

				// ── Stage 2: A's FIRST tx — frozen ctor + set_authorized, REAL proof, mined ──
				step("minting to owner A")
				await mintPublicTokensForAccount(aztecConfig!, ownerA)
				await setPgInputs(page, {
					tokenAddress: aztecConfig!.tokenAddress,
					authwitOwner: ownerA,
					authwitCaller: callerB,
					authwitAmount: "1",
					authwitNonce: "1",
				})
				step("granting public authwit as A (A's FIRST tx — ctor + set_authorized)")
				const grantResult = await runApprovedPgCall(ctx, page, {
					button: "grantPublicAuthwit",
					method: "grantPublicAuthwit",
					label: "passkey-canary:grantResult",
					popupTimeoutMs: 30_000,
					contentTimeoutMs: 30_000,
				})
				const grantTxHash = txHashOf(grantResult.resultJson)
				step(`grant submitted (${grantTxHash.slice(0, 12)}…); waiting for the node to mine it`)
				await waitForTxMined(aztecConfig!, grantTxHash, 300_000)
				step("A's ctor-deploy tx MINED — real proof accepted for a passkey-derived account")

				// ── Stage 3: authwit-CONSUMING tx as the named caller B (B's FIRST tx) ──
				await selectPgAccount(page, callerB)
				step("consuming the authwit as B (B's FIRST tx — its own ctor + transfer_from)")
				const consumeResult = await runApprovedPgCall(ctx, page, {
					button: "consumeAuthwit",
					method: "sendTx",
					label: "passkey-canary:consumeResult",
					popupTimeoutMs: 30_000,
					contentTimeoutMs: 30_000,
				})
				await waitForTxMined(aztecConfig!, txHashOf(consumeResult.resultJson), 300_000)
				step("authwit consumed; B's ctor-deploy tx MINED")

				// ── Stage 4: background restart → ceremony re-unlock → still operates ──
				// A page-scoped credential keeps the anchor popup open across the kill. A session-scoped
				// one lets it close first — which the kill needs, as Firefox declines to end a background
				// under an open extension page — and a fresh popup then hosts the ceremony.
				step("terminating the background")
				if (credentialOutlivesPage) await anchorPopup.close()
				// A prover-ON stage can outlast the browser's idle reaper; an absent background IS the
				// restart this stage exercises.
				await stopBackgroundIfAlive(ctx)
				if (credentialOutlivesPage) ceremonyPopup = await openPopup(ctx)

				// Session storage retains the dead background's heartbeat, so the gate needs a STRICTLY
				// NEWER value; the baseline is read after the stop, from an extension page.
				await waitForWorkerLiveness(ceremonyPopup, await readLivenessBaseline(ceremonyPopup))
				step("background restarted; the ceremony popup must present the lock screen")
				// Passkey sessions are never silently restored: the replacement background holds no
				// session. A popup kept open still says authenticated in its store; its reconnect boot
				// resolves `locked` under an auth-required page and enters the locked state on its own —
				// no Lock click here (the reconnect cleanup hides the header's lock control). A fresh
				// popup boots straight into it.
				await waitForHash(ceremonyPopup, "#/popup/auth", 60_000)
				await ceremonyPopup.waitForSelector('[data-testid="auth-submit"]', { visible: true, timeout: 15_000 })
				await ceremonyPopup.waitForFunction(
					() => {
						const btn = document.querySelector<HTMLButtonElement>('[data-testid="auth-submit"]')
						return btn !== null && !btn.disabled
					},
					{ timeout: 15_000 },
				)
				await clickByTestId(ceremonyPopup, "auth-submit")
				await waitForHash(ceremonyPopup, "#/popup/general", 60_000)
				step("post-restart ceremony unlock ok")

				// Reconnect the dApp and land a post-restart tx as A. The background rebuilds the
				// account from the master the passkey opened again and hard-throws on address drift, so
				// an ok result pins BOTH the reopened master and execution.
				await page.reload({ waitUntil: "domcontentloaded" })
				await page.waitForSelector('[data-testid="pg-btn-connect"]', { visible: true, timeout: 30_000 })
				await reconnectPlayground(ctx, page, "transaction", "passkey-canary:capsResult", { timeoutMs: 30_000 })
				// Both granted accounts must come back with the reconnected session, not only the one acted as.
				await page.waitForFunction(() => document.querySelectorAll('[data-testid="pg-select-account"] option').length >= 2, {
					timeout: 30_000,
					polling: 200,
				})
				await selectPgAccount(page, ownerA)
				step("post-restart sendTx as A (reopened passkey account, non-init path)")
				const finalResult = await sendDefaultTx(ctx, page, aztecConfig!, "passkey-canary:finalResult", {
					popupTimeoutMs: 180_000,
					contentTimeoutMs: 30_000,
				})
				await waitForTxMined(aztecConfig!, txHashOf(finalResult.resultJson), 300_000)
				step("post-restart tx mined — passkey-derived account fully operational after ceremony re-unlock")
			} finally {
				await auth.cleanup()
				await ceremonyPopup.close().catch(() => {})
				await anchorPopup.close().catch(() => {})
			}
		},
	)
})
