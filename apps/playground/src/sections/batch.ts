/**
 * Batch combos.
 *
 * - meta: 3 silent-path methods (no popup).
 * - mixed: silent reads incl. one capability-gated method (no popup once the
 *   capability is granted).
 * - abort-on-failure: includes a leg expected to fail; verifies the dispatcher
 *   aborts the batch on the first failure and the dApp sees the underlying error.
 */
import { guarded } from "../lib/log"
import { getInput, getState } from "../state"

export function renderBatch(): string {
	const s = getState()
	const dis = s.status === "connected" ? "" : "disabled"
	return `
		<fieldset class="pg-section">
			<legend>Batch</legend>
			<div class="pg-row">
				<button data-testid="pg-btn-batch-meta" type="button" ${dis}>batch meta</button>
				<button data-testid="pg-btn-batch-mixed" type="button" ${dis}>batch mixed</button>
				<button data-testid="pg-btn-batch-partial-failure" type="button" ${dis}>batch abort on failure</button>
			</div>
		</fieldset>
	`
}

export function bindBatch(root: HTMLElement): void {
	root.querySelector<HTMLButtonElement>('[data-testid="pg-btn-batch-meta"]')?.addEventListener(
		"click",
		guarded("batch", (wallet) => {
			// Only include methods that are silently dispatchable pre-grant.
			// `getAccounts` is in EXEMPT_METHODS (capability-map.ts:14) for
			// `enforceCapability` purposes, but `handleGetAccounts` still throws
			// CapabilityNotGrantedError("accounts") when no accounts have been
			// granted — pinned by meta-getAccounts-pregrant.test.ts. The batch
			// dispatcher re-runs `dispatch()` per leg and aborts on first throw,
			// so a single `getAccounts` leg here would error the entire batch.
			// 3x getChainInfo keeps the test exercising the multi-leg dispatch
			// path without touching the accounts contract.
			// biome-ignore lint/suspicious/noExplicitAny: structural batch shape
			return (wallet as any).batch([
				{ name: "getChainInfo", args: [] },
				{ name: "getChainInfo", args: [] },
				{ name: "getChainInfo", args: [] },
			])
		}),
	)

	root.querySelector<HTMLButtonElement>('[data-testid="pg-btn-batch-mixed"]')?.addEventListener(
		"click",
		guarded("batch", async (wallet) => {
			// Silent meta + two `basic`-bundle silent legs. `getAccounts` pre-grant
			// throws inside `handleGetAccounts` (see comment in batch-meta above)
			// — so this batch uses getChainInfo + 2x getContractMetadata to stress
			// both an exempt leg AND a contracts-gated leg.
			// (No sendTx leg in this variant — sendTx-in-batch deserves its own
			//  test with deeper popup choreography.)
			// biome-ignore lint/suspicious/noExplicitAny: structural batch shape
			return (wallet as any).batch([
				{ name: "getChainInfo", args: [] },
				{ name: "getContractMetadata", args: [getInput("tokenAddress") || "0x0"] },
				{ name: "getContractMetadata", args: [getInput("tokenAddress") || "0x0"] },
			])
		}),
	)

	root.querySelector<HTMLButtonElement>('[data-testid="pg-btn-batch-partial-failure"]')?.addEventListener(
		"click",
		guarded("batch", (wallet) => {
			// One real meta call + one expected-to-fail leg (unknown method).
			// The dispatcher aborts on the first failure; the unknown method
			// throws and the whole batch rejects with that error.
			// biome-ignore lint/suspicious/noExplicitAny: structural batch shape
			return (wallet as any).batch([
				{ name: "getChainInfo", args: [] },
				{ name: "thisMethodDoesNotExist", args: [] },
			])
		}),
	)
}
