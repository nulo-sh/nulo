/**
 * Frozen-account execution canary — the per-Aztec-bump gate for the address freeze.
 *
 * A green address KAT says NOTHING about executability: the regime's frozen account bytecode driven
 * by a newer simulator/prover/entrypoint encoding is a combination upstream never tests. This file
 * asserts the full frozen-ctor arc, stage by stage, against a live node:
 *
 *   1. The FROZEN derivation (vendored artifact + descriptor) reproduces the live wallet's
 *      account addresses, re-derived test-side from the revealed profile master.
 *   2. The accounts' initialization nullifiers are ABSENT on the node (nothing deployed yet).
 *   3. The first tx executes the frozen constructor via the multicall deploy path — simulate,
 *      REAL proof, node acceptance — proven by the init nullifier flipping to PRESENT.
 *   4. A subsequent authwit-CONSUMING tx (grant as A → consume as the named caller B) succeeds.
 *   5. A background restart later, the re-derived account still signs, proves, and lands a tx
 *      (the background's re-derivation path throws "account address inconsistency" on drift, so
 *      an ok result pins re-derivation AND execution).
 *
 * Every stage asserts an exact outcome — no ok-or-error tolerances in this file. Run it
 * prover-ON per bump, on Chrome and on Firefox: `bun run e2e:agent
 * tests/e2e/network/frozen-account-canary.test.ts` (see the aztec-update skill; a red canary on
 * either browser BLOCKS the bump — hold the line, or rotate the address regime as a deliberate
 * act, never as a fix).
 */
import { Buffer } from "node:buffer"
import { describe, expect, inject } from "vitest"
import { stopBackgroundIfAlive } from "../fixtures/browser"
import { createAztecNodeClient } from "@aztec-labs/aztec.js/node"
import type { ILogger } from "@nulo/wallet-core/logger"
import { mintPublicTokensForAccount, waitForTxMined, type AztecTestConfig } from "../fixtures/aztec"
import { openPopup, test, waitForHash } from "../fixtures/extension"
import { ensureUnlocked, getAccountAddress, readLivenessBaseline, revealSeedPhrase, waitForWorkerLiveness } from "../fixtures/helpers"
import { selectPgAccount, setPgInputs, txHashOf } from "../fixtures/playground"
import { reconnectPlayground, runApprovedPgCall, sendDefaultTx } from "../fixtures/send"
import { TEST_PASSWORD } from "../fixtures/constants"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

describe("frozen-account canary — the execution gate every @aztec bump runs, on both browsers", () => {
	test("agent-runner contract: a live sandbox must be configured (no false skip)", () => {
		if (process.env.E2E_REQUIRE_SETUP === "1") {
			expect(hasConfig).toBe(true)
		}
	})

	test.skipIf(!hasConfig)(
		"frozen-account canary — derive, ctor-deploy with real proof, authwit consume, SW-restart re-derive",
		// retry: 0 — this is a bump gate; a retry-masked single-shot failure would defeat its purpose.
		{ timeout: 900_000, retry: 0 },
		async ({ dappConnectedExtensionWithFirstTwoAccountsCap }) => {
			const ctx = dappConnectedExtensionWithFirstTwoAccountsCap
			const { playgroundPage: page, accountAddresses } = ctx
			const step = (m: string) => console.log(`[frozen-canary] ${m}`)
			expect(accountAddresses.length).toBe(2)

			// ── Stage 1: frozen derivation reproduces the live wallet's addresses ──
			// Capture the recovery phrase (plain-key export is gone in KDF v2) and derive the master
			// test-side through the standard BIP-39 step — the same path the wallet uses.
			step("revealing recovery phrase")
			const popup = await openPopup(ctx)
			await waitForHash(popup, "#/popup/general", 30_000)
			const words = (await revealSeedPhrase(popup, TEST_PASSWORD)).join(" ")
			await popup.close()
			expect(words.split(" ").length).toBe(24)

			step("deriving accounts test-side through the frozen path")
			const { Fr } = await import("@aztec-labs/aztec.js/fields")
			const { poseidon2Hash } = await import("@aztec-labs/foundation/crypto/sync")
			const { deriveMasterFromMnemonic } = await import("@nulo/wallet-crypto")
			const { NuloAccount } = await import("@nulo/aztec-runtime/account")
			const { computeSiloedPrivateInitializationNullifier } = await import("@aztec-labs/stdlib/hash")
			const { createLogger } = await import("@aztec-labs/foundation/log")
			const logger = createLogger("frozen-account-canary")
			const master = Fr.fromBuffer(Buffer.from(await deriveMasterFromMnemonic(words.split(" "))))
			// DELIBERATELY INDEPENDENT recompute of the wallet's NULO-ACCOUNT-KDF v2 account-seed
			// formula (poseidon2HashWithSeparator = separator unshifted as Fr):
			// poseidon2Hash([SEP, master, l1ChainId, type, index]) with SEP = NULO_ACCOUNT_SEED_SEP
			// (0xa22f2a02 = sha256("nulo:account-seed:v2")[0..4]), Local Network l1ChainId = 31337
			// (anvil), AccountType.Nulo_v1 = 0. Hand-rolled ON PURPOSE — never import the wallet's
			// deriveAccountSeed here; this test is the external cross-check.
			const NULO_ACCOUNT_SEED_SEP = 2720999938
			const LOCAL_L1_CHAIN_ID = 31337
			const derived = await Promise.all(
				[0, 1].map(async (index) => {
					const seed = poseidon2Hash([new Fr(NULO_ACCOUNT_SEED_SEP), master, new Fr(LOCAL_L1_CHAIN_ID), new Fr(0), new Fr(index)])
					// Aztec's Logger has no `log`; NuloAccount calls it only from its PXE and transaction methods.
					const account = await NuloAccount.new(seed, logger as unknown as ILogger, "account")
					const instance = (account as unknown as { instance: { initializationHash: InstanceType<typeof Fr> } }).instance
					const initNullifier = await computeSiloedPrivateInitializationNullifier(account.address, instance.initializationHash)
					return { index, address: account.address.toString(), initNullifier }
				}),
			)
			// Order-independent set match, then map granted → derived so later stages use exact pairs.
			expect(new Set(derived.map((d) => d.address))).toEqual(new Set(accountAddresses))
			const byAddress = new Map<string, (typeof derived)[number]>(derived.map((d) => [d.address, d]))
			const [ownerA, callerB] = accountAddresses as [string, string]
			const derivedA = byAddress.get(ownerA)
			const derivedB = byAddress.get(callerB)
			if (!derivedA || !derivedB) throw new Error("granted addresses did not map to derived accounts")
			step(`frozen derivation matches wallet: A=${ownerA.slice(0, 12)}… B=${callerB.slice(0, 12)}…`)

			// ── Stage 2: initialization nullifiers ABSENT (accounts not deployed) ──
			const node = createAztecNodeClient(aztecConfig!.nodeUrl)
			expect(await node.getNullifierMembershipWitness("latest", derivedA.initNullifier)).toBeUndefined()
			expect(await node.getNullifierMembershipWitness("latest", derivedB.initNullifier)).toBeUndefined()
			step("init nullifiers ABSENT for both accounts")

			// ── Stage 3: first tx executes the FROZEN ctor (multicall deploy) with a real proof ──
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
				label: "frozen-account-canary:grantResult",
				popupTimeoutMs: 30_000,
				contentTimeoutMs: 30_000,
			})
			const grantTxHash = txHashOf(grantResult.resultJson)
			step(`grant submitted (${grantTxHash.slice(0, 12)}…); waiting for the node to mine it`)
			await waitForTxMined(aztecConfig!, grantTxHash, 300_000)

			// Node ACCEPTED the frozen constructor: A's init nullifier flipped to PRESENT.
			expect(await node.getNullifierMembershipWitness("latest", derivedA.initNullifier)).toBeDefined()
			step("A's init nullifier PRESENT — frozen ctor executed and accepted")

			// ── Stage 4: authwit-CONSUMING tx as the named caller B ──
			await selectPgAccount(page, callerB)
			step("consuming the authwit as B (B's FIRST tx — its own frozen ctor + transfer_from)")
			const consumeResult = await runApprovedPgCall(ctx, page, {
				button: "consumeAuthwit",
				method: "sendTx",
				label: "frozen-account-canary:consumeResult",
				popupTimeoutMs: 30_000,
				contentTimeoutMs: 30_000,
			})
			const consumeTxHash = txHashOf(consumeResult.resultJson)
			await waitForTxMined(aztecConfig!, consumeTxHash, 300_000)
			expect(await node.getNullifierMembershipWitness("latest", derivedB.initNullifier)).toBeDefined()
			step("authwit consumed; B's init nullifier PRESENT")

			// ── Stage 5: background restart → recovery re-derives and still operates ──
			// A prover-ON stage can outlast the browser's idle reaper; an absent background IS the
			// restart this stage exercises.
			step("terminating the background")
			await stopBackgroundIfAlive(ctx)

			// Session storage retains the dead background's heartbeat, so the gate needs a
			// STRICTLY NEWER value; the baseline is read after the stop, from an
			// extension page (chrome.storage is undefined on the playground page).
			const recoveryPopup = await openPopup(ctx)
			await waitForWorkerLiveness(recoveryPopup, await readLivenessBaseline(recoveryPopup))
			await recoveryPopup.waitForFunction(() => window.location.hash.length > 2, { timeout: 60_000 })
			// Post-restart the lock decision IS the activation bootstrap, which the next wait budgets
			// at 120s — the helper's default 30s measured the same bootstrap with a shorter clock and
			// tripped three times on starved prover-ON runners (heartbeat advancing, record well-formed).
			await ensureUnlocked(recoveryPopup, TEST_PASSWORD, { decisionBudgetMs: 120_000 })
			await recoveryPopup.waitForFunction(() => window.location.hash.includes("/popup/general"), { timeout: 120_000 })
			// WHICH of the profile's accounts the popup presents after a restart is UI behavior, not a
			// freeze invariant — the address just has to be one of the frozen-derived pair (the real
			// re-derivation proof is the post-restart tx as A below).
			expect([ownerA, callerB]).toContain(await getAccountAddress(recoveryPopup))
			await recoveryPopup.close()
			step("post-restart unlock ok; presented account is one of the frozen-derived pair")

			// Reconnect the dApp (the verify popup re-fires, as on every reconnect)
			// and land a post-restart tx as A. The background rebuilds the account contract from the
			// seed on this path and hard-throws on address drift, so an ok result pins BOTH
			// re-derivation and execution of the re-derived frozen account.
			await page.reload({ waitUntil: "domcontentloaded" })
			await page.waitForSelector('[data-testid="pg-btn-connect"]', { visible: true, timeout: 30_000 })
			// Connect alone yields accounts=[] by design (playground populates from
			// requestCapabilities, not getAccounts); re-requesting the already-granted bundle early-returns
			// on the empty delta, with no popup, and repopulates the select.
			await reconnectPlayground(ctx, page, "transaction", "frozen-account-canary:capsResult", { timeoutMs: 30_000 })
			// Both granted accounts must come back with the reconnected session, not only the one acted as.
			await page.waitForFunction(() => document.querySelectorAll('[data-testid="pg-select-account"] option').length >= 2, {
				timeout: 30_000,
				polling: 200,
			})
			await selectPgAccount(page, ownerA)
			step("post-restart sendTx as A (re-derived account, non-init path)")
			// 180s: the first post-restart RPC that touches the chain runtime pays the PXE host's full
			// cold start (bb init + encrypted-store unlock) BEFORE the execute popup can open.
			const finalResult = await sendDefaultTx(ctx, page, aztecConfig!, "frozen-account-canary:finalResult", {
				popupTimeoutMs: 180_000,
				contentTimeoutMs: 30_000,
			})
			const finalTxHash = txHashOf(finalResult.resultJson)
			await waitForTxMined(aztecConfig!, finalTxHash, 300_000)
			step("post-restart tx mined — re-derived frozen account fully operational")
		},
	)
})
