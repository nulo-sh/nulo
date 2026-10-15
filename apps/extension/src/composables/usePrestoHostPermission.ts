/**
 * Whether Firefox withholds the loopback origins Presto listens on. Firefox lets a person switch an
 * MV3 add-on's host permissions off in about:addons; Chrome grants them at install, so there the
 * page probes at once and nothing is read.
 *
 * Without the grant a probe still leaves, and Presto answers it with its minimal body, so the page
 * holds its first probe (`onFirstAllowed`) until the grant is known, and a later grant (`onGranted`)
 * re-checks at once. Every grant, Allow's included, arrives through `permissions.onAdded`.
 *
 * The parent calls `dispose()`.
 */
import { computed, ref } from "vue"
import { createRunFence } from "@/composables/runFence"
import { PRESTO_HOST } from "@/presto/config"
import { isFirefox } from "@/utils/browser-surface"

/** `unknown`: the first read failed, so the page shows as if the row did not exist. */
type GrantStatus = "pending" | "unknown" | "missing" | "granted"

export interface PrestoHostPermissionCallbacks {
	/** Runs once, when the page may probe: the grant is held, unreadable, or not Firefox's to withhold. */
	onFirstAllowed: () => void
	/** Runs on each grant that lands after the page saw it missing or could not read it. */
	onGranted: () => void
}

function isPrestoOrigin(pattern: unknown): pattern is string {
	if (typeof pattern !== "string") return false
	try {
		const url = new URL(pattern)
		return (url.protocol === "https:" || url.protocol === "http:") && url.hostname === PRESTO_HOST
	} catch {
		return false
	}
}

/** The manifest's own loopback entries, so a request can never name more than the manifest declares. */
function prestoOrigins(): string[] {
	const declared: unknown = chrome.runtime.getManifest().host_permissions
	return Array.isArray(declared) ? declared.filter(isPrestoOrigin) : []
}

export function usePrestoHostPermission(callbacks: PrestoHostPermissionCallbacks) {
	const status = ref<GrantStatus>("pending")
	const missing = computed(() => status.value === "missing")
	const origins = isFirefox() ? prestoOrigins() : []
	const fence = createRunFence()
	let disposed = false

	function land(granted: boolean): void {
		const before = status.value
		status.value = granted ? "granted" : "missing"
		if (!granted || before === "granted") return
		if (before === "pending") callbacks.onFirstAllowed()
		else callbacks.onGranted()
	}

	async function read(): Promise<void> {
		const isCurrent = fence.begin()
		let granted: boolean
		try {
			granted = await chrome.permissions.contains({ origins })
		} catch (error) {
			if (disposed || !isCurrent()) return
			console.debug("presto host permission read failed", { error })
			// Only a first read falls back; a later failure keeps what the page last saw.
			if (status.value !== "pending") return
			status.value = "unknown"
			callbacks.onFirstAllowed()
			return
		}
		if (disposed || !isCurrent()) return
		land(granted)
	}

	const onChanged = () => void read()

	/** Must run inside the click's own dispatch: Firefox refuses a request without user input. */
	function request(): void {
		if (disposed || origins.length === 0) return
		chrome.permissions.request({ origins }).then(
			(granted) => {
				if (!granted) console.debug("presto host permission refused")
			},
			(error: unknown) => console.debug("presto host permission request failed", { error }),
		)
	}

	function dispose(): void {
		disposed = true
		fence.invalidate()
		if (origins.length === 0) return
		chrome.permissions.onAdded.removeListener(onChanged)
		chrome.permissions.onRemoved.removeListener(onChanged)
	}

	if (origins.length === 0) {
		callbacks.onFirstAllowed()
	} else {
		// Subscribed before the first read, so a change landing mid-read is never lost to it.
		chrome.permissions.onAdded.addListener(onChanged)
		chrome.permissions.onRemoved.addListener(onChanged)
		void read()
	}

	return { missing, request, dispose }
}
