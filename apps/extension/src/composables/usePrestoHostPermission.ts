/**
 * Firefox lets a person withhold the loopback origins Presto listens on, and a probe sent without
 * them gets Presto's minimal body. So on Firefox the page's first probe waits until the grant is
 * known, and every later grant, Allow's included, arrives through `permissions.onAdded` and re-checks.
 * Elsewhere nothing is read and the page probes at once. The parent calls `dispose()`.
 */
import { computed, ref } from "vue"
import { createRunFence } from "@/composables/runFence"
import { PRESTO_HOST } from "@/presto/config"
import { isFirefox } from "@/utils/browser-surface"

/** `unknown`: a read failed before any answered, so the page shows as if the row did not exist. */
type GrantStatus = "pending" | "unknown" | "missing" | "granted"

export interface PrestoHostPermissionCallbacks {
	/** Runs at most once, when the page may probe before any grant: held at mount, unreadable, or never read. */
	onFirstAllowed: () => void
	/** Runs on each grant a permission event brings, unless the page already held it. */
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

	function land(granted: boolean, fromEvent: boolean): void {
		const before = status.value
		status.value = granted ? "granted" : "missing"
		if (!granted || before === "granted") return
		// An event's read that overtook the mount read reports a grant that landed after mount.
		if (before === "pending" && !fromEvent) callbacks.onFirstAllowed()
		else callbacks.onGranted()
	}

	async function read(fromEvent: boolean): Promise<void> {
		const isCurrent = fence.begin()
		let granted: boolean
		try {
			granted = await chrome.permissions.contains({ origins })
		} catch (error) {
			if (disposed || !isCurrent()) return
			console.debug("presto host permission read failed", { error })
			// Only a failure before any answer falls back; a later one keeps what the page last saw.
			if (status.value !== "pending") return
			status.value = "unknown"
			callbacks.onFirstAllowed()
			return
		}
		if (disposed || !isCurrent()) return
		land(granted, fromEvent)
	}

	const onChanged = () => void read(true)

	/** Must run inside the click's own dispatch: Firefox refuses a request without user input. */
	function request(): void {
		if (disposed || origins.length === 0) return
		chrome.permissions.request({ origins }).then(
			(granted) => {
				if (!granted && !disposed) console.debug("presto host permission refused")
			},
			(error: unknown) => {
				if (!disposed) console.debug("presto host permission request failed", { error })
			},
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
		void read(false)
	}

	return { missing, request, dispose }
}
