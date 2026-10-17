import type { Page } from "puppeteer"
import { clickByTestId } from "./dom"
import { navigateByHash } from "./navigation"
import { openDropdown } from "./widgets"

/** Click a theme button (system / light / dark) and wait for `html[theme=…]`
 *  to reflect the choice. The theme buttons are inside a Dropdown popup whose
 *  leave `<Transition>` keeps the options VISIBLE while the dropdown's state
 *  is already closed — a visibility sample taken mid-close (right after a
 *  previous selection closed the menu) reads "open", skips the trigger click,
 *  and then waits on an option that is about to disappear. Gate on the
 *  dropdown's OWN state (`data-dropdown-open`, synchronous with `isOpen`). */
export async function setTheme(page: Page, mode: "system" | "light" | "dark"): Promise<void> {
	await openDropdown(page, "theme-trigger")
	await clickByTestId(page, `theme-${mode}-btn`)
	if (mode === "system") {
		// system mode resolves to either "dark" or "light" via prefers-color-scheme
		await page.waitForFunction(() => !!document.documentElement.getAttribute("theme"), { timeout: 2_000 })
	} else {
		await page.waitForFunction((m: string) => document.documentElement.getAttribute("theme") === m, { timeout: 2_000 }, mode)
	}
}

/** Toggle a privacy setting by its testid suffix and return the new state.
 *  The container `setting-<key>` wraps a Toggle component (a `[tabindex="1"]`
 *  div whose `active` class reflects on/off). Click the inner toggle, then
 *  read its post-click class. Container-level click does NOT propagate. */
export async function togglePrivacySetting(page: Page, key: string): Promise<boolean> {
	await page.waitForSelector(`[data-testid="setting-${key}"] [tabindex="1"]`, { visible: true, timeout: 5_000 })
	const before = await getPrivacySetting(page, key)
	await page.evaluate((k: string) => {
		const toggle = document.querySelector(`[data-testid="setting-${k}"] [tabindex="1"]`) as HTMLElement | null
		toggle?.click()
	}, key)
	// Toggle exposes `data-toggle-active`; wait for the attribute to flip
	// instead of guessing how long Vue takes to re-render after setValue.
	const want = String(!before)
	await page.waitForFunction(
		({ k, w }: { k: string; w: string }) => {
			const root = document.querySelector(`[data-testid="setting-${k}"]`)
			return root?.querySelector("[data-toggle-active]")?.getAttribute("data-toggle-active") === w
		},
		{ timeout: 2_000, polling: 50 },
		{ k: key, w: want },
	)
	return getPrivacySetting(page, key)
}

/** Read a privacy setting's current state without toggling. The toggle
 *  reflects on/off via its `active` CSS-module class on the inner div. */
export async function getPrivacySetting(page: Page, key: string): Promise<boolean> {
	return page.evaluate((k: string) => {
		const toggle = document.querySelector(`[data-testid="setting-${k}"] [tabindex="1"]`) as HTMLElement | null
		if (!toggle) throw new Error(`getPrivacySetting: no toggle inside setting-${k}`)
		// CSS-module class names are mangled but always contain "active"
		return (toggle.className ?? "").includes("active")
	}, key)
}

/** Set Developer Mode from Settings → Developer, wait for the write to land, and return to the
 *  general tab (the settings subpages hide the nav tabs the other helpers click). */
export async function setDeveloperMode(page: Page, on: boolean): Promise<void> {
	await setAdvancedToggle(page, "developerMode", on)
}

/** Set Debug Mode (the log LEVEL — debug lines are dropped without it, whatever Developer Mode
 *  says). The toggle only renders while Developer Mode is on. */
export async function setDebugMode(page: Page, on: boolean): Promise<void> {
	await setAdvancedToggle(page, "debugMode", on)
}

async function setAdvancedToggle(page: Page, key: "developerMode" | "debugMode", on: boolean): Promise<void> {
	await navigateByHash(page, "#/popup/settings/developer")
	const toggle = `[data-testid="settings-toggle-${key}"]`
	await page.waitForSelector(toggle, { visible: true, timeout: 30_000 })
	const isOn = async () => (await page.$eval(toggle, (el) => el.getAttribute("aria-checked"))) === "true"
	if ((await isOn()) !== on) {
		await clickByTestId(page, `settings-toggle-${key}`)
		await page.waitForFunction(
			(sel: string, want: string) => document.querySelector(sel)?.getAttribute("aria-checked") === want,
			{ timeout: 10_000, polling: 200 },
			toggle,
			on ? "true" : "false",
		)
	}
	await navigateByHash(page, "#/popup/general")
}

export const enableDeveloperMode = (page: Page): Promise<void> => setDeveloperMode(page, true)
