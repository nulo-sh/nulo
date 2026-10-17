import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import { clickByTestId, test } from "../fixtures/extension"
import { callExpectingNoPopup, type PgResult } from "../fixtures/playground"
import type { AztecTestConfig } from "../fixtures/aztec"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

/**
 * Tests #23-#25: the canonical simulation methods are silent on default sessions
 * (PrivateData=4 < confLevel=5). simulateTx (#23) answers; profileTx (#24) is refused as an
 * unsupported method, since every profile mode needs the account's real signature; the
 * executeUtility probe (#25) calls `balance_of_public`, a public function, under the session's
 * simulation utility grant, and the wallet refuses it as invalid arguments before PXE runs it.
 *
 * Uses `dappConnectedExtensionWithAccountsCap` so the cap-popup round-trip happens during fixture
 * setup (hookTimeout=300s) rather than during a test's budget.
 */
async function fillInputs(page: Page): Promise<void> {
	await page.evaluate(
		({ token, recipient }: { token: string; recipient: string }) => {
			const setVal = (sel: string, v: string) => {
				const input = document.querySelector<HTMLInputElement>(sel)
				if (!input) return
				const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set
				setter?.call(input, v)
				input.dispatchEvent(new Event("input", { bubbles: true }))
			}
			setVal('[data-testid="pg-input-tokenAddress"]', token)
			setVal('[data-testid="pg-input-recipient"]', recipient)
			setVal('[data-testid="pg-input-amount"]', "1")
		},
		{ token: aztecConfig!.tokenAddress, recipient: aztecConfig!.minterAddress },
	)
}

/** The JSON-RPC error the wallet answered, as the playground records it. */
function envelopeOf(result: PgResult): unknown {
	const payload = result.errorJson as string | { message?: string } | undefined
	return JSON.parse((typeof payload === "string" ? payload : payload?.message) ?? "null")
}

test.skipIf(!hasConfig)(
	"sim-simulateTx (#23) — silent path returns ok or error",
	{ timeout: 60_000 },
	async ({ dappConnectedExtensionWithAccountsCap }) => {
		const { playgroundPage: page } = dappConnectedExtensionWithAccountsCap
		await fillInputs(page)

		const result = await callExpectingNoPopup(dappConnectedExtensionWithAccountsCap, page, "simulateTx", async () => {
			await clickByTestId(page, "pg-btn-simulateTx-transfer")
		})
		expect(["ok", "error"]).toContain(result.status)
	},
)

test.skipIf(!hasConfig)(
	"sim-profileTx (#24) — refused silently as an unsupported method",
	{ timeout: 60_000 },
	async ({ dappConnectedExtensionWithAccountsCap }) => {
		const { playgroundPage: page } = dappConnectedExtensionWithAccountsCap
		await fillInputs(page)

		const result = await callExpectingNoPopup(dappConnectedExtensionWithAccountsCap, page, "profileTx", async () => {
			await clickByTestId(page, "pg-btn-profileTx")
		})
		expect(result.status).toBe("error")
		expect(envelopeOf(result)).toEqual({
			code: -32601,
			message: "Unsupported wallet method: profileTx",
			data: { walletErrorCode: "UNSUPPORTED_METHOD" },
		})
	},
)

test.skipIf(!hasConfig)(
	"sim-executeUtility (#25) — a public function is refused silently as invalid arguments",
	{ timeout: 60_000 },
	async ({ dappConnectedExtensionWithAccountsCap }) => {
		const { playgroundPage: page } = dappConnectedExtensionWithAccountsCap
		await fillInputs(page)

		const result = await callExpectingNoPopup(dappConnectedExtensionWithAccountsCap, page, "executeUtility", async () => {
			await clickByTestId(page, "pg-btn-executeUtility-balance")
		})
		expect(result.status).toBe("error")
		expect(envelopeOf(result)).toEqual({
			code: -32602,
			message: "The request's arguments do not match the wallet API.",
			data: { walletErrorCode: "INVALID_PARAMS" },
		})
	},
)
