import type { EventHandler } from "@nulo/wallet-core/utils"
import { createReconnectRead } from "@/composables/reconnectRead"
import { createRunFence } from "@/composables/runFence"
import { type Ref, ref } from "vue"
import type { IncomingSyncHealth, IncomingSyncHealthChanged } from "@/wallet/services/incoming-transfer/spec"

/** Once shown, the stalled notice stays at least this long, so a Retry that works at once does not
 *  make it blink in and out. */
export const STALLED_MIN_DISPLAY_MS = 5_000

type Subscribable<T> = Pick<EventHandler<T>, "add" | "remove">

export interface IncomingSyncScope {
	profileId: string
	networkId: string
}

export interface UseIncomingSyncHealthDeps {
	/** The parent's client; the parent owns connect and disconnect. */
	client: {
		getIncomingSyncHealth(networkId: string): Promise<IncomingSyncHealth>
		retryIncomingScan(networkId: string): Promise<void>
		onIncomingSyncHealthChanged: Subscribable<IncomingSyncHealthChanged>
		onConnected: Subscribable<void>
	}
	/** The store's profile + network, or undefined while either is missing. */
	getScope: () => IncomingSyncScope | undefined
}

export interface UseIncomingSyncHealth {
	/** Whether the stalled notice is on screen — the worker's verdict, held for the minimum display. */
	stalled: Ref<boolean>
	retrying: Ref<boolean>
	/** Parent calls it on mount and on every scope change. */
	refresh: () => Promise<void>
	retry: () => Promise<void>
	dispose: () => void
}

const scopeKeyOf = (scope: IncomingSyncScope | undefined) => (scope ? `${scope.profileId}|${scope.networkId}` : "")

/**
 * Whether the active network's incoming scan is stalled. The health event is an invalidation, not a
 * value: every signal (event, reconnect, scope change, retry) refetches, and a reconnect follows
 * `createReconnectRead`'s rule. A fetch that fails changes nothing — it can neither invent a stall
 * nor clear one.
 */
export function useIncomingSyncHealth(deps: UseIncomingSyncHealthDeps): UseIncomingSyncHealth {
	const stalled = ref(false)
	const retrying = ref(false)

	let disposed = false
	const retryFence = createRunFence()
	let shownScope = ""
	let shownAt = 0
	let hideTimer: ReturnType<typeof setTimeout> | undefined

	const cancelHide = () => {
		if (hideTimer !== undefined) clearTimeout(hideTimer)
		hideTimer = undefined
	}

	/** Nothing of another scope carries over: not its notice, not even for the minimum display, and not
	 *  its pending Retry, which would leave this scope's button disabled by a request it never made. */
	const enterScope = (key: string) => {
		if (key === shownScope) return
		shownScope = key
		cancelHide()
		stalled.value = false
		retryFence.invalidate()
		retrying.value = false
	}

	const apply = (isStalled: boolean) => {
		if (isStalled) {
			cancelHide()
			if (!stalled.value) shownAt = Date.now()
			stalled.value = true
			return
		}
		if (!stalled.value || hideTimer !== undefined) return
		const remaining = shownAt + STALLED_MIN_DISPLAY_MS - Date.now()
		if (remaining <= 0) {
			stalled.value = false
			return
		}
		hideTimer = setTimeout(() => {
			hideTimer = undefined
			stalled.value = false
		}, remaining)
	}

	const reader = createReconnectRead(deps.client, async (isCurrent) => {
		// The page's async mount step can still call this after its unmount disposed us.
		if (disposed) return true
		const scope = deps.getScope()
		enterScope(scopeKeyOf(scope))
		if (!scope) return true
		const health = await deps.client.getIncomingSyncHealth(scope.networkId).catch(() => undefined)
		if (!health) return false
		if (isCurrent()) apply(health.stalled)
		return true
	})
	const refresh = reader.read

	const onChanged = (changed: IncomingSyncHealthChanged) => {
		if (scopeKeyOf(changed) === scopeKeyOf(deps.getScope())) void refresh()
	}

	const retry = async () => {
		const scope = deps.getScope()
		if (!scope || retrying.value) return
		enterScope(scopeKeyOf(scope))
		const isCurrent = retryFence.begin()
		retrying.value = true
		try {
			await deps.client.retryIncomingScan(scope.networkId)
		} catch {
			// Unreachable worker: the refetch below shows whatever is true now.
		}
		// A retry that outlived its scope owns neither the flag nor the next fetch.
		if (disposed || !isCurrent()) return
		retrying.value = false
		await refresh()
	}

	deps.client.onIncomingSyncHealthChanged.add(onChanged)

	const dispose = () => {
		disposed = true
		reader.dispose()
		cancelHide()
		deps.client.onIncomingSyncHealthChanged.remove(onChanged)
	}

	return { stalled, retrying, refresh, retry, dispose }
}
