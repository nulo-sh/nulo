/**
 * Data capability methods. Wires `getPrivateEvents`.
 */
import { AztecAddress } from "@aztec-labs/aztec.js/addresses"
import { EventSelector, type EventMetadataDefinition } from "@aztec-labs/stdlib/abi"
import { getWallet } from "../lib/wallet"
import { logCall } from "../lib/log"
import { getInput, getState, setState } from "../state"

export function renderData(): string {
	const s = getState()
	const dis = s.status === "connected" ? "" : "disabled"
	return `
		<fieldset class="pg-section">
			<legend>Data</legend>
			<div class="pg-row">
				<button data-testid="pg-btn-getPrivateEvents" type="button" ${dis}>getPrivateEvents</button>
			</div>
		</fieldset>
	`
}

export function bindData(root: HTMLElement): void {
	root.querySelector<HTMLButtonElement>('[data-testid="pg-btn-getPrivateEvents"]')?.addEventListener("click", async () => {
		const wallet = getWallet()
		if (!wallet) {
			setState({ lastError: "Not connected" })
			return
		}
		try {
			await logCall("getPrivateEvents", async () => {
				const tokenAddress = getInput("tokenAddress")
				if (!tokenAddress) throw new Error("tokenAddress input required")
				const s = getState()
				const acct = s.selectedAccount
					? AztecAddress.fromStringUnsafe(s.selectedAccount)
					: AztecAddress.fromStringUnsafe(tokenAddress)
				// Schema-valid, as the stock SDK types it: the wallet refuses a call its schema rejects
				// (block numbers start at 1) before the scope check this button exercises.
				const eventMetadata: EventMetadataDefinition = {
					eventSelector: EventSelector.empty(),
					abiType: { kind: "field" },
					fieldNames: [],
				}
				const eventFilter = {
					contractAddress: AztecAddress.fromStringUnsafe(tokenAddress),
					fromBlock: 1,
					toBlock: 1000,
					scopes: [acct],
				}
				// biome-ignore lint/suspicious/noExplicitAny: getPrivateEvents shapes vary; test driver may override
				return (wallet as any).getPrivateEvents(eventMetadata, eventFilter)
			})
		} catch (err) {
			setState({ lastError: err instanceof Error ? err.message : String(err) })
		}
	})
}
