// Modified from Azguard Wallet (https://github.com/AzguardWallet/azguard-wallet), Copyright 2026 BB Strategy Pte. Ltd., Apache-2.0.
import type { Config } from "@/wallet/config/config"

export const isPrefersDarkScheme = (): boolean => {
	return window.matchMedia("(prefers-color-scheme: dark)")?.matches ?? false
}

// Key shared with the pre-paint boot script at public/theme-boot.js. Keep both in sync.
export const THEME_HINT_KEY = "nulo:theme"

// Mirror the chosen theme to localStorage so theme-boot.js can set <html theme> BEFORE first paint,
// killing the flash-of-dark (the extension CSP forbids inline JS, so the boot script is external).
// chrome.storage stays the source of truth; this is only a synchronous paint cache. Store the RAW
// choice ("dark"|"light"|"system") so "system" re-resolves to the CURRENT OS preference on next load —
// storing the resolved value would desync after the OS theme changes while the popup is closed.
export const persistThemeHint = (value: string): void => {
	try {
		localStorage.setItem(THEME_HINT_KEY, value)
	} catch {
		// localStorage can throw (privacy mode / disabled storage); the paint-hint is best-effort.
	}
}

/** Paints a theme choice on `root` and mirrors it, raw, to the pre-paint hint; `system` resolves to
 *  the OS scheme as it is now. Call it only with a choice read from Config, never a default: the hint
 *  is what the next document paints first. */
export const applyThemeChoice = (root: HTMLElement, choice: Config["theme"]): void => {
	persistThemeHint(choice)
	root.setAttribute("theme", choice === "system" ? (isPrefersDarkScheme() ? "dark" : "light") : choice)
}

export const debounce = <T extends (...args: never[]) => unknown>(fn: T, delay: number): ((...args: Parameters<T>) => void) => {
	let timeout: ReturnType<typeof setTimeout> | undefined

	return (...args: Parameters<T>) => {
		clearTimeout(timeout)
		timeout = setTimeout(() => {
			fn(...args)
		}, delay)
	}
}
