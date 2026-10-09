import { detectInstall, type Install, STORES } from "./install"

/** Narrows the served two-store fallback to one button for the visitor's browser. Without a detection the page stays as served. */
export function mountInstall(install: Install | null = detectInstall(navigator)): void {
	if (!install) return
	const store = STORES[install.store]
	const other = STORES[install.store === "chrome" ? "firefox" : "chrome"]
	for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-install="primary"], a[data-install="nav"]')) {
		link.href = store.url
		link.textContent = `Add to ${install.browser}`
	}
	for (const link of document.querySelectorAll<HTMLAnchorElement>("a[data-install-other]")) {
		link.href = other.url
		link.textContent = other.name
	}
	for (const el of document.querySelectorAll<HTMLElement>('[data-install="secondary"], [data-install-fallback]')) {
		el.hidden = true
	}
	for (const el of document.querySelectorAll<HTMLElement>("[data-install-detected]")) {
		el.hidden = false
	}
}
