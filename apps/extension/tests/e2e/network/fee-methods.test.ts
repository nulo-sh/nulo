import { inject, expect } from "vitest"
import { getStartedFeeJuiceHeldKey } from "@/utils/profile-ui-keys"
import type { FeePicks } from "@/wallet/services/ui-preference/spec"
import { test, openPopup, waitForHash, replaceInputValue, clickByTestId } from "../fixtures/extension"
import {
	fillSendForm,
	getStartedRows,
	readSessionRow,
	refreshBalances,
	sendTransfer,
	setActiveSendType,
	waitForHomeReminders,
	waitForToast,
	waitForTxConfirmation,
} from "../fixtures/helpers"
import {
	assertPublishInvariant,
	chooseRecipient,
	openReview,
	openSend,
	type ReviewView,
	readReview,
	readSendInputs,
	readSendView,
	selectSendFeeMethod,
	shotSend,
	submitSend,
	waitForFee,
	waitForReviewClosed,
	waitForReviewReady,
	waitForSendGone,
	waitForTag,
} from "../fixtures/send-page"
import { pointerClick } from "../helpers/legal-drivers"
import { coveredAt, tabAround, waitForFocus } from "../helpers/pointer-probes"
import { savedFeePicks } from "../helpers/ui-preferences"
import type { AztecTestConfig } from "../fixtures/aztec"
import type { Page } from "puppeteer"

const aztecConfig = inject("aztecTestConfig") as AztecTestConfig | undefined
const hasConfig = aztecConfig !== undefined

// Fee method tests use separate fixtures from transfer tests.
// Each test verifies a different fee payment method via the FeeSettingsCard UI.

test.skipIf(!hasConfig)("sponsored FPC is default fee method", { timeout: 180_000 }, async ({ tokenReadyExtension }) => {
	const page = await openPopup(tokenReadyExtension)
	await waitForHash(page, "#/popup/general")

	await openSend(page)
	await chooseRecipient(page, tokenReadyExtension.accountAddress)

	// Wait for FPC auto-discovery to complete
	await page.waitForFunction(
		() => {
			const trigger = document.querySelector('[data-testid="send-fee-method-trigger"]')
			return trigger?.textContent?.includes("Sponsored")
		},
		{ timeout: 30_000, polling: 1_000 },
	)

	const triggerText = await page.evaluate(() => document.querySelector('[data-testid="send-fee-method-trigger"]')?.textContent?.trim())
	console.log(`[fee-methods] Default fee method: "${triggerText}"`)
	expect(triggerText).toContain("Sponsored")

	console.log("✓ Sponsored FPC is the default fee method")
	await page.close()
})

test.skipIf(!hasConfig)("transfer with sponsored FPC fee", { timeout: 180_000 }, async ({ tokenReadyExtension }) => {
	const page = await openPopup(tokenReadyExtension)
	await waitForHash(page, "#/popup/general")

	await sendTransfer(page, {
		fromType: "public",
		toType: "public",
		amount: "1",
		destination: tokenReadyExtension.accountAddress,
	})
	console.log("✓ Transfer with Sponsored FPC submitted")
	await page.close()
})

// Uses the feeJuiceImportedExtension fixture, which
// pre-funds the imported account directly on-chain (matching what the
// extension's importPlain flow derives), so the extension's PXE sees both
// public + private FJ balances without needing a UI-level claim.
test.skipIf(!hasConfig)("transfer with public Fee Juice", { timeout: 300_000 }, async ({ feeJuiceImportedExtension }) => {
	const page = await openPopup(feeJuiceImportedExtension)
	await waitForHash(page, "#/popup/general")

	await openSend(page)
	await chooseRecipient(page, feeJuiceImportedExtension.accountAddress)

	// Public→public. A side is disabled until the token's capability flags load, so use the
	// polling helper instead of a single click + sleep.
	await setActiveSendType(page, "send-from-type", "public")
	await setActiveSendType(page, "send-to-type", "public")

	// Wait for amount input to be enabled
	await page.waitForFunction(
		() => {
			const input = document.querySelector('[data-testid="send-amount-input"]') as HTMLInputElement
			return input && !input.disabled
		},
		{ timeout: 60_000, polling: 2_000 },
	)

	// Enter the amount via the v-model-aware helper
	await replaceInputValue(page, '[data-testid="send-amount-input"]', "1")

	// Now switch fee method to Fee Juice (AFTER entering details, so the re-estimation uses FJ)
	await selectSendFeeMethod(page, "public")
	console.log("[fee-methods] Switched to Fee Juice (public)")

	// Wait for "Review send" to enable (re-estimation with Fee Juice)
	await page.waitForFunction(
		() => {
			const btn = document.querySelector<HTMLButtonElement>('[data-testid="send-submit"]')
			return Boolean(btn) && !btn?.disabled
		},
		{ timeout: 120_000, polling: 3_000 },
	)

	await submitSend(page)

	// Wait for toast
	await waitForToast(page, "Transaction submitted", 60_000)

	console.log("✓ Transfer with Fee Juice (public) submitted")
	await page.close()
})

// Same fixture, exercise PrivateFPC.pay_fee path.
// The fixture pre-funded the PrivateFPC's internal balance for the imported
// account via bridgeForMint + claim + mint (all from the same-secret script
// wallet, so msg_sender == claimer). This test verifies the FpcStrategy can
// spend that balance to sponsor a transfer.
test.skipIf(!hasConfig)("transfer with private Fee Juice", { timeout: 300_000 }, async ({ feeJuiceImportedExtension }) => {
	const page = await openPopup(feeJuiceImportedExtension)
	await waitForHash(page, "#/popup/general")

	await openSend(page)
	await chooseRecipient(page, feeJuiceImportedExtension.accountAddress)

	// Public→public (the token transfer itself is public; fee payment is what's
	// private, paid via PrivateFPC's internal FJ balance). Use the polling helper
	// so we don't no-op while async token-capability flags are still arriving.
	await setActiveSendType(page, "send-from-type", "public")
	await setActiveSendType(page, "send-to-type", "public")

	// Wait for amount input to be enabled
	await page.waitForFunction(
		() => {
			const input = document.querySelector('[data-testid="send-amount-input"]') as HTMLInputElement
			return input && !input.disabled
		},
		{ timeout: 60_000, polling: 2_000 },
	)

	await replaceInputValue(page, '[data-testid="send-amount-input"]', "1")

	// Switch fee method to Private Fee Juice — exercises FpcStrategy paying
	// via PrivateFPC.pay_fee using the FPC's internal balance. The amount input
	// enables on the token balance alone, so the fee card's first FPC and
	// balance read, which the row waits on, can still be in flight here.
	await selectSendFeeMethod(page, "private")
	console.log("[fee-methods] Switched to Fee Juice (private)")

	// Wait for re-estimation (private path involves more PXE work — note proofs
	// for FPC scope, etc. — so allow generous timeout).
	await page.waitForFunction(
		() => {
			const btn = document.querySelector<HTMLButtonElement>('[data-testid="send-submit"]')
			return Boolean(btn) && !btn?.disabled
		},
		{ timeout: 180_000, polling: 3_000 },
	)

	await submitSend(page)

	await waitForToast(page, "Transaction submitted", 60_000)

	console.log("✓ Transfer with Fee Juice (private) submitted")
	await page.close()
})

// Uses feeJuiceImportedExtension. The fixture pre-funds
// the imported account directly so getGasBalances reads non-zero public AND
// private FeeJuice (PrivateFPC.balance_of) without UI claim flow.
test.skipIf(!hasConfig)("gas balance card shows non-zero FeeJuice", { timeout: 120_000 }, async ({ feeJuiceImportedExtension }) => {
	const page = await openPopup(feeJuiceImportedExtension)
	await waitForHash(page, "#/popup/general")

	// Wait for GasBalanceCard to load and show a non-zero public FJ balance
	// The gas balance refreshes async after the PXE syncs blocks
	await page.waitForSelector('[data-testid="gas-balance-public"]', { visible: true, timeout: 60_000 })

	const balanceText = await page.evaluate(() => document.querySelector('[data-testid="gas-balance-public"]')?.textContent?.trim() || "")
	console.log(`[gas-balance] Public FJ balance: "${balanceText}"`)

	// Should contain "FJ" and NOT be "0 FJ"
	expect(balanceText).toContain("FJ")
	expect(balanceText).not.toBe("0 FJ")

	console.log("✓ Gas balance card shows non-zero FeeJuice")
	await page.close()

	// Warm-cache reopen: the SW-side reader serves last-known balances via
	// peek, so a reopened popup paints the value near-instantly instead of
	// re-skeletoning through a fresh PXE read. 10s absorbs loaded-CI popup
	// boot variance while staying far under the 60s cold-path budget above.
	const reopened = await openPopup(feeJuiceImportedExtension)
	await waitForHash(reopened, "#/popup/general")
	await reopened.waitForSelector('[data-testid="gas-balance-public"]', { visible: true, timeout: 10_000 })
	const reopenedText = await reopened.evaluate(
		() => document.querySelector('[data-testid="gas-balance-public"]')?.textContent?.trim() || "",
	)
	expect(reopenedText).toContain("FJ")
	expect(reopenedText).not.toBe("0 FJ")

	console.log("✓ Reopened popup paints gas balance from the warm cache")
	await reopened.close()
})

// ── The fee source follows the transfer's origin, and the page says what the fee publishes ────────
//
// Three funding shapes, one fixture each: no gas (tokenReady), public gas only (feeJuiceReady),
// both (feeJuiceImported). Send keeps its fee picks under its own storage key; the fixtures are
// file-scoped and earlier tests pick methods, so every test here starts by clearing that key and
// can therefore assert DEFAULTS, not leftovers. Every state a walk visits is read whole — the card's
// tag, the form's warning and the publish line's `you` must agree (`waitForFee` / `waitForTag`) —
// and every send passes the review, whose rows say what the send publishes.

/** Send's picks live under the profile's own key; each fixture holds one profile. */
const SEND_PICKS_PREFIX = "nulo:ui:sendFeePaymentMethods@"

async function clearSendPicks(page: Page): Promise<void> {
	await page.evaluate(async (prefix: string) => {
		const keys = Object.keys(await chrome.storage.local.get(null)).filter((key) => key.startsWith(prefix))
		await chrome.storage.local.remove(keys)
	}, SEND_PICKS_PREFIX)
}

async function readSendPicks(page: Page): Promise<FeePicks["send"]> {
	return (await savedFeePicks(page)).send
}

/** Fills the open form and sends a send nothing warns about through its review, whose rows must read `rows`. */
async function fillAndSubmit(page: Page, destination: string, amount: string, rows: Partial<ReviewView>): Promise<void> {
	await fillSendForm(page, { amount, destination })
	expect(assertPublishInvariant(await readSendView(page))).toMatchObject({ tag: null, warning: false })
	await openReview(page)
	await waitForReviewReady(page)
	expect(await readReview(page)).toMatchObject(rows)
	await pointerClick(page, "send-review-submit")
	await waitForToast(page, "Transaction submitted", 60_000)
	await waitForSendGone(page)
}

/** Still on the Send form with no submission toast after `dwellMs`: what a first click on "Review send" must leave behind. */
async function expectNothingSent(page: Page, dwellMs: number): Promise<void> {
	await new Promise((r) => setTimeout(r, dwellMs))
	const state = await page.evaluate(() => ({
		onForm: Boolean(document.querySelector('[data-testid="send-payee"]')),
		toast: (document.body.textContent ?? "").toLowerCase().includes("transaction submitted"),
	}))
	expect(state).toEqual({ onForm: true, toast: false })
}

/** The form's amount and the side it arrives on. */
const readAgainFields = (page: Page) =>
	page.evaluate(() => ({
		amount: document.querySelector<HTMLInputElement>('[data-testid="send-amount-input"]')?.value ?? null,
		arrival: document.querySelector('[data-testid="send-to-type"]')?.getAttribute("data-side") ?? null,
	}))

test.skipIf(!hasConfig)(
	"no gas at all: both origins default to the sponsor, nothing warns, the review arms and sends, and the next Send offers that send again",
	{ timeout: 300_000 },
	async ({ tokenReadyExtension }) => {
		// Recent leaves the wallet's own accounts out, so this walk pays one it does not hold.
		const payee = (aztecConfig as AztecTestConfig).minterAddress
		const page = await openPopup(tokenReadyExtension)
		await waitForHash(page, "#/popup/general")
		await clearSendPicks(page)
		await openSend(page)
		await chooseRecipient(page, payee)

		// The token is held on the public side alone, so Send opens there. No gas is held, so each origin's
		// walk ends on the sponsor.
		await waitForFee(page, "public", "sponsored")
		await setActiveSendType(page, "send-from-type", "private")
		const privateOrigin = await waitForFee(page, "private", "sponsored")
		expect(privateOrigin).toMatchObject({ tag: null, warning: false, you: "hidden" })
		await shotSend(page, "publish-all-hidden", "send-publish")

		await setActiveSendType(page, "send-from-type", "public")
		const publicOrigin = await waitForFee(page, "public", "sponsored")
		expect(publicOrigin).toMatchObject({ tag: null, warning: false, you: "public" })

		// Nothing was picked, so nothing was remembered.
		expect(await readSendPicks(page)).toEqual({})

		// A send nothing warns about is reviewed like any other: the sheet arms after its wait.
		await setActiveSendType(page, "send-to-type", "public")
		await shotSend(page, "publish-public-send", "send-publish")
		await fillSendForm(page, { amount: "1", destination: payee })
		await openReview(page)
		await waitForReviewReady(page)
		expect(await readReview(page)).toMatchObject({
			you: "public",
			to: "public",
			amount: "public",
			payer: "contract",
			ready: true,
			remedyHref: null,
		})
		await shotSend(page, "sheet-not-gated", "send-review-submit")
		await pointerClick(page, "send-review-submit")
		await waitForToast(page, "Transaction submitted", 60_000)
		await waitForSendGone(page)
		await waitForTxConfirmation(page, { amount: "1", fromType: "public", toType: "public", timeout: 120_000 })

		// The next Send lists the payee under Recent with that send, and offers it again on the form.
		await openSend(page)
		const recent = `[data-testid="send-recent"][data-address="${payee}"]`
		await page.waitForSelector(recent, { visible: true, timeout: 10_000 })
		expect(await page.$eval(recent, (el) => el.textContent?.replace(/\s+/g, " ") ?? "")).toContain("Last: 1 TST, publicly")
		await page.$eval(recent, (el) => (el as HTMLElement).click())
		await page.waitForSelector('[data-testid="send-again"]', { visible: true, timeout: 10_000 })
		expect(await page.$eval('[data-testid="send-again"]', (el) => el.textContent?.replace(/\s+/g, " ").trim())).toBe(
			"Same as last time: 1 TST, publicly",
		)
		expect(await readAgainFields(page)).toEqual({ amount: "", arrival: "private" })
		await clickByTestId(page, "send-again")
		await page.waitForFunction(() => document.querySelector<HTMLInputElement>('[data-testid="send-amount-input"]')?.value !== "", {
			timeout: 5_000,
			polling: 100,
		})
		expect(await readAgainFields(page)).toEqual({ amount: "1", arrival: "public" })
		await page.close()
	},
)

test.skipIf(!hasConfig)(
	"public gas only: a private send is defaulted to Fee Juice, tagged in both wordings, and sends only through the sheet",
	{ timeout: 600_000 },
	async ({ feeJuiceReadyExtension }) => {
		const self = feeJuiceReadyExtension.accountAddress

		// A public-origin send already names the sender: Fee Juice is the matched default, silently.
		{
			const page = await openPopup(feeJuiceReadyExtension)
			await waitForHash(page, "#/popup/general")
			await clearSendPicks(page)
			await openSend(page)
			await chooseRecipient(page, self)
			await setActiveSendType(page, "send-from-type", "public")
			await setActiveSendType(page, "send-to-type", "private")
			const shield = await waitForFee(page, "public", "public")
			expect(shield).toMatchObject({ tag: null, warning: false, you: "public" })

			// Shield 100 so there is a private balance to send from — paid with that same default.
			await fillAndSubmit(page, self, "100", { you: "public", to: "hidden", amount: "public" })
			await waitForTxConfirmation(page, { amount: "100", fromType: "public", toType: "private", timeout: 120_000 })
			await page.close()
		}

		{
			const page = await openPopup(feeJuiceReadyExtension)
			await waitForHash(page, "#/popup/general")
			// The fixture's minted tokens fund the wallet, and its card still asks for the phrase first.
			await waitForHomeReminders(page)
			expect(await getStartedRows(page)).toEqual([
				"get-started-phrase",
				"get-started-aztec",
				"get-started-feeJuice done",
				"get-started-presto",
			])
			expect(await page.$('[data-testid="backup-reminder-banner"]')).toBeNull()
			// Home records the held Fee Juice for the profile.
			const profileId = (await readSessionRow(page))?.profile
			if (!profileId) throw new Error("no unlocked profile")
			await page.waitForFunction(
				async (key: string) => (await chrome.storage.local.get(key))[key] === true,
				{ timeout: 10_000, polling: 100 },
				getStartedFeeJuiceHeldKey(profileId),
			)
			await refreshBalances(page)
			await openSend(page)
			await chooseRecipient(page, self)
			await setActiveSendType(page, "send-from-type", "private")
			await setActiveSendType(page, "send-to-type", "private")

			// THE case: private gas read as zero, public gas held. Nobody picked anything.
			const defaulted = await waitForFee(page, "private", "public")
			// Nulo's sponsor pays on this network, and still the fix is only ever the bridge.
			expect(defaulted).toMatchObject({ tag: "private-private", warning: true, you: "exposed", warningFix: "bridge" })
			expect(await readSendPicks(page)).toEqual({})
			await shotSend(page, "warning-private-private", "send-fee-warning")

			await setActiveSendType(page, "send-to-type", "public")
			const toPublic = await waitForTag(page, "private-public")
			expect(toPublic).toMatchObject({ method: "public", warning: true, you: "exposed" })
			await shotSend(page, "warning-private-public", "send-fee-warning")

			await setActiveSendType(page, "send-to-type", "private")
			await waitForTag(page, "private-private")

			// A sponsor that does not name the account is one pick away, and lifts the warning with the tag.
			await selectSendFeeMethod(page, "sponsored")
			expect(await waitForTag(page, null)).toMatchObject({ warning: false, you: "hidden" })
			await selectSendFeeMethod(page, "public")
			await waitForTag(page, "private-private")

			// The warned send: "Review send" only opens the sheet. Nothing goes out, and while the sheet is
			// up the footer is under it — nothing stays clickable below a modal.
			await fillSendForm(page, { amount: "10", destination: self })
			await openReview(page)
			await expectNothingSent(page, 1_500)
			expect(await coveredAt(page, "send-submit")).not.toBeNull()
			const review = await readReview(page)
			expect(review).toMatchObject({ you: "exposed", shape: "private-private", to: "hidden", amount: "hidden", payer: "account" })
			expect(review.remedyHref).toMatch(/^https:\/\//)
			await shotSend(page, "sheet-gated", "send-review-submit")

			// The trap: Tab never leaves the sheet; Escape closes it and hands focus back to the opener.
			const visited = await tabAround(page, 12)
			expect(visited).toContain("send-review-submit")
			expect(visited).not.toContain("send-submit")
			expect(visited).not.toContain("send-fee-change")
			expect(visited).not.toContain("send-fee-warning-bridge")
			expect(visited).not.toContain("send-amount-input")
			await page.keyboard.press("Escape")
			await waitForReviewClosed(page)
			await waitForFocus(page, "send-submit")

			// The form survived the round trip, warning included.
			expect(await readSendInputs(page)).toEqual({ amount: "10", destination: self })
			expect(await waitForTag(page, "private-private")).toMatchObject({ warning: true, you: "exposed" })

			// Reopened, armed after the wait, sent from the sheet alone — paid by the account.
			await openReview(page)
			await waitForReviewReady(page)
			await pointerClick(page, "send-review-submit")
			await waitForToast(page, "Transaction submitted", 60_000)
			await waitForSendGone(page)
			await waitForTxConfirmation(page, { amount: "10", fromType: "private", toType: "private", timeout: 120_000 })
			await page.close()
		}
	},
)

test.skipIf(!hasConfig)(
	"both gases held: each origin defaults to its own, a hand-picked sponsor lifts the warning, a hand-picked Fee Juice raises it, and the pick is kept per origin",
	{ timeout: 600_000 },
	async ({ feeJuiceImportedExtension }) => {
		const self = feeJuiceImportedExtension.accountAddress

		{
			const page = await openPopup(feeJuiceImportedExtension)
			await waitForHash(page, "#/popup/general")
			await clearSendPicks(page)
			await openSend(page)
			await chooseRecipient(page, self)

			// The token is held on the public side alone, so Send opens there.
			await waitForFee(page, "public", "public")
			await setActiveSendType(page, "send-from-type", "private")
			const privateDefault = await waitForFee(page, "private", "private")
			expect(privateDefault).toMatchObject({ tag: null, warning: false, you: "hidden" })

			await setActiveSendType(page, "send-from-type", "public")
			const publicDefault = await waitForFee(page, "public", "public")
			expect(publicDefault).toMatchObject({ tag: null, warning: false, you: "public" })

			// Shield so the private sends below have something to spend (public origin → its default payer).
			await setActiveSendType(page, "send-to-type", "private")
			await fillAndSubmit(page, self, "100", { you: "public" })
			await waitForTxConfirmation(page, { amount: "100", fromType: "public", toType: "private", timeout: 120_000 })
			await page.close()
		}

		// A hand-picked sponsor: hidden, and nothing warns.
		{
			const page = await openPopup(feeJuiceImportedExtension)
			await waitForHash(page, "#/popup/general")
			await refreshBalances(page)
			await openSend(page)
			await chooseRecipient(page, self)
			await setActiveSendType(page, "send-from-type", "private")
			await setActiveSendType(page, "send-to-type", "private")
			await waitForFee(page, "private", "private")

			await selectSendFeeMethod(page, "sponsored")
			expect(await waitForTag(page, null)).toMatchObject({ method: "sponsored", warning: false, you: "hidden" })
			await fillAndSubmit(page, self, "5", { you: "hidden" })
			await waitForTxConfirmation(page, { amount: "5", fromType: "private", toType: "private", timeout: 120_000 })
			await page.close()
		}

		// A hand-picked Fee Juice: the tag, then the private → public wording, sent through the sheet.
		{
			const page = await openPopup(feeJuiceImportedExtension)
			await waitForHash(page, "#/popup/general")
			await refreshBalances(page)
			await openSend(page)
			await chooseRecipient(page, self)
			await setActiveSendType(page, "send-from-type", "private")
			await setActiveSendType(page, "send-to-type", "private")
			// The pick survived: the sponsor, previewed while balances load and then in effect.
			await waitForFee(page, "private", "sponsored")
			await waitForTag(page, null)

			await selectSendFeeMethod(page, "public")
			expect(await waitForTag(page, "private-private")).toMatchObject({ warning: true, you: "exposed" })

			await setActiveSendType(page, "send-to-type", "public")
			await waitForTag(page, "private-public")

			await fillSendForm(page, { amount: "10", destination: self })
			await openReview(page)
			expect(await readReview(page)).toMatchObject({
				you: "exposed",
				shape: "private-public",
				to: "public",
				amount: "public",
				payer: "account",
			})
			await waitForReviewReady(page)
			await pointerClick(page, "send-review-submit")
			await waitForToast(page, "Transaction submitted", 60_000)
			await waitForSendGone(page)
			await waitForTxConfirmation(page, { amount: "10", fromType: "private", toType: "public", timeout: 120_000 })
			await page.close()
		}

		// A fresh popup: the pick survived, per origin, and still warns.
		{
			const page = await openPopup(feeJuiceImportedExtension)
			await waitForHash(page, "#/popup/general")
			await openSend(page)
			await chooseRecipient(page, self)
			// The trigger previews the saved pick while balances load, and a preview pays nothing — so the
			// tag, not the trigger, is the signal that Fee Juice is the method in effect.
			await waitForFee(page, "private", "public")
			expect(await waitForTag(page, "private-private", 90_000)).toMatchObject({ warning: true, you: "exposed" })

			// A public origin has no sender left to protect: the tag goes, and that origin keeps its own default.
			await setActiveSendType(page, "send-from-type", "public")
			expect(await waitForFee(page, "public", "public")).toMatchObject({ tag: null, warning: false, you: "public" })

			// Back to private: the pick made under THIS origin returns, and the tag with it.
			await setActiveSendType(page, "send-from-type", "private")
			await setActiveSendType(page, "send-to-type", "private")
			await waitForFee(page, "private", "public")
			await waitForTag(page, "private-private")
			expect(await readSendPicks(page)).toEqual({ [self]: { private: { type: "fj" } } })

			await clearSendPicks(page)
			await page.close()
		}
	},
)
