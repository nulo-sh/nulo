/**
 * The account's own Fee Juice read two ways that disagree: the estimate's probe reads the payer's
 * slot through `getPublicStorageAt`, the card's balance comes from a `balance_of_public` simulation.
 * With the active endpoint behind a relay that answers the probe's slot read with zero, the funded
 * sandbox account's two reads disagree across the real transport, as a lagging upstream behind a
 * pool makes them. The worker reads both once more, and Send warns with both figures instead of
 * refusing. With the relay's rule gone, the next estimate carries no shortfall at all.
 */
import type { Page } from "puppeteer"
import { expect, inject } from "vitest"
import { feeJuiceAddress } from "@/wallet/utils/fee-juice"
import type { AztecTestConfig } from "../fixtures/aztec"
import { openPopup, replaceInputValue, test, waitForHash } from "../fixtures/extension"
import { setActiveSendType } from "../fixtures/helpers"
import { rewriteActiveNetwork } from "../fixtures/networks"
import { pollUntil } from "../fixtures/poll"
import { callsOf, type RpcRelay, startRpcRelay } from "../fixtures/rpc-relay"
import { chooseRecipient, openSend, selectSendFeeMethod, shotSend } from "../fixtures/send-page"
import { setDeveloperMode } from "../fixtures/settings"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined

const SPEC = "fee-shortfall-recheck"
const step = (message: string) => console.log(`[${SPEC}] ${message}`)

const UNCONFIRMED =
	/^Your balance couldn't be confirmed: one check found [\d,.]+ FJ and a fresh one found 0 FJ\. If the network refuses this send, nothing is charged\.$/

/** How many reads of a Fee Juice slot the relay has received since `from`, a batch's entries one by one. */
const feeJuiceSlotReads = (relay: RpcRelay, from: number): number =>
	relay
		.received()
		.filter((r) => r.seq > from)
		.flatMap(callsOf)
		.filter((c) => c.method === "aztec_getpublicstorageat" && c.params.includes(feeJuiceAddress.toLowerCase())).length

const lastSeq = (relay: RpcRelay): number => relay.received().at(-1)?.seq ?? 0

async function readFee(page: Page) {
	return page.evaluate(() => {
		const text = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.textContent?.replace(/\s+/g, " ").trim() ?? null
		const submit = document.querySelector<HTMLButtonElement>('[data-testid="send-submit"]')
		return {
			unconfirmed: text("fee-juice-unconfirmed"),
			shortfall: text("fee-juice-shortfall"),
			submitEnabled: Boolean(submit) && !submit?.disabled,
		}
	})
}

test.skipIf(!aztecConfig)(
	"fee-shortfall-recheck — a probe that reads the funded account empty warns without refusing, and a clean read clears it",
	{ timeout: 600_000, retry: 0 },
	async ({ feeJuiceImportedExtension: ctx }) => {
		const config = aztecConfig as AztecTestConfig
		const relay = await startRpcRelay(config.nodeUrl, "fee-shortfall-relay")
		try {
			step("the active network's endpoint behind the relay")
			const setup = await openPopup(ctx)
			await waitForHash(setup, "#/popup/general", 30_000)
			await setDeveloperMode(setup, true)
			const network = await rewriteActiveNetwork(setup, (n) => {
				const primary = n.endpoints.find((e) => e.id === n.primaryEndpointId)
				if (n.kind !== "local" || !primary) return false
				n.endpoints = [{ ...primary, rpcUrl: relay.url }]
				return true
			})
			expect(network, "the active network is the Local Network").toBeDefined()
			await setup.close()

			step("the probe's slot read answered with zero; the balance simulation untouched")
			const zeroed = relay.fail({
				methods: ["getPublicStorageAt"],
				carrying: feeJuiceAddress,
				fault: { kind: "result", value: `0x${"0".repeat(64)}` },
			})

			const page = await openPopup(ctx)
			await waitForHash(page, "#/popup/general", 30_000)
			await openSend(page)
			await chooseRecipient(page, ctx.accountAddress)
			await setActiveSendType(page, "send-from-type", "public")
			await setActiveSendType(page, "send-to-type", "public")
			await page.waitForFunction(
				() => document.querySelector<HTMLInputElement>('[data-testid="send-amount-input"]')?.disabled === false,
				{ timeout: 60_000, polling: 500 },
			)
			await replaceInputValue(page, '[data-testid="send-amount-input"]', "1")
			await selectSendFeeMethod(page, "public")

			step("the estimate's two reads still disagree after the recheck: a warning, and Review send stays on")
			const disputed = await pollUntil(
				() => readFee(page),
				(fee) => fee.unconfirmed !== null || fee.shortfall !== null,
				{ label: "the Fee Juice estimate's verdict", timeoutMs: 120_000, intervalMs: 500 },
			)
			expect(disputed.shortfall, "no refusal row while the reads disagree").toBeNull()
			expect(disputed.unconfirmed).toMatch(UNCONFIRMED)
			expect(zeroed.taken(), "the probe and its one recheck both read the zeroed slot").toBeGreaterThanOrEqual(2)
			await pollUntil(
				() => readFee(page),
				(fee) => fee.submitEnabled,
				{ label: "Review send enabled beside the warning", timeoutMs: 30_000, intervalMs: 500 },
			)
			await shotSend(page, "send-fee-unconfirmed", "fee-settings-card")

			step("the rule retired: the next estimate reads the slot as it is and carries no shortfall")
			relay.clear()
			const cleared = lastSeq(relay)
			await replaceInputValue(page, '[data-testid="send-amount-input"]', "2")
			const clean = await pollUntil(
				async () => ({ fee: await readFee(page), reads: feeJuiceSlotReads(relay, cleared) }),
				({ fee, reads }) => reads > 0 && fee.unconfirmed === null && fee.shortfall === null && fee.submitEnabled,
				{ label: "a clean estimate after the rule retired", timeoutMs: 120_000, intervalMs: 500 },
			)
			expect(clean.reads, "a fresh probe read the slot through the relay").toBeGreaterThan(0)
			await page.close()
		} finally {
			await relay.close()
		}
	},
)
