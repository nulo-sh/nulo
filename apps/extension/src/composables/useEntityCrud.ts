import { onScopeDispose, ref, type Ref } from "vue"
import type { EventHandler } from "@nulo/wallet-core/utils"
import { createRunFence } from "@/composables/runFence"

export type EntityCrudMode = "incremental" | "resync"

export interface UseEntityCrudOptions<T> {
	/** Initial fetch — runs immediately on setup. */
	fetch: () => Promise<T[]>
	/**
	 * Service event hooks. Each hook is optional; pass only the ones the
	 * service emits. Most services emit all three; some (e.g. token list) only
	 * emit add/delete because edit happens elsewhere. Omitting a hook means
	 * "I don't care about this transition" — the composable will not re-fetch
	 * or splice on it.
	 */
	added?: EventHandler<T>
	updated?: EventHandler<T>
	deleted?: EventHandler<T>
	/**
	 * How to identify the same entity across events. Default: `e => (e as any).id`.
	 * Override when your entity uses a different key (e.g. `address`).
	 */
	identity?: (entity: T) => string | number
	/**
	 * - `"incremental"` (default): use the event payload to splice the list.
	 *   Cheap, no network. Picks the freshest payload each event.
	 * - `"resync"`: re-fetch the whole list on every event. Safer when other
	 *   tabs/windows mutate the store concurrently (use for shared lists like
	 *   contacts where consistency beats latency).
	 */
	mode?: EntityCrudMode
	/**
	 * Live-scope filter for `"incremental"` mode. Service events are GLOBAL
	 * broadcasts while `fetch` is scope-bound — without this, a mid-switch
	 * event for another chain/profile/account splices a foreign row into the
	 * list. Applied to add/update payloads only; deletes stay unfiltered
	 * (removing by id is subtractive and scope-safe). Ignored in `"resync"`.
	 */
	accept?: (entity: T) => boolean
	/**
	 * Called if the initial fetch or a resync throws. Defaults to a no-op.
	 * The composable still exposes `error` for template binding.
	 */
	onError?: (err: unknown) => void
}

export interface UseEntityCrudResult<T> {
	entities: Ref<T[]>
	isLoading: Ref<boolean>
	error: Ref<unknown>
	/**
	 * Re-run `fetch` and replace the list. `clear: true` empties the list
	 * SYNCHRONOUSLY before fetching — for scope switches (profile/network/
	 * account), where the old rows belong to another scope and must not
	 * survive a failed refetch. Event-driven resyncs stay non-clearing so a
	 * routine add/delete doesn't blank the whole list for a round-trip.
	 */
	refresh: (opts?: { clear?: boolean }) => Promise<void>
	/** The initial fetch, settled: resolves once it lands or fails, never rejects. */
	loaded: Promise<void>
	dispose: () => void
}

const defaultIdentity = <T>(entity: T): string | number => {
	const id = (entity as { id?: string | number }).id
	if (id === undefined) {
		throw new Error("useEntityCrud: entity has no `id` field — pass an explicit `identity` option")
	}
	return id
}

export function useEntityCrud<T>(options: UseEntityCrudOptions<T>): UseEntityCrudResult<T> {
	const { fetch, added, updated, deleted, identity = defaultIdentity, mode = "incremental", accept, onError } = options

	const entities = ref([]) as Ref<T[]>
	const isLoading = ref(true)
	const error = ref<unknown>(null)

	const fence = createRunFence()
	let disposed = false
	/** The incremental events since the current fetch began: its snapshot can be read before an
	 *  event's write and delivered after it, so each is applied again over the snapshot. */
	let sinceFetch: Array<() => void> | undefined

	const land = (result: T[], missed: Array<() => void>) => {
		entities.value = result
		for (const splice of missed) splice()
		error.value = null
	}
	const stopRecording = (missed: Array<() => void>) => {
		if (sinceFetch === missed) sinceFetch = undefined
	}

	const refresh = async (opts?: { clear?: boolean }) => {
		const isCurrent = fence.begin()
		const missed: Array<() => void> = []
		sinceFetch = missed
		if (opts?.clear) {
			// Synchronous with `begin()`: the foreign-scope rows are gone
			// before ANY await, and a failed fetch below leaves the list empty
			// rather than resurrecting them.
			entities.value = []
			error.value = null
		}
		isLoading.value = true
		try {
			const result = await fetch()
			if (disposed || !isCurrent()) return
			land(result, missed)
		} catch (err) {
			if (disposed || !isCurrent()) return
			error.value = err
			onError?.(err)
		} finally {
			stopRecording(missed)
			if (!disposed && isCurrent()) isLoading.value = false
		}
	}

	const apply = (splice: () => void) => {
		splice()
		sinceFetch?.push(splice)
	}
	const upsert = (entity: T) => {
		const id = identity(entity)
		// Same id reappearing as `added` is treated as an update — common in
		// services that re-emit on reconnect.
		if (entities.value.some((e) => identity(e) === id)) {
			entities.value = entities.value.map((e) => (identity(e) === id ? entity : e))
			return
		}
		entities.value = [...entities.value, entity]
	}

	const onAdded = (entity: T) => {
		if (mode === "resync") {
			void refresh()
			return
		}
		if (accept && !accept(entity)) return
		apply(() => upsert(entity))
	}
	const onUpdated = (entity: T) => onAdded(entity)
	const onDeleted = (entity: T) => {
		if (mode === "resync") {
			void refresh()
			return
		}
		const id = identity(entity)
		apply(() => {
			entities.value = entities.value.filter((e) => identity(e) !== id)
		})
	}

	added?.add(onAdded)
	updated?.add(onUpdated)
	deleted?.add(onDeleted)

	const loaded = refresh()

	const dispose = () => {
		if (disposed) return
		disposed = true
		added?.remove(onAdded)
		updated?.remove(onUpdated)
		deleted?.remove(onDeleted)
	}

	onScopeDispose(dispose)

	return { entities, isLoading, error, refresh, loaded, dispose }
}
