import type { Browser, Page } from "puppeteer"
import { PASSKEY_COPY } from "@/utils/passkey-copy"
import { type VirtualAuthenticator, holdNextCredentialGet, virtualAuthenticator } from "./browser"
import { clickByTestId, expectNoNameField, waitForHash } from "./extension"
import { waitForToast } from "./helpers"

/** Drive the passkey-register flow on a fresh extension at /popup/register.
 *  Preconditions: `setupPasskeyVirtualAuth` has been called against the popup
 *  target (otherwise navigator.credentials.create routes to the platform
 *  authenticator and times out under headless). The ceremony runs in-page
 *  (path A) on the SAME FrameTreeNode, so the created credential lives on the
 *  popup page's virtual authenticator — keep that page open for any later
 *  ceremony (lock/unlock, SW-restart recovery, re-import). */
export async function registerPasskeyProfile(page: Page): Promise<void> {
	await openPasskeyRegister(page)
	await clickByTestId(page, "register-submit-btn")

	// The in-page modal opens, runs WebAuthn against the virtual
	// authenticator (resolves in ms), self-dismisses on success. Assert on
	// the page hash transitioning to /popup/general.
	await waitForHash(page, "#/popup/general", 60_000)
}

/** Brings a fresh extension's /popup/register to its passkey form, one press from creating the profile. */
export async function openPasskeyRegister(page: Page): Promise<void> {
	await waitForHash(page, "#/popup/register", 15_000)
	await page.waitForFunction(() => !document.querySelector('[data-testid="global-loader"]'), {
		timeout: 15_000,
		polling: 500,
	})

	await clickByTestId(page, "register-create-btn")

	// A fresh install's first profile has no name field; it is created as "Main".
	await expectNoNameField(page, "register-page", "register-name-input")

	// Switch the method-tabs from password (default) → passkey.
	await page.waitForSelector('[data-testid="register-method-passkey"]', { visible: true, timeout: 10_000 })
	await clickByTestId(page, "register-method-passkey")

	await page.waitForSelector('[data-testid="register-submit-btn"]', { visible: true, timeout: 10_000 })
}

export type PasskeyAuthSetup = VirtualAuthenticator

/**
 * A PRF-capable virtual authenticator, so `navigator.credentials` resolves without a device.
 *
 * @param anchorPage  The page the in-page ceremonies will run on — the one from
 *                    `openPopup(ctx)`, passed BEFORE driving register. Chrome
 *                    scopes an authenticator to the page it was added on, so a
 *                    credential made there lives exactly as long as that page.
 */
export const setupPasskeyVirtualAuth = (browser: Browser, anchorPage: Page): Promise<PasskeyAuthSetup> =>
	virtualAuthenticator(browser, anchorPage)

export interface PasskeySurface {
	/** The in-page passkey card mounted. */
	cardMounted: boolean
	/** Windows the browser opened, the passkey window included. */
	windowsOpened: number
}

type SurfaceProbe = Window & { __passkeySurface?: PasskeySurface }

/** Starts a fresh record, read by `readPasskeySurface`, of where the next passkey step runs from `page`:
 *  a step that stays in the page mounts the card and opens no window. */
export async function watchPasskeySurface(page: Page): Promise<void> {
	await page.evaluate(() => {
		const w = window as SurfaceProbe
		const listening = w.__passkeySurface !== undefined
		w.__passkeySurface = { cardMounted: false, windowsOpened: 0 }
		if (listening) return
		chrome.windows.onCreated.addListener(() => {
			if (w.__passkeySurface) w.__passkeySurface.windowsOpened++
		})
		// The card can mount and unmount between two polls, so it is seen by a mutation, not a read.
		new MutationObserver(() => {
			if (w.__passkeySurface && document.querySelector('[data-testid="passkey-ceremony-dialog"]'))
				w.__passkeySurface.cardMounted = true
		}).observe(document.body, { childList: true, subtree: true })
	})
}

export async function readPasskeySurface(page: Page): Promise<PasskeySurface | undefined> {
	return page.evaluate(() => (window as SurfaceProbe).__passkeySurface)
}

/** Clicks `triggerTestId` with its passkey step refused once; returns with the passkey allowed again. */
export async function refusePasskeyStep(page: Page, auth: PasskeyAuthSetup, triggerTestId: string): Promise<void> {
	const allowAgain = await auth.refuseNextStep(page)
	try {
		await clickByTestId(page, triggerTestId)
		await waitForToast(page, PASSKEY_COPY.notConfirmed, 30_000, { kind: "error" })
		await page.waitForFunction(
			(id: string) => {
				const control = document.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)
				return !!control && !control.disabled && control.getAttribute("aria-disabled") !== "true"
			},
			{ timeout: 5_000, polling: 100 },
			triggerTestId,
		)
	} catch (err) {
		// The step's own error is the diagnosis: lifting the refusal fails too once the page is gone.
		await allowAgain().catch(() => {})
		throw err
	}
	await allowAgain()
}

type HoldProbe = Window & { __releasePasskeyRequest?: () => void }

/** Holds the next passkey request `page` makes until the returned call lets it through, so a test can
 *  read the page while the request is pending. The returned call also lifts a hold no request met. */
export async function holdNextPasskeyRequest(page: Page): Promise<() => Promise<void>> {
	await page.evaluate(() => {
		const credentials = navigator.credentials
		const saved = (["create", "get"] as const).map((key) => [key, Object.getOwnPropertyDescriptor(credentials, key)] as const)
		let restored = false
		const restore = () => {
			if (restored) return
			restored = true
			for (const [key, descriptor] of saved) {
				if (descriptor) Object.defineProperty(credentials, key, descriptor)
				else Reflect.deleteProperty(credentials, key)
			}
		}
		let release = () => {}
		const released = new Promise<void>((resolve) => {
			release = resolve
		})
		;(window as HoldProbe).__releasePasskeyRequest = () => {
			restore()
			release()
		}
		credentials.create = async (options) => {
			restore()
			await released
			return credentials.create(options)
		}
		credentials.get = async (options) => {
			restore()
			await released
			return credentials.get(options)
		}
	})
	return async () => {
		await page.evaluate(() => (window as HoldProbe).__releasePasskeyRequest?.())
	}
}

/** Leave the next ceremony on `page` pending, so a test can cancel it. */
export async function stallNextPasskeyCeremony(page: Page, auth: PasskeyAuthSetup): Promise<void> {
	await auth.cleanup()
	await holdNextCredentialGet(page)
}
