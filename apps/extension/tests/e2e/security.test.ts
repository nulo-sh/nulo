import { once } from "node:events"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { expect } from "vitest"
import manifest from "../../manifest/manifest.config"
import { extensionUrl, newPage } from "./fixtures/browser"
import { TEST_PASSWORD } from "./fixtures/constants"
import { test, openPopup, waitForHash, clickByTestId, replaceInputValue } from "./fixtures/extension"
import { changePassword, lockWallet, navigateByHash, selectedAccount, waitForToast } from "./fixtures/helpers"
import { setupPasskeyVirtualAuth } from "./fixtures/passkey"

const ORIGINAL_PASSWORD = TEST_PASSWORD
const NEW_PASSWORD = "NewTestPassword456!"

test("change password rejects too-short and mismatched inputs", async ({ registeredExtensionPerTest }) => {
	const page = await openPopup(registeredExtensionPerTest)
	await waitForHash(page, "#/popup/general")

	await navigateByHash(page, "#/popup/settings/security/change-password")
	await page.waitForSelector('[data-testid="current-password-input"]', { visible: true, timeout: 5_000 })

	// Too-short new password keeps submit disabled
	await replaceInputValue(page, '[data-testid="current-password-input"]', ORIGINAL_PASSWORD)
	await replaceInputValue(page, '[data-testid="new-password-input"]', "short")
	await replaceInputValue(page, '[data-testid="new-password-repeat-input"]', "short")
	const submitDisabledShort = await page.evaluate(() => {
		const btn = document.querySelector('[data-testid="change-password-submit-btn"]') as HTMLButtonElement | null
		return btn?.disabled ?? null
	})
	expect(submitDisabledShort).toBe(true)

	// Mismatched repeats keeps submit disabled
	await replaceInputValue(page, '[data-testid="new-password-input"]', "ValidPassword123")
	await replaceInputValue(page, '[data-testid="new-password-repeat-input"]', "DifferentPassword123")
	const submitDisabledMismatch = await page.evaluate(() => {
		const btn = document.querySelector('[data-testid="change-password-submit-btn"]') as HTMLButtonElement | null
		return btn?.disabled ?? null
	})
	expect(submitDisabledMismatch).toBe(true)

	expect(registeredExtensionPerTest.consoleErrors).toEqual([])
	expect(registeredExtensionPerTest.pageErrors).toEqual([])
})

// Bumped per-test timeout to 120s. The multi-step flow (popup boot →
// changePassword → toast → back-nav → lockWallet → fresh popup → auth) racks
// up on the order of 30-90s on hosted CI's cold-PXE timing curve; the 60s
// config default was too tight, and the prior 30s explicit override was even
// worse.
test("change password succeeds and unlocks with new password", { timeout: 120_000 }, async ({ registeredExtensionPerTest }) => {
	const page = await openPopup(registeredExtensionPerTest)
	// Bump default 5s → 15s: hosted CI's popup boot + auto-redirect from "#/" to
	// "#/popup/general" can occasionally exceed 5s under cumulative load.
	await waitForHash(page, "#/popup/general", 15_000)

	await changePassword(page, ORIGINAL_PASSWORD, NEW_PASSWORD)
	await waitForToast(page, "Profile password changed")

	// router.back() returns to whatever was previous; we just need to end up
	// somewhere outside the change-password page. With longer timeout because
	// the SW round-trip + back-nav can take >5s under vitest worker pressure.
	await page.waitForFunction(() => !window.location.hash.includes("change-password"), { timeout: 15_000 })

	await lockWallet(page)
	await page.close()

	const page2 = await openPopup(registeredExtensionPerTest)
	await waitForHash(page2, "#/popup/auth", 10_000)

	await page2.waitForSelector('[data-testid="auth-password-input"]', { visible: true, timeout: 5_000 })
	await replaceInputValue(page2, '[data-testid="auth-password-input"]', NEW_PASSWORD)
	await clickByTestId(page2, "auth-submit")

	await page2.waitForFunction(() => !window.location.hash.includes("/popup/auth"), { timeout: 10_000 })

	expect(registeredExtensionPerTest.consoleErrors).toEqual([])
	expect(registeredExtensionPerTest.pageErrors).toEqual([])
	await page2.close()
})

// Each change is proved by the unlock that follows it, with the new method; that the old one no
// longer opens the row is the unit layer's (`service.passkey-unlock.test.ts`). A change made leaves
// the page for Settings.
test("the unlock method changes to a passkey and back to a password", { timeout: 180_000 }, async ({ registeredExtensionPerTest }) => {
	const page = await openPopup(registeredExtensionPerTest)
	await waitForHash(page, "#/popup/general", 15_000)
	const auth = await setupPasskeyVirtualAuth(registeredExtensionPerTest.browser, page)
	const authSubmitEnabled = () =>
		page.waitForFunction(() => document.querySelector<HTMLButtonElement>('[data-testid="auth-submit"]')?.disabled === false, {
			timeout: 15_000,
			polling: 200,
		})

	try {
		const address = await selectedAccount(page)
		await navigateByHash(page, "#/popup/settings/security/unlock-method")
		await page.waitForSelector('[data-testid="unlock-method-use-passkey"]', { visible: true, timeout: 10_000 })
		await clickByTestId(page, "unlock-method-use-passkey")
		await page.waitForSelector('[data-testid="unlock-method-password-input"]', { visible: true, timeout: 5_000 })
		await replaceInputValue(page, '[data-testid="unlock-method-password-input"]', ORIGINAL_PASSWORD)
		await clickByTestId(page, "unlock-method-continue")
		await waitForToast(page, "Now unlocks with your passkey", 60_000)
		await waitForHash(page, "#/popup/settings", 15_000)
		await navigateByHash(page, "#/popup/general")

		await lockWallet(page)
		await authSubmitEnabled()
		expect(await page.$('[data-testid="auth-password-input"]'), "the lock screen still asks the old password").toBeNull()
		await clickByTestId(page, "auth-submit")
		await waitForHash(page, "#/popup/general", 60_000)
		expect(await selectedAccount(page)).toBe(address)

		await navigateByHash(page, "#/popup/settings/security/unlock-method")
		await page.waitForSelector('[data-testid="unlock-method-use-password"]', { visible: true, timeout: 10_000 })
		await clickByTestId(page, "unlock-method-use-password")
		await page.waitForSelector('[data-testid="unlock-method-new-password-input"]', { visible: true, timeout: 60_000 })
		await replaceInputValue(page, '[data-testid="unlock-method-new-password-input"]', NEW_PASSWORD)
		await replaceInputValue(page, '[data-testid="unlock-method-new-password-confirm-input"]', NEW_PASSWORD)
		await clickByTestId(page, "unlock-method-save")
		await waitForToast(page, "Now unlocks with your password", 60_000)
		await waitForHash(page, "#/popup/settings", 15_000)
		await navigateByHash(page, "#/popup/general")

		await lockWallet(page)
		await page.waitForSelector('[data-testid="auth-password-input"]', { visible: true, timeout: 15_000 })
		await replaceInputValue(page, '[data-testid="auth-password-input"]', NEW_PASSWORD)
		await clickByTestId(page, "auth-submit")
		await waitForHash(page, "#/popup/general", 60_000)
		expect(await selectedAccount(page)).toBe(address)

		expect(registeredExtensionPerTest.pageErrors.filter((e) => !e.message.includes("Client disconnected"))).toEqual([])
	} finally {
		await auth.cleanup()
		await page.close()
	}
})

test("auto-lock TTL change persists across navigation", async ({ registeredExtensionPerTest }) => {
	const page = await openPopup(registeredExtensionPerTest)
	await waitForHash(page, "#/popup/general")

	await navigateByHash(page, "#/popup/settings/lock")
	await page.waitForSelector('[data-testid="auto-lock-input"]', { visible: true, timeout: 5_000 })

	// Targets the descendant <input> of the wrapper that received the testid
	// via inheritAttrs (replaceInputValue handles that fallback).
	await replaceInputValue(page, '[data-testid="auto-lock-input"]', "45")

	// Debounced sessionTtl write fires after 300ms; wait for the toast to
	// confirm the write landed before navigating away.
	await waitForToast(page, "Auto-lock timeout updated")

	// Navigate away and back. Uses `/about` — a real sibling settings page.
	await navigateByHash(page, "#/popup/settings/about")
	await navigateByHash(page, "#/popup/settings/lock")

	await page.waitForSelector('[data-testid="auto-lock-input"]', { visible: true, timeout: 5_000 })

	const persistedValue = await page.evaluate(() => {
		const wrapper = document.querySelector('[data-testid="auto-lock-input"]')
		const input = wrapper instanceof HTMLInputElement ? wrapper : wrapper?.querySelector("input")
		return (input as HTMLInputElement | null)?.value ?? null
	})
	expect(persistedValue).toBe("45")

	expect(registeredExtensionPerTest.consoleErrors).toEqual([])
	expect(registeredExtensionPerTest.pageErrors).toEqual([])
})

// A file a page can fetch at the extension's fixed URL tells it the wallet is installed, so no file
// is web-accessible; the content script is injected as one self-contained file and needs none.
test("a web page can fetch no extension file, the injected content script included", async ({ extension }) => {
	const popup = await openPopup(extension)
	const { exposed, injected } = await popup.evaluate(() => {
		const manifest = chrome.runtime.getManifest()
		return {
			exposed: manifest.web_accessible_resources,
			injected: (manifest.content_scripts ?? []).flatMap(({ js }: { js?: string[] }) => js ?? []),
		}
	})
	expect(exposed ?? []).toEqual([])
	const files = [...injected, ...(exposed ?? []).flatMap(({ resources }: { resources: string[] }) => resources)]
	const urls = files.map((file) => extensionUrl(extension.extensionId, `/${file}`))
	expect(urls.length).toBeGreaterThan(0)

	const fetchAll = (list: string[]) =>
		Promise.all(
			list.map((url) =>
				fetch(url).then(
					(res) => res.status,
					() => "refused" as const,
				),
			),
		)
	// Control: the URLs are right, so a refusal below is the page being refused, not a typo.
	expect(new Set(await popup.evaluate(fetchAll, urls))).toEqual(new Set([200]))
	await popup.close()

	const server = createServer((_, res) => res.end("<!doctype html><title>dapp</title>")).listen(0, "127.0.0.1")
	try {
		await once(server, "listening")
		const page = await newPage(extension.browser)
		try {
			await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`)
			expect(new Set(await page.evaluate(fetchAll, urls))).toEqual(new Set(["refused"]))
		} finally {
			await page.close()
		}
	} finally {
		server.close()
	}
})

// The policy every extension page runs under is the one the browser loaded, not the source: a build
// step that rewrote it would widen `connect-src` past what `src/manifest.test.ts` pins.
test("the loaded manifest carries the source's extension-page policy", async ({ extension }) => {
	const popup = await openPopup(extension)
	const loaded = await popup.evaluate(() => chrome.runtime.getManifest().content_security_policy as Record<string, unknown>)
	await popup.close()
	const source = (manifest as { content_security_policy: Record<string, unknown> }).content_security_policy
	// Firefox 158's schema adds an optional `sandbox` and reports it unset as `null`.
	const { sandbox, ...named } = loaded
	expect(sandbox === null && !("sandbox" in source) ? named : loaded).toEqual(source)
})
