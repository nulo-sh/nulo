/**
 * Each passkey step a page starts is refused once, as a dismissed prompt refuses it, and then tried
 * again: the toast says the passkey was not confirmed, the control that started the step is offered
 * again, the second try takes the toast away as it starts, and it finishes the step. Firefox's
 * toolbar runs its steps in windows of their own; `passkey-toolbar-panel.test.ts` refuses them there.
 */
import type { Page } from "puppeteer"
import { expect } from "vitest"
import { PASSKEY_COPY } from "@/utils/passkey-copy"
import { extensionUrl, gotoExtensionPage } from "./fixtures/browser"
import { clickByTestId, type ExtensionContext, expectNoNameField, openPopup, test, waitForHash } from "./fixtures/extension"
import { navigateByHash, waitForToast, waitForToastGone } from "./fixtures/helpers"
import {
	holdNextPasskeyRequest,
	openPasskeyRegister,
	refusePasskeyStep,
	registerPasskeyProfile,
	setupPasskeyVirtualAuth,
	withholdCreatePrf,
} from "./fixtures/passkey"
import { completeResetRitual } from "./helpers/crash-truth"
import {
	buildSyntheticPasskeyBackup,
	ONBOARDING_IMPORT_SHELL,
	POPUP_IMPORT_SHELL,
	readActiveAccount,
	readRegisteredPasskey,
	refusePasskeyRestore,
	writeBackupToTemp,
} from "./helpers/import-drivers"

/** Registers a passkey profile in `page`, keeps a backup of it, and deletes it. Chrome's virtual
 *  authenticator lives in this page, so every later passkey step runs in it too. */
async function backUpAndDeletePasskeyProfile(page: Page): Promise<{ file: string; address: string }> {
	await registerPasskeyProfile(page)
	const passkey = await readRegisteredPasskey(page)
	const file = writeBackupToTemp(buildSyntheticPasskeyBackup(passkey), "passkey-backup.json")
	await navigateByHash(page, "#/popup/settings/security/reset")
	await completeResetRitual(page, "#/popup/register")
	return { file, address: passkey.account.address }
}

/** Onboarding in the same tab: a wallet with no profile runs it again. */
async function onboardingInPage(ctx: ExtensionContext, page: Page, cta: "create" | "import"): Promise<void> {
	await page.evaluate(() => chrome.storage.local.set({ "nulo:onboarding:completed": false }))
	await gotoExtensionPage(page, extensionUrl(ctx.extensionId, "/src/onboarding/index.html#/onboarding/welcome"))
	await page.waitForSelector(`[data-testid="onboarding-welcome-${cta}"]`, { visible: true, timeout: 30_000 })
	await clickByTestId(page, `onboarding-welcome-${cta}`)
	await waitForHash(page, `#/onboarding/${cta}`, 10_000)
}

/** The second try, its passkey request held until the refused try's toast is gone. */
async function retryWithTheToastGone(page: Page, control: string): Promise<void> {
	const release = await holdNextPasskeyRequest(page)
	try {
		await clickByTestId(page, control)
		await page.waitForSelector('[data-testid="passkey-ceremony-dialog"]', { visible: true, timeout: 30_000 })
		await waitForToastGone(page, PASSKEY_COPY.notConfirmed)
	} catch (err) {
		// The wait's own error is the diagnosis: releasing fails too once the page is gone.
		await release().catch(() => {})
		throw err
	}
	await release()
}

const toPopupImport = (_ctx: ExtensionContext, page: Page) => navigateByHash(page, "#/popup/import")
const toOnboardingImport = (ctx: ExtensionContext, page: Page) => onboardingInPage(ctx, page, "import")

interface Step {
	where: string
	/** Brings `page` to the control that starts the step; returns the account the step must open, if any. */
	reach: (ctx: ExtensionContext, page: Page) => Promise<string | undefined>
	control: string
	/** Resolves once the second try has finished the step. */
	finished: (page: Page) => Promise<unknown>
}

const STEPS: Step[] = [
	{
		where: "the popup's new passkey profile",
		reach: async (_ctx, page) => {
			await openPasskeyRegister(page)
			return undefined
		},
		control: "register-submit-btn",
		finished: (page) => waitForHash(page, "#/popup/general", 60_000),
	},
	{
		where: "onboarding's new passkey profile",
		reach: async (ctx, page) => {
			await onboardingInPage(ctx, page, "create")
			await expectNoNameField(page, "onboarding-create-page", "onboarding-name-input")
			await clickByTestId(page, "onboarding-method-passkey")
			return undefined
		},
		control: "onboarding-submit-create",
		finished: (page) => waitForHash(page, "#/onboarding/learn", 60_000),
	},
	{
		where: "the popup's unlock",
		reach: async (_ctx, page) => {
			await registerPasskeyProfile(page)
			await clickByTestId(page, "header-lock")
			await waitForHash(page, "#/popup/auth", 15_000)
			return readActiveAccount(page)
		},
		control: "auth-submit",
		finished: (page) => waitForHash(page, "#/popup/general", 60_000),
	},
	{
		where: "the popup's full backup",
		reach: async (_ctx, page) => {
			await registerPasskeyProfile(page)
			await navigateByHash(page, "#/popup/settings/security/export/full")
			return undefined
		},
		control: "agree-continue-btn",
		// The backup's card shows before the prompt; Download is enabled only once the backup is made.
		finished: (page) =>
			page.waitForFunction(
				() => document.querySelector<HTMLButtonElement>('[data-testid="download-backup-btn"]')?.disabled === false,
				{ timeout: 180_000, polling: 250 },
			),
	},
	...[
		{ where: "the popup's passkey import", to: toPopupImport, landing: "#/popup/general" },
		{ where: "onboarding's passkey import", to: toOnboardingImport, landing: "#/onboarding/learn" },
	].map(
		({ where, to, landing }): Step => ({
			where,
			reach: async (ctx, page) => {
				const { address } = await backUpAndDeletePasskeyProfile(page)
				await to(ctx, page)
				return address
			},
			control: "import-option-passkey",
			finished: (page) => waitForHash(page, landing, 60_000),
		}),
	),
]

for (const { where, reach, control, finished } of STEPS) {
	test(`${where}: a refused passkey can be tried again, and the second try finishes`, async ({ freshExtensionPerTest: ctx }) => {
		const page = await openPopup(ctx)
		const auth = await setupPasskeyVirtualAuth(ctx.browser, page)
		try {
			const account = await reach(ctx, page)
			await refusePasskeyStep(page, auth, control)
			await retryWithTheToastGone(page, control)
			await finished(page)
			await waitForToastGone(page, PASSKEY_COPY.notConfirmed, 1_000)
			if (account) expect((await readRegisteredPasskey(page)).account.address).toBe(account)
		} finally {
			await auth.cleanup()
		}
	}, 240_000)
}

test("the popup's new passkey profile: a passkey created but not confirmed is confirmed on retry, never created again", async ({
	freshExtensionPerTest: ctx,
}) => {
	const page = await openPopup(ctx)
	const auth = await setupPasskeyVirtualAuth(ctx.browser, page)
	try {
		await openPasskeyRegister(page)
		const creates = await withholdCreatePrf(page)
		await clickByTestId(page, "register-submit-btn")
		await waitForToast(page, PASSKEY_COPY.notConfirmed, 30_000, { kind: "error" })
		expect(await creates()).toBe(1)
		await retryWithTheToastGone(page, "register-submit-btn")
		await waitForHash(page, "#/popup/general", 60_000)
		expect(await creates()).toBe(1)
	} finally {
		await auth.cleanup()
	}
}, 240_000)

for (const { where, shell, to } of [
	{ where: "the popup's full-backup restore", shell: POPUP_IMPORT_SHELL, to: toPopupImport },
	{ where: "onboarding's full-backup restore", shell: ONBOARDING_IMPORT_SHELL, to: toOnboardingImport },
]) {
	test(`${where}: a refused passkey keeps the backup chosen, and the second try restores`, async ({ freshExtensionPerTest: ctx }) => {
		const page = await openPopup(ctx)
		const auth = await setupPasskeyVirtualAuth(ctx.browser, page)
		try {
			const { file, address } = await backUpAndDeletePasskeyProfile(page)
			await to(ctx, page)
			await page.waitForSelector('[data-testid="import-option-full-backup"]', { visible: true, timeout: 10_000 })
			await clickByTestId(page, "import-option-full-backup")
			const submit = shell.submitTestId("full-backup")
			await refusePasskeyRestore(page, auth, submit, file)
			await retryWithTheToastGone(page, submit)
			await waitForHash(page, shell.successHash, 120_000)
			await waitForToastGone(page, PASSKEY_COPY.notConfirmed, 1_000)
			expect((await readRegisteredPasskey(page)).account.address).toBe(address)
		} finally {
			await auth.cleanup()
		}
	}, 240_000)
}
